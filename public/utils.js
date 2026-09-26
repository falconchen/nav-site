/**
 * 通用工具类函数
 */

// 转义 HTML，渲染来自外部（网页标题、API 写入）的文本时用
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 显示通知：样式见 styles.css 的 .notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
    notification.textContent = message;
    document.body.appendChild(notification);

    // 同一时间只留最新一条，免得几条叠在一起
    document.querySelectorAll('.notification.show').forEach(old => {
        if (old !== notification) old.classList.remove('show');
    });

    requestAnimationFrame(() => {
        requestAnimationFrame(() => notification.classList.add('show'));
    });

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 400);
    }, 3000);
}

// 显示保存进度面板（手动上传到云端用）：样式见 styles.css 的 .save-panel
function showSaveProgress() {
    const existingProgress = document.getElementById('save-progress-bar');
    if (existingProgress) {
        existingProgress.remove();
    }

    const progressContainer = document.createElement('div');
    progressContainer.id = 'save-progress-bar';
    progressContainer.className = 'save-panel';
    progressContainer.setAttribute('role', 'status');
    progressContainer.innerHTML = `
        <div class="save-panel-head">
            <span class="spinner"></span>
            <span>正在保存到云端</span>
        </div>
        <div class="save-panel-track"><div id="progress-bar-fill"></div></div>
        <div id="progress-status">准备中…</div>
    `;
    document.body.appendChild(progressContainer);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => progressContainer.classList.add('show'));
    });

    const dismiss = () => {
        progressContainer.classList.remove('show');
        setTimeout(() => progressContainer.remove(), 400);
    };

    return {
        update: (percent, status) => {
            const fill = document.getElementById('progress-bar-fill');
            const statusText = document.getElementById('progress-status');
            if (fill) fill.style.width = `${percent}%`;
            if (statusText) statusText.textContent = status;
        },
        complete: (success, message) => {
            const fill = document.getElementById('progress-bar-fill');
            const statusText = document.getElementById('progress-status');
            const spinner = progressContainer.querySelector('.spinner');

            if (fill) {
                fill.style.width = '100%';
                fill.style.background = success ? 'var(--success)' : 'var(--danger)';
            }
            if (spinner) spinner.style.display = 'none';
            if (statusText) statusText.textContent = message || (success ? '已保存' : '保存失败');

            setTimeout(dismiss, 1500);
        },
        remove: dismiss
    };
}

// 在 header 底边显示细进度条（自动保存用，不打断操作）
let headerProgressHideTimer = null;
function showHeaderProgress() {
    const header = document.querySelector('.header');
    const setPercent = (percent) => header?.style.setProperty('--save-progress', `${percent}%`);

    clearTimeout(headerProgressHideTimer);
    if (header) {
        header.classList.remove('save-failed');
        header.classList.add('is-saving');
    }
    setPercent(0);

    return {
        update: (percent) => setPercent(percent),
        complete: (success) => {
            if (!header) return;
            setPercent(100);
            if (!success) header.classList.add('save-failed');
            headerProgressHideTimer = setTimeout(() => {
                header.classList.remove('is-saving');
                // 等淡出结束再归零，避免进度条倒着缩回去
                headerProgressHideTimer = setTimeout(() => {
                    header.classList.remove('save-failed');
                    setPercent(0);
                }, 300);
            }, success ? 400 : 1500);
        }
    };
}

// 解析用户代理字符串
function parseUserAgent(userAgent) {
    const parser = {
        device: 'Unknown Device',
        browser: 'Unknown Browser',
        os: 'Unknown OS'
    };

    // 简单的用户代理解析
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
        parser.device = 'Mobile Device';
    } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
        parser.device = 'Tablet';
    } else {
        parser.device = 'Desktop';
    }

    if (userAgent.includes('Chrome')) {
        parser.browser = 'Chrome';
    } else if (userAgent.includes('Firefox')) {
        parser.browser = 'Firefox';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        parser.browser = 'Safari';
    } else if (userAgent.includes('Edge')) {
        parser.browser = 'Edge';
    }

    if (userAgent.includes('Windows')) {
        parser.os = 'Windows';
    } else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
        parser.os = 'iOS';
    }else if (userAgent.includes('Mac')) {
        parser.os = 'macOS';
    } else if (userAgent.includes('Linux')) {
        parser.os = 'Linux';
    } else if (userAgent.includes('Android')) {
        parser.os = 'Android';
    }

    return parser;
}

// 压缩数据（gzip）
async function compressData(data) {
    try {
        // 将数据转换为 JSON 字符串
        const jsonString = JSON.stringify(data);

        // 转换为 Uint8Array
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(jsonString);

        // 使用 CompressionStream 进行 gzip 压缩
        const compressionStream = new CompressionStream('gzip');
        const writer = compressionStream.writable.getWriter();
        writer.write(uint8Array);
        writer.close();

        // 读取压缩后的数据
        const reader = compressionStream.readable.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // 合并所有 chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const compressed = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            compressed.set(chunk, offset);
            offset += chunk.length;
        }

        // 转换为 base64 字符串以便传输
        let binary = '';
        for (let i = 0; i < compressed.length; i++) {
            binary += String.fromCharCode(compressed[i]);
        }
        const base64 = btoa(binary);

        console.log('📦 Compression stats:', {
            original: jsonString.length,
            compressed: compressed.length,
            base64: base64.length,
            ratio: (compressed.length / jsonString.length * 100).toFixed(2) + '%'
        });

        return base64;
    } catch (error) {
        console.error('❌ Compression error:', error);
        throw error;
    }
}

// 解压缩数据（gzip）
async function decompressData(base64String) {
    try {
        // 将 base64 转换为 Uint8Array
        const binary = atob(base64String);
        const compressed = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            compressed[i] = binary.charCodeAt(i);
        }

        // 使用 DecompressionStream 进行 gzip 解压缩
        const decompressionStream = new DecompressionStream('gzip');
        const writer = decompressionStream.writable.getWriter();
        writer.write(compressed);
        writer.close();

        // 读取解压缩后的数据
        const reader = decompressionStream.readable.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // 合并所有 chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const decompressed = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            decompressed.set(chunk, offset);
            offset += chunk.length;
        }

        // 转换为字符串
        const decoder = new TextDecoder();
        const jsonString = decoder.decode(decompressed);

        // 解析 JSON
        const data = JSON.parse(jsonString);

        console.log('📦 Decompression stats:', {
            compressed: compressed.length,
            decompressed: jsonString.length
        });

        return data;
    } catch (error) {
        console.error('❌ Decompression error:', error);
        throw error;
    }
}

// IndexedDB 存储工具，用于突破 localStorage 的容量限制
const dbStorage = {
    dbName: 'NavSiteDB',
    storeName: 'settings',
    db: null,

    // 初始化数据库
    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB open error:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    // 获取数据
    async getItem(key) {
        try {
            await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(key);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error(`Error getting item ${key} from IndexedDB:`, error);
            // 降级使用 localStorage
            return localStorage.getItem(key);
        }
    },

    // 存储数据
    async setItem(key, value) {
        try {
            await this.init();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(value, key);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error(`Error setting item ${key} in IndexedDB:`, error);
            // 降级使用 localStorage，但捕获可能的容量超限错误
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                console.error('localStorage also failed:', e);
                throw e;
            }
        }
    }
};

window.dbStorage = dbStorage;
