/**
 * 个人访问令牌管理 API
 *
 * 只接受网页登录会话：令牌不能用来创建或吊销令牌，否则一个泄露的令牌就能自我续命。
 */

import { Hono } from 'hono';
import { requireSession } from '../lib/session-auth.js';
import {
    MAX_TOKENS_PER_USER,
    createToken,
    listTokens,
    normalizeTokenName,
    revokeToken
} from '../lib/personal-tokens.js';

const app = new Hono();

app.use('/tokens', requireSession);
app.use('/tokens/*', requireSession);

// 令牌存在 KV 里，没绑定就整个功能不可用
app.use('/tokens', requireKv);
app.use('/tokens/*', requireKv);

async function requireKv(c, next) {
    if (!c.env.USER_SESSIONS) {
        return c.json({ error: 'Token storage not available' }, 503);
    }
    await next();
}

app.get('/tokens', async (c) => {
    const user = c.get('user');
    const tokens = await listTokens(c.env.USER_SESSIONS, user.userId);
    return c.json({ success: true, tokens, limit: MAX_TOKENS_PER_USER });
});

app.post('/tokens', async (c) => {
    const user = c.get('user');
    let body = {};
    try {
        body = await c.req.json();
    } catch {
        // 允许空请求体，用默认名称
    }

    const name = normalizeTokenName(body.name) || '未命名令牌';
    const result = await createToken(c.env.USER_SESSIONS, user.userId, name);
    if (result.error === 'limit') {
        return c.json({
            error: `Token limit reached (${MAX_TOKENS_PER_USER})`,
            code: 'TOKEN_LIMIT'
        }, 409);
    }

    return c.json({ success: true, token: result.token, tokenInfo: result.record }, 201);
});

app.delete('/tokens/:id', async (c) => {
    const user = c.get('user');
    const removed = await revokeToken(c.env.USER_SESSIONS, user.userId, c.req.param('id'));
    if (!removed) {
        return c.json({ error: 'Token not found' }, 404);
    }
    return c.json({ success: true });
});

export default app;
