# 安全配置指南

## 📋 概述

本指南说明在 Cloudflare Workers 项目中，哪些配置可以安全地公开在 Git 仓库中，哪些必须保密。

## 🔐 配置分类

### ✅ 可以公开的配置（放在 `wrangler.jsonc`）

这些配置可以安全地提交到公开的 Git 仓库：

| 配置项 | 示例值 | 说明 |
|--------|--------|------|
| KV Namespace IDs | `"208b00870543476cb91dbe4ed1c2673e"` | 只是资源标识符，无访问权限 |
| GitHub Client ID | `"Ov23liKipGcajk33VBXL"` | OAuth 公开标识符 |
| 服务 URLs | `"https://glowing-stallion-58025.upstash.io"` | 公开的服务端点 |
| 配置参数 | `"JWT_EXPIRATION_DAYS": "7"` | 应用配置，非敏感信息 |

**为什么这些是安全的？**
- **KV Namespace ID**: 仅凭 ID 无法访问数据，需要 Cloudflare 账户权限
- **GitHub Client ID**: OAuth 标准中的公开标识符，设计就是要公开的
- **服务 URLs**: 公开的端点地址，不包含认证信息

### ❌ 必须保密的配置（放在 `.dev.vars` 或 Cloudflare Secrets）

这些配置绝不能提交到 Git 仓库：

| 配置项 | 说明 | 存储位置 |
|--------|------|----------|
| `GITHUB_CLIENT_SECRET` | GitHub OAuth 密钥 | `.dev.vars` (本地) + Cloudflare Secrets (生产) |
| `JWT_SECRET` | JWT 签名密钥 | `.dev.vars` (本地) + Cloudflare Secrets (生产) |
| `UPSTASH_REDIS_REST_TOKEN` | Redis 访问令牌 | `.dev.vars` (本地) + Cloudflare Secrets (生产) |

## 🏗️ 当前配置结构

### `wrangler.jsonc` - 公开配置
```json
{
  "vars": {
    "GITHUB_CLIENT_ID": "Ov23liKipGcajk33VBXL",           // ✅ 公开
    "UPSTASH_REDIS_REST_URL": "https://glowing-stallion-58025.upstash.io", // ✅ 公开
    "JWT_EXPIRATION_DAYS": "7"                              // ✅ 公开
  },
  "kv_namespaces": [
    {
      "binding": "USER_SESSIONS",
      "id": "208b00870543476cb91dbe4ed1c2673e"              // ✅ 公开
    }
  ]
}
```

### `.dev.vars` - 敏感配置（本地开发）
```ini
# ❌ 敏感信息 - 不要提交到 Git
GITHUB_CLIENT_SECRET=6e65da533a06c0bfb4534708a58cb458752a4442
UPSTASH_REDIS_REST_TOKEN=AeKpAAIjcDExZmY5ZmQwYzJhNDg0MDBlYWVhMjMxZTU2ZGRlNTE3ZXAxMA
JWT_SECRET=xPidtTJeZ2Mt3Tegv6EauBNBaem22y7R
```

## 🔒 安全机制说明

### KV Namespace 安全性

**为什么 KV Namespace ID 可以公开？**

1. **需要双重认证**:
   ```
   KV Namespace ID + Cloudflare 账户权限 = 数据访问
   ```

2. **类似数据库表名**:
   - 知道表名不等于能访问数据
   - 需要有效的数据库连接和权限

3. **Cloudflare 架构要求**:
   - Worker 必须在配置中声明 binding
   - 运行时通过 `env.BINDING_NAME` 访问
   - 无法通过其他方式绕过

### GitHub OAuth 安全性

**为什么 Client ID 可以公开？**

1. **OAuth 2.0 标准设计**:
   ```
   Client ID (公开) + Client Secret (保密) = 完整认证
   ```

2. **前端应用需要**:
   - 浏览器必须知道 Client ID 才能发起 OAuth
   - 即使隐藏也会在网络请求中暴露

3. **GitHub 官方做法**:
   - GitHub 本身就将 Client ID 设计为公开标识符
   - 安全性完全依赖 Client Secret

## 🛡️ 进一步的安全建议

### 1. 环境隔离

为不同环境使用不同的资源：

```json
{
  "kv_namespaces": [
    { "binding": "USER_SESSIONS", "id": "dev_namespace_id" }
  ],
  "env": {
    "production": {
      "kv_namespaces": [
        { "binding": "USER_SESSIONS", "id": "prod_namespace_id" }
      ]
    }
  }
}
```

### 2. 最小权限原则

- 开发环境使用受限的测试数据
- 生产环境使用完全隔离的资源
- 定期轮换敏感密钥

### 3. 监控和审计

- 启用 Cloudflare 访问日志
- 监控异常的 API 调用
- 定期检查账户权限

## 📚 相关资源

- [Cloudflare Workers 安全模型](https://developers.cloudflare.com/workers/reference/security-model/)
- [KV 数据安全](https://developers.cloudflare.com/kv/reference/data-security/)
- [环境变量最佳实践](https://developers.cloudflare.com/workers/configuration/environment-variables/)

## ❓ 常见问题

**Q: 如果有人知道了我的 KV Namespace ID 怎么办？**
A: 没有你的 Cloudflare 账户权限，他们无法访问其中的数据。这就像知道了银行账号但没有密码一样。

**Q: 我可以把 GitHub Client ID 放在环境变量中吗？**
A: 可以，但没必要。Client ID 本身就是设计为公开的，隐藏它不会增加安全性。

**Q: 生产环境的密钥怎么管理？**
A: 使用 `wrangler secret put` 命令将敏感信息直接存储在 Cloudflare 中，不要放在任何配置文件里。

---

## 🎯 总结

**核心原则**: 公开的是标识符，保密的是认证凭据。KV Namespace ID 和 GitHub Client ID 是标识符，可以安全地放在公开仓库中。真正的安全边界在于 Cloudflare 账户权限和各种 Secret 密钥。
