# GitHub 登录和数据同步配置指南

本项目已集成 GitHub OAuth 登录和 Upstash Redis 数据同步功能。请按照以下步骤完成配置：

## 1. GitHub OAuth 应用配置

### 1.1 创建 GitHub OAuth 应用

1. 访问 https://github.com/settings/developers
2. 点击 "New OAuth App"
3. 填写应用信息：
   - **Application name**: 你的应用名称（如：导航网站）
   - **Homepage URL**: 你的网站 URL（如：https://your-domain.com）
   - **Authorization callback URL**: `https://your-domain.com/api/auth/github/callback`
4. 点击 "Register application"
5. 记录下生成的 `Client ID` 和 `Client Secret`

### 1.2 本地开发配置

对于本地开发，callback URL 应该设置为：

```
http://localhost:8787/api/auth/github/callback
```

## 2. Upstash Redis 配置

### 2.1 创建 Upstash Redis 数据库

1. 访问 https://upstash.com/
2. 注册并登录账户
3. 点击 "Create Database"
4. 选择合适的区域（推荐选择离用户最近的区域）
5. 创建后获取：
   - **UPSTASH_REDIS_REST_URL**: REST API URL
   - **UPSTASH_REDIS_REST_TOKEN**: REST API Token

## 3. 环境变量配置

### 3.1 开发环境配置

编辑 `.dev.vars` 文件，填入实际的配置信息：

```env
# GitHub OAuth配置
GITHUB_CLIENT_ID=your_actual_github_client_id
GITHUB_CLIENT_SECRET=your_actual_github_client_secret

# Upstash Redis配置
UPSTASH_REDIS_REST_URL=https://your-redis-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_actual_redis_token

# JWT密钥（建议使用强随机字符串）
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random
```

### 3.2 生产环境配置

使用 Wrangler CLI 设置生产环境密钥：

```bash
# 设置GitHub OAuth密钥
wrangler secret put GITHUB_CLIENT_SECRET

# 设置Upstash Redis Token
wrangler secret put UPSTASH_REDIS_REST_TOKEN

# 设置JWT密钥
wrangler secret put JWT_SECRET
```

然后更新 `wrangler.jsonc` 中的公开变量：

```jsonc
"vars": {
  "GITHUB_CLIENT_ID": "your_actual_github_client_id",
  "UPSTASH_REDIS_REST_URL": "https://your-redis-endpoint.upstash.io",
  "JWT_SECRET": "" // 这个会被secret覆盖
}
```

## 4. Cloudflare KV 配置

### 4.1 创建 KV 命名空间

```bash
# 创建开发环境KV
wrangler kv:namespace create "USER_SESSIONS" --preview

# 创建生产环境KV
wrangler kv:namespace create "USER_SESSIONS"
```

### 4.2 更新 wrangler.jsonc

将生成的 KV 命名空间 ID 更新到 `wrangler.jsonc`：

```jsonc
"kv_namespaces": [
  {
    "binding": "USER_SESSIONS",
    "id": "your_actual_kv_namespace_id",
    "preview_id": "your_actual_preview_kv_namespace_id"
  }
]
```

## 5. 功能特性

### 5.1 用户认证

- GitHub OAuth 登录
- JWT token 会话管理
- 自动登录状态检测

### 5.2 数据同步

- 用户网站数据云端存储
- 自动同步本地变更
- 数据冲突合并策略
- 跨设备数据同步

### 5.3 安全特性

- CSRF 保护（state 参数）
- JWT token 过期管理
- 安全的密钥存储

## 6. API 端点

### 认证相关

- `GET /api/auth/github` - 发起 GitHub 登录
- `GET /api/auth/github/callback` - GitHub 登录回调
- `GET /api/auth/verify` - 验证 token 有效性
- `POST /api/auth/logout` - 用户登出

### 数据同步相关

- `POST /api/user-data/save` - 保存用户数据
- `GET /api/user-data/load` - 加载用户数据
- `POST /api/user-data/merge` - 合并本地和云端数据
- `GET /api/user-data/status` - 获取同步状态
- `DELETE /api/user-data/delete` - 删除用户数据

## 7. 使用说明

1. 用户点击"登录"按钮进行 GitHub 认证
2. 登录成功后，用户数据会自动同步到云端
3. 数据变更时会自动保存到 Redis
4. 支持手动点击"同步数据"进行强制同步
5. 页面关闭前会自动保存最新数据

## 8. 故障排除

### 8.1 常见问题

**问题：登录弹窗被阻止**

- 解决：确保浏览器允许弹出窗口

**问题：回调 URL 不匹配**

- 解决：检查 GitHub OAuth 应用的 callback URL 配置

**问题：Redis 连接失败**

- 解决：验证 Upstash Redis 配置信息是否正确

**问题：JWT token 无效**

- 解决：检查 JWT_SECRET 是否配置正确

### 8.2 日志调试

查看浏览器控制台和 Cloudflare Workers 日志进行问题排查。

## 9. 注意事项

1. **隐私保护**: 用户数据存储在用户自己的 Redis 实例中
2. **数据备份**: 建议定期备份重要数据
3. **访问控制**: 每个用户只能访问自己的数据
4. **性能优化**: Redis 缓存提供快速的数据访问
5. **扩展性**: 支持大量用户同时使用

配置完成后，重启开发服务器或重新部署即可使用新功能。
