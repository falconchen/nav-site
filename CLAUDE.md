# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 仓库概述

这是一个包含多个 HTML/CSS 项目的 monorepo：

- **nav-site/**: 基于 Cloudflare Workers 的导航网站，支持用户认证和云端同步
- **extension/**（在 nav-site 内）: Chrome / Firefox 扩展「皮皮2047 收藏助手」，调用 `/api/v1` 收藏网页，见 `extension/README.md`。
  两个浏览器共用代码，Firefox 版由 `npm run build:firefox` 改写 manifest 生成到 `extension-firefox/`；扩展 API 一律用 `lib/ext.js` 的 `ext`，不直接写 `chrome.*`。
  Firefox 版自行分发：`npm run sign:firefox` 签名后 `npm run release:firefox` 发到 GitHub Releases，靠 `update_url` 自动更新。
  每次修改扩展都要升 `extension/manifest.json` 的 `version`：小改动升次版本（1.1.0 → 1.2.0），大改动升主版本（1.2.0 → 2.0.0），升级时修订号归零
- **dxy/**: 简单的 HTML 页面（遗留项目）
- **sassy/**: CSS 样式项目（遗留项目）

主要活跃项目是 `nav-site`。

## nav-site 架构

### 技术栈

- **运行时**: Cloudflare Workers + Hono 框架
- **前端**: 原生 JavaScript（无框架）、HTML5、CSS3
- **存储**: Cloudflare KV 用于用户会话和数据存储
- **AI**: Cloudflare AI 绑定用于网站分析
- **构建**: esbuild 用于压缩，html-minifier-terser 用于 HTML
- **测试**: Vitest + @cloudflare/vitest-pool-workers

### 核心组件

**服务端 (`server/`)：**
- `server/index.js` - 主 Hono 应用，路由所有 API 端点
- `server/api/auth.js` - GitHub OAuth 认证流程
- `server/api/user-data.js` - 用户数据存储和版本管理系统
- `server/api/tokens.js` - 个人访问令牌的生成、列出、吊销（只接受网页登录 JWT）
- `server/api/v1.js` - RESTful API v1，给浏览器扩展等第三方客户端读写网址（文档见 `doc/REST_API.md`）
- `server/api/analyze.js` - AI 驱动的网站元数据提取（分类 + 描述生成）
- `server/api/proxy-image.js` - 图片代理用于解决 CORS
- `server/api/upload-image.js` - 图标上传中转到 cf-photos 图床，返回公开 URL
- `server/lib/fetch-remote-image.js` - 带防盗链 Referer 的远程图片抓取（代理与转存共用）
- `server/lib/session-auth.js` - 网页登录 JWT 校验（验签 + 核对 KV 会话），user-data 和 v1 共用
- `server/lib/personal-tokens.js` - 个人令牌的存储与校验
- `server/lib/rate-limit.js` - 按 IP 的固定窗口限流（图床上传与 AI 识别共用）

**前端 (`public/`)：**
- `public/index.html` - 主 HTML 结构，包含内联主题脚本
- `public/styles.css` - 完整样式表，使用 CSS 变量实现主题切换
- `public/script.js` - 主应用逻辑（103KB，处理 UI 交互）
- `public/data.js` - 默认分类和网站数据结构
- `public/auth.js` - 前端认证和会话管理
- `public/sync.js` - 云端同步与版本历史（直接覆盖，不合并）
- `public/session.js` - 本地会话管理
- `public/api-tokens.js` - 「个人令牌」弹窗
- `public/category-edit.js` - 分类编辑 UI 和逻辑
- `public/icon-selector.js` - 图标选择模态框
- `public/image-upload.js` - 图标压缩转 WebP 并上传图床
- `public/utils.js` - 共享工具函数
- `public/view-tabs.js` - 顶部视图 tab（最近添加 / 访问最多 / 特别关注 / 全部网站）切换与移动端左右滑动手势
- `public/visit-stats.js` - 访问统计（只存本机），给「访问最多」排序

### 视图 tab

页面顶部是四个横向 tab：最近添加、访问最多、特别关注、全部网站，当前 tab 写在 `<html data-tab>` 上，
存 localStorage `activeTab`（内联脚本首屏前读取，防闪烁）。分类侧边栏只在「全部网站」下显示。

- 「特别关注」就是原来的「置顶」（中间一度叫「特别收藏」），只改了界面名称和图标（黄色星星）；数据字段、DOM id、`activeTab` 取值、API 参数仍叫 `pinned`
- 访问最多：点击卡片（含中键）时 `recordVisit()` 记一次，按 frecency 排序取前 60 个（`FREQUENT_LIMIT`）。
  得分 = 次数 × 最近 10 次访问的平均权重（≤4 天 100、≤14 天 70、≤31 天 50、≤90 天 30、更早 10）。
  数据**只存本机** IndexedDB（`navSiteVisits`，按与服务端 `urlKey()` 相同的规则归一化网址），不走 `saveNavData`：
  同步是整份覆盖，多设备次数会互相覆盖，且每次点击都会冲掉只保留 5 份的版本历史。
  点击后不立即重排，切到该 tab 或页面重新可见时再渲染；右键「从访问最多中移除」清掉该网址的记录
- 特别关注、最近添加、访问最多都**不是分类**，是从数据派生的视图：置顶取 `website.pinned === true`，
  最近添加按 `addedTime` 倒序取前 60 个（`RECENT_LIMIT`，1～5 的最小公倍数，每行 3/4/5 张时最后一行都满）
- 这些视图的 DOM 是 `<section class="category-section" id="frequent|pinned|recent">`，`isVirtualSection(id)` 判断；
  编辑、删除、切换收藏靠卡片上的 `data-original-category` 找回原分类。三个视图用 `renderVirtualViews()` 一起重渲染
- 普通分类 section 渲染在 `#tab-all` 里；`showCategory()` 会先切到「全部网站」
- 搜索始终搜全部网站：有关键词时加 `body.searching`，临时显示 `#tab-all`，清空后回到原 tab
- 移动端左右滑动只在松手时判断一次（不跟手），每个 tab 各自记住滚动位置
- 特别关注卡片右上角的星星是真实按钮（`.card-pin-btn`，每张卡都渲染，靠 `.pinned` 类显示），点击取消关注
- 第五个 tab「私密收藏」（`data-tab="private"`）放 `website.private === true` 的网站，它们不进分类 section、最近添加、
  访问最多、特别关注和搜索（`collectAllWebsites()` 默认排除，要取私密网站得传 `{ onlyPrivate: true }`）。私密优先于特别关注。
  **这只是界面隐藏**：localStorage、云端 KV、版本历史、导出文件、`/api/v1` 里都是明文。其它规则：
  - 默认锁定、不渲染卡片 DOM；点「显示」后写 sessionStorage `privateRevealed`，本次会话有效。`activeTab` 不记 `private`，左右滑动也滑不进去
  - 描述只渲染占位符，真实文本存在 `privateDescriptions`（WeakMap），点击描述才填进 DOM；悬浮提示照常显示，但描述点开前只显示 `••••••`；点击不记访问次数
  - `/api/v1` 的 `POST /websites` 接受 `private`，扩展弹窗有「私密收藏」勾选框；右键一键收藏不设私密
  - 分类 section 跳过私密网站后 DOM 下标和数据下标对不上，按卡片找数据一律用 `siteIndexOfCard()`，不要再写 `children.indexOf(card)`

登录状态在页面启动时通过 `/api/auth/verify` 校验。只有明确收到 401 或 `valid: false` 才删除本地令牌；断网、请求异常及服务端临时故障会保留令牌，并在网络恢复或 15 秒后重试。校验未成功前不启动云端同步。修改此流程时需检查断网刷新后恢复、真正过期以及校验期间切换账号这三种情况。

### AI 网站识别

「AI识别」按钮触发 `POST /api/analyze-website`，抓取目标网页后跑两轮模型：分类和描述生成。
抓取、解析、两轮 AI 的实现在 `server/lib/website-analyzer.js`，网页端和 `/api/v1` 共用。

**分类用编号制，不让模型输出分类 id。** 用户会改分类名而 id 不变（比如「社交媒体」改名成
AIGC、id 仍是 `social`），让模型输出 id 会被这种语义错位带偏。现在 prompt 里给的是编号 +
分类**名称** + 该分类下已收录的站点样例，模型返回编号，服务端按下标映射回 id
（`buildCategoryCandidates` / `parseCategoryResponse`）。

**样例是个人化分类唯一的判断依据。** 「稍后阅读」「工作相关」「个人项目」这类分类不是网站
属性而是用户与网站的关系，光看网页内容判断不出来。前端 `collectCategorySamples()` 按
`weight` 倒序取每个分类前 12 个站点的标题+域名传给服务端，服务端再做条数和长度的防御性裁剪。

其它约定：
- 用 JSON 模式（`response_format` + `json_schema`）拿 `{category_index, confidence}`，
  分类 `temperature: 0`，描述 `0.3`
- `confidence` 为 `low` 或编号越界 → 返回空分类，前端保持下拉框不动并提示用户手选。
  错分比不分更烦，且静默错分用户未必会发现
- 分类只喂 800 字正文，描述喂 3000 字——分类塞太多正文会被导航栏、页脚、广告冲淡指令
- 没有 AI 绑定或调用失败 → 退回 `getCategoryByKeywords` 关键词规则，`categoryConfidence`
  标为 `fallback`（注意这条兜底命中率很低，多数会判成未分类）
- 接口不鉴权，限流 10 次/分钟（`server/lib/rate-limit.js`，与图床上传共用）

`/api/v1` 只传 url 时走 `analyzeWebsite()`，行为和网页端不同：
- 补全失败不能导致保存失败。每个字段各有兜底链，分类是 AI → 同域名历史归类 → 「未分类」，不用关键词规则
- 分类候选和样例由服务端从云端数据构造，规则与前端 `collectCategorySamples()` 一致，改一边要同步另一边
- 两轮 AI 并行跑，各 10 秒超时；抓网页 6 秒超时、只读前 1MB，反爬质询页（状态码 200 但标题是 “Just a moment…” 之类）当作被拦截
- 扩展传来的 `hints`（当前页标题、描述、正文）在抓取失败或正文太薄时顶上
- 没有任何网页内容时不调 AI 写描述；AI 返回「无相关信息可供总结」这类拒答时丢弃（`DESCRIPTION_REFUSAL_PATTERN`），
  实测抓取被拦截时模型真会把拒答当描述返回
- 响应里的 `analysis` 写明每个字段的来源和降级原因（`warnings`），字段含义见 `doc/REST_API.md`
- 本地 `npm run dev` 调 Workers AI 需要先 `npx wrangler login`，否则 AI 全部报 `Not logged in`，只能看到兜底结果

### 抓取被拦截时的兜底

v2ex 这类站点会间歇性开 Cloudflare 质询，Worker 抓取拿到 403。网页端和 `/api/v1` 都经过 `loadPage()`：

1. 先自己抓（`fetchPage`），失败或拿到质询页时，配了 `JINA_API_KEY` 就改走 Jina Reader（`fetchPageViaReader`）。
   Jina 按输出 token 计费，所以只在失败时调用，且用 JSON 格式（Markdown 正文）：同一页要 HTML 格式贵十几倍。
   Jina 那边也被拦（`httpStatus` ≥ 400 或质询页）时当作失败；`/api/v1` 带了足够的 `hints.content` 时不调 Jina
2. 仍然失败：网页端接口返回 502 + `fetchFailed`，前端 `fillFormFromDomainHistory()` 按同域名已收录网址预填分类和图标；
   `/api/v1` 走原有兜底链（hints、同域名归类）

不要接「绕过反爬」类的抓取服务（住宅代理、自动过质询），那是在对抗对方站点的防护。

### 图标存储

网站卡片的自定义图标存在 `website.imageData` 字段：

- **新图标存图床 URL**，两条来源共用同一套压缩：浏览器端缩放到 ≤256px 转成 WebP，再 POST 到 `/api/upload-image`。手动上传直接压；AI 识别出的远程图标先经 `/api/proxy-image` 取回字节（绕开跨域和防盗链，且 blob URL 同源不会污染 canvas），再走同一条压缩上传路径。
- **历史 base64 数据原样保留**。渲染路径把 `imageData` 当成不透明的 `<img src>`，data URL 和 http URL 都能用，不需要迁移。
- 图床不可用时降级为 base64 并提示用户，保证离线优先不被打破。
- 图床地址和 token 都在服务端（`CF_PHOTOS_ENDPOINT` / `CF_PHOTOS_TOKEN`），换图床不用改代码。
- cf-photos 没有开 CORS，图床 token 也不能下发到前端，所以必须由 Worker 中转。上传端点不鉴权，靠 5MB 上限、MIME 白名单、按 IP 每分钟 20 次限流兜底。
- 服务端 MIME 白名单**不含 SVG**（图床原样存储，SVG 可内嵌脚本）。前端的压缩步骤会把 SVG 光栅化成 WebP，所以 GitHub 这类只提供 SVG favicon 的站点也能正常入库。

### 个人令牌与 REST API

`/api/v1` 给 Chrome 扩展这类没法走 OAuth 弹窗的客户端用，接口说明见 `doc/REST_API.md`，测试方法和实测记录见 `doc/REST_API_TESTING.md`。

- 令牌形如 `navpat_<43 位 base64url>`，靠前缀和 JWT 区分。KV 里只存 SHA-256 摘要（`pat_<hash>`），
  明文只在生成时返回一次；每个用户的令牌列表在 `pat_list_<userId>`，最多 10 个
- 最后使用时间单独存在 `pat_used_<hash>`，每小时最多写一次。不要回写到 `pat_<hash>`：
  和吊销并发时会把刚删掉的令牌写回来
- 令牌不过期，也不能调 `/api/tokens` 生成或吊销令牌，只能访问 `/api/v1`
- 写接口是读-改-写整份云端数据，并照常生成版本快照（描述里带令牌名）。云端没有分类数据时拒绝写入：
  否则网页端会把残缺数据当成更新下载，覆盖本地
- 网址查重忽略协议、`www.`、`#hash` 和末尾斜杠
- 卡片渲染（`createCardHTML`）对标题、网址、描述、图标做了 HTML 转义，扩展写入的网页标题不可信

### 数据同步系统

同步系统使用**直接覆盖**模式（无复杂合并）：
- 上传：覆盖云端数据，创建版本快照（最多保留 5 个版本）
- 下载：从选定版本覆盖本地数据
- 版本号使用时间戳（`Date.now()`）而非递增整数
- 数据变化 2 秒后自动保存
- 版本历史存储在 KV 中，30 天 TTL

### 构建系统

构建流程（`build-script.js`）：
1. 清理并创建 `dist/` 目录
2. 使用 esbuild 压缩所有 JS 和 CSS 文件
3. 复制 `public/img/` 到 `dist/img/`
4. 使用 html-minifier-terser 压缩 HTML
5. 注入构建时间戳版本号（格式：`yymmddHHMM`，Asia/Shanghai 时区）
6. 在 HTML 中添加构建时间注释

## 开发命令

```bash
# 首先进入 nav-site 目录
cd nav-site

# 开发
npm run dev          # 启动 Wrangler 开发服务器（localhost:8787）
npm start           # dev 的别名

# 构建
npm run build       # 构建生产环境资源到 dist/

# 测试
npm test            # 运行 Vitest 测试

# 部署
npm run deploy      # 部署到 Cloudflare Workers 生产环境
```

### 环境配置

**开发环境 vs 生产环境：**
- 开发环境：使用 `public/` 目录，开发用 KV 命名空间
- 生产环境：使用 `dist/` 目录，独立的 KV 命名空间
- 在 `wrangler.jsonc` 的 `env.production` 中配置

**必需的 Secrets：**
- `GITHUB_CLIENT_ID` - GitHub OAuth 应用客户端 ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth 应用密钥
- `JWT_SECRET` - JWT 签名密钥
- `CF_PHOTOS_ENDPOINT` - 图床地址（如 `https://your-photo-host`）
- `CF_PHOTOS_TOKEN` - 图床的 AUTH_TOKEN
- `JINA_API_KEY` - Jina Reader 的 key，抓取被拦截时的兜底（可选，不配就不走 Jina）

图床地址走 secret 而不是 `wrangler.jsonc` 的 vars，是为了不把自己的图床域名硬编码进仓库。
换图床只改环境变量即可，代码不用动；只填域名时会按 https 补全。

设置 secrets：`wrangler secret put SECRET_NAME`

**环境变量：**
- `JWT_EXPIRATION_DAYS` - 3（开发）/ 90（生产）
- `environment` - "development" / "production"

### Wrangler 配置

`wrangler.jsonc` 中的关键绑定：
- `ASSETS` - 从 public/ 或 dist/ 提供静态文件
- `AI` - Cloudflare AI 绑定用于网站分析
- `USER_SESSIONS` - KV 命名空间用于会话和数据

## 架构模式

### 主题系统
- 基于 CSS 变量驱动（`data-theme="light|dark"`）
- 强调色系统（`data-accent="blue|purple|green|orange"`）
- 侧边栏模式（`data-sidebar="normal|compact"`）
- HTML 中的内联脚本防止主题闪烁
- 所有偏好设置存储在 localStorage

### 认证流程
1. 用户点击 GitHub 登录
2. 重定向到 `/api/auth/github`（生成 state，存储到 KV）
3. GitHub 回调到 `/api/auth/github/callback`
4. 服务器验证 state，用 code 交换 token
5. 获取用户信息，用用户数据签名 JWT
6. 返回 HTML，通过 postMessage 发送到父窗口
7. 前端存储 JWT，更新 UI

### 数据结构
旧版本把 `pinned` / `recent` 当虚拟分类存在 `categories` 里，现在不再存储。本地加载、导入、云端下载
都会经过 `ensureFixedCategories()`，由它剥掉旧数据里的这两项；服务端 `/api/v1` 也仍会过滤它们，用来兼容云端的旧数据。

分类和网站以嵌套对象存储：
```javascript
{
  categories: [{
    id: string,
    name: string,
    icon: string,
    order: number,
    websites: [{ id, name, url, icon, description, pinned, addedTime }]
  }],
  version: timestamp,
  lastUpdated: ISO string
}
```

## 文件组织

- 构建输出到 `dist/`（已 gitignore）
- 开发环境静态资源在 `public/`，生产环境在 `dist/`
- 服务端代码不打包，直接在 Workers 上运行
- 不使用 TypeScript - 全部使用纯 JavaScript
- 不使用 JSX - 原生 HTML 和 DOM 操作

## 重要说明

- 应用支持离线优先：所有数据存储在 localStorage，云端同步可选
- AI 分析使用 Cloudflare 的 `@cf/meta/llama-3.3-70b-instruct-fp8-fast` 模型（常量 `AI_MODEL`，分类和描述共用）
- 图片代理是必需的，因为许多网站不允许直接嵌入
- 版本管理仅保留最近 5 个版本（30 天 TTL）
- 构建版本格式在 `index.html` 中：`<span id="version">dev</span>` → 被替换为时间戳
