# JWT 配置说明

## Hono 安全升级与算法校验（2026-10-04）

Hono 从 `4.8.3` 升级到本次 npm `latest` 对应的稳定版 `4.13.12`，更新 `package.json` 和 `package-lock.json`，修复依赖审计报告的高危告警。升级后的 `npm audit` 报告 0 个漏洞。

Hono 自 `4.11.4` 起要求 `verify()` 显式指定验证算法。`server/api/auth.js` 的签发、校验和登出，以及 `server/lib/session-auth.js` 的共享会话校验，均固定使用 `HS256`。验证算法不从未验签的 JWT header 推断。

原来 `sign(payload, JWT_SECRET)` 默认签发的就是 HS256 令牌，所以正常的已有登录会话仍然有效，不需要更换 `JWT_SECRET` 或清除 KV 会话。JWT 过期校验和 KV 会话核对继续保留；不同算法、错误签名、过期或字符串类型的 `exp` 会被拒绝。

### 回归测试与验证

新增 `test/auth-jwt.spec.js`，覆盖 `/api/auth/verify`、`/api/auth/logout` 和使用共享鉴权的 `/api/tokens`：已有 HS256 令牌通过，HS384 / HS512、错误密钥、过期令牌、字符串 `exp` 和无签名的 `alg=none` 令牌返回 401；无效令牌不会删除 KV 会话，正常登出后的原令牌无法继续访问。

```bash
npm ci
npm ls hono
npm audit
npm test -- --run
npm run build
npx wrangler deploy --env production --dry-run
git diff --check
```

本次全部 25 个测试文件、465 项测试通过。测试使用模拟 KV 和测试密钥，不代表 GitHub / Google 真实 OAuth 登录已验证。后续添加 JWT 校验时必须继续显式传入 `HS256`，避免依赖升级后使已有会话全部返回 401。

参考：[Hono 4.13.12 发布记录](https://github.com/honojs/hono/releases/tag/v4.13.12)、[JWT Helper 官方文档](https://hono.dev/docs/helpers/jwt)、[4.11.4 安全修复与 API 变化](https://github.com/honojs/hono/releases/tag/v4.11.4)。

## JWT 有效时间配置

登录有效期由环境变量 `JWT_EXPIRATION_DAYS`（单位：天）控制，写在 `wrangler.jsonc` 的 `vars` 里，开发和生产各一份：

| 环境 | 当前值 |
| --- | --- |
| 开发（顶层 `vars`） | `"30"` |
| 生产（`env.production.vars`） | `"365"` |

没设或不是数字时按 7 天算（`server/api/auth.js` 的 `generateAuthResponse()`）。本地想临时换个值，可以在 `.dev.vars` 里加一行
`JWT_EXPIRATION_DAYS=1`，它会盖过 `wrangler.jsonc`。

- JWT 里的过期时间和 KV 里会话记录的 TTL 用的是同一个值，到期后 KV 记录自动清除
- 改配置只影响之后签发的令牌，已经登录的会话仍按签发时的有效期算
- 生产环境改完要重新部署（推送到 `master`）才生效
- 个人令牌（`navpat_` 开头）不过期，不受这个配置影响
