# 分支预览部署

## 配置和数据范围

项目使用 Wrangler `4.147.0` 的原生 Worker Previews（开放测试版），通过 `wrangler.jsonc` 的顶层 `previews` 配置为 Git 分支建立预览。

- `ASSETS`、兼容日期和兼容标志沿用 Worker 配置。部署命令中的 `--env production` 只选择现有 Worker 名称及 `dist/` 资源配置；发布操作由 `wrangler preview` 执行。
- 环境变量和资源绑定在 `previews` 中显式设置，生产配置不会自动继承。`environment` 为 `preview`，JWT 有效期为 30 天。
- `USER_SESSIONS` 使用 `nav-site-preview-sessions`（`9fb5088ef7f74a6e860c671ee5cc7a80`），OAuth state 和登录会话与生产分开。这个 KV 会被使用同一配置的多个预览分支共享。
- Workers AI 显式绑定为 `AI`，调用仍计入同一 Cloudflare 账号的用量。
- 本次从本地现有 `.dev.vars` 上传 OAuth、JWT、Redis、图床和 Jina 凭据。**预览会读写这些凭据所连接的 Redis；若生产使用同一 Redis，账号、收藏、版本、记事和访问记录会共享，预览操作也会修改生产数据。** KV 隔离不等于业务数据隔离。Cloudflare 不返回已经保存的 Secret 值，不能直接核对远端生产 Redis 凭据是否与本地完全一致。

## 创建或更新预览

需要 Node.js >= 22.12.0、已安装的项目依赖，以及有 Workers / KV 权限的 Cloudflare 登录。

```bash
git switch codex/i18n
npm ci
npx wrangler login
npm run check:i18n
npm run deploy:preview
```

默认以当前 Git 分支作为预览名称。本分支名称为 `codex/i18n`；重复执行更新同一个稳定预览地址，每次部署还会生成独立部署地址。以 Wrangler 输出的 URL 为准。

当前稳定预览地址：[codex/i18n](https://codex-i18n-nav-site.tttt.workers.dev)。

首次部署需要显式提供 Secrets。已有 `.dev.vars` 包含所需凭据时，可执行：

```bash
npm run deploy:preview -- --secrets-file .dev.vars
```

这会上传文件中的全部变量作为该预览的 Secrets；先确认文件内容只包含本次需要的凭据。`.dev.vars` 已被 Git 忽略，禁止把凭据写进 Wrangler 配置、文档或提交。

后续单独更新一个预览的 Secret：

```bash
npx wrangler preview secret put JWT_SECRET --env production --name codex/i18n
npx wrangler preview secret list --env production --name codex/i18n
```

生产 Secret、Previews Base Secret 和某个分支的 Secret 是不同范围，生产 Secret 不会自动复制。Base Secret 更新只影响新建预览。当前预览使用单独上传的 Secrets。

## OAuth 回调

后端根据当前请求域名生成 OAuth 回调，因此需要 OAuth 提供商允许稳定预览域名：

- GitHub：`<稳定预览地址>/api/auth/github/callback`。
- Google：`<稳定预览地址>/api/auth/google/callback`。

Google 客户端可添加额外的授权重定向 URI。按本次核对的 GitHub 官方文档，OAuth App 现支持最多 10 个回调 URL，可以保留生产回调并添加预览回调。两个提供商都需要显式允许预览回调；不要把生产回调直接替换为预览回调。

Secret 已配置、登录入口返回 302，不代表 OAuth 提供商已经允许新回调，也不代表用户已经完成登录。真实登录和云端同步需要在浏览器中进一步验证。

## 验证和清理

```bash
npm run check:i18n
npm test -- --run
npm run build
npx wrangler deploy --env production --dry-run
git diff --check
```

`--dry-run` 验证 Worker 打包和 `dist/` 资源，不发布生产，也不能代替线上预览验证。发布后检查首页、JavaScript/CSS、三种语言资源、`/uuid`、未授权 API，以及 OAuth 入口的回调域名。在浏览器中切换简体中文、繁体中文、英语，检查实际文案。

删除分支预览：

```bash
npx wrangler preview delete --env production --name codex/i18n
```

删除预览不会清空共享 Redis。会话 KV 是单独创建的账号资源，删除预览后仍保留；在确认其他预览不再使用前不要删除该命名空间。

## 本次部署验证（2026-10-04）

- 源码分支 `codex/i18n`，合并提交 `03bf95e`，前端构建版本 `2610040049`。
- 首次预览部署地址：[d488fa7f](https://d488fa7f-nav-site.tttt.workers.dev)。
- 10 个测试文件、201 项测试通过；602 个翻译键检查通过；构建、Wrangler dry-run 和 `git diff --check` 通过。
- 线上 40 个静态文件的 SHA-256 与本地 `dist/` 一致；浏览器验证简体、繁体、英语切换及对应标题和标签文案。
- `/uuid` 返回 200，未登录的会话校验和受保护 API 返回 401；GitHub / Google 入口返回 302，回调域名指向稳定预览地址。
- 预览的 10 项 Secret 已存在，本地 Redis 凭据的只读 `PING` 返回 `PONG`。
- 生产活动部署仍为 `5b487001-3bd1-4c55-9f78-5f1f268661ef`，版本 `425b947f-3d50-4b46-aaf4-64507df5105e`（100%），本次预览发布未改变生产部署。
- **按用户要求暂不处理的登录配置**：本地 `.dev.vars` 的两个 OAuth 客户端 ID 均与线上生产入口不同。因此当前使用的是本地现有登录凭据，不能称为已经复用远端生产登录配置。Google 实际返回 `/signin/oauth/error`，错误为 `redirect_uri_mismatch`。后续需要生产凭据的本地文件，或为当前 OAuth App 添加预览回调。真实 OAuth 登录及登录后的云端同步尚未验证。

## 官方参考

- [Worker Previews 入门](https://developers.cloudflare.com/workers/previews/get-started/)
- [Preview 配置和 Secrets](https://developers.cloudflare.com/workers/previews/configuration/)
- [资源共享与隔离](https://developers.cloudflare.com/workers/previews/resources/)
- [GitHub OAuth App 回调配置](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
- [Google OAuth 授权重定向 URI](https://developers.google.com/identity/protocols/oauth2/web-server)
