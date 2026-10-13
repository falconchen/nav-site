import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../server/index.js';
import { withSecurityHeaders } from '../server/lib/security-headers.js';

function createKvStub() {
    const store = new Map();
    return {
        get: async (key, options) => {
            if (!store.has(key)) return null;
            const value = store.get(key);
            const type = typeof options === 'string' ? options : options?.type;
            return type === 'json' ? JSON.parse(value) : value;
        },
        put: async (key, value) => { store.set(key, value); },
        delete: async (key) => { store.delete(key); },
        list: async ({ prefix = '' } = {}) => ({
            keys: [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
            list_complete: true
        })
    };
}

function expectSecurityHeaders(res, { referrerPolicy = 'strict-origin-when-cross-origin' } = {}) {
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe(referrerPolicy);
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
}

describe('安全响应头', () => {
    let env;
    const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
    const request = (url, init) => worker.fetch(new Request(url, init), env, ctx());

    beforeEach(() => {
        env = {
            JWT_SECRET: 'test-secret',
            USER_SESSIONS: createKvStub(),
            OAUTH_KV: createKvStub(),
            ASSETS: {
                fetch: vi.fn(async () => new Response('<html>home</html>', { headers: { 'Content-Type': 'text/html' } }))
            }
        };
    });

    it('静态页面带三个安全响应头，不加会挡住扩展新标签页的 X-Frame-Options 和 CSP', async () => {
        const res = await request('https://nav.test/');
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('home');
        expectSecurityHeaders(res);
        expect(res.headers.get('X-Frame-Options')).toBeNull();
        expect(res.headers.get('Content-Security-Policy')).toBeNull();
    });

    it('不限制剪贴板：复制网址和扩展的 iframe 都要用', async () => {
        const res = await request('https://nav.test/');
        expect(res.headers.get('Permissions-Policy')).not.toContain('clipboard');
    });

    it('接口响应和 404 也带', async () => {
        expectSecurityHeaders(await request('https://nav.test/api/auth/verify'));
        const missing = await request('https://nav.test/api/no-such-endpoint', { method: 'POST' });
        expect(missing.status).toBe(404);
        expectSecurityHeaders(missing);
    });

    it('路由自己设的 Referrer-Policy 不被盖掉', async () => {
        const authorize = await request('https://nav.test/oauth/authorize?client_id=abc');
        expectSecurityHeaders(authorize, { referrerPolicy: 'no-referrer' });
        expect(authorize.headers.get('X-Frame-Options')).toBe('DENY');

        const add = await request('https://nav.test/add?url=https%3A%2F%2Fexample.com&t=abc');
        expectSecurityHeaders(add, { referrerPolicy: 'no-referrer' });
    });

    it('OAuth 库直接应答的响应也带', async () => {
        const metadata = await request('https://nav.test/.well-known/oauth-authorization-server');
        expect(metadata.status).toBe(200);
        expectSecurityHeaders(metadata);

        const mcp = await request('https://nav.test/mcp', { method: 'POST', body: '{}' });
        expect(mcp.status).toBe(401);
        expectSecurityHeaders(mcp);
        expect(mcp.headers.get('WWW-Authenticate')).toBeTruthy();
    });

    it('建不出 OAuth provider 的地址（非回环的 http）照样带', async () => {
        const res = await request('http://192.168.1.5:8787/');
        expect(res.status).toBe(200);
        expectSecurityHeaders(res);
    });

    it('响应头只读、没有正文的响应也能处理', async () => {
        const redirect = withSecurityHeaders(Response.redirect('https://nav.test/next', 302));
        expect(redirect.status).toBe(302);
        expect(redirect.headers.get('Location')).toBe('https://nav.test/next');
        expectSecurityHeaders(redirect);

        const notModified = withSecurityHeaders(new Response(null, { status: 304, headers: { ETag: '"abc"' } }));
        expect(notModified.status).toBe(304);
        expect(notModified.headers.get('ETag')).toBe('"abc"');
        expectSecurityHeaders(notModified);
    });
});
