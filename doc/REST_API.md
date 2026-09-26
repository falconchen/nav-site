# REST API v1

给浏览器扩展、脚本等第三方客户端用的接口，前缀 `/api/v1`。测试方法和实测记录见 [REST_API_TESTING.md](REST_API_TESTING.md)。

## 鉴权

登录网页后，在右上角用户菜单 →「个人令牌」生成令牌（以 `navpat_` 开头，只显示一次）。
请求时带上：

```
Authorization: Bearer navpat_xxxxxxxx
```

- 令牌不过期，不用时在同一个弹窗里吊销；每个用户最多 10 个
- 令牌不能用来生成或吊销令牌，只能访问 `/api/v1`
- 网页登录的 JWT 也能访问 `/api/v1`
- 服务端只存令牌的 SHA-256 摘要。KV 是最终一致的，吊销后最长约 60 秒内其它节点可能仍然认这个令牌

## 前提

云端必须已经有数据（网页端登录后至少同步过一次），否则写接口返回 `409 NO_CLOUD_DATA`。
这样可以避免网页端把一份只有一条网址的云端数据当成更新下载下来，覆盖本地数据。

## 接口

### `GET /api/v1/me`

校验令牌、获取当前用户。

```json
{ "success": true, "user": { "id": "...", "login": "...", "name": "...", "avatar_url": "..." },
  "auth": { "via": "token", "tokenName": "Chrome 扩展" } }
```

### `GET /api/v1/categories`

分类列表，不含「特别关注」（旧称置顶、特别收藏）「最近添加」这两个视图。

```json
{ "success": true, "categories": [{ "id": "tools", "name": "实用工具", "icon": "fas fa-tools", "order": 3, "count": 12 }] }
```

### `GET /api/v1/websites`

| 参数 | 说明 |
| --- | --- |
| `category` | 可选，分类 id 或名称 |
| `url` | 可选，按网址查找。比较时忽略协议、`www.`、`#hash` 和末尾斜杠，扩展可以用它判断当前页是否已收藏 |

返回的网站带 `category` 字段。旧版 base64 图标体积大，`imageData` 返回 `null`。
`private: true` 表示网页端的私密收藏。这只是界面上的隐藏标记，接口照常返回完整的标题、网址和描述。

### `POST /api/v1/websites`

最少只传 `url`，缺的标题、分类、描述、图标由服务端抓网页并用 AI 补全。

```json
{ "url": "https://github.com/anthropics/claude-code" }
```

完整字段：

```json
{
  "url": "https://github.com",
  "title": "GitHub",
  "category": "tools",
  "description": "代码托管平台",
  "icon": "fab fa-github",
  "imageData": "https://example.com/favicon.png",
  "pinned": false,
  "private": false,
  "hints": {
    "title": "标签页标题",
    "description": "页面 meta 描述",
    "content": "页面正文摘要",
    "icon": "https://example.com/favicon.png"
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `url` | 必填，http(s) |
| `category` | 可选，分类 id 或名称。不传就自动归类；传了但不存在返回 400，不会静默兜底 |
| `title` | 可选，不传就自动补全 |
| `description` | 可选，最长 1000 字，不传就自动补全 |
| `icon` | 可选，Font Awesome 类名，缺省 `fas fa-globe` |
| `imageData` | 可选，图片 URL 或 base64 data URL（png/jpeg/gif/webp/ico，≤256KB），不传就自动补全 |
| `pinned` | 可选，是否加入特别关注（网页端旧称置顶、特别收藏） |
| `private` | 可选，是否放进私密收藏。为 `true` 时忽略 `pinned`。只是界面上的隐藏标记，数据仍是明文 |
| `hints` | 可选，扩展从当前页拿到的信息。扩展看到的是已登录、已过反爬的页面，服务端抓不到时靠它兜底。超长会被截断（标题 200、描述 1000、正文 3000 字），不合法的字段直接忽略 |

- `201`：返回 `{ website, analysis, version }`
- `409 DUPLICATE`：网址已存在，返回已有条目。查重在抓网页和调 AI 之前，不会白花一次调用
- `400`：参数错误；分类不存在时会附上可选分类列表
- `429`：需要 AI 补全的请求（缺分类或缺描述）按用户限流 20 次/分钟

#### 自动补全的兜底顺序

补全失败不会导致保存失败，每个字段各自往下退：

| 字段 | 兜底顺序 |
| --- | --- |
| 标题 | 请求里的 `title` → `hints.title` → 网页 `<title>` → `og:site_name` → 域名 |
| 分类 | 请求里的 `category` → AI（置信度 high/medium）→ 同域名：已收录网址里同域名最多的分类 → 「未分类」（没有就取排在最前的分类） |
| 描述 | 请求里的 `description` → AI 摘要 → 网页 meta 描述 → `hints.description` → 第一段正文 → 空 |
| 图标 | 请求里的 `imageData` → `hints.icon` → 网页里的图标 → `/favicon.ico` → 不设（前端显示默认图标） |

- 标题、分类、描述都给了就不抓网页；分类和描述都给了就不调 AI
- 抓网页超时 6 秒，两轮 AI 并行、各 10 秒超时，最坏约 16 秒
- AI 分类用的候选和样例由服务端从你的云端数据构造（每个分类按权重取前 12 个站点），调用方不用传

#### `analysis`

```json
{
  "sources": { "title": "page", "category": "domain", "description": "ai", "icon": "hint" },
  "categoryConfidence": "domain",
  "warnings": ["ai_category_low_confidence"]
}
```

- `sources` 每个字段的来源：`provided`（请求里给的）、`hint`、`page`、`ai`、`domain`（同域名归类）、`fallback`（未分类）、`none`（空）
- `categoryConfidence`：`provided`、`high`、`medium`、`domain`、`fallback`
- `warnings`：发生了哪些降级

| warning | 含义 |
| --- | --- |
| `fetch_timeout` | 抓网页超时 |
| `fetch_blocked` | 被拦截：401/403/429/503，或返回的是反爬质询页 |
| `fetch_failed` | 网络错误或其它 HTTP 错误 |
| `fetched_via_reader` | 自己抓取失败，改由 Jina Reader 抓到了内容（`sources` 里仍记为 `page`）。请求带了足够的 `hints.content` 时不走 Jina |
| `not_html` | 网址指向的是图片、PDF 等文件 |
| `content_thin` | 网页正文太少（SPA 空壳、登录墙），改用了 `hints.content` |
| `ai_unavailable` | 没有 AI 绑定 |
| `ai_category_failed` | AI 分类报错或超时 |
| `ai_category_low_confidence` | AI 没把握，没采用 |
| `ai_description_failed` | AI 描述报错、超时、返回空，或返回的是「无相关信息」之类的拒答 |
| `ai_description_skipped` | 抓不到网页内容也没有 hints，不让 AI 凭空写描述（分类照跑，模型凭域名和标题也能判断知名站点） |

扩展可以在 `sources.category` 为 `domain` 或 `fallback` 时提示「已放入 xx，可在网页端调整」。

### `POST /api/v1/websites/analyze`

入参和 `POST /websites` 相同，只返回补全结果，不保存，不生成版本快照。扩展弹窗打开时用它预填表单，用户确认后再 `POST /websites`。

```json
{ "success": true, "duplicate": null, "website": { "title": "...", "category": "dev", "...": "..." }, "analysis": { "...": "..." } }
```

网址已收藏时直接返回 `{ "success": true, "duplicate": { ...已有条目 } }`，不抓网页也不调 AI。

### `DELETE /api/v1/websites?url=<网址>[&category=<id|名称>]`

按网址删除，返回 `{ removed, version }`；找不到返回 `404`。

写操作（POST/DELETE）按 IP 限流 30 次/分钟，每次写入都会生成一个版本快照，
误操作可以在网页端的版本历史里恢复。

## 与网页端同步的关系

API 写入后云端 `version` 变大。已打开的网页在获得焦点或切回标签页时检查云端版本，
发现更新就下载覆盖本地。如果网页端恰好有 2 秒内还没上传的本地改动，会跳过这次下载，
随后本地上传会覆盖掉 API 的写入（同步是整份覆盖，不做合并）；这时可以从版本历史里找回。

## Chrome 扩展示例

`manifest.json` 里给站点域名加 `host_permissions`，扩展请求就不受 CORS 限制。

先用 content script（或 `chrome.scripting.executeScript`）从当前页取 hints：

```js
function collectHints() {
  const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
  return {
    title: document.title,
    description: meta?.content || '',
    content: document.body.innerText.slice(0, 3000)
  };
}
```

一键保存，只传 url 和 hints：

```js
const API = 'https://your-nav-site.example/api/v1';

async function saveCurrentTab(token) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result: hints }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectHints });
  const res = await fetch(`${API}/websites`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: tab.url, hints: { ...hints, icon: tab.favIconUrl } })
  });
  const body = await res.json();
  if (res.status === 409) return body.code; // DUPLICATE / NO_CLOUD_DATA
  if (!res.ok) throw new Error(body.error);
  // 分类是兜底来的，提示用户去确认
  if (['domain', 'fallback'].includes(body.analysis.sources.category)) {
    console.log(`已放入「${body.website.category}」，AI 没能判断分类`);
  }
  return body.website;
}
```

带确认的保存：弹窗打开时调 `POST /websites/analyze` 预填表单，用户改完再把最终字段连同 `category`、`description` 一起
`POST /websites`。这时两个字段都给了，不会再跑一次 AI。
