/**
 * 图标上传 - 压缩成 WebP 后上传到图床，拿回 URL
 *
 * 以前图标是以 base64 data URL 存在 website.imageData 里的，一份数据能撑到 5MB+，
 * 同步时还要整包压缩上传、保留多个历史版本。现在改成只存图床 URL。
 *
 * 历史的 base64 数据不受影响：渲染路径把 imageData 当成不透明的 <img src>，
 * data URL 和 http URL 都能用。
 */

// 图标最长边，超过就等比缩放。卡片上实际只显示几十像素，256 足够了
const ICON_MAX_SIZE = 256;
const ICON_WEBP_QUALITY = 0.85;

// 和服务端 upload-image.js 保持一致
const MAX_ICON_BYTES = 5 * 1024 * 1024;

// 服务端允许直传图床的类型，必须和 upload-image.js 的 ALLOWED_MIME 一致。
// 不在这个集合里的（典型是 SVG）必须先光栅化成 WebP，否则服务端会 415。
const UPLOADABLE_MIME = new Set([
    'image/webp',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon'
]);

// 原始文件能不能不经转换直接上传
function canUploadDirectly(file) {
    return UPLOADABLE_MIME.has((file.type || '').split(';')[0].trim().toLowerCase());
}

/**
 * 把图片文件读成位图
 *
 * 优先用 createImageBitmap；Safari 对 SVG blob 的支持不稳，
 * 失败时回退到 <img> + object URL。
 *
 * @param {File|Blob} file
 * @returns {Promise<{source: CanvasImageSource, width: number, height: number, close: Function}>}
 */
async function loadImageSource(file) {
    try {
        const bitmap = await createImageBitmap(file);
        // SVG 没有固有尺寸时浏览器可能给 0
        if (bitmap.width > 0 && bitmap.height > 0) {
            return {
                source: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                close: () => bitmap.close()
            };
        }
        bitmap.close();
    } catch (error) {
        console.warn('createImageBitmap 失败，回退到 Image 加载:', error);
    }

    // 回退路径
    const objectUrl = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('图片加载失败'));
            image.src = objectUrl;
        });

        return {
            source: img,
            // 无固有尺寸的 SVG 用 ICON_MAX_SIZE 兜底
            width: img.naturalWidth || ICON_MAX_SIZE,
            height: img.naturalHeight || ICON_MAX_SIZE,
            close: () => URL.revokeObjectURL(objectUrl)
        };
    } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
    }
}

/**
 * 压缩图片并转成 WebP
 *
 * 注意：动图 GIF 会被压成静帧。图标场景可以接受。
 *
 * @param {File} file 原始文件
 * @param {Object} options
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
async function compressImageToWebp(file, options = {}) {
    const maxSize = options.maxSize || ICON_MAX_SIZE;
    const quality = options.quality || ICON_WEBP_QUALITY;

    // 原类型本身就能直传时，才允许在各种异常情况下退回原文件
    const directUploadOk = canUploadDirectly(file);
    const fallback = (reason) => {
        if (!directUploadOk) {
            // 典型是 SVG：服务端不收，又转不出 WebP，只能明确报错
            throw new Error(`${reason}，且 ${file.type || '该格式'} 不支持直接上传`);
        }
        return { blob: file, filename: file.name || 'icon' };
    };

    let image;
    try {
        image = await loadImageSource(file);
    } catch (error) {
        console.warn('图片解码失败:', error);
        return fallback('图片解码失败');
    }

    try {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image.source, 0, 0, width, height);

        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/webp', quality);
        });

        // toBlob 返回 null 说明浏览器不支持 WebP 编码
        if (!blob) {
            console.warn('当前浏览器不支持 WebP 编码');
            return fallback('当前浏览器不支持 WebP 编码');
        }

        // 原图本来就很小时压缩可能适得其反。
        // 但这只在原类型能直传时才成立——SVG 再大也得转。
        if (directUploadOk && blob.size >= file.size) {
            console.log(`压缩后反而更大（${blob.size} >= ${file.size}），上传原文件`);
            return { blob: file, filename: file.name || 'icon' };
        }

        console.log(`🖼️ 图标压缩: ${(file.size / 1024).toFixed(1)}KB -> ${(blob.size / 1024).toFixed(1)}KB (${width}x${height} WebP)`);
        return { blob, filename: 'icon.webp' };
    } catch (error) {
        if (!directUploadOk) throw error;
        console.warn('图片压缩失败，上传原文件:', error);
        return fallback('图片压缩失败');
    } finally {
        image.close();
    }
}

/**
 * 把文件读成 base64 data URL（图床不可用时的降级方案）
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
    });
}

/**
 * 上传图标文件到图床
 *
 * 图床不可用时降级为 base64 data URL，保证离线优先的承诺不被打破。
 *
 * @param {File} file
 * @returns {Promise<{url: string, fallback: boolean}>} fallback 为 true 表示返回的是 base64
 */
async function uploadIconFile(file) {
    if (file.size > MAX_ICON_BYTES) {
        throw new Error('图片超过 5MB 上限');
    }

    const { blob, filename } = await compressImageToWebp(file);

    try {
        const formData = new FormData();
        formData.append('image', blob, filename);

        const response = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!response.ok || !data.success || !data.url) {
            throw new Error(data.error || `服务返回 ${response.status}`);
        }

        return { url: data.url, fallback: false };
    } catch (error) {
        console.error('图床上传失败，降级为本地图片:', error);
        showNotification('图床上传失败，已临时存为本地图片', 'error');
        return { url: await readFileAsDataUrl(blob), fallback: true };
    }
}

/**
 * 把远程图标转存到图床（AI 识别网站图标时用）
 *
 * 图片由 Worker 直接抓取转发，不经过浏览器。
 *
 * @param {string} remoteUrl 远程图标地址
 * @returns {Promise<string>} 图床 URL
 */
async function uploadIconFromUrl(remoteUrl) {
    const response = await fetch('/api/upload-image/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: remoteUrl })
    });

    const data = await response.json();
    if (!response.ok || !data.success || !data.url) {
        throw new Error(data.error || `服务返回 ${response.status}`);
    }

    return data.url;
}

// 暴露给其他脚本使用
window.compressImageToWebp = compressImageToWebp;
window.uploadIconFile = uploadIconFile;
window.uploadIconFromUrl = uploadIconFromUrl;
