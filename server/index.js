/**
 * 欢迎使用 Cloudflare Workers! 这是你的第一个 worker.
 *
 * - 在终端运行 `npm run dev` 启动开发服务器
 * - 在浏览器打开 http://localhost:8787/ 查看你的 worker
 * - 运行 `npm run deploy` 发布你的 worker
 *
 * 了解更多：https://developers.cloudflare.com/workers/
 */

import { Hono } from 'hono';

// 创建 Hono 应用
const app = new Hono();

// 处理根路径请求
app.get('/', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});

// 添加：处理所有静态资源请求 run_worker_first时需要这样设置
app.get('/*', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});

// 返回问候消息
app.get('/message', (c) => {
	return c.text('你好，世界！');
});

// 返回随机 UUID
app.get('/random', (c) => {
	return c.text(crypto.randomUUID());
});

// 404 处理
app.notFound((c) => {
	return c.text('页面未找到', 404);
});

// 导出默认处理函数
export default {
	fetch: app.fetch,
};
