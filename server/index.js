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
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import analyzeApi from './api/analyze.js';
import proxyImageApi from './api/proxy-image.js';
import uploadImageApi from './api/upload-image.js';
import authApi from './api/auth.js';
import userDataApi from './api/user-data.js';
import tokensApi from './api/tokens.js';
import v1Api from './api/v1.js';
import notesApi, { loadPublicNoteForPage } from './api/notes.js';
import visitsApi from './api/visits.js';
import shareApi from './api/share.js';
import oauthApi, { AUTHORIZE_PATH, MCP_SCOPE } from './api/oauth.js';
import mcpApp, { MCP_PATH } from './mcp/index.js';
import { isPersonalToken, verifyPersonalToken } from './lib/personal-tokens.js';
import { withSecurityHeaders } from './lib/security-headers.js';
import { renderPublicNotePage } from './lib/note-public-page.js';

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

// 测试接口：打印用户UA和IP
app.get('/test/user-info', (c) => {
	// 获取用户的 IP 地址
	const ip = c.req.header('CF-Connecting-IP') ||
	           c.req.header('X-Forwarded-For') ||
	           c.req.header('X-Real-IP') ||
	           '未知IP';

	// 获取用户的 User-Agent
	const userAgent = c.req.header('User-Agent') || '未知User-Agent';

	// 获取国家信息（Cloudflare 提供）
	const country = c.req.header('CF-IPCountry') || '未知国家';

	// 打印到控制台
	console.log('=== 用户信息测试 ===');
	console.log('IP地址:', ip);
	console.log('User-Agent:', userAgent);
	console.log('国家:', country);
	console.log('==================');

	// 返回JSON格式的信息
	return c.json({
		success: true,
		userInfo: {
			ip: ip,
			userAgent: userAgent,
			country: country,
			timestamp: new Date().toISOString()
		},
		message: '用户信息已打印到控制台'
	});
});

// API 路由
app.route('/api', analyzeApi);
app.route('/api', proxyImageApi);
app.route('/api', uploadImageApi);
app.route('/api', authApi);
app.route('/api', userDataApi);
app.route('/api', tokensApi);
app.route('/api', v1Api);
app.route('/api', notesApi);
app.route('/api', visitsApi);
app.route('/api', shareApi);
app.route('/api', oauthApi);

// 公开发布的记事：/n/<公开 id> 用静态页 note-public.html 做模板，服务端填好标题和分享卡片的 og 标签，
// 记事数据内联进页面，正文仍在浏览器里渲染（server/lib/note-public-page.js）。
// 是用户发布的内容，不让搜索引擎收录
app.get('/n/:id', async (c) => {
	const pageUrl = new URL(c.req.url);
	const assetUrl = new URL('/note-public', pageUrl);
	// 不转发条件请求头：页面内容是动态的，拿到 304 就没有模板可改写了
	const asset = await c.env.ASSETS.fetch(new Request(assetUrl));
	if (!asset.ok) return asset;

	const loaded = await loadPublicNoteForPage(c, c.req.param('id'));
	const page = loaded ? renderPublicNotePage(asset, { note: loaded.note, url: pageUrl }) : asset;
	const headers = new Headers(asset.headers);
	for (const name of ['ETag', 'Last-Modified', 'Content-Length']) headers.delete(name);
	// 取消发布要立刻生效
	headers.set('Cache-Control', 'no-store');
	headers.set('X-Robots-Tag', 'noindex, nofollow');
	return new Response(page.body, { status: loaded && !loaded.note ? 404 : 200, headers });
});

// iOS 快捷指令浮层用的添加页：网址里带短时令牌，不让它经 Referer 泄露，也不让搜索引擎收录
app.get('/add', async (c) => {
	const asset = await c.env.ASSETS.fetch(c.req.raw);
	const response = new Response(asset.body, asset);
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	response.headers.set('Cache-Control', 'no-store');
	return response;
});

// MCP 的 OAuth 授权页：地址里带着授权请求，不让它经 Referer 泄露；禁止被嵌进别的页面，防点击劫持
app.get(AUTHORIZE_PATH, async (c) => {
	const url = new URL(c.req.url);
	url.pathname = '/oauth-authorize';
	url.search = '';
	const asset = await c.env.ASSETS.fetch(new Request(url, c.req.raw));
	const response = new Response(asset.body, asset);
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
	response.headers.set('Cache-Control', 'no-store');
	return response;
});

// 授权页只能从上面的路由进：直接访问静态文件拿不到那些响应头，等于把防嵌入的保护绕过去了
for (const path of ['/oauth-authorize', '/oauth-authorize/', '/oauth-authorize.html']) {
	app.get(path, (c) => c.text('页面未找到', 404));
}

// 添加：处理所有静态资源请求
app.get('/*', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});

// 404 处理
app.notFound((c) => {
	return c.text('页面未找到', 404);
});

// ---------- MCP 与 OAuth ----------
//
// OAuthProvider 包在整个应用外面：/mcp 的请求先由它校验令牌，令牌端点、客户端注册和
// /.well-known 元数据由它直接应答，其余请求原样交给上面的 Hono 应用。
// 授权页和「是否同意」是应用自己的事，见 server/api/oauth.js。

const ACCESS_TOKEN_TTL = 60 * 60;
// 一直在用就不用重新授权，闲置满 90 天才失效
const REFRESH_TOKEN_IDLE_TTL = 90 * 24 * 60 * 60;

function createOAuthProvider(origin) {
	// 令牌只在这一个资源上有效（RFC 8707）。域名写不死：本地是 127.0.0.1，线上是正式域名
	const resource = `${origin}${MCP_PATH}`;
	return new OAuthProvider({
		apiRoute: MCP_PATH,
		apiHandler: { fetch: mcpApp.fetch },
		defaultHandler: { fetch: app.fetch },
		authorizeEndpoint: AUTHORIZE_PATH,
		tokenEndpoint: '/oauth/token',
		clientRegistrationEndpoint: '/oauth/register',
		clientIdMetadataDocumentEnabled: true,
		scopesSupported: [MCP_SCOPE],
		requiredScopes: [MCP_SCOPE],
		accessTokenTTL: ACCESS_TOKEN_TTL,
		refreshTokenTTL: REFRESH_TOKEN_IDLE_TTL,
		refreshTokenIdleTTL: REFRESH_TOKEN_IDLE_TTL,
		resourceMetadata: { resource, resource_name: '皮皮2047' },
		// 不是它签发的令牌会问到这里：个人令牌（navpat_）也能直接用，给配置里能写请求头的客户端
		resolveExternalToken: async ({ token, env }) => {
			if (!isPersonalToken(token) || !env.USER_SESSIONS) return null;
			const record = await verifyPersonalToken(env.USER_SESSIONS, token);
			if (!record) return null;
			return {
				props: { userId: record.userId, via: 'token', tokenName: record.name },
				audience: resource
			};
		}
	});
}

// 每个 origin 建一次。建不出来（比如本地用非回环的 http 地址访问，OAuth 要求 https）记成 null，
// 这时站点其余功能照常，只是没有 MCP
const providers = new Map();

function getOAuthProvider(origin) {
	if (!providers.has(origin)) {
		let provider = null;
		try {
			provider = createOAuthProvider(origin);
		} catch (error) {
			console.error(`这个地址上不启用 MCP（${origin}）:`, error.message);
		}
		providers.set(origin, provider);
	}
	return providers.get(origin);
}

// 导出默认处理函数
export default {
	// 安全响应头加在最外层：/mcp、/oauth/token 这些由库直接应答的响应不经过 Hono 应用
	async fetch(request, env, ctx) {
		const provider = getOAuthProvider(new URL(request.url).origin);
		// 库会把自己的辅助对象挂到 env.OAUTH_PROVIDER 上且只挂一次；传一份浅拷贝，免得不同 origin 的请求互相串
		const response = provider
			? await provider.fetch(request, { ...env }, ctx)
			: await app.fetch(request, env, ctx);
		return withSecurityHeaders(response);
	},
};
