# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 仓库概述

这是一个包含多个 HTML/CSS 项目的 monorepo：

- **nav-site/**: 基于 Cloudflare Workers 的导航网站，支持用户认证和云端同步
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
- `server/api/analyze.js` - AI 驱动的网站元数据提取
- `server/api/proxy-image.js` - 图片代理用于解决 CORS

**前端 (`public/`)：**
- `public/index.html` - 主 HTML 结构，包含内联主题脚本
- `public/styles.css` - 完整样式表，使用 CSS 变量实现主题切换
- `public/script.js` - 主应用逻辑（103KB，处理 UI 交互）
- `public/data.js` - 默认分类和网站数据结构
- `public/auth.js` - 前端认证和会话管理
- `public/sync.js` - 云端同步与版本历史（直接覆盖，不合并）
- `public/session.js` - 本地会话管理
- `public/category-edit.js` - 分类编辑 UI 和逻辑
- `public/icon-selector.js` - 图标选择模态框
- `public/utils.js` - 共享工具函数

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
分类和网站以嵌套对象存储：
```javascript
{
  categories: [{
    id: string,
    name: string,
    icon: string,
    order: number,
    websites: [{ id, name, url, icon, description, pinned, dateAdded }]
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
- AI 分析使用 Cloudflare 的 `@cf/meta/llama-3.3-70b-instruct-fp8-fast` 模型
- 图片代理是必需的，因为许多网站不允许直接嵌入
- 版本管理仅保留最近 5 个版本（30 天 TTL）
- 构建版本格式在 `index.html` 中：`<span id="version">dev</span>` → 被替换为时间戳
