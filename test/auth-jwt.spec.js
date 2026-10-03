import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sign } from 'hono/jwt';
import worker from '../server/index.js';

const JWT_SECRET = 'hono-upgrade-test-secret';
const USER_ID = 'jwt-test-user';
const SESSION_ID = 'jwt-test-session';
const SESSION_KEY = `user_session_${USER_ID}_${SESSION_ID}`;

describe('Hono 升级后的 JWT 鉴权', () => {
    let env;
    let store;
    const ctx = { waitUntil() {}, passThroughOnException() {} };

    beforeEach(() => {
        store = new Map();
        env = {
            JWT_SECRET,
            USER_SESSIONS: {
                get: vi.fn(async (key) => store.get(key) ?? null),
                put: vi.fn(async (key, value) => { store.set(key, value); }),
                delete: vi.fn(async (key) => { store.delete(key); })
            }
        };
        // 认证端点的调试日志不需要输出测试令牌。
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function payload(overrides = {}) {
        return {
            userId: USER_ID,
            sessionId: SESSION_ID,
            exp: Math.floor(Date.now() / 1000) + 3600,
            ...overrides
        };
    }

    function seedSession(token) {
        store.set(SESSION_KEY, JSON.stringify({ token, createdAt: new Date().toISOString() }));
    }

    function call(path, token, method = 'GET') {
        return worker.fetch(new Request(`https://nav.test${path}`, {
            method,
            headers: { Authorization: `Bearer ${token}` }
        }), env, ctx);
    }

    describe.each([
        ['/api/auth/verify', 'GET'],
        ['/api/auth/logout', 'POST'],
        ['/api/tokens', 'GET']
    ])('%s', (path, method) => {
        it('继续接受默认 HS256 签发的会话令牌', async () => {
            // 旧版 sign() 未指定算法时默认使用 HS256，升级后仍应兼容。
            const token = await sign(payload(), JWT_SECRET);
            seedSession(token);
            const response = await call(path, token, method);
            expect(response.status).toBe(200);
            const body = await response.json();
            if (path === '/api/auth/verify') {
                expect(body).toMatchObject({ valid: true, user: { id: USER_ID } });
            } else if (path === '/api/auth/logout') {
                expect(body).toEqual({ success: true });
                expect(store.has(SESSION_KEY)).toBe(false);
            } else {
                expect(body).toMatchObject({ success: true, tokens: [] });
            }
        });

        it.each(['HS384', 'HS512'])('拒绝使用同一密钥签发的 %s 令牌', async (algorithm) => {
            const token = await sign(payload(), JWT_SECRET, algorithm);
            seedSession(token);
            const response = await call(path, token, method);
            expect(response.status).toBe(401);
            expect(env.USER_SESSIONS.delete).not.toHaveBeenCalled();
            expect(store.has(SESSION_KEY)).toBe(true);
        });

        it('拒绝使用错误密钥签发的令牌', async () => {
            const token = await sign(payload(), 'wrong-secret', 'HS256');
            seedSession(token);
            expect((await call(path, token, method)).status).toBe(401);
            expect(env.USER_SESSIONS.delete).not.toHaveBeenCalled();
        });

        it('拒绝过期令牌', async () => {
            const token = await sign(payload({ exp: Math.floor(Date.now() / 1000) - 60 }), JWT_SECRET, 'HS256');
            seedSession(token);
            expect((await call(path, token, method)).status).toBe(401);
            expect(env.USER_SESSIONS.delete).not.toHaveBeenCalled();
        });

        it('拒绝字符串类型的过期时间', async () => {
            const token = await sign(payload({ exp: String(Math.floor(Date.now() / 1000) + 3600) }), JWT_SECRET, 'HS256');
            seedSession(token);
            expect((await call(path, token, method)).status).toBe(401);
            expect(env.USER_SESSIONS.delete).not.toHaveBeenCalled();
        });

        it('拒绝没有签名的 alg=none 令牌', async () => {
            const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload())}.`;
            seedSession(token);
            expect((await call(path, token, method)).status).toBe(401);
            expect(env.USER_SESSIONS.delete).not.toHaveBeenCalled();
        });
    });

    it('登出后，校验端点和受保护路由都拒绝原来的有效令牌', async () => {
        const token = await sign(payload(), JWT_SECRET, 'HS256');
        seedSession(token);
        expect((await call('/api/auth/verify', token)).status).toBe(200);
        expect((await call('/api/tokens', token)).status).toBe(200);
        expect((await call('/api/auth/logout', token, 'POST')).status).toBe(200);
        expect((await call('/api/auth/verify', token)).status).toBe(401);
        expect((await call('/api/tokens', token)).status).toBe(401);
    });
});
