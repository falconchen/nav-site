/**
 * 弹窗里把图标转存到图床，和网页端「自动填写」同一套做法（public/image-upload.js）：
 * 远程图标经导航站的 /api/proxy-image 取回字节（扩展没有任意站点的主机权限，直接 fetch 会被跨域拦），
 * 在弹窗里缩到 ≤256px 转成 WebP，再 POST 到 /api/upload-image。
 *
 * 弹窗一打开就传，预览换成图床地址，保存时直接用。用户取消的话图床里会留一个几 KB 的文件；
 * 同一个图标地址转存过就记在 storage.session 里，反复打开弹窗不重复上传。
 * 失败不影响收藏：保存时服务端还会再试一次转存（server/lib/rehost-icon.js），再不行就存原地址。
 */

import { ext } from './ext.js';

const ICON_MAX_SIZE = 256;
const ICON_WEBP_QUALITY = 0.85;
const UPLOAD_TIMEOUT_MS = 15000;
const CACHE_KEY = 'iconUploads';
const CACHE_LIMIT = 50;

async function readCache() {
    try {
        return (await ext.storage.session.get(CACHE_KEY))[CACHE_KEY] || {};
    } catch {
        return {};
    }
}

async function writeCache(src, url) {
    try {
        const cache = await readCache();
        cache[src] = url;
        // 只留最近的几十条，storage.session 有配额
        const entries = Object.entries(cache).slice(-CACHE_LIMIT);
        await ext.storage.session.set({ [CACHE_KEY]: Object.fromEntries(entries) });
    } catch {
        // 缓存只是省一次上传，写不进去不要紧
    }
}

async function fetchIconBlob(serverUrl, src, signal) {
    // base64 图标（标签页给的）直接解码，不用绕服务端
    const url = src.startsWith('data:')
        ? src
        : `${serverUrl}/api/proxy-image?url=${encodeURIComponent(src)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`获取图标失败（${response.status}）`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('图标为空');
    return blob;
}

// 用 <img> 解码：SVG 也能画到 canvas 上，转出来的 WebP 图床才收
function loadImage(blob) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(objectUrl) });
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('图标解码失败'));
        };
        img.src = objectUrl;
    });
}

async function toWebp(blob) {
    const { img, release } = await loadImage(blob);
    try {
        // SVG 没写尺寸时 naturalWidth 可能是 0，按最大尺寸画
        const naturalWidth = img.naturalWidth || ICON_MAX_SIZE;
        const naturalHeight = img.naturalHeight || ICON_MAX_SIZE;
        const scale = Math.min(1, ICON_MAX_SIZE / Math.max(naturalWidth, naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(naturalHeight * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', ICON_WEBP_QUALITY));
        if (!webp) throw new Error('浏览器不支持 WebP 编码');
        return webp;
    } finally {
        release();
    }
}

async function upload(serverUrl, blob, signal) {
    const form = new FormData();
    form.append('image', blob, 'icon.webp');
    const response = await fetch(`${serverUrl}/api/upload-image`, { method: 'POST', body: form, signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.url) {
        throw new Error(data.error || `图床上传失败（${response.status}）`);
    }
    return data.url;
}

/**
 * @param {string} serverUrl 导航站地址
 * @param {string} src 原图标地址（http(s) 或 base64）
 * @returns {Promise<string>} 图床地址；失败时抛错，调用方保留原地址
 */
export async function uploadIconToPhotoHost(serverUrl, src) {
    const cached = (await readCache())[src];
    if (cached) return cached;

    const signal = AbortSignal.timeout(UPLOAD_TIMEOUT_MS);
    const blob = await fetchIconBlob(serverUrl, src, signal);
    const url = await upload(serverUrl, await toWebp(blob), signal);
    await writeCache(src, url);
    return url;
}
