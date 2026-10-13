/**
 * MCP 的 OAuth 授权：授权页用的接口，和「已授权的应用」的管理
 *
 * 令牌端点、客户端注册、元数据都由 @cloudflare/workers-oauth-provider 处理（见 server/index.js），
 * 这里只有它留给应用自己做的那一段：确认是谁在授权、要不要同意。
 *
 * 授权页（public/oauth-authorize.html）是静态页，把地址栏里的授权请求原样传过来。
 * 「同意」带着网页登录的 JWT 走 Authorization 头：别的网站拿不到这个令牌，所以伪造不了同意请求，
 * 页面本身禁止被嵌进 iframe。每次授权都要用户亲手点，不记住、不自动放行，因为谁都能来注册成客户端。
 */

import { Hono } from 'hono';
import { AuthorizationError, CimdFetchError, authorizationErrorRedirect } from '@cloudflare/workers-oauth-provider';
import { requireSession } from '../lib/session-auth.js';

const app = new Hono();

export const AUTHORIZE_PATH = '/oauth/authorize';
// 这个服务只有一种权限：读收藏、添加收藏、读写记事本
export const MCP_SCOPE = 'mcp';

const MAX_QUERY_LENGTH = 4000;

app.use('/oauth/*', async (c, next) => {
    // 本地用非回环的 http 地址访问时建不出 OAuth 服务（见 server/index.js），这组接口也就用不了
    if (!c.env.OAUTH_PROVIDER) {
        return c.json({ error: 'OAuth is not available on this origin', code: 'OAUTH_UNAVAILABLE' }, 503);
    }
    c.header('Cache-Control', 'no-store');
    await next();
});

/**
 * 把授权页传来的查询串还原成授权请求并校验（客户端是否存在、回调地址是否登记过、PKCE 等）
 */
function parseAuthQuery(c, query) {
    if (typeof query !== 'string' || !query || query.length > MAX_QUERY_LENGTH) {
        throw new AuthorizationError('invalid_request', { description: 'Missing authorization request' });
    }
    const url = new URL(AUTHORIZE_PATH, c.req.url);
    url.search = query.replace(/^\?/, '');
    return c.env.OAUTH_PROVIDER.parseAuthRequest(new Request(url));
}

// 授权请求本身有问题时的响应。回调地址通过校验后才把错误带回客户端，否则只在授权页上显示
function authErrorResponse(c, error) {
    if (error instanceof AuthorizationError) {
        return c.json({
            error: error.description || error.message,
            code: 'INVALID_AUTH_REQUEST',
            redirectTo: error.redirectTo || null
        }, 400);
    }
    if (error instanceof CimdFetchError) {
        return c.json({ error: 'This app could not be verified', code: 'CLIENT_UNVERIFIED', redirectTo: null }, 400);
    }
    throw error;
}

// 授权页要显示的内容：谁在申请、授权后把令牌交到哪里
app.get('/oauth/request', async (c) => {
    try {
        const request = await parseAuthQuery(c, new URL(c.req.url).search);
        const details = await c.env.OAUTH_PROVIDER.describeConsent(request);
        return c.json({
            success: true,
            client: {
                name: details.clientName,
                // 只有用元数据文档登记的客户端才有核实过的域名，自己注册的名字是自称的
                domain: details.clientDomain || null
            },
            redirectHost: details.redirectHost,
            redirectIsLoopback: details.redirectIsLoopback
        });
    } catch (error) {
        return authErrorResponse(c, error);
    }
});

app.post('/oauth/approve', requireSession, async (c) => {
    const { userId } = c.get('user');
    let body;
    try {
        body = await c.req.json();
    } catch {
        body = null;
    }

    try {
        const request = await parseAuthQuery(c, body?.query);
        const details = await c.env.OAUTH_PROVIDER.describeConsent(request);
        const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
            request,
            userId,
            // metadata 不加密，只放「已授权的应用」列表要显示的东西
            metadata: { clientName: details.clientName, redirectHost: details.redirectHost },
            scope: [MCP_SCOPE],
            props: { userId, via: 'oauth', clientName: details.clientName }
        });
        return c.json({ success: true, redirectTo });
    } catch (error) {
        return authErrorResponse(c, error);
    }
});

// 拒绝不需要登录：只是带着 access_denied 跳回已经校验过的回调地址
app.post('/oauth/deny', async (c) => {
    let body;
    try {
        body = await c.req.json();
    } catch {
        body = null;
    }

    try {
        const request = await parseAuthQuery(c, body?.query);
        return c.json({ success: true, redirectTo: authorizationErrorRedirect(request, 'access_denied') });
    } catch (error) {
        return authErrorResponse(c, error);
    }
});

// ---------- 已授权的应用 ----------

app.get('/oauth/grants', requireSession, async (c) => {
    const { userId } = c.get('user');
    const grants = [];
    let cursor;
    do {
        const page = await c.env.OAUTH_PROVIDER.listUserGrants(userId, { cursor });
        grants.push(...page.items);
        cursor = page.cursor;
    } while (cursor);

    return c.json({
        success: true,
        grants: grants
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((grant) => ({
                id: grant.id,
                clientName: grant.metadata?.clientName || '未命名应用',
                redirectHost: grant.metadata?.redirectHost || null,
                createdAt: new Date(grant.createdAt * 1000).toISOString(),
                expiresAt: grant.expiresAt ? new Date(grant.expiresAt * 1000).toISOString() : null
            }))
    });
});

// 撤销后这次授权签发的访问令牌和刷新令牌一起失效
app.delete('/oauth/grants/:id', requireSession, async (c) => {
    const { userId } = c.get('user');
    const grantId = c.req.param('id');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(grantId)) {
        return c.json({ error: 'Grant not found' }, 404);
    }
    await c.env.OAUTH_PROVIDER.revokeGrant(grantId, userId);
    return c.json({ success: true });
});

export default app;
