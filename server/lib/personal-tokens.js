/**
 * 个人访问令牌（Personal Access Token）
 *
 * 给浏览器扩展、脚本这类没法走 OAuth 弹窗的客户端用。和网页登录的 JWT 分开：
 * - 不过期，靠用户手动吊销；网页登出不影响它
 * - KV 里只存 SHA-256 摘要，明文只在创建时返回一次，泄露 KV 也拿不到可用令牌
 * - 带固定前缀，服务端据此区分 PAT 和 JWT，用户也容易在配置里认出来
 *
 * KV 布局（USER_SESSIONS 命名空间）：
 * - pat_<sha256>            → { id, userId, name, prefix, createdAt }
 * - pat_used_<sha256>       → 最后使用时间（ISO 字符串）
 * - pat_list_<userId>       → [{ id, hash }]  用来列出和吊销
 *
 * 最后使用时间单独存一个键：如果回写到 pat_<sha256>，吊销和回写并发时会把刚删掉的令牌写回来。
 *
 * 注意 KV 是最终一致的，吊销后其它边缘节点最长约 60 秒内仍可能认这个令牌。
 */

export const TOKEN_PREFIX = 'navpat_';
export const MAX_TOKENS_PER_USER = 10;
const MAX_NAME_LENGTH = 50;
// lastUsedAt 不必每次请求都写，KV 写入有配额，精确到小时足够用户判断令牌是否还在用
const LAST_USED_WRITE_INTERVAL_MS = 60 * 60 * 1000;
const LAST_USED_TTL_SECONDS = 400 * 24 * 60 * 60;

function toBase64Url(bytes) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isPersonalToken(token) {
    return typeof token === 'string' && token.startsWith(TOKEN_PREFIX);
}

export async function hashToken(token) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function listKey(userId) {
    return `pat_list_${userId}`;
}

async function readList(kv, userId) {
    const raw = await kv.get(listKey(userId));
    if (!raw) return [];
    try {
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function publicView(record, lastUsedAt = null) {
    return {
        id: record.id,
        name: record.name,
        prefix: record.prefix,
        createdAt: record.createdAt,
        lastUsedAt
    };
}

export function normalizeTokenName(name) {
    if (typeof name !== 'string') return '';
    return name.trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * 列出用户的令牌（不含明文和摘要）
 */
export async function listTokens(kv, userId) {
    const list = await readList(kv, userId);
    const records = await Promise.all(list.map(async ({ hash }) => {
        const [raw, lastUsedAt] = await Promise.all([
            kv.get(`pat_${hash}`),
            kv.get(`pat_used_${hash}`)
        ]);
        if (!raw) return null;
        try {
            return publicView(JSON.parse(raw), lastUsedAt);
        } catch {
            return null;
        }
    }));
    return records.filter(Boolean);
}

/**
 * 创建令牌，返回 { token, record }；超出数量上限返回 { error: 'limit' }
 */
export async function createToken(kv, userId, name) {
    const list = await readList(kv, userId);
    if (list.length >= MAX_TOKENS_PER_USER) {
        return { error: 'limit' };
    }

    const token = TOKEN_PREFIX + toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await hashToken(token);
    const record = {
        id: crypto.randomUUID(),
        userId,
        name,
        // 只留前缀方便用户在列表里对应是哪个令牌，不足以还原明文
        prefix: token.slice(0, TOKEN_PREFIX.length + 4),
        createdAt: new Date().toISOString()
    };

    await kv.put(`pat_${hash}`, JSON.stringify(record));
    list.push({ id: record.id, hash });
    await kv.put(listKey(userId), JSON.stringify(list));

    return { token, record: publicView(record) };
}

/**
 * 吊销令牌，找不到返回 false
 */
export async function revokeToken(kv, userId, id) {
    const list = await readList(kv, userId);
    const entry = list.find((item) => item.id === id);
    if (!entry) return false;

    await Promise.all([
        kv.delete(`pat_${entry.hash}`),
        kv.delete(`pat_used_${entry.hash}`)
    ]);
    await kv.put(listKey(userId), JSON.stringify(list.filter((item) => item.id !== id)));
    return true;
}

/**
 * 校验令牌，有效时返回记录，否则 null
 */
export async function verifyPersonalToken(kv, token, { waitUntil } = {}) {
    if (!isPersonalToken(token)) return null;

    const hash = await hashToken(token);
    const raw = await kv.get(`pat_${hash}`);
    if (!raw) return null;

    let record;
    try {
        record = JSON.parse(raw);
    } catch {
        return null;
    }

    // 放到响应之后做，不给每个 API 请求多加一次 KV 往返
    const touch = touchLastUsed(kv, hash).catch((error) => {
        console.error('更新令牌最后使用时间失败:', error);
    });
    if (waitUntil) waitUntil(touch); else await touch;

    return record;
}

async function touchLastUsed(kv, hash) {
    const key = `pat_used_${hash}`;
    const lastUsed = Date.parse(await kv.get(key) || '') || 0;
    if (Date.now() - lastUsed < LAST_USED_WRITE_INTERVAL_MS) return;
    await kv.put(key, new Date().toISOString(), { expirationTtl: LAST_USED_TTL_SECONDS });
}
