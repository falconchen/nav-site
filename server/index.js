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
import { cors } from 'hono/cors';
import analyzeApi from './api/analyze.js';
import proxyImageApi from './api/proxy-image.js';
import authApi from './api/auth.js';
import userDataApi from './api/user-data.js';

// 创建 Hono 应用
const app = new Hono();

// 启用CORS
app.use('*', cors());

// 处理根路径请求
app.get('/', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});


// 返回随机 UUID
app.get('/uuid', (c) => {
	return c.text(crypto.randomUUID());
});

// API 路由
app.route('/api', analyzeApi);
app.route('/api', proxyImageApi);
app.route('/api', authApi);
app.route('/api', userDataApi);

// 添加：处理所有静态资源请求
app.get('/*', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});

// 404 处理
app.notFound((c) => {
	return c.text('页面未找到', 404);
});

// 导出默认处理函数
export default {
	fetch: app.fetch,
};
