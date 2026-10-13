# MCP 接入

站点自带一个 MCP 服务，让 Claude、ChatGPT、Cursor 这类 AI 工具直接查你的收藏、读写记事本。接上之后可以这样问：

- 「我今天收藏了哪些网址？」「最近关注了哪些？」
- 「我的收藏里有没有关于正则表达式的？」
- 「把 https://example.com 加到收藏里，放进实用工具」
- 「把未分类里和 AI 有关的网址都移到 AIGC」「把这几个网址设为特别关注」
- 「记事本里有哪些分类？最近写了什么？」
- 「把这次对话总结成一篇笔记，放到『对话总结』里」

接入地址是 `https://<你的域名>/mcp`（登录后在用户菜单 →「个人令牌」弹窗下半部分可以复制）。

## 两种接入方式

### 1. OAuth 授权（Claude 网页 / 手机 App、ChatGPT 等）

这类工具添加「自定义连接器」时填接入地址，然后在本站的授权页上点同意：

1. 在工具里添加连接器，地址填 `https://<你的域名>/mcp`（各工具的入口见下面）
2. 工具会打开本站的授权页。页面上写着是哪个应用在申请、授权后跳转到哪个域名，核对无误后点「同意授权」
3. 没登录的话先在授权页上用 GitHub / Google 登录，登录完自动回到授权页

授权页上的登录只为完成这次授权，不会让这个浏览器里的首页变成已登录。手机 App 里弹出的是内嵌浏览器，和 Safari / Chrome 的登录状态不通，所以一定会要求登录一次。

访问令牌 1 小时过期，工具会自动用刷新令牌续期；连续 90 天没用过才需要重新授权。

**Claude（claude.ai）**：Customize → Connectors → 「+ Add」→「Add custom connector」，填名称和地址，认证方式都用默认的
（「Sign in now」+「Use Claude's published identity」）。聊天时点输入框左下角「+」→ Connectors 打开它。授权页会显示「由 claude.ai 发布」。

**ChatGPT（chatgpt.com）**：插件 →「添加自定义 MCP 服务器」，身份验证选 OAuth，然后**展开「高级 OAuth 设置」，把「注册方法」从
「客户端标识符元数据文档（CIMD）」改成「动态客户端注册（DCR）」**，「基础授权范围」填 `mcp`，再创建。

- 不改的话授权页会报「没能核实这个应用的身份」：CIMD 方式要我们的服务端去拉 `https://chatgpt.com/oauth/client.json`，
  而 chatgpt.com 对从 Cloudflare Workers 发出的请求返回 403（2026-10 实测，同一个文档从别处请求是 200）。这是对方的防护，我们这边绕不过去
- 用 DCR 时应用名是对方自己登记的，授权页会提示「名称没有经过核实」，以「授权后跳转到」的域名（`chatgpt.com`）为准
- 带写操作的自定义 MCP 是否可用取决于订阅，写操作默认每次都要确认，以它那边的说明为准

### 2. 个人令牌（Claude Code、Cursor、Codex 等能配置请求头的工具）

在「个人令牌」弹窗里生成一个令牌，放进请求头：

```bash
claude mcp add --transport http pipi2047 https://<你的域名>/mcp --header "Authorization: Bearer navpat_xxxxxxxx"
```

用 JSON 配置的工具（Cursor 的 `mcp.json` 等）：

```json
{
  "mcpServers": {
    "pipi2047": {
      "url": "https://<你的域名>/mcp",
      "headers": { "Authorization": "Bearer navpat_xxxxxxxx" }
    }
  }
}
```

Claude Desktop 的配置文件只支持本地进程，用 `mcp-remote` 转一下：

```json
{
  "mcpServers": {
    "pipi2047": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<你的域名>/mcp", "--header", "Authorization: Bearer navpat_xxxxxxxx"]
    }
  }
}
```

这些工具大多也支持 OAuth，不想在配置文件里放令牌的话，不写 `headers` 直接连，按提示在浏览器里授权即可。

所有个人令牌都能通过 MCP 访问记事本，包括给浏览器扩展用的那个。`/api/notes` 这组 REST 接口不受影响，仍然只认网页登录。

## 撤销

用户菜单 →「个人令牌」：

- 「已授权的应用」里点两次「撤销」，这次授权签发的访问令牌和刷新令牌一起失效
- 个人令牌点「吊销」。KV 是最终一致的，其它节点最长约 60 秒后生效

## 工具

### 收藏（查询、添加、修改，不能删除）

| 工具 | 作用 |
| --- | --- |
| `list_categories` | 分类和每个分类的网址数量 |
| `search_bookmarks` | 搜索或列出收藏。条件可以组合：`query`（多个词空格分开，`match: any` 时命中一个就算）、`category`、`pinned`、`added_after` / `added_before`、`sort`、`limit`（默认 50，上限 200）、`offset` |
| `add_bookmark` | 添加网址。只有 `url` 必填，标题、描述、分类没给的由服务端抓网页后自动补全（和 `POST /api/v1/websites` 同一套逻辑，见 [REST_API.md](REST_API.md)）；已收藏的不重复添加 |
| `update_bookmarks` | 修改已收藏网址的分类、标题、描述、特别关注。一次最多 50 个，每一项用 `url` 指明是哪个，只改填了的字段 |

- 日期按 Asia/Shanghai 算：`added_after: "2026-10-13"` 表示当天 0 点起（含），`added_before` 不含。查某一天就是 `added_after` 填当天、`added_before` 填第二天。返回的时间带 `+08:00`，结果里的 `now` 是服务器当前时间
- 「最近关注」按特别关注的排序键从大到小（新关注的最大）。数据里没有「关注时间」，在网页上拖过特别关注的顺序后，就以拖动后的顺序为准
- 搜索是关键词匹配（标题、网址、描述、分类名），不是语义搜索；找不到时 AI 一般会自己换词再试
- `update_bookmarks` 一次调用只保存一次、只占一个历史版本，所以批量整理要让 AI 放进同一次调用（工具说明里已经这样要求）。
  每一项各自成败，改不了的会说明原因；全都没变化时不保存。换了分类的排到新分类最前，新设为特别关注的排到关注列表最前，添加时间不变
- 改错了可以在网页端用户菜单 →「历史版本」恢复，但只留最近 5 个版本，AI 连着改几批之后更早的就找不回了。
  这个工具带「有破坏性」的标记，多数 AI 工具调用前会让你确认
- 不能改网址本身、不能新建分类、不能删除收藏；私密收藏改不了（对 AI 来说不存在），被隐藏的描述也不能覆盖（它看不到原文）

### 记事本（增删改查）

| 工具 | 作用 |
| --- | --- |
| `list_note_folders` | 文件夹和各自的记事数量 |
| `list_notes` | 记事列表，按最后修改时间倒序，只有标题等概要。可按 `folder`、`query`（只匹配标题）过滤 |
| `get_note` | 读取一条记事的全文 |
| `create_note` | 新建记事，默认 Markdown。正文第一行就是标题；`folder` 必须是已有的文件夹 |
| `update_note` | `mode: "append"` 追加到末尾；`mode: "replace"`（默认）覆盖整篇，必须带 `base_updated_at`；也可以只移动文件夹或只改格式 |
| `delete_note` | 永久删除 |
| `create_note_folder` / `rename_note_folder` / `delete_note_folder` | 文件夹的增改删。删文件夹不删记事，里面的记事变成未归档 |

- **删除和覆盖都找不回来**：记事本没有回收站和版本历史。这几个工具带了「有破坏性」的标记，多数 AI 工具调用前会先问你，但这不是保证
- 覆盖整篇要带 `base_updated_at`（`get_note` 返回的 `updatedAt`）：一是逼 AI 先读再改，二是你同时在网页上改过的话会被拒绝，而不是被冲掉
- 不能发布或取消公开链接，AI 也拿不到公开链接，只知道一条记事是否已发布

## AI 看不到什么

交给 AI 的内容会发到 AI 服务商，所以这里比 `/api/v1` 收得紧：

- **私密收藏**完全不返回，搜不到，也不计入分类数量。让 AI 添加一个已经在私密收藏里的网址时，只会告诉它「已经收藏过了」
- **隐藏描述**的网站照常返回标题和网址，但不返回描述，描述也不参与搜索（否则能靠换关键词试出内容）
- 不提供访问统计、版本历史、用户资料

返回给 AI 的标题、描述、记事正文都是数据。服务端在说明里要求 AI 不执行其中出现的指示，但这依赖 AI 工具自己守规矩；收藏的标题可能来自扩展抓取的网页，别让 AI 对着不可信的内容自动执行破坏性操作。

## 限流

按用户计，每分钟：工具调用总计 120 次；添加和修改收藏合计 30 次调用（其中需要 AI 补全的 20 次，和 `/api/v1` 共用）；记事本写操作 60 次（和网页端共用）。超限时工具返回错误说明，不是 HTTP 429。

## 协议

- Streamable HTTP，无状态：每个 POST 回一个 JSON，不开 SSE，没有会话 id；GET / DELETE 返回 405
- 同时支持 `2026-07-28`（无握手，版本在每条请求的 `_meta` 和请求头里）和 `2025-11-25` / `2025-06-18` / `2025-03-26`（`initialize` 握手）
- 只有 tools，没有 resources 和 prompts
- 鉴权按 MCP 授权规范：未带令牌返回 401 和 `WWW-Authenticate: Bearer resource_metadata="…"`，资源元数据在 `/.well-known/oauth-protected-resource/mcp`，授权服务器元数据在 `/.well-known/oauth-authorization-server`。支持动态客户端注册（`/oauth/register`）和 Client ID Metadata Document，强制 PKCE（S256）

## 本地调试

```bash
npx @modelcontextprotocol/inspector
```

地址填 `http://127.0.0.1:8787/mcp`（`npm run dev` 起的本地服务），传输选 Streamable HTTP，请求头里加个人令牌。
本地的 KV 是模拟的，令牌要在本地页面里生成；Redis 没有本地模拟，读写的是 `.dev.vars` 里填的那个实例。

部署前提：`wrangler.jsonc` 里的 `OAUTH_KV` 绑定（见 [setup.md](setup.md)）。
