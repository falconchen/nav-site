import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sign } from 'hono/jwt';
import worker from '../server/index.js';
import { sanitizeReturnTo } from '../server/api/auth.js';

const REDIS_URL = 'https://redis.example.test';
const JWT_SECRET = 'test-secret';
const USER_A = 'user_aaaa1111';
const USER_B = 'user_bbbb2222';
const REDIRECT_URI = 'https://client.example/callback';
const VERIFIER = 'verifier-verifier-verifier-verifier-verifier-1234';

// 比 USER_SESSIONS 的桩多实现 list 和 { type: 'json' }，OAuth 库要用
function createKvStub() {
    const store = new Map();
    return {
        store,
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

function mockRedis(fetchSpy) {
    const store = new Map();
    fetchSpy.mockImplementation(async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!url.startsWith(REDIS_URL)) throw new Error(`unexpected fetch ${url}`);
        const [, op, ...rest] = url.slice(REDIS_URL.length).split('/');
        const key = decodeURIComponent(rest.join('/'));
        if (op === 'get') return Response.json({ result: store.has(key) ? store.get(key) : null });
        if (op === 'set') { store.set(key, init.body); return Response.json({ result: 'OK' }); }
        if (op === 'del') { const had = store.delete(key); return Response.json({ result: had ? 1 : 0 }); }
        throw new Error(`unexpected op ${op}`);
    });
    return store;
}

async function s256(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('MCP 的 OAuth 授权', () => {
    let fetchSpy;
    let env;
    let jwtA;
    let jwtB;
    const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

    function request(path, { method = 'GET', token, body, form } = {}) {
        const headers = { 'CF-Connecting-IP': '203.0.113.1' };
        if (token) headers.Authorization = `Bearer ${token}`;
        let payload;
        if (form) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            payload = new URLSearchParams(form).toString();
        } else if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            payload = JSON.stringify(body);
        }
        return worker.fetch(new Request(`https://nav.test${path}`, { method, headers, body: payload }), env, ctx());
    }

    async function login(userId) {
        const token = await sign({ userId, sessionId: 's1', exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET);
        await env.USER_SESSIONS.put(`user_session_${userId}_s1`, JSON.stringify({ token }));
        return token;
    }

    async function registerClient(name = 'Claude') {
        const res = await request('/oauth/register', {
            method: 'POST',
            body: {
                client_name: name,
                redirect_uris: [REDIRECT_URI],
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none'
            }
        });
        expect(res.status).toBe(201);
        return (await res.json()).client_id;
    }

    async function authQuery(clientId, overrides = {}) {
        return '?' + new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: REDIRECT_URI,
            code_challenge: await s256(VERIFIER),
            code_challenge_method: 'S256',
            state: 'state-123',
            scope: 'mcp',
            resource: 'https://nav.test/mcp',
            ...overrides
        }).toString();
    }

    async function approve(query, token = jwtA) {
        const res = await request('/api/oauth/approve', { method: 'POST', token, body: { query } });
        expect(res.status).toBe(200);
        return new URL((await res.json()).redirectTo);
    }

    function exchange(clientId, code, verifier = VERIFIER) {
        return request('/oauth/token', {
            method: 'POST',
            form: {
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
                client_id: clientId,
                code_verifier: verifier,
                resource: 'https://nav.test/mcp'
            }
        });
    }

    // 走完整个流程，拿到访问令牌
    async function authorize(token = jwtA, name = 'Claude') {
        const clientId = await registerClient(name);
        const redirect = await approve(await authQuery(clientId), token);
        const res = await exchange(clientId, redirect.searchParams.get('code'));
        expect(res.status).toBe(200);
        return { clientId, ...(await res.json()) };
    }

    function callTool(accessToken, name, args = {}) {
        return request('/mcp', {
            method: 'POST',
            token: accessToken,
            body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }
        });
    }

    beforeEach(async () => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        mockRedis(fetchSpy);
        env = {
            JWT_SECRET,
            UPSTASH_REDIS_REST_URL: REDIS_URL,
            UPSTASH_REDIS_REST_TOKEN: 'redis-token',
            GITHUB_CLIENT_ID: 'gh-client',
            USER_SESSIONS: createKvStub(),
            OAUTH_KV: createKvStub(),
            ASSETS: {
                fetch: vi.fn(async () => new Response('<html>authorize</html>', { headers: { 'Content-Type': 'text/html' } }))
            }
        };
        jwtA = await login(USER_A);
        jwtB = await login(USER_B);
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    describe('授权页', () => {
        it('返回静态页，禁止缓存和嵌入，查询串不带给静态资源', async () => {
            const res = await request('/oauth/authorize?client_id=abc&state=1');
            expect(res.status).toBe(200);
            expect(await res.text()).toContain('authorize');
            expect(res.headers.get('X-Frame-Options')).toBe('DENY');
            expect(res.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
            expect(res.headers.get('Cache-Control')).toBe('no-store');
            expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
            expect(env.ASSETS.fetch.mock.calls[0][0].url).toBe('https://nav.test/oauth-authorize');
        });

        it('静态文件的原始路径不能直接访问', async () => {
            for (const path of ['/oauth-authorize', '/oauth-authorize.html', '/oauth-authorize/?client_id=abc']) {
                expect((await request(path)).status).toBe(404);
            }
            expect(env.ASSETS.fetch).not.toHaveBeenCalled();
            // 脚本本身照常提供
            expect((await request('/oauth-authorize.js')).status).toBe(200);
        });

        it('告诉页面是谁在申请、授权后跳到哪里', async () => {
            const clientId = await registerClient('Claude');
            const res = await request(`/api/oauth/request${await authQuery(clientId)}`);
            expect(res.status).toBe(200);
            expect(res.headers.get('Cache-Control')).toBe('no-store');
            expect(await res.json()).toEqual({
                success: true,
                client: { name: 'Claude', domain: null },
                redirectHost: 'client.example',
                redirectIsLoopback: false
            });
        });

        it('客户端不存在、回调地址没登记过时不给跳转地址', async () => {
            const unknown = await request(`/api/oauth/request${await authQuery('no-such-client')}`);
            expect(unknown.status).toBe(400);
            expect((await unknown.json()).redirectTo).toBeNull();

            const clientId = await registerClient();
            const hijacked = await request(`/api/oauth/request${await authQuery(clientId, { redirect_uri: 'https://evil.example/cb' })}`);
            expect(hijacked.status).toBe(400);
            expect((await hijacked.json()).redirectTo).toBeNull();

            expect((await request('/api/oauth/request')).status).toBe(400);
        });

        it('回调地址没问题但请求不合规时，把错误带回客户端', async () => {
            const clientId = await registerClient();
            const res = await request(`/api/oauth/request${await authQuery(clientId, { response_type: 'token' })}`);
            expect(res.status).toBe(400);
            const redirect = new URL((await res.json()).redirectTo);
            expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI);
            expect(redirect.searchParams.get('error')).toBeTruthy();
            expect(redirect.searchParams.get('state')).toBe('state-123');
        });
    });

    describe('同意与拒绝', () => {
        it('没登录不能同意', async () => {
            const query = await authQuery(await registerClient());
            expect((await request('/api/oauth/approve', { method: 'POST', body: { query } })).status).toBe(401);
            expect((await request('/api/oauth/approve', { method: 'POST', token: 'not-a-jwt', body: { query } })).status).toBe(401);
            expect([...env.OAUTH_KV.store.keys()].some((key) => key.startsWith('grant:'))).toBe(false);
        });

        it('同意后带着授权码跳回客户端', async () => {
            const redirect = await approve(await authQuery(await registerClient()));
            expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI);
            expect(redirect.searchParams.get('code')).toBeTruthy();
            expect(redirect.searchParams.get('state')).toBe('state-123');
        });

        it('同意时回调地址被换掉会被拒绝', async () => {
            const clientId = await registerClient();
            const query = await authQuery(clientId, { redirect_uri: 'https://evil.example/cb' });
            const res = await request('/api/oauth/approve', { method: 'POST', token: jwtA, body: { query } });
            expect(res.status).toBe(400);
            expect((await res.json()).redirectTo).toBeNull();
        });

        it('拒绝不需要登录，带着 access_denied 跳回客户端', async () => {
            const query = await authQuery(await registerClient());
            const res = await request('/api/oauth/deny', { method: 'POST', body: { query } });
            expect(res.status).toBe(200);
            const redirect = new URL((await res.json()).redirectTo);
            expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI);
            expect(redirect.searchParams.get('error')).toBe('access_denied');
            expect(redirect.searchParams.get('state')).toBe('state-123');
            expect(redirect.searchParams.has('code')).toBe(false);
        });
    });

    describe('令牌', () => {
        it('授权码 + PKCE 换到访问令牌和刷新令牌，能调 MCP', async () => {
            const tokens = await authorize();
            expect(tokens.access_token).toBeTruthy();
            expect(tokens.refresh_token).toBeTruthy();
            expect(tokens.expires_in).toBe(3600);

            const res = await callTool(tokens.access_token, 'create_note', { content: 'OAuth 写的记事' });
            expect(res.status).toBe(200);
            const { result } = await res.json();
            expect(result.isError).toBe(false);

            // 记在授权人自己名下，别人看不到
            const mine = await (await request('/api/notes', { token: jwtA })).json();
            expect(mine.notes.map((note) => note.title)).toEqual(['OAuth 写的记事']);
            const theirs = await (await request('/api/notes', { token: jwtB })).json();
            expect(theirs.notes).toEqual([]);
        });

        it('code_verifier 不对换不到令牌，授权码只能用一次', async () => {
            const clientId = await registerClient();
            const first = await approve(await authQuery(clientId));
            expect((await exchange(clientId, first.searchParams.get('code'), 'wrong-verifier-wrong-verifier-wrong-verifier-000')).status).toBe(400);

            const second = await approve(await authQuery(clientId));
            const code = second.searchParams.get('code');
            expect((await exchange(clientId, code)).status).toBe(200);
            expect((await exchange(clientId, code)).status).toBe(400);
        });

        it('刷新令牌能换新的访问令牌', async () => {
            const tokens = await authorize();
            const res = await request('/oauth/token', {
                method: 'POST',
                form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: tokens.clientId }
            });
            expect(res.status).toBe(200);
            const refreshed = await res.json();
            expect(refreshed.access_token).not.toBe(tokens.access_token);
            expect((await callTool(refreshed.access_token, 'list_note_folders')).status).toBe(200);
        });

        it('授权码不能直接当访问令牌用', async () => {
            const redirect = await approve(await authQuery(await registerClient()));
            expect((await callTool(redirect.searchParams.get('code'), 'list_note_folders')).status).toBe(401);
        });
    });

    describe('已授权的应用', () => {
        it('列出自己授权过的应用，撤销后令牌立刻失效', async () => {
            const tokens = await authorize(jwtA, 'Claude');
            await authorize(jwtB, 'ChatGPT');

            const res = await request('/api/oauth/grants', { token: jwtA });
            expect(res.status).toBe(200);
            const { grants } = await res.json();
            expect(grants).toHaveLength(1);
            expect(grants[0].clientName).toBe('Claude');
            expect(grants[0].redirectHost).toBe('client.example');
            expect(Date.parse(grants[0].createdAt)).toBeGreaterThan(0);

            // 别人撤销不了
            await request(`/api/oauth/grants/${grants[0].id}`, { method: 'DELETE', token: jwtB });
            expect((await callTool(tokens.access_token, 'list_note_folders')).status).toBe(200);

            expect((await request(`/api/oauth/grants/${grants[0].id}`, { method: 'DELETE', token: jwtA })).status).toBe(200);
            expect((await callTool(tokens.access_token, 'list_note_folders')).status).toBe(401);
            expect((await (await request('/api/oauth/grants', { token: jwtA })).json()).grants).toEqual([]);

            const refresh = await request('/oauth/token', {
                method: 'POST',
                form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: tokens.clientId }
            });
            expect(refresh.status).toBe(400);
        });

        it('同一个应用重新授权后只留一条', async () => {
            const clientId = await registerClient();
            for (let i = 0; i < 2; i++) {
                const redirect = await approve(await authQuery(clientId));
                expect((await exchange(clientId, redirect.searchParams.get('code'))).status).toBe(200);
            }
            expect((await (await request('/api/oauth/grants', { token: jwtA })).json()).grants).toHaveLength(1);
        });

        it('只接受网页登录', async () => {
            expect((await request('/api/oauth/grants')).status).toBe(401);
            const tokens = await authorize();
            expect((await request('/api/oauth/grants', { token: tokens.access_token })).status).toBe(401);
        });
    });

    describe('整页跳转登录', () => {
        it('只放行跳回授权页', () => {
            expect(sanitizeReturnTo('/oauth/authorize?client_id=abc')).toBe('/oauth/authorize?client_id=abc');
            expect(sanitizeReturnTo('/oauth/authorize')).toBeNull();
            expect(sanitizeReturnTo('//evil.example/oauth/authorize?x=1')).toBeNull();
            expect(sanitizeReturnTo('https://evil.example/oauth/authorize?x=1')).toBeNull();
            expect(sanitizeReturnTo('/oauth/authorize?x=1\\@evil.example')).toBeNull();
            expect(sanitizeReturnTo('/oauth/authorize?x=1\nSet-Cookie: a=b')).toBeNull();
            expect(sanitizeReturnTo('/oauth/authorize?' + 'a'.repeat(4000))).toBeNull();
            expect(sanitizeReturnTo(undefined)).toBeNull();
        });

        async function startLogin(returnTo) {
            const suffix = returnTo === undefined ? '' : `?return_to=${encodeURIComponent(returnTo)}`;
            const res = await request(`/api/auth/github${suffix}`);
            expect(res.status).toBe(302);
            const state = new URL(res.headers.get('Location')).searchParams.get('state');
            return { state, stored: env.USER_SESSIONS.store.get(`github_state_${state}`) };
        }

        it('跳回地址随 state 存起来，不合规的当成普通弹窗登录', async () => {
            expect((await startLogin('/oauth/authorize?client_id=abc')).stored).toBe('/oauth/authorize?client_id=abc');
            expect((await startLogin('https://evil.example/')).stored).toBe('valid');
            expect((await startLogin()).stored).toBe('valid');
        });

        it('登录失败时跳回授权页，不去找弹窗', async () => {
            const { state } = await startLogin('/oauth/authorize?client_id=abc');
            const res = await request(`/api/auth/github/callback?error=access_denied&state=${state}`);
            const html = await res.text();
            expect(html).toContain('sessionStorage.setItem("oauthLoginResult"');
            expect(html).toContain('location.replace("/oauth/authorize?client_id=abc")');
            expect(html).not.toContain('window.opener');
            // state 用过就作废
            expect(env.USER_SESSIONS.store.has(`github_state_${state}`)).toBe(false);
        });

        it('弹窗登录照旧 postMessage，错误信息不会被当成脚本执行', async () => {
            const { state } = await startLogin();
            const payload = "';alert(1);//</script><script>alert(2)</script>";
            const res = await request(`/api/auth/github/callback?error=${encodeURIComponent(payload)}&state=${state}`);
            const html = await res.text();
            expect(html).toContain('window.opener.postMessage({"type":"AUTH_ERROR"');
            expect(html).not.toContain('</script><script>');
            expect(html).not.toContain("error: '");
            expect(html.match(/<\/script>/g)).toHaveLength(1);
        });

        it('state 不对时报错', async () => {
            const res = await request('/api/auth/github/callback?code=abc&state=forged');
            expect(await res.text()).toContain('invalid_state');
        });
    });
});
