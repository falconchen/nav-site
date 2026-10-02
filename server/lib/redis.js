/**
 * Upstash Redis（REST）的薄封装，值一律存 JSON
 *
 * 和 user-data.js 里那套 fetch 写法是同一个协议，区别是失败会抛 RedisError：
 * 记事本是「读索引 → 改 → 写回」，读失败如果当成「没有数据」，下一步写回就会把索引清空。
 */

export class RedisError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RedisError';
    }
}

function credentials(env) {
    const url = env.UPSTASH_REDIS_REST_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        throw new RedisError('Redis credentials not configured');
    }
    return { url, token };
}

async function command(env, path, init = {}) {
    const { url, token } = credentials(env);
    let response;
    try {
        response = await fetch(`${url}/${path}`, {
            ...init,
            headers: { 'Authorization': `Bearer ${token}`, ...init.headers }
        });
    } catch (error) {
        throw new RedisError(`Redis request failed: ${error.message}`);
    }
    if (!response.ok) {
        throw new RedisError(`Redis responded ${response.status}`);
    }
    return (await response.json()).result;
}

/**
 * @returns {Promise<any|null>} 解析后的值，key 不存在返回 null
 */
export async function redisGet(env, key) {
    const result = await command(env, `get/${key}`);
    if (result === null || result === undefined) return null;
    try {
        return JSON.parse(result);
    } catch {
        throw new RedisError(`Redis value of ${key} is not JSON`);
    }
}

export async function redisSet(env, key, value) {
    await command(env, `set/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value)
    });
}

export async function redisDel(env, key) {
    await command(env, `del/${key}`, { method: 'POST' });
}
