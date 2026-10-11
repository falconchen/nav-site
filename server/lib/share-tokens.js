/**
 * 分享令牌：iOS 快捷指令「显示网页」浮层用的短时凭证
 *
 * 浮层（Safari View）和 Safari、主屏幕 PWA 的存储互相隔离，拿不到 localStorage 里的登录令牌，
 * 「显示网页」又只能发不带请求头的 GET。所以快捷指令先用个人令牌换一个短时令牌放进网址，
 * /add 页面拿它调 /api/v1 里「添加网站」用到的几个接口（白名单在 v1.js）。
 *
 * - 30 分钟过期，保存成功后立即作废
 * - KV 里只存 SHA-256 摘要：share:<sha256> → { userId, url, createdAt }
 *
 * KV 是最终一致的，作废后其它边缘节点短时间内仍可能认这个令牌；重复提交靠 /api/v1 的网址查重兜底。
 */

import { hashToken } from './personal-tokens.js';

export const SHARE_TOKEN_HEADER = 'X-Share-Token';
export const SHARE_TOKEN_TTL_SECONDS = 30 * 60;
const KEY_PREFIX = 'share:';

function toBase64Url(bytes) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 签发令牌，返回明文（只此一次）
 */
export async function createShareToken(kv, { userId, url }) {
    const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    await kv.put(
        KEY_PREFIX + await hashToken(token),
        JSON.stringify({ userId, url, createdAt: Date.now() }),
        { expirationTtl: SHARE_TOKEN_TTL_SECONDS }
    );
    return token;
}

/**
 * 校验令牌，有效时返回 { userId, url, key }，否则 null
 */
export async function verifyShareToken(kv, token) {
    // 明文固定是 32 字节的 base64url，长度不对的不必去查 KV
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

    const key = KEY_PREFIX + await hashToken(token);
    const raw = await kv.get(key);
    if (!raw) return null;

    try {
        const record = JSON.parse(raw);
        if (!record?.userId) return null;
        return { userId: record.userId, url: record.url, key };
    } catch {
        return null;
    }
}

export async function revokeShareToken(kv, key) {
    await kv.delete(key);
}
