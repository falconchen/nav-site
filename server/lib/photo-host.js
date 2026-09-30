/**
 * cf-photos 图床：网页端上传（/api/upload-image）和 /api/v1 保存时转存图标共用
 */

// 允许上传到图床的图片类型。
// 故意不含 image/svg+xml：图床是原样存储再原样吐回的，SVG 可以内嵌脚本。
// 前端会把 SVG 光栅化成 WebP 再传，所以用户侧不丢功能。
export const ALLOWED_MIME = new Set([
    'image/webp',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon'
]);

/**
 * 解析图床地址
 *
 * 地址走 secret / .dev.vars 而不是 wrangler.jsonc，所以不会硬编码进仓库，
 * 换图床只需要改环境变量，不用动代码。
 *
 * @param {Object} env Worker 环境变量
 * @returns {string} 规范化后的图床根地址（无结尾斜杠）
 */
export function resolvePhotoHost(env) {
    const endpoint = (env.CF_PHOTOS_ENDPOINT || '').trim();
    if (!endpoint) {
        throw new Error('图床未配置，请设置 CF_PHOTOS_ENDPOINT（如 https://your-photo-host）');
    }

    // 允许只填域名，默认按 https 处理
    const withProtocol = /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`;

    try {
        return new URL(withProtocol).origin;
    } catch {
        throw new Error(`CF_PHOTOS_ENDPOINT 不是合法地址: ${endpoint}`);
    }
}

/**
 * 上传到 cf-photos 图床
 *
 * 契约见 cf-photos 的 src/index.js：POST /upload，multipart/form-data，
 * 文件字段名为 image，Bearer 鉴权，成功返回 201 + { result:'success', url }。
 *
 * @param {Object} env Worker 环境变量
 * @param {Blob} blob 图片数据
 * @param {string} filename 文件名（图床用它推断后缀）
 * @returns {Promise<string>} 图床返回的公开 URL
 */
export async function uploadToPhotoHost(env, blob, filename) {
    const endpoint = resolvePhotoHost(env);

    const form = new FormData();
    // 不要手写 Content-Type，交给 FormData 自己带 boundary
    form.append('image', blob, filename);

    const response = await fetch(`${endpoint}/upload`, {
        method: 'POST',
        headers: env.CF_PHOTOS_TOKEN
            ? { Authorization: `Bearer ${env.CF_PHOTOS_TOKEN}` }
            : {},
        body: form
    });

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        // 鉴权失败时图床返回的是纯文本
        throw new Error(`图床返回 ${response.status}: ${text.slice(0, 120)}`);
    }

    if (!response.ok || data.result !== 'success' || !data.url) {
        throw new Error(data.message || `图床返回 ${response.status}`);
    }

    return data.url;
}

// 按内容去重的映射 imghash_<sha256> → 图床地址存在 KV。图床上的文件万一被手动删了，映射最多坏这么久
const DEDUPE_TTL_SECONDS = 180 * 24 * 60 * 60;

async function sha256Hex(bytes) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 按图片内容去重后上传：同样的字节只在图床存一份，返回同一个地址。
 *
 * 映射是全局的、不分用户：拿到映射的前提是手里已经有同样的字节，不泄露什么；
 * 地址是服务端自己上传后写进去的，调用方伪造不了。KV 出问题时退化成普通上传。
 * 并发上传同一张图可能各传一份，之后都会命中其中一个，可以接受。
 *
 * @returns {Promise<{url: string, deduped: boolean}>}
 */
export async function uploadDedupedToPhotoHost(env, blob, filename) {
    const bytes = await blob.arrayBuffer();
    const kv = env.USER_SESSIONS;
    let key = null;

    try {
        key = `imghash_${await sha256Hex(bytes)}`;
        const cached = kv ? await kv.get(key) : null;
        // 只认当前图床域名下的地址，换了图床旧映射自然失效
        if (cached && new URL(cached).origin === resolvePhotoHost(env)) {
            return { url: cached, deduped: true };
        }
    } catch (error) {
        console.warn('图片去重查询失败，照常上传:', error.message);
    }

    const url = await uploadToPhotoHost(env, new Blob([bytes], { type: blob.type }), filename);

    if (kv && key) {
        try {
            await kv.put(key, url, { expirationTtl: DEDUPE_TTL_SECONDS });
        } catch (error) {
            console.warn('图片去重映射写入失败:', error.message);
        }
    }
    return { url, deduped: false };
}
