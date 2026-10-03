## 检查 Wrangler 版本
```bash
npx wrangler --version
# 或
npx wrangler -v
```

## 部署

```
npx wrangler deploy
```

要禁用自动部署，同时仍允许构建自动运行并保存为版本 （而不将其提升为活动部署），请将部署命令更新为：npx wrangler versions upload。


要恢复推送后代码自动构建并成为活动版本（自动部署），您需要：

1. 登录 Cloudflare 仪表盘
2. 进入 **Workers & Pages**
3. 选择您的 Worker 项目
4. 点击 **设置** 然后选择 **Builds**
5. 将部署命令更改回 `npx wrangler deploy`

这样，每次您向关联的 Git 仓库推送代码时，Cloudflare 将自动构建您的 Worker 并将新版本设置为活动部署。

`npx wrangler versions upload` 只是临时解决方案，让您可以控制何时手动激活新版本。一旦您准备好恢复自动部署流程，只需将部署命令改回 `npx wrangler deploy` 即可。


## 静态资源绑定的问题

run_worker_first 为 true 时，需要这样设置，否则css及js等静态资源404

```
// wrangler.jsonc
	"assets": {
    "directory": "./public",
		"run_worker_first": true,
    "binding": "ASSETS"
  },
```

``` js
// 处理根路径请求
app.get('/', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});

// 添加：处理所有静态资源请求 run_worker_first时需要这样设置，否则css及js等静态资源404
app.get('/*', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});

```

## 设置正式环境的环境变量

```
npx wrangler secret put USER_AGENT --env production
```

```
npx wrangler secret put ACCEPT_LANGUAGE --env production
```

## Wrangler 升级与验证（2026-10-04）

### 背景和修改

Wrangler 从 `4.22.0` 升级到本次查询 npm `latest` 得到的稳定版 `4.147.0`。新版 Wrangler 要求 Node.js >= 22；项目声明 Node.js >= 22.12.0，以兼容测试工具链，建议使用 22 或 24 LTS。

原来的 `@cloudflare/vitest-pool-workers@0.8.41` 自带 Wrangler `4.20.3` 和旧版 workerd，单独升级 CLI 会导致测试仍运行在旧运行时。按官方迁移指引改为 `@cloudflare/vitest-plugin@1.3.6` 和 Vitest `4.1.11`，测试插件与 CLI 使用相同的 Wrangler、Miniflare 和 workerd 版本。

`vitest.config.js` 更名为 `vitest.config.mjs`，改用 `vitest/config` 的 `defineConfig()` 和 `cloudflareTest()`，替代已经移除的 `defineWorkersConfig()` / `test.poolOptions.workers` 配置。新插件只提供 ESM，`.mjs` 可以避免配置被按 CommonJS 加载，同时保留现有 CommonJS 构建脚本。Vitest 保持在插件声明支持的 4.1 系列。

项目构建依赖 esbuild 从 `0.25.5` 升级到 0.28 系列（锁文件为 `0.28.2`），满足新版测试依赖 Vite 8 的 esbuild peer 范围。Wrangler 内部依赖为 `0.28.1`。

新插件默认连接远程绑定，现有 AI 配置会在测试启动时尝试 Cloudflare 登录。测试已模拟 AI 和外部 fetch，因此在 `cloudflareTest()` 中显式设置 `remoteBindings: false`，让单元测试无需 Cloudflare 账号或网络连接。

本次保留 `wrangler.jsonc` 的 `compatibility_date: "2025-06-17"` 和现有兼容标志、资源目录及绑定。CLI 升级不要求推进兼容日期；以后修改日期应单独验证运行时行为。

### 安装和验证方式

```bash
node --version
npm ci
npx wrangler --version
npm ls wrangler @cloudflare/vitest-plugin vitest miniflare workerd
npm test -- --run
npm run build
npx wrangler deploy --env production --dry-run
git diff --check
```

`--dry-run` 只在本地校验配置和打包，不发布 Worker。可以用 `npm run dev -- --local --ip 127.0.0.1` 启动不连接远程绑定的开发服务器，检查首页、静态资源、`/uuid` 和未登录的 API 响应。Workers AI、OAuth 和外部 Redis 服务需要各自的凭据，单元测试使用模拟响应，不能据此声称真实外部服务已验证。

### 本次验证结果

验证环境为 macOS 14.8.9、Node.js 22.22.3 和 npm 10.9.8。

- 升级前后均为 24 个测试文件、443 项测试全部通过；关闭远程绑定后，测试退出也不再等待远程连接超时。
- `npm ci` 按新锁文件安装成功，`npm ls` 没有无效 peer 依赖；Wrangler CLI 和测试插件均使用 Wrangler `4.147.0`、Miniflare `5.20261001.0-alpha` 和 workerd `1.20261001.1`。Miniflare 的 alpha 版本是本次官方稳定版 Wrangler 的内置依赖。
- `npm run build` 和生产配置的 `wrangler deploy --env production --dry-run` 通过，后者识别到 40 个静态文件。
- 开发服务检查通过：首页、CSS、JS、工具页、记事页、PWA 清单及公开记事页返回 200；`/uuid` 返回合法 UUID v4；未登录的记事和 REST API 返回 401；不存在的静态资源返回 404。测试使用独立的临时 KV 状态目录，结束后停止开发服务。
- `git diff --check` 通过。

首次用 npm 10 替换旧测试依赖时遇到其依赖树解析错误 `Cannot read properties of null (reading 'edgesOut')`，本次改用本机 Node.js 24.20.0 / npm 11.19.0 生成锁文件；随后确认常用的 Node.js 22 / npm 10 可以执行 `npm ci` 和全部测试。

`npm audit` 仍报告既存的 `hono@4.8.3` 为 1 个高危依赖项。本次没有升级 Hono 或改变业务代码，应另行升级 Hono 并验证 JWT、认证和路由行为；本次检查不能视为整个项目的安全审计。

### 后续升级注意事项

- 一起检查 Wrangler 和测试插件版本，确认 `npm ls` 不再保留旧版 Wrangler / workerd。
- 先查看测试插件的 `peerDependencies` 再选择 Vitest 主版本；本次插件支持 `^4.1.0`，不支持 Vitest 5。
- Cloudflare 自动构建环境也需要 Node.js >= 22.12.0。推送到 `master` 会触发项目已有的自动部署流程。
- 更新依赖后提交 `package.json`、`package-lock.json` 和相关配置，让其他环境通过 `npm ci` 重现依赖。

参考：[Wrangler 官方发布记录](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.147.0)、[迁移到 Vitest 插件](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/)、[迁移到 Vitest 4](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-from-vitest-3-to-vitest-4/)。
