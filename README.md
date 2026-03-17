# 导航助手

## 项目简介

导航助手是一个美观、实用的网址导航网页，帮助用户快速访问常用网站。基于 Cloudflare Workers 构建，支持本地存储和云端同步。

## 主要功能

- 多分类网址导航（社交媒体、实用工具、设计资源、开发技术、新闻资讯、娱乐休闲）
- 支持网站的添加、编辑、删除和置顶
- 支持网站图标上传或自定义 Font Awesome 图标
- 支持关键词搜索与高亮
- 亮色/暗色主题切换，并自动记忆用户选择
- 侧边栏压缩/展开模式，提供更大内容显示区域
- 响应式设计，适配桌面和移动端
- **IndexedDB 高效存储**：支持海量数据存储，突破 localStorage 5MB 限制
- **云端同步**：支持 GitHub 账号登录，数据自动同步到云端
- **版本历史**：最多保留 5 个版本，支持恢复历史数据

## 技术栈

- **后端**: Cloudflare Workers + Hono 框架
- **前端**: 原生 JavaScript、HTML5、CSS3
- **存储**: IndexedDB (本地) + Cloudflare KV (云端)
- **AI**: Cloudflare AI 绑定用于网站元数据提取
- **认证**: GitHub OAuth
- **构建**: esbuild + html-minifier-terser

## 快速开始

```bash
# 克隆项目
git clone <repository-url>
cd nav-site

# 安装依赖
npm install

# 开发环境
npm run dev

# 构建生产环境
npm run build

# 部署到 Cloudflare Workers
npm run deploy
```

## 环境配置

### 开发环境
- 运行 `npm run dev` 启动本地开发服务器 (localhost:8787)
- 使用 `wrangler.jsonc` 中配置的开发用 KV 命名空间

### 生产环境
- 运行 `npm run build` 构建到 `dist/` 目录
- 部署时使用独立的 KV 命名空间

### 必需的 Secrets

部署前需配置以下环境变量：

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET

wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```



## 数据同步

- **上传**: 手动触发，覆盖云端数据并创建版本快照
- **下载**: 从云端拉取数据，可选择恢复任意历史版本
- **自动保存**: 本地数据变化 2 秒后自动保存
- **离线优先**: 所有数据优先存储在本地，联网后自动同步

## 主题系统

- 右上角点击"月亮/太阳"按钮可切换亮色/暗色主题
- 支持多种强调色（蓝色、紫色、绿色、橙色）
- 主题选择会自动保存，下次访问自动应用

## 配色

```css
--purple: #14003c;
--pink: #ff1365;
--blue: #0d002a;
--grey: #c4bfce;
--border-radius: 4px;
--color-text: white;
--color-primary: #7026b9;
```
