# 部署与配置

从零部署一份导航站要准备的东西：两个 OAuth 应用、一个 Upstash Redis、两个 Cloudflare KV 命名空间，再把密钥交给 Wrangler。
本文合并了原来的五份文档（登录配置、快速配置、环境变量、环境隔离、安全配置）。

> 文档和代码里**不要写真实的密钥**，示例一律用占位符。这个仓库是公开的。

## 1. OAuth 应用

登录支持 GitHub 和 Google，至少配一种。回调地址由服务端按当前域名拼出来，本地和线上各登记一个。

| | 创建位置 | 回调地址 |
| --- | --- | --- |
| GitHub | <https://github.com/settings/developers> → New OAuth App | `https://<域名>/api/auth/github/callback` |
| Google | Google Cloud Console → API 和服务 → 凭据 → OAuth 客户端 ID（Web 应用） | `https://<域名>/api/auth/google/callback` |

本地开发的回调地址是 `http://127.0.0.1:8787/api/auth/<github|google>/callback`（按你实际打开的主机名和端口填，`localhost` 和 `127.0.0.1` 算两个地址）。
GitHub 一个应用只能填一个回调地址，本地和线上要各建一个应用；Google 可以在同一个客户端里填多个。

## 2. Upstash Redis

在 <https://upstash.com> 建一个数据库，拿到 REST 地址和令牌。收藏数据、版本历史、用户档案、记事本和访问统计都存在这里。

## 3. Cloudflare KV

```bash
npx wrangler login
npx wrangler kv namespace create USER_SESSIONS
npx wrangler kv namespace create nav-site-oauth
```

把输出的 id 填进 `wrangler.jsonc` 的 `kv_namespaces`：

- 绑定名 `USER_SESSIONS`：登录会话、OAuth state、个人令牌、分享令牌、限流计数和图床去重映射
- 绑定名 `OAUTH_KV`：AI 工具通过 MCP 接入时的授权记录（见 [MCP.md](MCP.md)）。绑定名是 `@cloudflare/workers-oauth-provider` 定死的，
  命名空间叫什么都行。和上面那个分开放，这个库会按前缀列举、清理自己的 key

## 4. 密钥和变量

### Secrets

本地写在 `.dev.vars`（已在 `.gitignore` 里），线上用 `npx wrangler secret put <NAME> --env production` 设置。

| 名称 | 说明 |
| --- | --- |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth 应用 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 应用 |
| `JWT_SECRET` | 登录令牌的签名密钥，用足够长的随机串，比如 `openssl rand -base64 48` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis 的 REST 地址和令牌 |
| `CF_PHOTOS_ENDPOINT` / `CF_PHOTOS_TOKEN` | 图床地址和令牌；不配时图标降级存成 base64 |
| `JINA_API_KEY` | 可选，网页抓取被拦截时的兜底。可以填多个，用逗号分隔 |
| `USER_AGENT` / `ACCEPT_LANGUAGE` | 可选，抓取网页和图片时用的请求头，不设用内置默认值 |

`.dev.vars` 的格式：

```ini
GITHUB_CLIENT_ID=<你的 Client ID>
GITHUB_CLIENT_SECRET=<你的 Client Secret>
JWT_SECRET=<随机串>
UPSTASH_REDIS_REST_URL=https://<你的实例>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<令牌>
```

### 哪些可以公开

- **可以**：KV 命名空间 id（没有 Cloudflare 账号权限读不了数据）、OAuth 的 Client ID（OAuth 里本来就是公开标识）、Redis 的 REST 地址。
  这个项目为了不把自己的实例写进仓库，Client ID、Redis 地址和图床地址也都放在 secret 里
- **不可以**：Client Secret、`JWT_SECRET`、Redis 令牌、图床令牌、Jina key。泄露后要立即轮换：
  - `JWT_SECRET` 换掉后所有登录会话失效，用户需要重新登录；个人令牌不受影响（它不用这个密钥）
  - Redis 令牌在 Upstash 控制台重置，OAuth 密钥在各自的开发者后台重新生成，然后 `wrangler secret put` 更新

### 普通变量

在 `wrangler.jsonc` 的 `vars` 里，开发和生产各一份：

| 名称 | 开发 | 生产 | 说明 |
| --- | --- | --- | --- |
| `environment` | `development` | `production` | |
| `JWT_EXPIRATION_DAYS` | 30 | 365 | 登录有效天数，详见 [JWT_CONFIG.md](JWT_CONFIG.md) |
| `MAX_USER_VERSIONS` | 5 | 5 | 云端保留的历史版本数 |

## 5. 开发环境和生产环境

- 开发用 `public/` 目录，生产用构建出来的 `dist/`（`env.production`）
- `wrangler.jsonc` 里两个环境目前填的是**同一个** KV 命名空间 id。`npm run dev` 默认用本机模拟的 KV（数据在 `.wrangler/state/`），
  不会碰线上的；加了 `--remote` 才会读写线上 KV
- Redis 没有本地模拟：`.dev.vars` 里填的是哪个实例，本地开发就直接读写哪个。不想让本地调试碰到线上数据，就给开发单独建一个 Redis 数据库
- 本地调 Workers AI 要先 `npx wrangler login`，否则「自动填写」只能拿到兜底结果

## 6. 运行和部署

```bash
npm ci
npm run dev        # http://127.0.0.1:8787
npm test -- --run
npm run build
```

推送到 `master` 后由 Cloudflare 自动构建部署，不需要手动 `npm run deploy`。自动部署的开关和 Wrangler 升级记录见
[cloudflare-worker-notes.md](cloudflare-worker-notes.md)。

## 7. 常见问题

- **登录弹窗一闪就关 / 报回调地址不匹配**：OAuth 应用里登记的回调地址要和浏览器地址栏的协议、主机名、端口完全一致
- **登录弹窗被拦截**：允许本站弹出窗口
- **登录后马上掉线**：`JWT_SECRET` 没设或和签发时不一致；KV 没绑定时会话核对会被跳过，线上务必绑定
- **接口返回 503**：Redis 地址或令牌不对，或 Upstash 暂时不可用。读失败不会被当成「没有数据」，所以不会把云端清空
- **`/api/v1` 写接口返回 `409 NO_CLOUD_DATA`**：这个账号还没同步过，先在网页端登录一次
