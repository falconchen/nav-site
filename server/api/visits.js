/**
 * 访问统计同步接口：给「访问最多」多端同步用
 *
 * 只接受网页登录的 JWT（和 /notes 一样，个人令牌不能用）。
 * 合并规则和存储在 server/lib/visits-store.js。
 */

import { Hono } from 'hono';
import { requireSession } from '../lib/session-auth.js';
import { isRateLimited } from '../lib/rate-limit.js';
import { RedisError } from '../lib/redis.js';
import { VisitError, applyVisitUpdate, getVisits, parseVisitUpdate } from '../lib/visits-store.js';

// 点一次卡片上报一次，比记事本的写接口宽
const WRITE_RATE_LIMIT = 120;
// 首次同步会把本机整份统计传上来：500 个网址大约 100KB
const MAX_BODY_BYTES = 256 * 1024;

const app = new Hono();

app.use('/visits', requireSession);

function handle(handler) {
    return async (c) => {
        // 别的设备随时会改，不让浏览器和中间缓存留着
        c.header('Cache-Control', 'no-store');
        try {
            return await handler(c, c.get('user').userId);
        } catch (error) {
            if (error instanceof VisitError) {
                return c.json({ error: error.message, code: error.code }, error.status);
            }
            if (error instanceof RedisError) {
                console.error('访问统计存储不可用:', error.message);
                return c.json({ error: 'Visit storage unavailable', code: 'STORAGE_UNAVAILABLE' }, 503);
            }
            throw error;
        }
    };
}

app.get('/visits', handle(async (c, userId) => {
    return c.json({ success: true, ...(await getVisits(c.env, userId)) });
}));

app.post('/visits', handle(async (c, userId) => {
    if (await isRateLimited(c, { scope: 'visits_write', limit: WRITE_RATE_LIMIT, key: userId })) {
        return c.json({ error: 'Too many requests, please try again later', code: 'RATE_LIMITED' }, 429);
    }
    if (parseInt(c.req.header('Content-Length') || '0', 10) > MAX_BODY_BYTES) {
        throw new VisitError(413, 'BODY_TOO_LARGE', 'Request body too large');
    }
    let body;
    try {
        body = await c.req.json();
    } catch {
        throw new VisitError(400, 'INVALID_JSON', 'Invalid JSON body');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new VisitError(400, 'INVALID_JSON', 'Invalid JSON body');
    }
    const visits = await applyVisitUpdate(c.env, userId, parseVisitUpdate(body));
    return c.json({ success: true, ...visits });
}));

export default app;
