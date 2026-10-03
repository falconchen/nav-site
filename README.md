# 皮皮2047 · 私人网址簿

一个自用的网址导航站，线上地址 <https://pipi2047.eu.org>。运行在 Cloudflare Workers 上，数据优先存在本地，登录后可同步到云端；配套一个 Chrome / Firefox 扩展，在任意网页上一键收藏。

## 主要功能

**浏览**

- 顶部五个分区：全部网站、最近添加、访问最多、特别关注、私密收藏。分区顺序可在 tab 栏右键或长按调整
- 「全部网站」按分类展示，左侧目录可跳转，侧边栏支持普通 / 压缩两种模式
- 「访问最多」按访问次数和最近程度（frecency）排序，登录后访问记录多端同步，未登录只存在本机
- 搜索始终搜全部网站（不含私密收藏），按 `/` 聚焦搜索框；输入关键词后用 `↓` / `↑` 选择结果，`Enter` 在新标签页打开
- 手机端：卡片是图标宫格，长按弹出菜单，左右滑动切换分区，可添加到主屏幕

**管理**

- 网站的添加、编辑、删除、特别关注，分类的增删改和排序
- 「自动填写」：输入网址后由 AI 识别名称、分类和描述，分类参考你自己已有的收藏；网页被反爬拦截时可改走 Jina Reader 兜底
- 图标可以上传图片、选 Font Awesome 图标，或由「自动填写」抓取网站图标；图片压缩成 WebP 后存到图床
- 私密收藏：只在私密分区显示，默认锁定并模糊。注意这只是界面隐藏，数据本身不加密

**同步与账号**

- GitHub / Google 登录，同一邮箱可绑定多种登录方式
- 数据变化 2 秒后自动上传，云端保留最近 5 个版本（30 天），可恢复任意版本
- 支持导入 / 导出 JSON
- 个人令牌 + REST API v1，给浏览器扩展等第三方客户端使用

**外观**

- 「纸与墨」视觉风格：暖白纸面、墨色文字、宋体标题
- 深浅色主题（默认跟随系统），四种强调色（点击印章切换）
- 简体中文、繁体中文、英语界面，首次跟随浏览器语言；网站页脚/页眉和扩展设置可手动选择，偏好保存在本机

## 浏览器扩展

`extension/` 是「皮皮2047 收藏助手」，Chrome 和 Firefox 共用一份代码：

- 弹窗收藏当前网页，AI 自动补全名称、分类和描述，可勾选私密收藏
- 右键菜单一键收藏
- 接管新标签页，打开导航站

安装、Firefox 构建与签名发布见 [extension/README.md](extension/README.md)。

## 技术栈

| 部分 | 选型 |
| --- | --- |
| 运行时 | Cloudflare Workers + Hono |
| 前端 | 原生 JavaScript、HTML、CSS（无框架、无 TypeScript） |
| 存储 | 本地 localStorage / IndexedDB，云端 Cloudflare KV |
| AI | Cloudflare Workers AI（`@cf/meta/llama-3.3-70b-instruct-fp8-fast`） |
| 认证 | GitHub / Google OAuth + JWT，个人访问令牌 |
| 构建 | esbuild + html-minifier-terser |
| 测试 | Vitest 4 + `@cloudflare/vitest-plugin` |

## 目录结构

```
nav-site/
├── public/            前端页面、脚本、样式和图片（开发环境直接使用）
├── server/
│   ├── index.js       Hono 入口，挂载所有路由
│   ├── api/           认证、用户数据、令牌、REST API v1、AI 识别、图片代理与上传
│   └── lib/           共用逻辑：网页抓取与分析、会话校验、限流等
├── extension/         浏览器扩展源码
├── test/              测试
├── doc/               配置与接口文档
├── build-script.js    生产构建，输出到 dist/
└── wrangler.jsonc     Workers 配置
```

## 本地开发

需要 Node.js 22.12.0 及以上，建议使用 Node.js 22 或 24 LTS。Wrangler 和测试插件都作为项目依赖安装，具体版本由 `package-lock.json` 固定。

```bash
npm ci
npm run dev          # http://127.0.0.1:8787
npm test             # 运行测试
npm test -- --run    # 单次运行全部测试
npm run build        # 构建到 dist/
```

本地调用 Workers AI 前需要先 `npx wrangler login`，否则「自动填写」只能拿到兜底结果。

## 部署

推送到 `master` 后由 Cloudflare 自动构建部署。也可以手动执行 `npm run deploy`（构建后部署到 `env.production`）。

开发和生产使用各自独立的 KV 命名空间，在 `wrangler.jsonc` 中配置。

### Secrets

用 `npx wrangler secret put <NAME>` 设置：

| 名称 | 说明 |
| --- | --- |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth 应用 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 应用 |
| `JWT_SECRET` | JWT 签名密钥 |
| `CF_PHOTOS_ENDPOINT` / `CF_PHOTOS_TOKEN` | 图床地址和令牌；不可用时图标降级为 base64 |
| `JINA_API_KEY` | 可选，网页抓取被拦截时的兜底。可以填多个 key，用逗号分隔，额度用完自动换下一个 |

## 文档

- [功能待办](doc/TODO.md)
- [多语言界面与翻译维护](doc/I18N.md)
- [Wrangler 升级与验证](doc/cloudflare-worker-notes.md#wrangler-升级与验证2026-10-04)
- [REST API v1](doc/REST_API.md)、[测试记录](doc/REST_API_TESTING.md)
- [登录配置](doc/AUTH_SETUP.md)、[快速配置](doc/QUICK_SETUP.md)
- [环境变量](doc/ENV_VARIABLES_GUIDE.md)、[环境隔离](doc/ENVIRONMENT_ISOLATION_GUIDE.md)、[安全配置](doc/SECURITY_CONFIG_GUIDE.md)
