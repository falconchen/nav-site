# 实施方案：iOS 快捷指令「网页视图浮层」收藏网站

> **这是动手之前的方案，留作记录，和最终实现有出入**，以 [IOS_SHORTCUT.md](IOS_SHORTCUT.md)、[REST_API.md](REST_API.md) 为准。主要差别：
> - 原有入口是 `/?add=<网址>`（首页弹窗），`/add` 是这次新建的独立页面，走 `/api/v1`，没有改全局鉴权中间件
> - 表单不显示账号；短时令牌的白名单只有读分类、分析、保存三个接口，不含用户信息
> - 重复网址返回 409 并提示已收录，不更新原记录
> - 步骤 7（令牌页的「安装快捷指令」按钮）没做；做好的快捷指令在仓库的 `shortcuts/` 目录

> 给 Claude Code：请先阅读本文档，再探索现有项目代码，按「实施步骤」逐项修改。遇到与现有结构冲突的地方，以现有项目的约定为准，并在完成后列出你做的取舍。

## 1. 背景与目标

- 项目：自建的网站收藏 PWA，后端运行在 **Cloudflare Workers**。
- 现状：已有一个 iOS 快捷指令，用「打开 URL」打开 `/add?url=<网址>`。页面会在 Safari 新标签中打开，复用 Safari 里的登录态（前端把登录 token 存在 **localStorage**）。
- 问题：每次收藏都会跳出新的 Safari 标签，体验差。
- 目标：新快捷指令改用「显示网页」动作，以浮层（Safari View）的形式打开同一个 `/add` 表单，盖在当前网页上方，用户编辑、保存、关闭浮层后回到原网页。
- 难点：浮层与 Safari、PWA 的存储完全隔离，拿不到 localStorage 里的登录 token；而且「显示网页」只能发 GET 请求，不能带请求头。

## 2. 方案概要

```
快捷指令
 ├─ ① 获取 URL 内容：POST /api/share/draft
 │     Header: Authorization: Bearer <Personal Token>
 │     Body:   {"url": "<当前网页>"}
 │     ← {"edit_url": "https://<域名>/add?url=<编码>&t=<短时token>"}
 └─ ② 显示网页：GET edit_url（浮层）

/add 页面（前端）
 ├─ 发现 URL 中有 t 参数 → 存入 sessionStorage → history.replaceState 去掉 t
 ├─ 进入 share 模式：不跳登录页，所有 API 请求带 Header  X-Share-Token: <t>
 └─ 保存成功 → 显示「✅ 已保存，点左上角关闭」

后端
 ├─ 鉴权中间件：原有登录 token（full 权限） 或 X-Share-Token（share 权限，查 KV）
 └─ share 权限只允许访问「添加网站」链路上的接口，保存成功后作废 token
```

### 已确定的设计决策

| 项 | 决定 |
|---|---|
| 快捷指令凭证 | 用户在 App 内生成的 **Personal Token**，只放在快捷指令请求头里，绝不出现在 URL 中 |
| 浮层凭证 | 后端签发的**短时 token**，经 URL 传入，前端立即从地址栏抹掉 |
| token 存储 | **Cloudflare KV**，key 为 `share:<sha256(token)>`，值为 `{userId, url, createdAt}`，`expirationTtl: 1800`（30 分钟） |
| token 作废 | 保存成功后删除 KV key；否则 30 分钟后自动过期 |
| token 传递给 API | 前端用请求头 `X-Share-Token`（与现有基于 localStorage 和请求头的鉴权方式一致，不依赖浮层的 Cookie） |
| 旧快捷指令 | `/add?url=` 在 Safari 中打开的旧流程**保持可用**，不做任何破坏性改动 |
| AI 预填 | 不在 KV 里存 AI 结果，也不轮询（KV 最终一致，可能读到旧值）。页面像现在一样直接调用现有的自动填写接口，同步拿到结果 |

## 3. 实施步骤

### 步骤 0：先探索现有代码（不要跳过）

请找出并记录以下内容：

1. Worker 入口与路由定义方式（原生 fetch / Hono / itty-router 等）。
2. 现有鉴权逻辑：登录 token 如何校验、如何解析出 `userId`。
3. **Personal Token** 的存储与校验逻辑（以后快捷指令会用它）。
4. `/add` 页面是如何提供的（Workers Static Assets、SPA 前端路由，还是 Worker 渲染），以及「添加网站」表单组件的位置。
5. 「添加网站」链路调用的所有接口，至少包括：自动填写（AI 判断和抓取标题）、分类列表、图标上传（图床）、新建收藏。
6. `wrangler.toml` 或 `wrangler.jsonc` 中现有的绑定（KV、D1 等）。

### 步骤 1：复用现有 KV 绑定

- 项目**已有 KV 绑定**，直接复用，不要新建 namespace。
- 在 wrangler 配置中确认现有 KV 的绑定名，下文代码中的 `env.KV` 替换为实际绑定名。
- 所有 token 的 key 统一加 `share:` 前缀，避免与现有数据冲突。

### 步骤 2：新接口 `POST /api/share/draft`

- 鉴权：**只接受 Personal Token**，格式为 `Authorization: Bearer <Personal Token>`，复用现有的 Personal Token 校验逻辑。校验失败返回 401。
- 请求体：`{"url": string}`。校验它是合法的 http/https URL，否则返回 400。
- 逻辑：
  1. 生成 token：`crypto.getRandomValues(new Uint8Array(32))`，编码为 base64url。
  2. `await env.KV.put("share:" + sha256hex(token), JSON.stringify({userId, url, createdAt: Date.now()}), {expirationTtl: 1800})`。
  3. 返回 `{"edit_url": "https://<当前请求的 origin>/add?url=<encodeURIComponent(url)>&t=<token>"}`。**必须是带域名的完整 URL。**
- KV 中只存 token 的 SHA-256 哈希，不存明文。
- 可选：如果 Personal Token 系统支持权限范围，新增一个 `share:create` 权限，只允许调用此接口。

### 步骤 3：鉴权中间件扩展

在现有鉴权逻辑中增加第二种身份，伪代码如下：

```js
async function authenticate(req, env) {
  const user = await existingAuth(req, env);          // 原有：登录 token（以及 Personal Token，如果原本就支持）
  if (user) return { userId: user.id, scope: "full" };

  const t = req.headers.get("X-Share-Token");
  if (t) {
    const key = "share:" + await sha256hex(t);
    const d = await env.KV.get(key, "json");
    if (d) return { userId: d.userId, scope: "share", shareKey: key, shareUrl: d.url };
  }
  return null;
}
```

- `scope: "share"` **只允许**访问以下接口（以步骤 0 中找到的实际接口为准）：
  - 自动填写（AI 和标题抓取）
  - 读取分类列表
  - 图标上传
  - 新建收藏
  - 查询当前用户的基本信息（用于在表单上显示账号）
- 其他接口在 share 权限下一律返回 403。建议用显式的白名单实现，不要用黑名单。

### 步骤 4：新建收藏接口改造

- share 权限下新建收藏成功后，执行 `await env.KV.delete(shareKey)`。
- **按 URL 去重**（同一用户下如果已存在相同 URL）：返回已存在的记录或更新它，避免重复提交产生两条记录。KV 删除是最终一致的，存在短暂窗口内被重复使用的可能，靠去重兜底。
- full 权限下的行为保持不变。

### 步骤 5：`/add` 前端改造（share 模式）

1. 页面加载时，检查 URL 中是否有 `t`：
   - 有：`sessionStorage.setItem("shareToken", t)`，然后用 `history.replaceState` 从地址栏删除 `t`（保留 `url` 参数）。
   - 没有：尝试从 `sessionStorage` 读取（这样用户在浮层里点刷新时仍然可用）。
2. 处于 share 模式（拿到了 shareToken）时：
   - 本地没有登录 token 时，**不要**跳转到登录页。
   - 所有 API 请求加上请求头 `X-Share-Token: <token>`。如果有统一的 fetch 封装，在封装里处理。
   - 表单顶部显示当前账号（例如「添加网站 · user@example.com」），防止存进错误的账号。
   - 保存成功：不跳转，表单区域替换为「✅ 已保存，点左上角 ✕ 关闭」。
   - 「取消」和关闭按钮：显示「点左上角 ✕ 关闭」（页面无法自行关闭浮层）。
   - 收到 401 或 403（token 过期或无效）时：提示「链接已过期，请重新从共享菜单运行快捷指令」。
3. 非 share 模式：保持现有行为完全不变。
4. 如果 `/add` 依赖 Service Worker 或 PWA 的启动逻辑，确认它在普通浏览器视图中也能正常渲染。

### 步骤 6：安全细节

- `/add` 的响应头加上 `Referrer-Policy: no-referrer`。
- `/add` 加上 `X-Robots-Tag: noindex`（或 meta 标签）。
- 不要在日志里打印 token 或 Personal Token。
- token 的比对通过「对输入取哈希再查 KV」完成，天然不会泄露时序信息，不需要额外处理。

### 步骤 7（可选）：App 内引导

- 在「Personal Token」页面增加「安装 iPhone 快捷指令」按钮，链接到快捷指令的 iCloud 分享链接（由用户提供，先用配置项或占位符），并提示「导入时粘贴上面生成的 Personal Token」。

## 4. 快捷指令配置（用户手动完成，Claude Code 无需实现）

1. 详细信息里打开「在共享表单中显示」，接收类型选 **URL**、**Safari 网页**。
2. **文本**：内容为 Personal Token 的占位符。配置「导入问题」绑定到这个动作，让用户导入时填写。
3. **获取 URL 内容**：
   - URL：`https://<域名>/api/share/draft`
   - 方法：POST
   - 头部：`Authorization` = `Bearer ` + 「文本」变量
   - 请求体：JSON，字段 `url` = 「快捷指令输入」
4. **获取词典值**：键 `edit_url`。
5. **显示网页**：输入为「词典值」。

## 5. 验收清单

- [ ] 用正确的 Personal Token 调用 `POST /api/share/draft`，返回完整的 `edit_url`；Token 错误返回 401；url 不合法返回 400。
- [ ] KV 中出现 `share:<hash>`，TTL 约 1800 秒，值中不包含明文 token。
- [ ] 无痕窗口（没有登录 token）打开 `edit_url`：表单正常显示，地址栏中的 `t` 被抹掉，显示正确的账号，AI 自动填写正常。
- [ ] 在 share 模式下修改字段、上传图标、保存都成功；保存后 KV key 被删除；再次用同一 token 保存返回 401 或 403（或者因按 URL 去重而不产生重复记录）。
- [ ] 带 `X-Share-Token` 访问非白名单接口（例如删除收藏、列出全部收藏）返回 403。
- [ ] 30 分钟后 token 失效，前端显示「链接已过期」的提示。
- [ ] 浮层内刷新页面后仍可继续编辑（sessionStorage 生效）。
- [ ] 旧流程（Safari 中已登录，打开 `/add?url=...`）行为与改动前一致。
- [ ] iPhone 实机测试：从 Safari 共享面板运行快捷指令，浮层弹出，保存后关闭浮层，回到原网页。
