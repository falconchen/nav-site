import { Hono } from 'hono';
import { isRateLimited } from '../lib/rate-limit.js';
import { ALLOWED_MIME, uploadToPhotoHost } from '../lib/photo-host.js';

const app = new Hono();

// 单张图片大小上限。前端会先压成 WebP 再传，正常只有几 KB，
// 这里的上限只是给异常/恶意请求兜底。
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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

export default app;
