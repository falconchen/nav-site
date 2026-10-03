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

JWT（JSON Web Token）的有效时间现在可以通过环境变量进行配置。

### 配置变量

- **变量名**: `JWT_EXPIRATION_DAYS`
- **类型**: 字符串（数字）
- **默认值**: `"7"`（7天）
- **单位**: 天

### 配置位置

#### 1. 开发环境和生产环境
在 `wrangler.jsonc` 文件的 `vars` 部分：

```json
{
  "vars": {
    "JWT_EXPIRATION_DAYS": "7"
  }
}
```

#### 2. 本地开发（可选）
如果需要在本地开发时使用不同的过期时间，可以在 `.dev.vars` 文件中添加：

```ini
# JWT 过期时间（天数）
JWT_EXPIRATION_DAYS=7
```

**注意**: `.dev.vars` 中的配置会覆盖 `wrangler.jsonc` 中的配置。

### 配置示例

| 需求 | 配置值 | 说明 |
|------|--------|------|
| 1天过期 | `"1"` | 适用于测试环境 |
| 7天过期（默认） | `"7"` | 推荐的生产环境配置 |
| 30天过期 | `"30"` | 长期有效token |
| 90天过期 | `"90"` | 超长期有效token |

### 生效机制

1. **JWT Token**: 生成的JWT token会包含过期时间戳
2. **KV存储**: Cloudflare KV中存储的token也会使用相同的过期时间
3. **自动清理**: 过期的token会自动从KV存储中清除

### 修改配置后的操作

1. 修改 `wrangler.jsonc` 中的 `JWT_EXPIRATION_DAYS` 值
2. 重新部署应用：
   ```bash
   npm run deploy
   ```
3. 或重启开发服务器：
   ```bash
   npm run dev
   ```

### 注意事项

- 已经生成的JWT token不会受到配置修改的影响，它们仍然按照生成时的过期时间有效
- 只有新生成的token才会使用新的过期时间配置
- 如果配置值无效（非数字），系统会自动使用默认值7天
- 建议生产环境使用较短的过期时间（如7-30天）以提高安全性

### 调试日志

当JWT生成时，控制台会输出以下调试信息：

```
🕒 JWT expiration configured: {
  days: 7,
  seconds: 604800,
  expiresAt: "2025-01-08T10:22:28.200Z"
}
```

这可以帮助您确认配置是否正确生效。
