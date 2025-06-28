## 检查 Wrangler 版本
```
npx wrangler --version
// or
npx wrangler version
// or
npx wrangler -v
```

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