/**
 * 导航站 REST API 客户端，接口说明见仓库 doc/REST_API.md
 *
 * 服务端开了 CORS，带 Authorization 头的跨域请求能直接发，扩展不需要申请主机权限。
 */

import { ext } from './ext.js';

const SETTINGS_KEYS = ['serverUrl', 'token', 'newTab'];

// manifest.json 里的首页（chrome_settings_overrides.homepage）写死的也是这个地址，改的话两处一起改
export const DEFAULT_SERVER_URL = 'https://pipi2047.eu.org';

export async function loadSettings() {
    const settings = await ext.storage.local.get(SETTINGS_KEYS);
    return {
        serverUrl: normalizeServerUrl(settings.serverUrl || DEFAULT_SERVER_URL),
        token: settings.token || '',
        // 新标签页默认打开导航站，没存过就是开
        newTab: settings.newTab !== false
    };
}

export async function saveNewTabEnabled(enabled) {
    await ext.storage.local.set({ newTab: Boolean(enabled) });
}

export async function saveSettings({ serverUrl, token }) {
    await ext.storage.local.set({ serverUrl: normalizeServerUrl(serverUrl), token: token.trim() });
}

// 只填域名时补协议：本机地址补 http（本地开发服务器没有 https），其它补 https。去掉末尾斜杠
export function normalizeServerUrl(value) {
    let url = (value || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
        const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url);
        url = `${isLocal ? 'http' : 'https'}://${url}`;
    }
    return url.replace(/\/+$/, '');
}

// 自动补全最坏约 16 秒（抓网页 6 秒 + AI 10 秒），留足余量；其它请求不该超过 15 秒
const ANALYZE_TIMEOUT_MS = 30000;
const DEFAULT_TIMEOUT_MS = 15000;

export class ApiError extends Error {
    constructor(status, body) {
        super(body?.error || `HTTP ${status}`);
        this.status = status;
        this.code = body?.code || null;
        this.body = body || {};
    }
}

export function createClient({ serverUrl, token }) {
    async function request(method, path, { body, query, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        const url = new URL(`${serverUrl}/api/v1${path}`);
        for (const [key, value] of Object.entries(query || {})) {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
        }

        let response;
        try {
            response = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(body ? { 'Content-Type': 'application/json' } : {})
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(timeoutMs)
            });
        } catch (error) {
            const reason = error.name === 'TimeoutError' ? '请求超时' : error.message;
            throw new ApiError(0, { error: `连不上服务器：${reason}` });
        }

        let data = {};
        try {
            data = await response.json();
        } catch {
            // 非 JSON 响应
        }
        if (!response.ok) throw new ApiError(response.status, data);
        return data;
    }

    return {
        me: () => request('GET', '/me'),
        categories: () => request('GET', '/categories'),
        analyze: (payload) => request('POST', '/websites/analyze', { body: payload, timeoutMs: ANALYZE_TIMEOUT_MS }),
        // 缺分类或描述时服务端会跑 AI，超时要和 analyze 一样长
        save: (payload) => request('POST', '/websites', { body: payload, timeoutMs: ANALYZE_TIMEOUT_MS }),
        remove: (url) => request('DELETE', '/websites', { query: { url } })
    };
}

/**
 * 把 API 错误翻成给用户看的话
 */
export function describeError(error) {
    if (!(error instanceof ApiError)) return error?.message || '出错了';
    if (error.status === 0) return error.message;
    if (error.status === 401) return '令牌无效或已被吊销，请在设置里重新填写';
    if (error.code === 'NO_CLOUD_DATA') return '云端还没有数据，请先在导航站网页端登录并同步一次';
    if (error.status === 429) return '请求太频繁，请稍后再试';
    return error.message;
}
