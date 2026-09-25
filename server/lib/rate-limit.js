/**
 * 按 IP 的固定窗口限流
 *
 * 图床上传和 AI 分析这两个接口都不鉴权，又都会调用要花钱的外部资源
 * （图床存储、Workers AI），所以共用这一套兜底。
 */

/**
 * 取客户端 IP
 */
export function getClientIp(c) {
    return c.req.header('CF-Connecting-IP') ||
           c.req.header('X-Forwarded-For') ||
           c.req.header('X-Real-IP') ||
           'unknown';
}

/**
 * 固定窗口限流，窗口 1 分钟。
 * KV 没绑定时直接放行，不因为限流本身把功能打挂。
 *
 * @param {Object} c Hono context
 * @param {Object} options
 * @param {string} options.scope 限流维度名，不同接口用不同 scope 各算各的
 * @param {number} options.limit 每分钟允许次数
 * @param {string} [options.key] 计数对象，默认按客户端 IP；已鉴权的接口可以传 userId 按用户计
 * @returns {Promise<boolean>} true 表示超限，应当拒绝
 */
export async function isRateLimited(c, { scope, limit, key }) {
    if (!c.env.USER_SESSIONS) {
        console.log(`⚠️ KV namespace not available, skipping ${scope} rate limit`);
        return false;
    }

    const subject = key || getClientIp(c);
    const bucket = Math.floor(Date.now() / 60000);
    const counterKey = `rl_${scope}_${subject}_${bucket}`;

    try {
        const current = parseInt(await c.env.USER_SESSIONS.get(counterKey) || '0', 10);
        if (current >= limit) {
            return true;
        }
        // KV 的 TTL 最小值是 60 秒
        await c.env.USER_SESSIONS.put(counterKey, String(current + 1), { expirationTtl: 60 });
        return false;
    } catch (error) {
        console.error(`限流检查失败，放行 (${scope}):`, error);
        return false;
    }
}
