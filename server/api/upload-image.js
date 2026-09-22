import { Hono } from 'hono';
import { fetchRemoteImage } from '../lib/fetch-remote-image.js';
import { isRateLimited } from '../lib/rate-limit.js';

const app = new Hono();

// 单张图片大小上限。前端会先压成 WebP 再传，正常只有几 KB，
// 这里的上限只是给异常/恶意请求兜底。
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// 允许上传到图床的图片类型。
// 故意不含 image/svg+xml：图床是原样存储再原样吐回的，SVG 可以内嵌脚本。
// 前端会把 SVG 光栅化成 WebP 再传，所以用户侧不丢功能。
const ALLOWED_MIME = new Set([
    'image/webp',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon'
]);

// 限流：每个 IP 每分钟允许的上传次数
const RATE_LIMIT_PER_MINUTE = 20;

/**
 * 校验图片类型
 * @returns {{mime: string, error: string|null}}
 */
function validateMime(contentType) {
    const mime = (contentType || '').split(';')[0].trim().toLowerCase();
    if (!mime) {
        return { mime, error: '缺少图片类型' };
    }
    if (!ALLOWED_MIME.has(mime)) {
        return { mime, error: `不支持的图片类型: ${mime}` };
    }
    return { mime, error: null };
}

/**
 * 类型不受支持时的响应
 *
 * 带上机器可读的 code 和实际类型：前端拿到 unsupported_type 会退到
 * 浏览器里把图片光栅化成 WebP 再传（典型是 SVG，Worker 里没有 canvas 做不了），
 * 而不是去解析中文错误文案。
 */
function unsupportedTypeResponse(c, { mime, error }) {
    return c.json({ success: false, error, code: 'unsupported_type', contentType: mime }, 415);
}

/**
 * 解析图床地址
 *
 * 地址走 secret / .dev.vars 而不是 wrangler.jsonc，所以不会硬编码进仓库，
 * 换图床只需要改环境变量，不用动代码。
 *
 * @param {Object} env Worker 环境变量
 * @returns {string} 规范化后的图床根地址（无结尾斜杠）
 */
function resolvePhotoHost(env) {
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
async function uploadToPhotoHost(env, blob, filename) {
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

/**
 * 浏览器直传：multipart/form-data，字段名 image
 *
 * cf-photos 没有开 CORS，浏览器没法直连；而且图床 token 也不能下发到前端。
 * 所以由 Worker 中转。
 */
app.post('/upload-image', async (c) => {
    try {
        if (await isRateLimited(c, { scope: 'upload', limit: RATE_LIMIT_PER_MINUTE })) {
            return c.json({ success: false, error: '上传过于频繁，请稍后再试' }, 429);
        }

        // 先用 Content-Length 挡掉超大请求，避免白读进内存
        const declaredSize = parseInt(c.req.header('Content-Length') || '0', 10);
        if (declaredSize > MAX_UPLOAD_BYTES) {
            return c.json({ success: false, error: '图片超过 5MB 上限' }, 413);
        }

        const formData = await c.req.formData();
        const file = formData.get('image');

        if (!file || typeof file === 'string') {
            return c.json({ success: false, error: '缺少 image 字段' }, 400);
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            return c.json({ success: false, error: '图片超过 5MB 上限' }, 413);
        }

        const mimeCheck = validateMime(file.type);
        if (mimeCheck.error) {
            return unsupportedTypeResponse(c, mimeCheck);
        }

        const url = await uploadToPhotoHost(c.env, file, file.name || 'icon.webp');
        console.log('图床上传成功:', url);

        return c.json({ success: true, url });
    } catch (error) {
        console.error('上传图片到图床失败:', error);
        return c.json({ success: false, error: '上传失败: ' + error.message }, 502);
    }
});

/**
 * 服务端转存远程图片：body { url }
 *
 * 给 AI 识别网站图标用。图片从 Worker 直接抓取再转发到图床，
 * 完全不经过浏览器，省掉一整趟 base64 往返。
 */
app.post('/upload-image/from-url', async (c) => {
    try {
        if (await isRateLimited(c, { scope: 'upload', limit: RATE_LIMIT_PER_MINUTE })) {
            return c.json({ success: false, error: '上传过于频繁，请稍后再试' }, 429);
        }

        const body = await c.req.json();
        const imageUrl = body && body.url;

        if (!imageUrl) {
            return c.json({ success: false, error: '缺少 url 参数' }, 400);
        }

        let parsed;
        try {
            parsed = new URL(imageUrl);
        } catch {
            return c.json({ success: false, error: '无效的图片地址' }, 400);
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return c.json({ success: false, error: '只支持 http/https 图片地址' }, 400);
        }

        const response = await fetchRemoteImage(imageUrl, c.env);
        if (!response.ok) {
            return c.json({ success: false, error: `无法获取图片（${response.status}）` }, 502);
        }

        const contentType = response.headers.get('content-type') || '';
        const mimeCheck = validateMime(contentType);
        if (mimeCheck.error) {
            return unsupportedTypeResponse(c, mimeCheck);
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_UPLOAD_BYTES) {
            return c.json({ success: false, error: '图片超过 5MB 上限' }, 413);
        }
        if (buffer.byteLength === 0) {
            return c.json({ success: false, error: '图片内容为空' }, 502);
        }

        // 从原始地址里取个文件名，图床靠后缀推断类型
        const originalName = parsed.pathname.split('/').pop() || 'icon';
        const blob = new Blob([buffer], { type: mimeCheck.mime });

        const url = await uploadToPhotoHost(c.env, blob, originalName);
        console.log('远程图标转存成功:', imageUrl, '->', url);

        return c.json({ success: true, url });
    } catch (error) {
        console.error('转存远程图片失败:', error);
        return c.json({ success: false, error: '转存失败: ' + error.message }, 502);
    }
});

export default app;
