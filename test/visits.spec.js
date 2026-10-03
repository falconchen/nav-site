import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sign } from 'hono/jwt';
import worker from '../server/index.js';
import { LIMITS } from '../server/lib/visits-store.js';

const REDIS_URL = 'https://redis.example.test';
const JWT_SECRET = 'test-secret';
const USER_A = 'user_aaaa1111';
const USER_B = 'user_bbbb2222';
const DAY_MS = 24 * 60 * 60 * 1000;

function createKvStub() {
    const store = new Map();
    return {
        store,
        get: async (key) => (store.has(key) ? store.get(key) : null),
        put: async (key, value) => { store.set(key, value); },
        delete: async (key) => { store.delete(key); }
    };
}

// Upstash REST 的 get / set；store.failing 置真时模拟 Redis 故障
function mockRedis(fetchSpy) {
    const store = new Map();
    store.failing = false;
    store.writes = 0;
    fetchSpy.mockImplementation(async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!url.startsWith(REDIS_URL)) throw new Error(`unexpected fetch ${url}`);
        if (store.failing) return new Response('down', { status: 500 });
        const [, op, ...rest] = url.slice(REDIS_URL.length).split('/');
        const key = decodeURIComponent(rest.join('/'));
        if (op === 'get') return Response.json({ result: store.has(key) ? store.get(key) : null });
        if (op === 'set') { store.writes += 1; store.set(key, init.body); return Response.json({ result: 'OK' }); }
        throw new Error(`unexpected op ${op}`);
    });
    return store;
}

describe('访问统计同步', () => {
    let fetchSpy;
    let redisStore;
    let env;
    let tokenA;
    let tokenB;
    let now;
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

    async function post(body, token = tokenA) {
        const res = await call('/api/visits', { method: 'POST', token, body });
        expect(res.status).toBe(200);
        return res.json();
    }

    async function get(token = tokenA) {
        const res = await call('/api/visits', { token });
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
        now = Date.now();
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    describe('鉴权', () => {
        it('没登录 401', async () => {
            expect((await call('/api/visits')).status).toBe(401);
            expect((await call('/api/visits', { method: 'POST', body: {} })).status).toBe(401);
        });

        it('个人令牌不能用', async () => {
            const res = await call('/api/tokens', { method: 'POST', token: tokenA, body: { name: 'ext' } });
            const { token: pat } = await res.json();
            expect((await call('/api/visits', { token: pat })).status).toBe(401);
        });

        it('各用户的记录互不相干', async () => {
            await post({ delta: { 'a.com': { count: 2, visits: [now - 1000] } } });
            expect((await get(tokenB)).entries).toEqual({});
        });
    });

    describe('合并', () => {
        it('没有记录时返回空', async () => {
            expect(await get()).toMatchObject({ success: true, entries: {}, pins: {}, pinsUpdatedAt: 0 });
        });

        it('两台设备的增量相加，不互相覆盖', async () => {
            await post({ delta: { 'a.com': { count: 3, visits: [now - 3000, now - 2000, now - 1000] } } });
            const merged = await post({ delta: { 'a.com': { count: 3, visits: [now - 2500, now - 1500, now - 500] } } });
            expect(merged.entries['a.com'].count).toBe(6);
            expect(merged.entries['a.com'].visits).toEqual(
                [now - 3000, now - 2500, now - 2000, now - 1500, now - 1000, now - 500]
            );
            expect((await get()).entries).toEqual(merged.entries);
        });

        it('访问时间去重，只留最近 10 次', async () => {
            const first = Array.from({ length: 10 }, (_, i) => now - (20 - i) * 1000);
            const second = [first[9], now - 5000, now - 4000];
            await post({ delta: { 'a.com': { count: 40, visits: first } } });
            const { entries } = await post({ delta: { 'a.com': { count: 3, visits: second } } });
            expect(entries['a.com'].count).toBe(43);
            expect(entries['a.com'].visits).toHaveLength(LIMITS.samples);
            expect(entries['a.com'].visits.slice(-2)).toEqual([now - 5000, now - 4000]);
            expect(new Set(entries['a.com'].visits).size).toBe(LIMITS.samples);
        });

        it('同一批重发不会加两遍', async () => {
            const body = { batchId: 'batch-1', delta: { 'a.com': { count: 2, visits: [now - 1000] } } };
            await post(body);
            const again = await post(body);
            expect(again.entries['a.com'].count).toBe(2);
        });

        it('未来的时间按现在算', async () => {
            const { entries } = await post({ delta: { 'a.com': { count: 1, visits: [now + DAY_MS] } } });
            expect(entries['a.com'].visits[0]).toBeLessThanOrEqual(Date.now());
        });
    });

    describe('移除', () => {
        it('移除后记录消失', async () => {
            await post({ delta: { 'a.com': { count: 5, visits: [now - 5000] } } });
            const { entries } = await post({ removed: { 'a.com': now - 1000 } });
            expect(entries).toEqual({});
        });

        it('另一台设备离线期间攒的旧访问不会把它带回来', async () => {
            await post({ delta: { 'a.com': { count: 5, visits: [now - 9000] } } });
            await post({ removed: { 'a.com': now - 5000 } });
            const { entries } = await post({ delta: { 'a.com': { count: 2, visits: [now - 8000, now - 7000] } } });
            expect(entries).toEqual({});
        });

        it('移除之后的访问重新计数', async () => {
            await post({ delta: { 'a.com': { count: 5, visits: [now - 9000] } } });
            await post({ removed: { 'a.com': now - 5000 } });
            const { entries } = await post({ delta: { 'a.com': { count: 3, visits: [now - 8000, now - 2000, now - 1000] } } });
            expect(entries['a.com']).toEqual({ count: 2, visits: [now - 2000, now - 1000] });
        });

        it('云端已有移除时间之后的访问时留着', async () => {
            await post({ delta: { 'a.com': { count: 9, visits: [now - 9000, now - 1000] } } });
            const { entries } = await post({ removed: { 'a.com': now - 5000 } });
            expect(entries['a.com']).toEqual({ count: 1, visits: [now - 1000] });
        });

        it('同一批里先移除再访问，只算移除之后的', async () => {
            await post({ delta: { 'a.com': { count: 5, visits: [now - 9000] } } });
            const { entries } = await post({
                removed: { 'a.com': now - 5000 },
                delta: { 'a.com': { count: 1, visits: [now - 1000] } }
            });
            expect(entries['a.com']).toEqual({ count: 1, visits: [now - 1000] });
        });
    });

    describe('固定位置', () => {
        it('整份按最后改的为准', async () => {
            await post({ pins: { 'a.com': 0 }, pinsUpdatedAt: now - 2000 });
            const older = await post({ pins: { 'b.com': 3 }, pinsUpdatedAt: now - 3000 });
            expect(older.pins).toEqual({ 'a.com': 0 });

            const newer = await post({ pins: { 'b.com': 3 }, pinsUpdatedAt: now - 1000 });
            expect(newer.pins).toEqual({ 'b.com': 3 });
            expect(newer.pinsUpdatedAt).toBe(now - 1000);
        });

        it('空对象表示恢复自动排序', async () => {
            await post({ pins: { 'a.com': 0 }, pinsUpdatedAt: now - 2000 });
            expect((await post({ pins: {}, pinsUpdatedAt: now - 1000 })).pins).toEqual({});
        });

        it('不带 pins 的上报不动固定位置', async () => {
            await post({ pins: { 'a.com': 0 }, pinsUpdatedAt: now - 2000 });
            const { pins } = await post({ delta: { 'a.com': { count: 1, visits: [now - 1000] } } });
            expect(pins).toEqual({ 'a.com': 0 });
        });
    });

    describe('上限与校验', () => {
        it('超过上限时裁掉得分最低的', async () => {
            const delta = {};
            for (let i = 0; i < LIMITS.entries; i++) {
                delta[`site${i}.com`] = { count: 5, visits: [now - 1000] };
            }
            await post({ delta });
            const { entries } = await post({
                delta: {
                    'old.com': { count: 1, visits: [now - 200 * DAY_MS] },
                    'hot.com': { count: 50, visits: [now - 500] }
                }
            });
            expect(Object.keys(entries)).toHaveLength(LIMITS.entries);
            expect(entries['hot.com']).toBeDefined();
            expect(entries['old.com']).toBeUndefined();
        });

        it('格式不对返回 400，不写入', async () => {
            const bad = [
                { delta: [] },
                { delta: { 'a.com': { count: 0, visits: [now] } } },
                { delta: { 'a.com': { count: 1.5, visits: [now] } } },
                { delta: { 'a.com': { count: 1, visits: [] } } },
                { delta: { 'a.com': { count: 1, visits: ['x'] } } },
                { delta: { 'a.com': { count: 1, visits: Array(LIMITS.samples + 1).fill(now) } } },
                { delta: { ['a'.repeat(LIMITS.keyLength + 1)]: { count: 1, visits: [now] } } },
                { removed: { 'a.com': 'yesterday' } },
                { pins: { 'a.com': -1 }, pinsUpdatedAt: now },
                { pins: { 'a.com': 1 } },
                { batchId: 42 }
            ];
            for (const body of bad) {
                const res = await call('/api/visits', { method: 'POST', token: tokenA, body });
                expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
            }
            expect(redisStore.writes).toBe(0);
        });

        it('一次带太多网址返回 413', async () => {
            const delta = {};
            for (let i = 0; i <= LIMITS.deltaKeys; i++) delta[`site${i}.com`] = { count: 1, visits: [now] };
            const res = await call('/api/visits', { method: 'POST', token: tokenA, body: { delta } });
            expect(res.status).toBe(413);
        });
    });

    describe('存储故障', () => {
        it('Redis 读失败返回 503，不把记录写空', async () => {
            await post({ delta: { 'a.com': { count: 5, visits: [now - 1000] } } });
            const writes = redisStore.writes;

            redisStore.failing = true;
            expect((await call('/api/visits', { token: tokenA })).status).toBe(503);
            const res = await call('/api/visits', {
                method: 'POST', token: tokenA, body: { delta: { 'b.com': { count: 1, visits: [now] } } }
            });
            expect(res.status).toBe(503);
            expect((await res.json()).code).toBe('STORAGE_UNAVAILABLE');

            redisStore.failing = false;
            expect(redisStore.writes).toBe(writes);
            expect((await get()).entries['a.com'].count).toBe(5);
        });
    });
});
