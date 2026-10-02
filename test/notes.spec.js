import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sign } from 'hono/jwt';
import worker from '../server/index.js';
import { LIMITS, deriveTitle } from '../server/lib/notes-store.js';

const REDIS_URL = 'https://redis.example.test';
const JWT_SECRET = 'test-secret';
const USER_A = 'user_aaaa1111';
const USER_B = 'user_bbbb2222';

function createKvStub() {
    const store = new Map();
    return {
        store,
        get: async (key) => (store.has(key) ? store.get(key) : null),
        put: async (key, value) => { store.set(key, value); },
        delete: async (key) => { store.delete(key); }
    };
}

// Upstash REST 的 get / set / del；store.failing 置真时模拟 Redis 故障
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
        throw new Error(`unexpected op ${op}`);
    });
    return store;
}

describe('记事本', () => {
    let fetchSpy;
    let redisStore;
    let env;
    let tokenA;
    let tokenB;
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

    async function login(userId) {
        const token = await sign({ userId, sessionId: 's1', exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET);
        await env.USER_SESSIONS.put(`user_session_${userId}_s1`, JSON.stringify({ token }));
        return token;
    }

    async function create(body, token = tokenA) {
        const res = await call('/api/notes', { method: 'POST', token, body });
        expect(res.status).toBe(201);
        return (await res.json()).note;
    }

    async function createFolder(name, token = tokenA) {
        const res = await call('/api/notes/folders', { method: 'POST', token, body: { name } });
        expect(res.status).toBe(201);
        return (await res.json()).folder;
    }

    async function list(token = tokenA) {
        const res = await call('/api/notes', { token });
        expect(res.status).toBe(200);
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
        tokenA = await login(USER_A);
        tokenB = await login(USER_B);
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    describe('鉴权', () => {
        it('没登录 401', async () => {
            expect((await call('/api/notes')).status).toBe(401);
            expect((await call('/api/notes', { method: 'POST', body: { content: 'x' } })).status).toBe(401);
            expect((await call('/api/notes/folders', { method: 'POST', body: { name: 'x' } })).status).toBe(401);
        });

        it('个人令牌不能用', async () => {
            const res = await call('/api/tokens', { method: 'POST', token: tokenA, body: { name: 'ext' } });
            const { token: pat } = await res.json();
            expect((await call('/api/notes', { token: pat })).status).toBe(401);
        });
    });

    describe('增删改查', () => {
        it('新建后出现在列表里，列表不带正文', async () => {
            const note = await create({ content: '# 购物清单\n\n- 牛奶', syntax: 'markdown' });
            expect(note).toMatchObject({ title: '购物清单', syntax: 'markdown', folderId: null, publicId: null, length: 12 });
            expect(note.content).toBe('# 购物清单\n\n- 牛奶');

            const { notes, folders, limits } = await list();
            expect(notes).toHaveLength(1);
            expect(notes[0].id).toBe(note.id);
            expect(notes[0]).not.toHaveProperty('content');
            expect(folders).toEqual([]);
            expect(limits).toEqual(LIMITS);
        });

        it('默认是纯文本，正文单独存一个 key', async () => {
            const note = await create({ content: '第一行\n第二行' });
            expect(note.syntax).toBe('plain');
            expect(JSON.parse(redisStore.get(`note:${USER_A}:${note.id}`))).toEqual({ content: '第一行\n第二行' });

            const res = await call(`/api/notes/${note.id}`, { token: tokenA });
            expect((await res.json()).note.content).toBe('第一行\n第二行');
        });

        it('标题取第一个非空行', () => {
            expect(deriveTitle('\n\n  你好  \n世界')).toBe('你好');
            expect(deriveTitle('## 二级标题')).toBe('二级标题');
            expect(deriveTitle('#标签不是标题')).toBe('#标签不是标题');
            expect(deriveTitle('字'.repeat(300))).toHaveLength(100);
            expect(deriveTitle('  \n ')).toBe('无标题');
        });

        it('修改正文会更新标题、字数和时间', async () => {
            const note = await create({ content: '旧标题' });
            await new Promise(resolve => setTimeout(resolve, 5));
            const res = await call(`/api/notes/${note.id}`, { method: 'PUT', token: tokenA, body: { content: '新标题\n正文', syntax: 'markdown' } });
            expect(res.status).toBe(200);
            const updated = (await res.json()).note;
            expect(updated).toMatchObject({ title: '新标题', length: 6, syntax: 'markdown' });
            expect(updated.updatedAt > note.updatedAt).toBe(true);
            expect(updated.createdAt).toBe(note.createdAt);
        });

        it('删除后列表和正文都没了', async () => {
            const note = await create({ content: '要删的' });
            expect((await call(`/api/notes/${note.id}`, { method: 'DELETE', token: tokenA })).status).toBe(200);
            expect((await list()).notes).toEqual([]);
            expect(redisStore.has(`note:${USER_A}:${note.id}`)).toBe(false);
            expect((await call(`/api/notes/${note.id}`, { token: tokenA })).status).toBe(404);
        });

        it('不存在或格式不对的 id 返回 404', async () => {
            expect((await call('/api/notes/nope', { token: tokenA })).status).toBe(404);
            expect((await call('/api/notes/a%2Fb', { token: tokenA })).status).toBe(404);
            expect((await call('/api/notes/nope', { method: 'PUT', token: tokenA, body: { content: 'x' } })).status).toBe(404);
        });
    });

    describe('校验和上限', () => {
        it('空正文、非字符串、未知格式被拒', async () => {
            for (const body of [{ content: '   ' }, { content: 123 }, {}, { content: 'x', syntax: 'html' }]) {
                expect((await call('/api/notes', { method: 'POST', token: tokenA, body })).status).toBe(400);
            }
            const res = await worker.fetch(new Request('https://nav.test/api/notes', {
                method: 'POST',
                headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
                body: '{oops'
            }), env, ctx);
            expect(res.status).toBe(400);
        });

        it('正文超长返回 413，不截断', async () => {
            const res = await call('/api/notes', { method: 'POST', token: tokenA, body: { content: 'x'.repeat(LIMITS.maxContentLength + 1) } });
            expect(res.status).toBe(413);
            expect((await res.json()).code).toBe('NOTE_TOO_LONG');
            expect((await list()).notes).toEqual([]);
        });

        it('记事条数到上限后不能再建', async () => {
            const notes = Array.from({ length: LIMITS.maxNotes }, (_, i) => ({ id: `n${i}`, title: 't', syntax: 'plain' }));
            redisStore.set(`notes:${USER_A}`, JSON.stringify({ notes, folders: [] }));
            const res = await call('/api/notes', { method: 'POST', token: tokenA, body: { content: 'x' } });
            expect(res.status).toBe(409);
            expect((await res.json()).code).toBe('NOTE_LIMIT');
        });

        it('写操作按用户限流', async () => {
            const bucket = Math.floor(Date.now() / 60000);
            await env.USER_SESSIONS.put(`rl_notes_write_${USER_A}_${bucket}`, '60');
            expect((await call('/api/notes', { method: 'POST', token: tokenA, body: { content: 'x' } })).status).toBe(429);
            // 读不限，别的用户不受影响
            expect((await call('/api/notes', { token: tokenA })).status).toBe(200);
            expect((await call('/api/notes', { method: 'POST', token: tokenB, body: { content: 'x' } })).status).toBe(201);
        });

        it('Redis 故障返回 503，不把索引当成空的写回去', async () => {
            const note = await create({ content: '还在' });
            redisStore.failing = true;
            expect((await call('/api/notes', { token: tokenA })).status).toBe(503);
            expect((await call('/api/notes', { method: 'POST', token: tokenA, body: { content: 'x' } })).status).toBe(503);
            redisStore.failing = false;
            expect((await list()).notes.map(item => item.id)).toEqual([note.id]);
        });
    });

    describe('并发修改', () => {
        it('baseUpdatedAt 对不上返回 409，不带就覆盖', async () => {
            const note = await create({ content: '原文' });
            await new Promise(resolve => setTimeout(resolve, 5));
            await call(`/api/notes/${note.id}`, { method: 'PUT', token: tokenA, body: { content: '别处改的' } });

            const conflict = await call(`/api/notes/${note.id}`, {
                method: 'PUT', token: tokenA, body: { content: '我改的', baseUpdatedAt: note.updatedAt }
            });
            expect(conflict.status).toBe(409);
            expect((await conflict.json()).code).toBe('NOTE_CONFLICT');
            expect((await (await call(`/api/notes/${note.id}`, { token: tokenA })).json()).note.content).toBe('别处改的');

            const forced = await call(`/api/notes/${note.id}`, { method: 'PUT', token: tokenA, body: { content: '我改的' } });
            expect(forced.status).toBe(200);
            expect((await (await call(`/api/notes/${note.id}`, { token: tokenA })).json()).note.content).toBe('我改的');
        });
    });

    describe('文件夹', () => {
        it('新建、改名，重名被拒', async () => {
            const folder = await createFolder(' 工作 ');
            expect(folder.name).toBe('工作');
            expect((await call('/api/notes/folders', { method: 'POST', token: tokenA, body: { name: '工作' } })).status).toBe(409);
            expect((await call('/api/notes/folders', { method: 'POST', token: tokenA, body: { name: '  ' } })).status).toBe(400);

            const renamed = await call(`/api/notes/folders/${folder.id}`, { method: 'PUT', token: tokenA, body: { name: '生活' } });
            expect((await renamed.json()).folder.name).toBe('生活');
            expect((await list()).folders.map(item => item.name)).toEqual(['生活']);
        });

        it('移动记事不算修改，移到不存在的文件夹被拒', async () => {
            const folder = await createFolder('工作');
            const note = await create({ content: '周报' });

            const moved = await call(`/api/notes/${note.id}`, { method: 'PUT', token: tokenA, body: { folderId: folder.id } });
            expect((await moved.json()).note).toMatchObject({ folderId: folder.id, updatedAt: note.updatedAt });

            const bad = await call(`/api/notes/${note.id}`, { method: 'PUT', token: tokenA, body: { folderId: 'nope' } });
            expect(bad.status).toBe(404);
            expect((await bad.json()).code).toBe('FOLDER_NOT_FOUND');

            const inFolder = await create({ content: '直接建在文件夹里', folderId: folder.id });
            expect(inFolder.folderId).toBe(folder.id);
        });

        it('删文件夹不删记事，记事回到未归档', async () => {
            const folder = await createFolder('临时');
            const note = await create({ content: '留着', folderId: folder.id });
            expect((await call(`/api/notes/folders/${folder.id}`, { method: 'DELETE', token: tokenA })).status).toBe(200);

            const { notes, folders } = await list();
            expect(folders).toEqual([]);
            expect(notes).toHaveLength(1);
            expect(notes[0]).toMatchObject({ id: note.id, folderId: null });
        });
    });

    describe('公开发布', () => {
        it('发布后不登录也能读，只返回内容', async () => {
            const note = await create({ content: '# 公开的\n正文', syntax: 'markdown' });
            const res = await call(`/api/notes/${note.id}/publish`, { method: 'POST', token: tokenA });
            const { publicId } = (await res.json()).note;
            expect(publicId).toMatch(/^[A-Za-z0-9_-]{12}$/);
            expect(publicId).not.toContain(note.id);

            const pub = await call(`/api/public/notes/${publicId}`);
            expect(pub.status).toBe(200);
            expect(pub.headers.get('Cache-Control')).toBe('no-store');
            const body = await pub.json();
            expect(body.note).toEqual({ title: '公开的', content: '# 公开的\n正文', syntax: 'markdown', updatedAt: note.updatedAt });
            expect(JSON.stringify(body)).not.toContain(USER_A);
            expect(JSON.stringify(body)).not.toContain(note.id);
        });

        it('重复发布不换链接，公开页读到的是最新正文', async () => {
            const note = await create({ content: '第一版' });
            const first = (await (await call(`/api/notes/${note.id}/publish`, { method: 'POST', token: tokenA })).json()).note.publicId;
            const second = (await (await call(`/api/notes/${note.id}/publish`, { method: 'POST', token: tokenA })).json()).note.publicId;
            expect(second).toBe(first);

            await call(`/api/notes/${note.id}`, { method: 'PUT', token: tokenA, body: { content: '第二版' } });
            expect((await (await call(`/api/public/notes/${first}`)).json()).note.content).toBe('第二版');
        });

        it('取消发布后旧链接失效，再发布换新链接', async () => {
            const note = await create({ content: '先公开再收回' });
            const first = (await (await call(`/api/notes/${note.id}/publish`, { method: 'POST', token: tokenA })).json()).note.publicId;
            const off = await call(`/api/notes/${note.id}/publish`, { method: 'DELETE', token: tokenA });
            expect((await off.json()).note.publicId).toBe(null);
            expect((await call(`/api/public/notes/${first}`)).status).toBe(404);
            expect(redisStore.has(`note_public:${first}`)).toBe(false);

            const second = (await (await call(`/api/notes/${note.id}/publish`, { method: 'POST', token: tokenA })).json()).note.publicId;
            expect(second).not.toBe(first);
            expect((await call(`/api/public/notes/${first}`)).status).toBe(404);
            expect((await call(`/api/public/notes/${second}`)).status).toBe(200);
        });

        it('删除记事后公开链接失效', async () => {
            const note = await create({ content: '删掉' });
            const { publicId } = (await (await call(`/api/notes/${note.id}/publish`, { method: 'POST', token: tokenA })).json()).note;
            await call(`/api/notes/${note.id}`, { method: 'DELETE', token: tokenA });
            expect((await call(`/api/public/notes/${publicId}`)).status).toBe(404);
            expect(redisStore.has(`note_public:${publicId}`)).toBe(false);
        });

        it('反查表残留也读不到已取消发布的记事', async () => {
            const note = await create({ content: '残留' });
            const { publicId } = (await (await call(`/api/notes/${note.id}/publish`, { method: 'POST', token: tokenA })).json()).note;
            const mapping = redisStore.get(`note_public:${publicId}`);
            await call(`/api/notes/${note.id}/publish`, { method: 'DELETE', token: tokenA });
            redisStore.set(`note_public:${publicId}`, mapping);
            expect((await call(`/api/public/notes/${publicId}`)).status).toBe(404);
        });

        it('乱填的公开 id 返回 404', async () => {
            expect((await call('/api/public/notes/nope')).status).toBe(404);
            expect((await call('/api/public/notes/a%2Fb')).status).toBe(404);
        });

        it('公开接口按 IP 限流', async () => {
            const bucket = Math.floor(Date.now() / 60000);
            await env.USER_SESSIONS.put(`rl_notes_public_203.0.113.1_${bucket}`, '60');
            expect((await call('/api/public/notes/whatever')).status).toBe(429);
        });
    });

    describe('用户之间隔离', () => {
        it('读不到、改不了、删不了、发布不了别人的记事', async () => {
            const note = await create({ content: '甲的秘密' });
            const folder = await createFolder('甲的文件夹');

            expect((await list(tokenB)).notes).toEqual([]);
            expect((await list(tokenB)).folders).toEqual([]);
            expect((await call(`/api/notes/${note.id}`, { token: tokenB })).status).toBe(404);
            expect((await call(`/api/notes/${note.id}`, { method: 'PUT', token: tokenB, body: { content: '乙改的' } })).status).toBe(404);
            expect((await call(`/api/notes/${note.id}`, { method: 'DELETE', token: tokenB })).status).toBe(404);
            expect((await call(`/api/notes/${note.id}/publish`, { method: 'POST', token: tokenB })).status).toBe(404);
            expect((await call(`/api/notes/folders/${folder.id}`, { method: 'DELETE', token: tokenB })).status).toBe(404);

            // 乙也不能把自己的记事放进甲的文件夹
            const res = await call('/api/notes', { method: 'POST', token: tokenB, body: { content: '乙的', folderId: folder.id } });
            expect(res.status).toBe(404);

            expect((await (await call(`/api/notes/${note.id}`, { token: tokenA })).json()).note.content).toBe('甲的秘密');
        });
    });
});
