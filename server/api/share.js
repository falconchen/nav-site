/**
 * 分享草稿：iOS 快捷指令用个人令牌换一个带短时令牌的 /add 网址，再用「显示网页」以浮层打开。
 * 令牌的说明见 server/lib/share-tokens.js，页面是 public/add.html。
 */

import { Hono } from 'hono';
import { getBearerToken } from '../lib/session-auth.js';
import { isPersonalToken, verifyPersonalToken } from '../lib/personal-tokens.js';
import { createShareToken } from '../lib/share-tokens.js';
import { isRateLimited } from '../lib/rate-limit.js';
import { parseHttpUrl } from './v1.js';

const app = new Hono();

const DRAFT_RATE_LIMIT = 30;
const MAX_URL_LENGTH = 2048;

function getWaitUntil(c) {
    try {
        const ctx = c.executionCtx;
        return ctx.waitUntil.bind(ctx);
    } catch {
        return undefined;
    }
}

// 只接受个人令牌：个人令牌只放在快捷指令的请求头里，不会出现在网址中
app.post('/share/draft', async (c) => {
    const token = getBearerToken(c);
    if (!isPersonalToken(token)) {
        return c.json({ error: 'A personal access token is required' }, 401);
    }
    if (!c.env.USER_SESSIONS) {
        return c.json({ error: 'Token storage not available' }, 503);
    }
    const record = await verifyPersonalToken(c.env.USER_SESSIONS, token, { waitUntil: getWaitUntil(c) });
    if (!record) {
        return c.json({ error: 'Invalid or revoked token' }, 401);
    }

    if (await isRateLimited(c, { scope: 'share_draft', limit: DRAFT_RATE_LIMIT, key: record.userId })) {
        return c.json({ error: 'Too many requests, please try again later' }, 429);
    }

    let body;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const url = typeof body?.url === 'string' && body.url.length <= MAX_URL_LENGTH ? parseHttpUrl(body.url) : null;
    if (!url) {
        return c.json({ error: 'Field "url" must be an http(s) URL' }, 400);
    }

    const shareToken = await createShareToken(c.env.USER_SESSIONS, { userId: record.userId, url });
    const editUrl = new URL('/add', c.req.url);
    editUrl.searchParams.set('url', url);
    editUrl.searchParams.set('t', shareToken);

    c.header('Cache-Control', 'no-store');
    return c.json({ edit_url: editUrl.href });
});

export default app;
