/**
 * 网页登录会话（JWT）鉴权
 *
 * JWT 本身能验签，但登出/踢设备要能立即失效，所以还要核对 KV 里的会话记录。
 */

import { verify } from 'hono/jwt';

/**
 * 校验网页会话 JWT
 *
 * @returns {Promise<{payload?: Object, error?: Object}>} 成功返回 payload，失败返回可直接回给前端的错误体
 */
export async function verifySessionToken(c, token) {
    let payload;
    try {
        payload = await verify(token, c.env.JWT_SECRET);
    } catch {
        return { error: { error: 'Invalid token' } };
    }

    if (!c.env.USER_SESSIONS) {
        console.log('⚠️ KV namespace not available, skipping server-side token validation');
        return { payload };
    }

    if (!payload.sessionId) {
        console.log('❌ No sessionId in token payload - token may be from old system');
        return {
            error: {
                error: 'Token format outdated',
                message: 'Please logout and login again to get a new token',
                needReauth: true
            }
        };
    }

    const sessionKey = `user_session_${payload.userId}_${payload.sessionId}`;
    const storedSessionData = await c.env.USER_SESSIONS.get(sessionKey);
    if (!storedSessionData) {
        console.log('❌ Session not found in KV');
        return { error: { error: 'Token not found or invalid' } };
    }

    try {
        const sessionInfo = JSON.parse(storedSessionData);
        if (sessionInfo.token !== token) {
            console.log('❌ Token mismatch for session');
            return { error: { error: 'Token not found or invalid' } };
        }
    } catch (parseError) {
        console.log('❌ Failed to parse session data:', parseError);
        return { error: { error: 'Token not found or invalid' } };
    }

    return { payload };
}

/**
 * 从 Authorization 头取 Bearer token，没有返回 null
 */
export function getBearerToken(c) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.slice('Bearer '.length).trim() || null;
}

/**
 * 中间件：只接受网页会话 JWT，把 payload 放到 c.get('user')
 */
export const requireSession = async (c, next) => {
    const token = getBearerToken(c);
    if (!token) {
        return c.json({ error: 'Missing or invalid authorization header' }, 401);
    }

    const { payload, error } = await verifySessionToken(c, token);
    if (error) {
        return c.json(error, 401);
    }

    c.set('user', payload);
    await next();
};
