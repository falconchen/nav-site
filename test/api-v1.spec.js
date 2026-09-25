import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sign } from 'hono/jwt';
import worker from '../server/index.js';

const REDIS_URL = 'https://redis.example.test';
const JWT_SECRET = 'test-secret';
const USER_ID = 'user-1';

function createKvStub() {
    const store = new Map();
    return {
        store,
        get: async (key) => (store.has(key) ? store.get(key) : null),
        put: async (key, value) => { store.set(key, value); },
        delete: async (key) => { store.delete(key); }
    };
}

// 只实现 user-data.js 用到的 Upstash REST 子集：get / set / del。
// 其它地址（抓网页）交给 pageFetch，默认当成网络错误
function mockRedis(fetchSpy) {
    const store = new Map();
    store.pageFetch = vi.fn(async (url) => { throw new Error(`unexpected fetch ${url}`); });
    fetchSpy.mockImplementation(async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!url.startsWith(REDIS_URL)) return store.pageFetch(url, init);
        const [, op, ...rest] = url.slice(REDIS_URL.length).split('/');
        const key = decodeURIComponent(rest.join('/'));
        if (op === 'get') return Response.json({ result: store.has(key) ? store.get(key) : null });
        if (op === 'set') { store.set(key, init.body); return Response.json({ result: 'OK' }); }
        if (op === 'del') { const had = store.delete(key); return Response.json({ result: had ? 1 : 0 }); }
        throw new Error(`unexpected op ${op}`);
    });
    return store;
}

async function gzipBase64(data) {
    const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

async function gunzipBase64(base64) {
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
}

async function seedUserData(redisStore, data) {
    redisStore.set(`userdata:${USER_ID}`, JSON.stringify({
        compressed: await gzipBase64(data),
        version: data.version,
        lastUpdated: data.lastUpdated
    }));
}

async function readUserData(redisStore) {
    const stored = JSON.parse(redisStore.get(`userdata:${USER_ID}`));
    return gunzipBase64(stored.compressed);
}

const SAMPLE_DATA = {
    categories: [
        { id: 'pinned', name: '置顶', fixed: true, order: 0 },
        { id: 'recent', name: '最近添加', fixed: true, order: 1 },
        { id: 'social', name: 'AIGC', icon: 'fas fa-robot', order: 2 },
        { id: 'tools', name: '实用工具', icon: 'fas fa-tools', order: 3 }
    ],
    websites: {
        social: [{ title: 'ChatGPT', url: 'https://chatgpt.com/', weight: 120, pinned: true }],
        tools: [{ title: 'Regex101', url: 'https://regex101.com/', weight: 100, imageData: 'data:image/png;base64,AAAA' }]
    },
    version: 1000,
    lastUpdated: '2026-01-01T00:00:00.000Z'
};

describe('个人令牌 + REST API v1', () => {
    let fetchSpy;
    let redisStore;
    let env;
    let sessionJwt;
    const ctx = { waitUntil() {}, passThroughOnException() {} };

    function call(path, { method = 'GET', token, body } = {}) {
        const headers = { 'CF-Connecting-IP': '203.0.113.1' };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        return worker.fetch(new Request(`https://nav.test${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        }), env, ctx);
    }

    async function createPat(name = 'Chrome 扩展') {
        const res = await call('/api/tokens', { method: 'POST', token: sessionJwt, body: { name } });
        expect(res.status).toBe(201);
        return res.json();
    }

    beforeEach(async () => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        redisStore = mockRedis(fetchSpy);
        env = {
            JWT_SECRET,
            UPSTASH_REDIS_REST_URL: REDIS_URL,
            UPSTASH_REDIS_REST_TOKEN: 'redis-token',
            USER_SESSIONS: createKvStub()
        };
        sessionJwt = await sign({ userId: USER_ID, sessionId: 's1', exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET);
        await env.USER_SESSIONS.put(`user_session_${USER_ID}_s1`, JSON.stringify({ token: sessionJwt }));
        await seedUserData(redisStore, SAMPLE_DATA);
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    describe('令牌管理', () => {
        it('创建后只返回一次明文，KV 里只存摘要', async () => {
            const { token, tokenInfo } = await createPat();
            expect(token).toMatch(/^navpat_[A-Za-z0-9_-]{43}$/);
            expect(tokenInfo.name).toBe('Chrome 扩展');
            expect(token.startsWith(tokenInfo.prefix)).toBe(true);

            for (const [key, value] of env.USER_SESSIONS.store) {
                expect(key.includes(token)).toBe(false);
                expect(String(value).includes(token)).toBe(false);
            }

            const list = await (await call('/api/tokens', { token: sessionJwt })).json();
            expect(list.tokens).toHaveLength(1);
            expect(list.tokens[0]).not.toHaveProperty('token');
        });

        it('令牌不能用来管理令牌', async () => {
            const { token } = await createPat();
            const res = await call('/api/tokens', { method: 'POST', token, body: { name: 'x' } });
            expect(res.status).toBe(401);
        });

        it('吊销后令牌立即失效', async () => {
            const { token, tokenInfo } = await createPat();
            expect((await call('/api/v1/me', { token })).status).toBe(200);

            const del = await call(`/api/tokens/${tokenInfo.id}`, { method: 'DELETE', token: sessionJwt });
            expect(del.status).toBe(200);
            expect((await call('/api/v1/me', { token })).status).toBe(401);

            const list = await (await call('/api/tokens', { token: sessionJwt })).json();
            expect(list.tokens).toHaveLength(0);
        });

        it('使用后记录最后使用时间', async () => {
            const { token } = await createPat();
            await call('/api/v1/me', { token });
            const list = await (await call('/api/tokens', { token: sessionJwt })).json();
            expect(list.tokens[0].lastUsedAt).toBeTruthy();
        });
    });

    describe('鉴权', () => {
        it('没有令牌或令牌伪造时返回 401', async () => {
            expect((await call('/api/v1/categories')).status).toBe(401);
            expect((await call('/api/v1/categories', { token: 'navpat_forged' })).status).toBe(401);
        });

        it('网页登录 JWT 也能访问 v1', async () => {
            const res = await call('/api/v1/me', { token: sessionJwt });
            expect(res.status).toBe(200);
            expect((await res.json()).auth.via).toBe('session');
        });
    });

    describe('读取', () => {
        it('分类列表不含虚拟分类，带网站数量', async () => {
            const { token } = await createPat();
            const { categories } = await (await call('/api/v1/categories', { token })).json();
            expect(categories.map((c) => c.id)).toEqual(['social', 'tools']);
            expect(categories[0]).toMatchObject({ name: 'AIGC', count: 1 });
        });

        it('按网址查询时忽略协议、www 和末尾斜杠，且不返回 base64 图标', async () => {
            const { token } = await createPat();
            const res = await call(`/api/v1/websites?url=${encodeURIComponent('http://www.regex101.com')}`, { token });
            const { websites } = await res.json();
            expect(websites).toHaveLength(1);
            expect(websites[0]).toMatchObject({ title: 'Regex101', category: 'tools', imageData: null });
        });
    });

    describe('添加网站', () => {
        it('写入云端数据、升版本号并生成版本快照', async () => {
            const { token } = await createPat();
            const res = await call('/api/v1/websites', {
                method: 'POST', token,
                body: { url: 'https://github.com/#readme', title: 'GitHub', category: 'tools', description: '代码托管' }
            });
            expect(res.status).toBe(201);
            const { website, version } = await res.json();
            expect(website).toMatchObject({ url: 'https://github.com/', category: 'tools', weight: 110, pinned: false });
            expect(version).toBeGreaterThan(SAMPLE_DATA.version);

            const saved = await readUserData(redisStore);
            expect(saved.websites.tools.map((s) => s.title)).toEqual(['Regex101', 'GitHub']);
            expect(saved.categories).toEqual(SAMPLE_DATA.categories);
            expect(saved.version).toBe(version);

            const versions = JSON.parse(redisStore.get(`userdata_versions:${USER_ID}`));
            expect(versions[0].description).toBe('通过令牌「Chrome 扩展」添加：GitHub');
        });

        it('分类可以用名称指定；置顶取全局最大权重 +10', async () => {
            const { token } = await createPat();
            const res = await call('/api/v1/websites', {
                method: 'POST', token,
                body: { url: 'https://claude.ai', title: 'Claude', category: 'AIGC', pinned: true }
            });
            expect(res.status).toBe(201);
            expect((await res.json()).website).toMatchObject({ category: 'social', weight: 130, pinned: true });
        });

        it('重复网址返回 409 和已有条目', async () => {
            const { token } = await createPat();
            const res = await call('/api/v1/websites', {
                method: 'POST', token, body: { url: 'https://chatgpt.com', category: 'tools' }
            });
            expect(res.status).toBe(409);
            const body = await res.json();
            expect(body.code).toBe('DUPLICATE');
            expect(body.website.category).toBe('social');
        });

        it('校验参数', async () => {
            const { token } = await createPat();
            const post = (body) => call('/api/v1/websites', { method: 'POST', token, body });
            expect((await post({ url: 'javascript:alert(1)', category: 'tools' })).status).toBe(400);
            expect((await post({ url: 'https://a.com', category: 'pinned' })).status).toBe(400);
            expect((await post({ url: 'https://a.com', category: 'nope' })).status).toBe(400);
            expect((await post({ url: 'https://a.com', category: 'tools', icon: '" onclick="x' })).status).toBe(400);
            expect((await post({ url: 'https://a.com', category: 'tools', imageData: 'data:image/svg+xml;base64,AA' })).status).toBe(400);
        });

        it('云端还没有数据时拒绝写入，避免网页端用残缺数据覆盖本地', async () => {
            redisStore.clear();
            const { token } = await createPat();
            const res = await call('/api/v1/websites', {
                method: 'POST', token, body: { url: 'https://a.com', category: 'tools' }
            });
            expect(res.status).toBe(409);
            expect((await res.json()).code).toBe('NO_CLOUD_DATA');
            expect(redisStore.has(`userdata:${USER_ID}`)).toBe(false);
        });
    });

    describe('删除网站', () => {
        it('按网址删除', async () => {
            const { token } = await createPat();
            const res = await call(`/api/v1/websites?url=${encodeURIComponent('https://chatgpt.com')}`, { method: 'DELETE', token });
            expect(res.status).toBe(200);
            expect((await res.json()).removed).toHaveLength(1);
            const saved = await readUserData(redisStore);
            expect(saved.websites.social).toEqual([]);
        });

        it('不存在时返回 404', async () => {
            const { token } = await createPat();
            const res = await call(`/api/v1/websites?url=${encodeURIComponent('https://none.example')}`, { method: 'DELETE', token });
            expect(res.status).toBe(404);
        });
    });
    describe('只传 url 自动补全', () => {
        const PAGE = '<html><head><title>Claude Code</title><meta name="description" content="meta 描述"></head><body><p>正文</p></body></html>';

        function stubAi(categoryIndex = 2) {
            return vi.fn(async (_model, options) => options.response_format
                ? { response: JSON.stringify({ category_index: categoryIndex, confidence: 'high' }) }
                : { response: 'AI 描述。' });
        }

        beforeEach(() => {
            redisStore.pageFetch.mockImplementation(async () => new Response(PAGE, {
                status: 200, headers: { 'Content-Type': 'text/html' }
            }));
        });

        it('AI 补全标题、分类、描述并保存，响应带 analysis', async () => {
            env.AI = { run: stubAi(2) };
            const { token } = await createPat();
            const res = await call('/api/v1/websites', { method: 'POST', token, body: { url: 'https://code.claude.com/' } });

            expect(res.status).toBe(201);
            const body = await res.json();
            // 候选按 categories 数组顺序编号，2 号是 tools（实用工具）
            expect(body.website).toMatchObject({ title: 'Claude Code', description: 'AI 描述。', category: 'tools' });
            expect(body.analysis.sources).toMatchObject({ title: 'page', category: 'ai', description: 'ai' });

            const saved = await readUserData(redisStore);
            expect(saved.websites.tools.map((s) => s.title)).toContain('Claude Code');
        });

        it('AI 判断不出时按同域名归类，版本描述里注明', async () => {
            env.AI = { run: vi.fn(async () => { throw new Error('boom'); }) };
            const { token } = await createPat();
            const res = await call('/api/v1/websites', { method: 'POST', token, body: { url: 'https://chatgpt.com/g/some-gpt' } });

            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.website.category).toBe('social');
            expect(body.analysis.warnings).toEqual(['content_thin', 'ai_category_failed', 'ai_description_failed']);

            const versions = JSON.parse(redisStore.get(`userdata_versions:${USER_ID}`));
            expect(versions[0].description).toBe('通过令牌「Chrome 扩展」添加：Claude Code（自动归类：AIGC，同域名）');
        });

        it('网页抓不到时用 hints，仍然能保存', async () => {
            redisStore.pageFetch.mockImplementation(async () => new Response('Forbidden', { status: 403 }));
            env.AI = { run: stubAi(1) };
            const { token } = await createPat();
            const res = await call('/api/v1/websites', {
                method: 'POST', token,
                body: { url: 'https://blocked.example/', hints: { title: '标签页标题', icon: 'https://blocked.example/i.png' } }
            });

            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.website).toMatchObject({ title: '标签页标题', imageData: 'https://blocked.example/i.png' });
            expect(body.analysis.warnings).toContain('fetch_blocked');
        });

        it('重复网址在抓网页和调 AI 之前就返回 409', async () => {
            env.AI = { run: stubAi() };
            const { token } = await createPat();
            const res = await call('/api/v1/websites', { method: 'POST', token, body: { url: 'https://chatgpt.com' } });

            expect(res.status).toBe(409);
            expect(redisStore.pageFetch).not.toHaveBeenCalled();
            expect(env.AI.run).not.toHaveBeenCalled();
        });

        it('/websites/analyze 只返回建议，不写数据', async () => {
            env.AI = { run: stubAi(2) };
            const before = redisStore.get(`userdata:${USER_ID}`);
            const { token } = await createPat();
            const res = await call('/api/v1/websites/analyze', { method: 'POST', token, body: { url: 'https://code.claude.com/' } });

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body).toMatchObject({ duplicate: null, website: { title: 'Claude Code', category: 'tools' } });
            expect(redisStore.get(`userdata:${USER_ID}`)).toBe(before);
            expect(redisStore.has(`userdata_versions:${USER_ID}`)).toBe(false);
        });

        it('/websites/analyze 遇到已收藏的网址直接返回 duplicate', async () => {
            env.AI = { run: stubAi() };
            const { token } = await createPat();
            const res = await call('/api/v1/websites/analyze', { method: 'POST', token, body: { url: 'https://chatgpt.com/' } });

            const body = await res.json();
            expect(body.duplicate).toMatchObject({ title: 'ChatGPT', category: 'social' });
            expect(env.AI.run).not.toHaveBeenCalled();
        });

        it('需要 AI 的请求按用户限流', async () => {
            env.AI = { run: stubAi() };
            const bucket = Math.floor(Date.now() / 60000);
            await env.USER_SESSIONS.put(`rl_api_v1_ai_${USER_ID}_${bucket}`, '20');
            const { token } = await createPat();

            const limited = await call('/api/v1/websites/analyze', { method: 'POST', token, body: { url: 'https://code.claude.com/' } });
            expect(limited.status).toBe(429);

            // 分类和描述都给了就不跑 AI，不受这个限流影响
            const ok = await call('/api/v1/websites', {
                method: 'POST', token, body: { url: 'https://code.claude.com/', category: 'tools', description: 'd' }
            });
            expect(ok.status).toBe(201);
        });
    });
});
