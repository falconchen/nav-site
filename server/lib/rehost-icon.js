import { fetchRemoteImage } from './fetch-remote-image.js';
import { ALLOWED_MIME, resolvePhotoHost, uploadDedupedToPhotoHost } from './photo-host.js';

/**
 * /api/v1 保存网站时把图标转存到图床
 *
 * 扩展传来的是原站的 favicon 地址（或标签页给的 base64），直接存的话原站换地址、
 * 开防盗链、下线，图标就坏了；base64 还会把云端数据撑大。网页端的自动填写本来就会转存，
 * 这里让扩展收藏的网站也一样。
 *
 * Worker 里没有 canvas，不像网页端那样压成 WebP，按原格式上传；SVG 图床不收，保留原地址。
 * 转存失败一律保留原值，不影响保存（内网地址 Worker 访问不到，就是这种情况）。
 */

// 图标抓取超时。整个保存请求里 AI 已经可能占十几秒，这里不能再拖太久
const FETCH_TIMEOUT_MS = 5000;
// favicon 正常只有几 KB 到几十 KB，超过这个大小多半不是图标
const MAX_ICON_BYTES = 1024 * 1024;

// 服务器没给类型（或给了 octet-stream）时按后缀猜
const EXTENSION_MIME = {
    ico: 'image/x-icon',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp'
};

const MIME_EXTENSION = {
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp'
};

function isOnPhotoHost(env, url) {
    try {
        return new URL(url).origin === resolvePhotoHost(env);
    } catch {
        return false;
    }
}

function decodeDataUrl(value) {
    const match = value.match(/^data:([^;,]+);base64,(.*)$/i);
    if (!match) throw new Error('不是 base64 data URL');
    const bytes = Uint8Array.from(atob(match[2]), (ch) => ch.charCodeAt(0));
    return { mime: match[1].toLowerCase(), bytes };
}

async function downloadIcon(env, url) {
    const response = await fetchRemoteImage(url, env, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`图标地址返回 ${response.status}`);

    const declared = parseInt(response.headers.get('Content-Length') || '0', 10);
    if (declared > MAX_ICON_BYTES) throw new Error('图标太大');

    const bytes = new Uint8Array(await response.arrayBuffer());
    let mime = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
        const extension = new URL(url).pathname.split('.').pop().toLowerCase();
        mime = EXTENSION_MIME[extension] && (!mime || mime === 'application/octet-stream')
            ? EXTENSION_MIME[extension]
            : mime;
    }
    return { mime, bytes };
}

/**
 * @param {Object} env Worker 环境变量
 * @param {string} imageData 已经过 normalizeImageData 的 http(s) URL 或 base64 data URL
 * @returns {Promise<{imageData: string, warning: string|null}>} 转存后的地址；没转存时原样返回
 */
export async function rehostIcon(env, imageData) {
    // 没配图床（本地开发、测试）就不转存，也不算降级
    if (!imageData || !env.CF_PHOTOS_ENDPOINT) return { imageData, warning: null };
    if (isOnPhotoHost(env, imageData)) return { imageData, warning: null };

    try {
        const { mime, bytes } = imageData.startsWith('data:')
            ? decodeDataUrl(imageData)
            : await downloadIcon(env, imageData);
        if (!ALLOWED_MIME.has(mime)) throw new Error(`不支持的图片类型: ${mime || '未知'}`);
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_ICON_BYTES) throw new Error('图标为空或太大');

        const { url } = await uploadDedupedToPhotoHost(env, new Blob([bytes], { type: mime }), `icon.${MIME_EXTENSION[mime]}`);
        return { imageData: url, warning: null };
    } catch (error) {
        console.warn('图标转存图床失败，保留原地址:', imageData.slice(0, 120), error.message);
        return { imageData, warning: 'icon_rehost_failed' };
    }
}
