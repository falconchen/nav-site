# REST API 测试

接口说明见 [REST_API.md](REST_API.md)。本文记录怎么测，以及 2026-09-25 在本地开发服务器上实测的请求和响应。

## 自动化测试

```bash
npm test
```

`test/api-v1.spec.js` 用内存桩替代 KV 和 Upstash Redis，不碰真实数据，覆盖：

- 令牌：明文只返回一次、KV 里没有明文、令牌不能管理令牌、吊销后立即 401、记录最后使用时间
- 鉴权：无令牌、伪造令牌返回 401；网页登录 JWT 也能访问 v1
- 读取：分类不含虚拟分类；按网址查询忽略协议、`www.`、末尾斜杠；不返回 base64 图标
- 添加：写入后版本号变大并生成版本快照；分类可用名称；置顶权重；重复返回 409；参数校验；云端无数据时拒绝写入
- 删除：按网址删除；不存在返回 404

## 手工测试

### 准备

1. `.dev.vars` 里要有 `JWT_SECRET`、OAuth 和 `UPSTASH_REDIS_REST_*`。worktree 里没有这个文件时从主仓库复制一份，否则登录会报 `Client ID not configured`
2. `npm run dev` 启动，登录后在用户菜单 →「个人令牌」生成一个令牌
3. 设置环境变量，下面的命令都用它：

```bash
export TOKEN=navpat_xxxxxxxx
export API=http://127.0.0.1:8787/api/v1
```

> **本地开发服务器连的是真实的云端数据。** 每次写入都会生成版本快照，而版本最多保留 5 个，
> 所以一次「添加 + 删除」会挤掉最旧的 2 个历史版本。写测试请用明显的测试网址，测完删除。

### 只读接口

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/me
curl -s -H "Authorization: Bearer $TOKEN" $API/categories
curl -s -H "Authorization: Bearer $TOKEN" $API/websites
curl -s -G -H "Authorization: Bearer $TOKEN" --data-urlencode "url=https://www.anthropic.com/claude-opus-5-5" $API/websites
```

实测结果：

| 请求 | 状态 | 结果 |
| --- | --- | --- |
| `GET /me` | 200 | `"auth":{"via":"token","tokenName":"未命名令牌"}`，返回当前用户 |
| `GET /categories` | 200 | 11 个分类，不含「置顶」「最近添加」；改过名的分类返回新名称（`social` → AIGC） |
| `GET /websites` | 200 | 248 条，各分类数量与 `/categories` 的 `count` 一致 |
| `GET /websites?url=…` | 200 | 精确命中 1 条，图床图标 URL 原样返回 |

`GET /categories` 响应节选：

```json
{"success":true,"categories":[
  {"id":"social","name":"AIGC","icon":"fas fa-terminal","order":3,"count":53},
  {"id":"category-1750321371878","name":"稍后阅读","icon":"fas fa-bookmark","order":4,"count":22},
  {"id":"uncategorized","name":"未分类","icon":"fas fa-folder","order":1000,"count":8}
]}
```

### 添加

分类用名称「未分类」，网址带 `#hash`，标题带 HTML 标签：

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/navpat-test#section","title":"navpat 测试 <b>转义</b>","category":"未分类","description":"REST API 写入测试，可删除"}' \
  $API/websites
```

```json
HTTP 201
{"success":true,"website":{"title":"navpat 测试 <b>转义</b>","url":"https://example.com/navpat-test",
 "description":"REST API 写入测试，可删除","icon":"fas fa-globe","imageData":null,"pinned":false,
 "weight":1140,"addedTime":1790333812759,"editedTime":1790333812759,"category":"uncategorized"},
 "version":1790333812759}
```

检查点：

- `#section` 被去掉
- 分类名「未分类」映射成了 id `uncategorized`
- `weight` 是该分类最大权重 +10，与网页端一致
- 标题原样存储，由前端渲染时转义。在页面里用 `createCardHTML` 渲染这条数据，`.card-title` 的 innerHTML 是
  `navpat 测试 &lt;b&gt;转义&lt;/b&gt;`，页面上没有生成 `<b>` 元素

### 查重

换成 `http`、加 `www.` 和末尾斜杠，换一个分类：

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"http://www.example.com/navpat-test/","category":"tools"}' $API/websites
```

```json
HTTP 409
{"error":"Website already exists","code":"DUPLICATE","website":{"title":"navpat 测试 <b>转义</b>",
 "url":"https://example.com/navpat-test", "...":"...", "category":"uncategorized"}}
```

按网址查询也能用这几种写法命中同一条：

```bash
curl -s -G -H "Authorization: Bearer $TOKEN" --data-urlencode "url=https://example.com/navpat-test" $API/websites
# HTTP 200，websites 里 1 条
```

### 参数校验

| 请求体 | 状态 | 响应 |
| --- | --- | --- |
| `{"url":"javascript:alert(1)","category":"tools"}` | 400 | `Field "url" must be an http(s) URL` |
| `{"url":"https://example.com/x","category":"不存在的分类"}` | 400 | `Field "category" must be an existing category id or name`，附带可选分类列表 |
| `{"url":"https://example.com/x","category":"pinned"}` | 400 | 同上，虚拟分类不能直接写入 |
| `{"url":"https://example.com/x","category":"tools","icon":"\" onclick=\"x"}` | 400 | `Field "icon" must be a Font Awesome class name` |
| `{"url":"https://example.com/x","category":"tools","imageData":"data:image/svg+xml;base64,AA"}` | 400 | `Field "imageData" must be an http(s) URL or a base64 image data URL (≤256KB)` |
| `not json` | 400 | `Invalid JSON body` |

分类不存在时的响应（扩展可以直接拿 `categories` 让用户重选）：

```json
{"error":"Field \"category\" must be an existing category id or name",
 "categories":[{"id":"social","name":"AIGC"},{"id":"tools","name":"实用工具"},{"id":"uncategorized","name":"未分类"}]}
```

### 删除

```bash
curl -s -X DELETE -G -H "Authorization: Bearer $TOKEN" --data-urlencode "url=https://example.com/navpat-test" $API/websites
```

```json
HTTP 200
{"success":true,"removed":[{"title":"navpat 测试 <b>转义</b>","url":"https://example.com/navpat-test", "...":"...",
 "category":"uncategorized"}],"version":1790333839183}
```

再删一次返回 `404 {"error":"Website not found"}`；按网址查询返回空数组；网址总数回到 248。

### 鉴权

| 请求 | 状态 | 响应 |
| --- | --- | --- |
| 不带 `Authorization` | 401 | `Missing or invalid authorization header` |
| `Bearer navpat_forged` | 401 | `Invalid or revoked token` |
| 用令牌调 `GET /api/tokens` | 401 | `Invalid token`（令牌不能管理令牌） |
| 吊销后再用 | 401 | `Invalid or revoked token`（生产环境最长约 60 秒后生效） |

### 测完之后

- 网页端「版本历史」里能看到两条记录：`通过令牌「<令牌名>」添加：…` 和 `通过令牌「<令牌名>」删除：…`
- 在「个人令牌」里吊销测试令牌

## 未覆盖

- 写接口限流（30 次/分钟/IP）：手工测会产生大量版本快照，只靠代码审查
- 网页端有未上传改动时 API 写入被覆盖的情况：已知限制，见 REST_API.md「与网页端同步的关系」
