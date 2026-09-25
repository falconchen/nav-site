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

分类列表，不含「置顶」「最近添加」这两个虚拟分类。

```json
{ "success": true, "categories": [{ "id": "tools", "name": "实用工具", "icon": "fas fa-tools", "order": 3, "count": 12 }] }
```

### `GET /api/v1/websites`

| 参数 | 说明 |
| --- | --- |
| `category` | 可选，分类 id 或名称 |
| `url` | 可选，按网址查找。比较时忽略协议、`www.`、`#hash` 和末尾斜杠，扩展可以用它判断当前页是否已收藏 |

返回的网站带 `category` 字段。旧版 base64 图标体积大，`imageData` 返回 `null`。

### `POST /api/v1/websites`

```json
{
  "url": "https://github.com",
  "title": "GitHub",
  "category": "tools",
  "description": "代码托管平台",
  "icon": "fab fa-github",
  "imageData": "https://example.com/favicon.png",
  "pinned": false
}
```

| 字段 | 说明 |
| --- | --- |
| `url` | 必填，http(s) |
| `category` | 必填，分类 id 或名称 |
| `title` | 可选，缺省用域名 |
| `description` | 可选，最长 1000 字 |
| `icon` | 可选，Font Awesome 类名，缺省 `fas fa-globe` |
| `imageData` | 可选，图片 URL 或 base64 data URL（png/jpeg/gif/webp/ico，≤256KB） |
| `pinned` | 可选，是否置顶 |

- `201`：返回 `{ website, version }`
- `409 DUPLICATE`：网址已存在，返回已有条目
- `400`：参数错误；分类不存在时会附上可选分类列表

如果需要自动生成描述和分类，可以先调 `POST /api/analyze-website`（不需要鉴权），再把结果传进来。

### `DELETE /api/v1/websites?url=<网址>[&category=<id|名称>]`

按网址删除，返回 `{ removed, version }`；找不到返回 `404`。

写操作（POST/DELETE）按 IP 限流 30 次/分钟，每次写入都会生成一个版本快照，
误操作可以在网页端的版本历史里恢复。

## 与网页端同步的关系

API 写入后云端 `version` 变大。已打开的网页在获得焦点或切回标签页时检查云端版本，
发现更新就下载覆盖本地。如果网页端恰好有 2 秒内还没上传的本地改动，会跳过这次下载，
随后本地上传会覆盖掉 API 的写入（同步是整份覆盖，不做合并）；这时可以从版本历史里找回。

## Chrome 扩展示例

`manifest.json` 里给站点域名加 `host_permissions`，扩展请求就不受 CORS 限制：

```js
const API = 'https://your-nav-site.example/api/v1';

async function saveCurrentTab(token, category) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await fetch(`${API}/websites`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: tab.url, title: tab.title, category, imageData: tab.favIconUrl })
  });
  if (res.status === 409) return (await res.json()).code; // DUPLICATE / NO_CLOUD_DATA
  if (!res.ok) throw new Error((await res.json()).error);
  return 'saved';
}
```
