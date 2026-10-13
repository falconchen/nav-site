import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sign } from 'hono/jwt';
import worker from '../server/index.js';
import { parseTimeParam, toShanghaiIso } from '../server/lib/bookmark-query.js';

const REDIS_URL = 'https://redis.example.test';
const JWT_SECRET = 'test-secret';
const USER_A = 'user_aaaa1111';
const USER_B = 'user_bbbb2222';
const MODERN = '2026-07-28';

function createKvStub() {
    const store = new Map();
    return {
        store,
        get: async (key) => (store.has(key) ? store.get(key) : null),
        put: async (key, value) => { store.set(key, value); },
        delete: async (key) => { store.delete(key); }
    };
}

// Upstash REST 的 get / set / del / keys；其它地址（抓网页、探测图标）一律当网络错误
function mockRedis(fetchSpy) {
    const store = new Map();
    store.failing = false;
    fetchSpy.mockImplementation(async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!url.startsWith(REDIS_URL)) throw new Error(`unexpected fetch ${url}`);
        if (store.failing) return new Response('down', { status: 500 });
        const [, op, ...rest] = url.slice(REDIS_URL.length).split('/');
        const key = decodeURIComponent(rest.join('/'));
        if (op === 'get') return Response.json({ result: store.has(key) ? store.get(key) : null });
        if (op === 'set') { store.set(key, init.body); return Response.json({ result: 'OK' }); }
        if (op === 'del') { const had = store.delete(key); return Response.json({ result: had ? 1 : 0 }); }
        if (op === 'keys') {
            const prefix = key.replace(/\*$/, '');
            return Response.json({ result: [...store.keys()].filter((k) => typeof k === 'string' && k.startsWith(prefix)) });
        }
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

const at = (iso) => Date.parse(iso);

const SAMPLE_DATA = {
    categories: [
        { id: 'pinned', name: '置顶', fixed: true, order: 0 },
        { id: 'social', name: 'AIGC', icon: 'fas fa-robot', order: 2 },
        { id: 'tools', name: '实用工具', icon: 'fas fa-tools', order: 3 }
    ],
    websites: {
        social: [
            { title: 'ChatGPT', url: 'https://chatgpt.com/', description: 'OpenAI 的对话助手', weight: 120, pinned: true, pinnedOrder: 100, addedTime: at('2026-10-10T09:00:00+08:00') },
            { title: 'Midjourney', url: 'https://www.midjourney.com/', description: 'AI 绘画', weight: 110, pinned: true, pinnedOrder: 130, addedTime: at('2026-10-01T09:00:00+08:00') },
            { title: '秘密项目', url: 'https://secret.example/', description: '只有我知道的绘画站', weight: 100, private: true, addedTime: at('2026-10-13T10:00:00+08:00') }
        ],
        tools: [
            { title: 'Regex101', url: 'https://regex101.com/', description: '正则表达式测试', weight: 100, addedTime: at('2026-10-13T00:30:00+08:00') },
            { title: '路由器后台', url: 'https://router.example/', description: '账号 admin 口令 hunter2', hideDescription: true, weight: 90, addedTime: at('2026-10-12T23:30:00+08:00') }
        ]
    },
    version: 1000,
    lastUpdated: '2026-01-01T00:00:00.000Z'
};

describe('MCP', () => {
    let fetchSpy;
    let redisStore;
    let env;
    let jwtA;
    let patA;
    let patB;
    let nextId;
    const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

    function request(path, { method = 'GET', token, body, headers = {} } = {}) {
        const all = { 'CF-Connecting-IP': '203.0.113.1', ...headers };
        if (token) all.Authorization = `Bearer ${token}`;
        if (body !== undefined) all['Content-Type'] = 'application/json';
        return worker.fetch(new Request(`https://nav.test${path}`, {
            method,
            headers: all,
            body: body === undefined ? undefined : JSON.stringify(body)
        }), env, ctx());
    }

    // 老协议（握手式）的一条请求
    function rpc(method, params, { token = patA, headers } = {}) {
        return request('/mcp', {
            method: 'POST',
            token,
            headers,
            body: { jsonrpc: '2.0', id: nextId++, method, params }
        });
    }

    // 新协议：版本放在 _meta 里，并镜像到请求头
    function modernRpc(method, params = {}, { headers = {}, version = MODERN } = {}) {
        const all = { 'MCP-Protocol-Version': version, 'Mcp-Method': method, ...headers };
        if (method === 'tools/call' && !('Mcp-Name' in headers)) all['Mcp-Name'] = params.name;
        return request('/mcp', {
            method: 'POST',
            token: patA,
            headers: all,
            body: {
                jsonrpc: '2.0',
                id: nextId++,
                method,
                params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': version } }
            }
        });
    }

    /**
     * 调用工具，返回解析后的结果；工具报错时返回 { isError: true, text }
     */
    async function tool(name, args = {}, token = patA) {
        const res = await rpc('tools/call', { name, arguments: args }, { token });
        expect(res.status).toBe(200);
        const { result } = await res.json();
        const text = result.content[0].text;
        return result.isError ? { isError: true, text } : JSON.parse(text);
    }

    async function login(userId) {
        const token = await sign({ userId, sessionId: 's1', exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET);
        await env.USER_SESSIONS.put(`user_session_${userId}_s1`, JSON.stringify({ token }));
        return token;
    }

    async function createPat(jwt, name) {
        const res = await request('/api/tokens', { method: 'POST', token: jwt, body: { name } });
        expect(res.status).toBe(201);
        return (await res.json()).token;
    }

    async function seedUserData(userId, data) {
        redisStore.set(`userdata:${userId}`, JSON.stringify({
            compressed: await gzipBase64(data),
            version: data.version,
            lastUpdated: data.lastUpdated
        }));
    }

    async function readUserData(userId) {
        return gunzipBase64(JSON.parse(redisStore.get(`userdata:${userId}`)).compressed);
    }

    beforeEach(async () => {
        nextId = 1;
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        redisStore = mockRedis(fetchSpy);
        env = {
            JWT_SECRET,
            UPSTASH_REDIS_REST_URL: REDIS_URL,
            UPSTASH_REDIS_REST_TOKEN: 'redis-token',
            USER_SESSIONS: createKvStub(),
            // 个人令牌走不到 OAuth 的存储；真去读就说明把它当成了 OAuth 令牌
            OAUTH_KV: createKvStub()
        };
        jwtA = await login(USER_A);
        patA = await createPat(jwtA, 'Claude Code');
        patB = await createPat(await login(USER_B), '另一个人');
        await seedUserData(USER_A, SAMPLE_DATA);
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    describe('鉴权', () => {
        it('不带令牌返回 401，并指明去哪里找授权服务器', async () => {
            const res = await request('/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
            expect(res.status).toBe(401);
            expect(res.headers.get('WWW-Authenticate')).toContain(
                'resource_metadata="https://nav.test/.well-known/oauth-protected-resource/mcp"'
            );
        });

        it('伪造的个人令牌、网页登录的 JWT 都不能用', async () => {
            expect((await rpc('tools/list', undefined, { token: 'navpat_forged' })).status).toBe(401);
            expect((await rpc('tools/list', undefined, { token: jwtA })).status).toBe(401);
        });

        it('吊销后的个人令牌立刻失效', async () => {
            const list = await (await request('/api/tokens', { token: jwtA })).json();
            await request(`/api/tokens/${list.tokens[0].id}`, { method: 'DELETE', token: jwtA });
            expect((await rpc('tools/list')).status).toBe(401);
        });

        it('发布资源和授权服务器的元数据', async () => {
            const resource = await (await request('/.well-known/oauth-protected-resource/mcp')).json();
            expect(resource.resource).toBe('https://nav.test/mcp');
            expect(resource.authorization_servers).toEqual(['https://nav.test']);

            const server = await (await request('/.well-known/oauth-authorization-server')).json();
            expect(server.authorization_endpoint).toBe('https://nav.test/oauth/authorize');
            expect(server.token_endpoint).toBe('https://nav.test/oauth/token');
            expect(server.registration_endpoint).toBe('https://nav.test/oauth/register');
            expect(server.code_challenge_methods_supported).toContain('S256');
        });

        it('个人令牌仍然不能调记事本的 REST 接口', async () => {
            expect((await request('/api/notes', { token: patA })).status).toBe(401);
        });
    });

    describe('协议：握手式（2025-11-25 及更早）', () => {
        it('initialize 回客户端要的版本，不认识的版本回最新的老版本', async () => {
            const known = await (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })).json();
            expect(known.result.protocolVersion).toBe('2025-06-18');
            expect(known.result.capabilities).toEqual({ tools: {} });
            expect(known.result.serverInfo.name).toBe('pipi2047');
            expect(known.result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(known.result.instructions).toContain('Asia/Shanghai');

            const unknown = await (await rpc('initialize', { protocolVersion: '1999-01-01' })).json();
            expect(unknown.result.protocolVersion).toBe('2025-11-25');
        });

        it('通知回 202，ping 回空对象', async () => {
            const notified = await request('/mcp', {
                method: 'POST',
                token: patA,
                body: { jsonrpc: '2.0', method: 'notifications/initialized' }
            });
            expect(notified.status).toBe(202);
            expect(await notified.text()).toBe('');

            expect((await (await rpc('ping')).json()).result).toEqual({});
        });

        it('tools/list 按固定顺序列出全部工具', async () => {
            const { result } = await (await rpc('tools/list')).json();
            expect(result.tools.map((item) => item.name)).toEqual([
                'list_categories', 'search_bookmarks', 'add_bookmark',
                'list_note_folders', 'list_notes', 'get_note', 'create_note', 'update_note', 'delete_note',
                'create_note_folder', 'rename_note_folder', 'delete_note_folder',
                // 后加的工具排在最后，前面的顺序不变
                'update_bookmarks'
            ]);
            for (const item of result.tools) {
                expect(item.inputSchema.type).toBe('object');
                expect(item.description).toBeTruthy();
                expect(item.handler).toBeUndefined();
            }
            expect(result.tools.find((item) => item.name === 'delete_note').annotations.destructiveHint).toBe(true);
            expect(result.tools.find((item) => item.name === 'search_bookmarks').annotations.readOnlyHint).toBe(true);
        });

        it('不认识的方法、不认识的工具返回 JSON-RPC 错误', async () => {
            expect((await (await rpc('resources/list')).json()).error.code).toBe(-32601);
            expect((await (await rpc('tools/call', { name: 'drop_everything' })).json()).error.code).toBe(-32602);
        });

        it('不是合法的 JSON-RPC 时返回 400', async () => {
            const raw = (body) => worker.fetch(new Request('https://nav.test/mcp', {
                method: 'POST',
                headers: { Authorization: `Bearer ${patA}`, 'Content-Type': 'application/json' },
                body
            }), env, ctx());

            const broken = await raw('{oops');
            expect(broken.status).toBe(400);
            expect((await broken.json()).error.code).toBe(-32700);

            const batch = await raw(JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]));
            expect(batch.status).toBe(400);
            expect((await batch.json()).error.code).toBe(-32600);
        });

        it('GET 和 DELETE 返回 405', async () => {
            expect((await request('/mcp', { token: patA })).status).toBe(405);
            expect((await request('/mcp', { method: 'DELETE', token: patA })).status).toBe(405);
        });

        it('请求头里的版本不认识时返回 400', async () => {
            const res = await rpc('tools/list', undefined, { headers: { 'MCP-Protocol-Version': '1999-01-01' } });
            expect(res.status).toBe(400);
        });
    });

    describe('协议：无握手（2026-07-28）', () => {
        it('server/discover 什么都不带也能探测', async () => {
            const { result } = await (await rpc('server/discover')).json();
            expect(result.resultType).toBe('complete');
            expect(result.supportedVersions).toEqual(['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']);
            expect(result.capabilities).toEqual({ tools: {} });
            expect(result._meta['io.modelcontextprotocol/serverInfo'].name).toBe('pipi2047');
        });

        it('不握手直接调用，结果带 resultType 和缓存提示', async () => {
            const listed = await modernRpc('tools/list');
            expect(listed.status).toBe(200);
            const { result } = await listed.json();
            expect(result.resultType).toBe('complete');
            expect(result.tools).toHaveLength(13);
            expect(result.ttlMs).toBeGreaterThan(0);
            expect(result.cacheScope).toBe('public');

            const called = await modernRpc('tools/call', { name: 'list_categories', arguments: {} });
            const body = await called.json();
            expect(body.result.resultType).toBe('complete');
            expect(body.result.isError).toBe(false);
            expect(JSON.parse(body.result.content[0].text).categories).toHaveLength(2);
        });

        it('请求头和请求体对不上时返回 400 HeaderMismatch', async () => {
            const cases = [
                modernRpc('tools/list', {}, { headers: { 'MCP-Protocol-Version': '2025-11-25' } }),
                modernRpc('tools/list', {}, { headers: { 'Mcp-Method': 'tools/call' } }),
                modernRpc('tools/call', { name: 'list_categories' }, { headers: { 'Mcp-Name': 'delete_note' } }),
                modernRpc('tools/call', { name: 'list_categories' }, { headers: { 'Mcp-Name': '' } })
            ];
            for (const pending of cases) {
                const res = await pending;
                expect(res.status).toBe(400);
                expect((await res.json()).error.code).toBe(-32020);
            }
        });

        it('Mcp-Name 可以是 base64 写法', async () => {
            const encoded = `=?base64?${btoa('list_categories')}?=`;
            const res = await modernRpc('tools/call', { name: 'list_categories' }, { headers: { 'Mcp-Name': encoded } });
            expect(res.status).toBe(200);
        });

        it('不支持的版本返回 400 并列出支持的版本', async () => {
            const res = await modernRpc('tools/list', {}, { version: '2030-01-01' });
            expect(res.status).toBe(400);
            const { error } = await res.json();
            expect(error.code).toBe(-32022);
            expect(error.data.requested).toBe('2030-01-01');
            expect(error.data.supported).toContain('2026-07-28');
        });

        it('已移除的方法返回 404', async () => {
            const res = await modernRpc('ping');
            expect(res.status).toBe(404);
            expect((await res.json()).error.code).toBe(-32601);
        });
    });

    describe('时间参数', () => {
        it('只写日期或不带时区的时间按上海时间算', () => {
            expect(parseTimeParam('2026-10-13')).toBe(at('2026-10-13T00:00:00+08:00'));
            expect(parseTimeParam('2026-10-13T08:30')).toBe(at('2026-10-13T08:30:00+08:00'));
            expect(parseTimeParam('2026-10-13 08:30:15')).toBe(at('2026-10-13T08:30:15+08:00'));
            expect(parseTimeParam('2026-10-13T00:30:00Z')).toBe(at('2026-10-13T00:30:00Z'));
            expect(parseTimeParam(undefined)).toBeUndefined();
            expect(parseTimeParam('上周')).toBeNull();
        });

        it('输出带 +08:00', () => {
            expect(toShanghaiIso(at('2026-10-12T16:30:00Z'))).toBe('2026-10-13T00:30:00+08:00');
            expect(toShanghaiIso(0)).toBeNull();
        });
    });

    describe('收藏：查询', () => {
        it('分类数量不含私密收藏，也不含旧数据里的虚拟分类', async () => {
            const { categories } = await tool('list_categories');
            expect(categories).toEqual([
                { id: 'social', name: 'AIGC', count: 2 },
                { id: 'tools', name: '实用工具', count: 2 }
            ]);
        });

        it('默认按添加时间从新到旧，私密收藏不出现', async () => {
            const result = await tool('search_bookmarks');
            expect(result.total).toBe(4);
            expect(result.items.map((item) => item.title)).toEqual(['Regex101', '路由器后台', 'ChatGPT', 'Midjourney']);
            expect(result.items[0]).toEqual({
                title: 'Regex101',
                url: 'https://regex101.com/',
                category: '实用工具',
                pinned: false,
                addedAt: '2026-10-13T00:30:00+08:00',
                description: '正则表达式测试'
            });
            expect(result.now).toMatch(/\+08:00$/);
            expect(JSON.stringify(result)).not.toContain('秘密项目');
        });

        it('关键词搜不到私密收藏，也搜不中被隐藏的描述', async () => {
            // 「绘画」同时出现在私密网站的描述和 Midjourney 的描述里
            const drawing = await tool('search_bookmarks', { query: '绘画' });
            expect(drawing.items.map((item) => item.title)).toEqual(['Midjourney']);

            expect((await tool('search_bookmarks', { query: 'secret.example' })).total).toBe(0);
            expect((await tool('search_bookmarks', { query: 'hunter2' })).total).toBe(0);
        });

        it('隐藏描述的网站照常返回，但不带描述', async () => {
            const { items } = await tool('search_bookmarks', { query: '路由器' });
            expect(items).toHaveLength(1);
            expect(items[0].descriptionHidden).toBe(true);
            expect(items[0]).not.toHaveProperty('description');
        });

        it('多个关键词默认全部命中，match: any 命中一个就算', async () => {
            expect((await tool('search_bookmarks', { query: 'openai 正则' })).total).toBe(0);
            const any = await tool('search_bookmarks', { query: 'openai 正则', match: 'any' });
            expect(any.items.map((item) => item.title)).toEqual(['Regex101', 'ChatGPT']);
            // 分类名也参与匹配，不区分大小写
            expect((await tool('search_bookmarks', { query: 'aigc' })).total).toBe(2);
        });

        it('按日期过滤：今天收藏的', async () => {
            const today = await tool('search_bookmarks', { added_after: '2026-10-13' });
            expect(today.items.map((item) => item.title)).toEqual(['Regex101']);

            const yesterday = await tool('search_bookmarks', { added_after: '2026-10-12', added_before: '2026-10-13' });
            expect(yesterday.items.map((item) => item.title)).toEqual(['路由器后台']);
        });

        it('只看特别关注时按关注顺序排', async () => {
            const pinned = await tool('search_bookmarks', { pinned: true });
            // Midjourney 添加得早，但 pinnedOrder 更大（后关注的）
            expect(pinned.items.map((item) => item.title)).toEqual(['Midjourney', 'ChatGPT']);

            const byAdded = await tool('search_bookmarks', { pinned: true, sort: 'added_desc' });
            expect(byAdded.items.map((item) => item.title)).toEqual(['ChatGPT', 'Midjourney']);
        });

        it('按分类名或 id 过滤，分类不存在时列出已有的', async () => {
            expect((await tool('search_bookmarks', { category: '实用工具' })).total).toBe(2);
            expect((await tool('search_bookmarks', { category: 'social' })).total).toBe(2);

            const missing = await tool('search_bookmarks', { category: '不存在' });
            expect(missing.isError).toBe(true);
            expect(missing.text).toContain('AIGC、实用工具');
        });

        it('分页', async () => {
            const page = await tool('search_bookmarks', { limit: 2, offset: 1 });
            expect(page.total).toBe(4);
            expect(page.offset).toBe(1);
            expect(page.items.map((item) => item.title)).toEqual(['路由器后台', 'ChatGPT']);
        });

        it('时间格式不对、云端没有数据时给出能看懂的错误', async () => {
            const badTime = await tool('search_bookmarks', { added_after: '上周' });
            expect(badTime.isError).toBe(true);
            expect(badTime.text).toContain('added_after');

            const noData = await tool('search_bookmarks', {}, patB);
            expect(noData.isError).toBe(true);
        });
    });

    describe('收藏：添加', () => {
        const FULL = { url: 'https://example.com/tool', title: '示例工具', description: '一个示例', category: '实用工具' };

        it('写入云端并在版本历史里注明来源', async () => {
            const result = await tool('add_bookmark', FULL);
            expect(result.added).toBe(true);
            expect(result.bookmark).toEqual({
                title: '示例工具',
                url: 'https://example.com/tool',
                description: '一个示例',
                category: '实用工具',
                pinned: false
            });
            expect(result.autoFilled).toEqual([]);

            const data = await readUserData(USER_A);
            const saved = data.websites.tools.find((site) => site.url === 'https://example.com/tool');
            expect(saved.title).toBe('示例工具');
            expect(saved.addedTime).toBeGreaterThan(0);

            const versions = JSON.parse(redisStore.get(`userdata_versions:${USER_A}`));
            expect(JSON.stringify(versions)).toContain('MCP（令牌「Claude Code」）添加：示例工具');

            // 加完马上能搜到
            expect((await tool('search_bookmarks', { query: '示例工具' })).total).toBe(1);
        });

        it('设为特别关注时排在关注列表最前', async () => {
            await tool('add_bookmark', { ...FULL, pinned: true });
            const pinned = await tool('search_bookmarks', { pinned: true });
            expect(pinned.items[0].title).toBe('示例工具');
        });

        it('已收藏的网址不重复添加', async () => {
            const result = await tool('add_bookmark', { url: 'https://www.chatgpt.com' });
            expect(result.added).toBe(false);
            expect(result.bookmark.title).toBe('ChatGPT');
            expect(result.bookmark.category).toBe('AIGC');
        });

        it('已收藏在私密里时不透露条目内容', async () => {
            const result = await tool('add_bookmark', { url: 'https://secret.example/' });
            expect(result.added).toBe(false);
            expect(result).not.toHaveProperty('bookmark');
            expect(JSON.stringify(result)).not.toContain('秘密项目');

            const hidden = await tool('add_bookmark', { url: 'https://router.example/' });
            expect(hidden.bookmark.title).toBe('路由器后台');
            expect(JSON.stringify(hidden)).not.toContain('hunter2');
        });

        it('网址不合法、分类不存在时报错', async () => {
            const badUrl = await tool('add_bookmark', { url: 'javascript:alert(1)' });
            expect(badUrl.isError).toBe(true);

            const badCategory = await tool('add_bookmark', { ...FULL, category: '不存在' });
            expect(badCategory.isError).toBe(true);
            expect(badCategory.text).toContain('AIGC、实用工具');
        });

        it('按用户限流', async () => {
            const bucket = Math.floor(Date.now() / 60000);
            await env.USER_SESSIONS.put(`rl_mcp_bookmark_write_${USER_A}_${bucket}`, '30');
            const result = await tool('add_bookmark', FULL);
            expect(result.isError).toBe(true);
            expect(await readUserData(USER_A)).toEqual(SAMPLE_DATA);
        });
    });

    describe('收藏：修改', () => {
        const versions = () => JSON.parse(redisStore.get(`userdata_versions:${USER_A}`) || '[]');
        const one = async (update) => (await tool('update_bookmarks', { updates: [update] })).results[0];

        it('移到另一个分类，排在新分类最前，添加时间不变', async () => {
            const result = await one({ url: 'https://chatgpt.com/', category: '实用工具' });
            expect(result).toEqual({
                url: 'https://chatgpt.com/',
                status: 'updated',
                changed: ['category'],
                title: 'ChatGPT',
                category: '实用工具',
                pinned: true
            });

            const data = await readUserData(USER_A);
            expect(data.websites.social.map((site) => site.title)).toEqual(['Midjourney', '秘密项目']);
            const moved = data.websites.tools.find((site) => site.title === 'ChatGPT');
            expect(moved.weight).toBe(110);
            expect(moved.addedTime).toBe(at('2026-10-10T09:00:00+08:00'));
            expect(moved.pinnedOrder).toBe(100);
            expect(moved.editedTime).toBeGreaterThan(moved.addedTime);

            expect((await tool('search_bookmarks', { category: 'AIGC' })).items.map((item) => item.title)).toEqual(['Midjourney']);
        });

        it('改标题和描述，没提到的字段保持原样', async () => {
            const result = await one({ url: 'https://regex101.com', title: '  正则测试  ', description: '' });
            expect(result.changed).toEqual(['title', 'description']);
            expect(result.title).toBe('正则测试');

            const site = (await readUserData(USER_A)).websites.tools.find((item) => item.url === 'https://regex101.com/');
            expect(site.title).toBe('正则测试');
            expect(site.description).toBe('');
            expect(site.weight).toBe(100);
            expect(site.pinned).toBeUndefined();
        });

        it('设为特别关注排到关注列表最前，取消后不在列表里', async () => {
            expect((await one({ url: 'https://regex101.com/', pinned: true })).changed).toEqual(['pinned']);
            expect((await tool('search_bookmarks', { pinned: true })).items.map((item) => item.title))
                .toEqual(['Regex101', 'Midjourney', 'ChatGPT']);

            await one({ url: 'https://www.midjourney.com/', pinned: false });
            expect((await tool('search_bookmarks', { pinned: true })).items.map((item) => item.title))
                .toEqual(['Regex101', 'ChatGPT']);
            const data = await readUserData(USER_A);
            expect(data.websites.social.find((site) => site.title === 'Midjourney')).not.toHaveProperty('pinnedOrder');
        });

        it('一批改多个只保存一次、只占一个历史版本', async () => {
            const result = await tool('update_bookmarks', {
                updates: [
                    { url: 'https://chatgpt.com/', category: '实用工具' },
                    { url: 'https://www.midjourney.com/', category: '实用工具', title: 'MJ' },
                    { url: 'https://regex101.com/', pinned: true }
                ]
            });
            expect(result.updated).toBe(3);
            expect(result.failed).toBe(0);

            expect(versions()).toHaveLength(1);
            expect(JSON.stringify(versions())).toContain('MCP（令牌「Claude Code」）修改 3 个网址');

            const data = await readUserData(USER_A);
            expect(data.websites.tools.map((site) => site.title).sort()).toEqual(['ChatGPT', 'MJ', 'Regex101', '路由器后台'].sort());
        });

        it('每一项各自成败：能改的照改，改不了的说明原因', async () => {
            const result = await tool('update_bookmarks', {
                updates: [
                    { url: 'https://regex101.com/', title: '正则' },
                    { url: 'https://chatgpt.com/', category: '不存在的分类' },
                    { url: 'https://nowhere.example/', title: 'x' },
                    { url: 'not a url', title: 'x' },
                    { url: 'https://www.midjourney.com/', title: '   ' }
                ]
            });
            expect(result.updated).toBe(1);
            expect(result.failed).toBe(4);
            expect(result.results.map((item) => item.status)).toEqual(['updated', 'failed', 'failed', 'failed', 'failed']);
            expect(result.results[1].reason).toContain('分类不存在');
            expect(result.categories).toBe('AIGC、实用工具');

            const data = await readUserData(USER_A);
            expect(data.websites.tools.find((site) => site.url === 'https://regex101.com/').title).toBe('正则');
            expect(data.websites.social.find((site) => site.title === 'ChatGPT')).toBeTruthy();
            expect(JSON.stringify(versions())).toContain('修改：正则');
        });

        it('没有实际变化时不写入', async () => {
            const result = await tool('update_bookmarks', {
                updates: [
                    { url: 'https://chatgpt.com/', category: 'AIGC', title: 'ChatGPT', pinned: true },
                    { url: 'https://regex101.com/' }
                ]
            });
            expect(result).toMatchObject({ updated: 0, unchanged: 2, failed: 0 });
            expect(versions()).toEqual([]);
            expect(await readUserData(USER_A)).toEqual(SAMPLE_DATA);
        });

        it('私密收藏当作不存在，改不了', async () => {
            const result = await one({ url: 'https://secret.example/', title: '被 AI 改了', category: '实用工具' });
            expect(result.status).toBe('failed');
            expect(JSON.stringify(result)).not.toContain('秘密项目');
            expect(await readUserData(USER_A)).toEqual(SAMPLE_DATA);
        });

        it('被隐藏的描述不能覆盖，其它字段照常能改', async () => {
            const blocked = await one({ url: 'https://router.example/', description: '新描述' });
            expect(blocked.status).toBe('failed');
            expect(blocked.reason).toContain('隐藏');

            const moved = await one({ url: 'https://router.example/', category: 'AIGC', title: '路由器' });
            expect(moved.changed).toEqual(['title', 'category']);
            const site = (await readUserData(USER_A)).websites.social.find((item) => item.title === '路由器');
            expect(site.description).toBe('账号 admin 口令 hunter2');
            expect(site.hideDescription).toBe(true);
            expect(JSON.stringify(moved)).not.toContain('hunter2');
        });

        it('列表为空或超过上限时报错，按用户限流', async () => {
            expect((await tool('update_bookmarks', { updates: [] })).isError).toBe(true);
            expect((await tool('update_bookmarks', {})).isError).toBe(true);
            const tooMany = Array.from({ length: 51 }, () => ({ url: 'https://chatgpt.com/', title: 'x' }));
            expect((await tool('update_bookmarks', { updates: tooMany })).isError).toBe(true);

            const bucket = Math.floor(Date.now() / 60000);
            await env.USER_SESSIONS.put(`rl_mcp_bookmark_write_${USER_A}_${bucket}`, '30');
            expect((await tool('update_bookmarks', { updates: [{ url: 'https://chatgpt.com/', title: 'x' }] })).isError).toBe(true);
            expect(await readUserData(USER_A)).toEqual(SAMPLE_DATA);
        });

        it('改不了别人的收藏', async () => {
            const result = await tool('update_bookmarks', { updates: [{ url: 'https://chatgpt.com/', title: 'x' }] }, patB);
            expect(result.isError).toBe(true);
            expect(await readUserData(USER_A)).toEqual(SAMPLE_DATA);
        });
    });

    describe('记事本', () => {
        it('新建默认是 Markdown，可以按名称放进文件夹', async () => {
            const { folder } = await tool('create_note_folder', { name: '对话总结' });
            const { note } = await tool('create_note', { content: '# MCP 接入方案\n\n正文', folder: '对话总结' });
            expect(note.title).toBe('MCP 接入方案');
            expect(note.syntax).toBe('markdown');
            expect(note.folder).toBe('对话总结');
            expect(note.published).toBe(false);

            const folders = await tool('list_note_folders');
            expect(folders).toEqual({ folders: [{ id: folder.id, name: '对话总结', count: 1 }], unfiled: 0, total: 1 });

            const full = await tool('get_note', { id: note.id });
            expect(full.content).toBe('# MCP 接入方案\n\n正文');
            expect(full.updatedAt).toBe(note.updatedAt);
        });

        it('文件夹不存在时报错并列出已有的，不会悄悄建一个', async () => {
            await tool('create_note_folder', { name: '工作' });
            const result = await tool('create_note', { content: '内容', folder: '生活' });
            expect(result.isError).toBe(true);
            expect(result.text).toContain('工作');
            expect((await tool('list_notes')).total).toBe(0);
        });

        it('列表按最后修改时间倒序，只有概要，能按文件夹和标题过滤', async () => {
            await tool('create_note_folder', { name: '工作' });
            const first = (await tool('create_note', { content: '周报\n内容', syntax: 'plain', folder: '工作' })).note;
            await new Promise((resolve) => setTimeout(resolve, 5));
            await tool('create_note', { content: '购物清单\n牛奶' });
            await new Promise((resolve) => setTimeout(resolve, 5));
            await tool('update_note', { id: first.id, mode: 'append', content: '补充' });

            const all = await tool('list_notes');
            expect(all.items.map((item) => item.title)).toEqual(['周报', '购物清单']);
            expect(all.items[0]).not.toHaveProperty('content');

            expect((await tool('list_notes', { folder: '工作' })).items.map((item) => item.title)).toEqual(['周报']);
            expect((await tool('list_notes', { folder: 'none' })).items.map((item) => item.title)).toEqual(['购物清单']);
            expect((await tool('list_notes', { query: '清单' })).total).toBe(1);
            expect((await tool('list_notes', { limit: 1, offset: 1 })).items.map((item) => item.title)).toEqual(['购物清单']);
        });

        it('追加不用带 base_updated_at，原文保留', async () => {
            const { note } = await tool('create_note', { content: '标题\n第一段\n\n' });
            const result = await tool('update_note', { id: note.id, mode: 'append', content: '第二段' });
            expect(result.updated).toBe(true);
            expect((await tool('get_note', { id: note.id })).content).toBe('标题\n第一段\n\n第二段');
        });

        it('改写整篇必须带 base_updated_at，对不上就拒绝', async () => {
            const { note } = await tool('create_note', { content: '原文' });

            const missing = await tool('update_note', { id: note.id, content: '新内容' });
            expect(missing.isError).toBe(true);
            expect(missing.text).toContain('base_updated_at');

            const stale = await tool('update_note', { id: note.id, content: '新内容', base_updated_at: '2020-01-01T00:00:00.000Z' });
            expect(stale.isError).toBe(true);
            expect(stale.text).toContain('get_note');
            expect((await tool('get_note', { id: note.id })).content).toBe('原文');

            const ok = await tool('update_note', { id: note.id, content: '新标题\n新内容', base_updated_at: note.updatedAt });
            expect(ok.note.title).toBe('新标题');
            expect((await tool('get_note', { id: note.id })).content).toBe('新标题\n新内容');
        });

        it('只移动文件夹或只改格式不用带正文', async () => {
            await tool('create_note_folder', { name: '归档' });
            const { note } = await tool('create_note', { content: '内容' });

            const moved = await tool('update_note', { id: note.id, folder: '归档' });
            expect(moved.note.folder).toBe('归档');
            // 移动不算修改
            expect(moved.note.updatedAt).toBe(note.updatedAt);

            const back = await tool('update_note', { id: note.id, folder: 'none', syntax: 'plain' });
            expect(back.note.folder).toBeNull();
            expect(back.note.syntax).toBe('plain');

            expect((await tool('update_note', { id: note.id })).isError).toBe(true);
        });

        it('删除后读不到', async () => {
            const { note } = await tool('create_note', { content: '要删的\n内容' });
            expect(await tool('delete_note', { id: note.id })).toEqual({ deleted: true, id: note.id, title: '要删的' });
            expect((await tool('get_note', { id: note.id })).isError).toBe(true);
            expect((await tool('delete_note', { id: note.id })).isError).toBe(true);
        });

        it('文件夹改名、删除，删除后里面的记事变成未归档', async () => {
            await tool('create_note_folder', { name: '草稿' });
            const { note } = await tool('create_note', { content: '内容', folder: '草稿' });

            expect((await tool('create_note_folder', { name: '草稿' })).isError).toBe(true);
            expect((await tool('rename_note_folder', { folder: '草稿', name: '成稿' })).folder.name).toBe('成稿');
            expect((await tool('get_note', { id: note.id })).folder).toBe('成稿');

            expect(await tool('delete_note_folder', { folder: '成稿' })).toEqual({
                deleted: true,
                folder: '成稿',
                notesMovedToUnfiled: 1
            });
            expect((await tool('get_note', { id: note.id })).folder).toBeNull();
            expect((await tool('delete_note_folder', { folder: '成稿' })).isError).toBe(true);
        });

        it('内容为空、超长时报错', async () => {
            expect((await tool('create_note', { content: '   ' })).isError).toBe(true);
            const tooLong = await tool('create_note', { content: 'a'.repeat(100001) });
            expect(tooLong.isError).toBe(true);
            expect(tooLong.text).toContain('100000');
        });

        it('读不到别人的记事', async () => {
            const { note } = await tool('create_note', { content: 'A 的记事' });
            expect((await tool('get_note', { id: note.id }, patB)).isError).toBe(true);
            expect((await tool('list_notes', {}, patB)).total).toBe(0);
            expect((await tool('delete_note', { id: note.id }, patB)).isError).toBe(true);
            expect((await tool('get_note', { id: note.id })).content).toBe('A 的记事');
        });

        it('网页端发布过的记事只告诉 AI 已发布，不给公开链接', async () => {
            const { note } = await tool('create_note', { content: '公开的' });
            const published = await request(`/api/notes/${note.id}/publish`, { method: 'POST', token: jwtA });
            const { publicId } = (await published.json()).note;

            const seen = await tool('get_note', { id: note.id });
            expect(seen.published).toBe(true);
            expect(JSON.stringify(seen)).not.toContain(publicId);
        });

        it('存储故障时不把原因当成「没有数据」', async () => {
            redisStore.failing = true;
            const result = await tool('list_notes');
            expect(result.isError).toBe(true);
            expect(result.text).toContain('暂时不可用');
        });

        it('写操作和网页端共用限流', async () => {
            const bucket = Math.floor(Date.now() / 60000);
            await env.USER_SESSIONS.put(`rl_notes_write_${USER_A}_${bucket}`, '60');
            expect((await tool('create_note', { content: '内容' })).isError).toBe(true);
            expect((await tool('list_notes')).total).toBe(0);
        });
    });

    it('工具调用总量按用户限流', async () => {
        const bucket = Math.floor(Date.now() / 60000);
        await env.USER_SESSIONS.put(`rl_mcp_call_${USER_A}_${bucket}`, '120');
        const result = await tool('list_categories');
        expect(result.isError).toBe(true);
        // 列工具不算调用
        expect((await rpc('tools/list')).status).toBe(200);
    });
});
