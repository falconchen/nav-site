import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import uploadImageApi from '../server/api/upload-image.js';

const PHOTO_HOST = 'https://photo.example.test';

// 极简 KV 桩，只实现限流用到的 get/put
function createKvStub(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        store,
        get: async (key) => (store.has(key) ? store.get(key) : null),
        put: async (key, value) => { store.set(key, value); }
    };
}

function createEnv(overrides = {}) {
    return {
        CF_PHOTOS_ENDPOINT: PHOTO_HOST,
        CF_PHOTOS_TOKEN: 'test-token',
        USER_SESSIONS: createKvStub(),
        ...overrides
    };
}

function createUploadRequest(blob, filename = 'icon.webp') {
    const form = new FormData();
    form.append('image', blob, filename);
    return { method: 'POST', body: form };
}

describe('POST /upload-image', () => {
    let fetchSpy;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('上传成功时返回图床 URL，并带上 Bearer 鉴权', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            result: 'success',
            code: 200,
            url: `${PHOTO_HOST}/i/2026/09/21/AbCdEf12.webp`
        }), { status: 201 }));

        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
        const res = await uploadImageApi.request(
            '/upload-image', createUploadRequest(blob), createEnv()
        );

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            success: true,
            url: `${PHOTO_HOST}/i/2026/09/21/AbCdEf12.webp`,
            deduped: false
        });

        // 转发到图床时带了 token，且文件字段名是 image
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe(`${PHOTO_HOST}/upload`);
        expect(init.headers.Authorization).toBe('Bearer test-token');
        expect(init.body.get('image')).toBeInstanceOf(Blob);
    });

    describe('按内容去重', () => {
        function mockPhotoHost() {
            let n = 0;
            fetchSpy.mockImplementation(async () => Response.json(
                { result: 'success', url: `${PHOTO_HOST}/i/${++n}.webp` }, { status: 201 }
            ));
        }

        function upload(env, bytes) {
            const blob = new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
            return uploadImageApi.request('/upload-image', createUploadRequest(blob), env).then((res) => res.json());
        }

        it('同样的字节第二次不再上传，返回同一个地址', async () => {
            mockPhotoHost();
            const env = createEnv();
            const first = await upload(env, [1, 2, 3]);
            const second = await upload(env, [1, 2, 3]);

            expect(first).toMatchObject({ url: `${PHOTO_HOST}/i/1.webp`, deduped: false });
            expect(second).toMatchObject({ url: `${PHOTO_HOST}/i/1.webp`, deduped: true });
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect([...env.USER_SESSIONS.store.keys()].some((key) => /^imghash_[0-9a-f]{64}$/.test(key))).toBe(true);
        });

        it('不同的字节各传一份', async () => {
            mockPhotoHost();
            const env = createEnv();
            await upload(env, [1, 2, 3]);
            const other = await upload(env, [4, 5, 6]);

            expect(other).toMatchObject({ url: `${PHOTO_HOST}/i/2.webp`, deduped: false });
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('映射指向别的域名（比如换了图床）时不采用，重新上传', async () => {
            mockPhotoHost();
            const env = createEnv();
            await upload(env, [1, 2, 3]);
            for (const key of env.USER_SESSIONS.store.keys()) {
                if (key.startsWith('imghash_')) env.USER_SESSIONS.store.set(key, 'https://old-host.example/i/x.webp');
            }
            const again = await upload(env, [1, 2, 3]);

            expect(again).toMatchObject({ url: `${PHOTO_HOST}/i/2.webp`, deduped: false });
        });

        it('KV 出错时照常上传', async () => {
            mockPhotoHost();
            const kv = createKvStub();
            kv.get = async (key) => {
                if (key.startsWith('imghash_')) throw new Error('KV 挂了');
                return null;
            };
            kv.put = async (key, value) => {
                if (key.startsWith('imghash_')) throw new Error('KV 挂了');
                kv.store.set(key, value);
            };
            const res = await upload(createEnv({ USER_SESSIONS: kv }), [1, 2, 3]);

            expect(res).toMatchObject({ success: true, url: `${PHOTO_HOST}/i/1.webp`, deduped: false });
        });
    });

    it('拒绝白名单外的类型（SVG 不允许直传图床）', async () => {
        const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' });
        const res = await uploadImageApi.request(
            '/upload-image', createUploadRequest(blob, 'icon.svg'), createEnv()
        );

        expect(res.status).toBe(415);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('类型被拒时返回机器可读的 code，供前端退到浏览器光栅化', async () => {
        const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' });
        const res = await uploadImageApi.request(
            '/upload-image', createUploadRequest(blob, 'icon.svg'), createEnv()
        );

        expect(res.status).toBe(415);
        await expect(res.json()).resolves.toMatchObject({
            success: false,
            code: 'unsupported_type',
            contentType: 'image/svg+xml'
        });
    });

    it('超过 5MB 上限时返回 413', async () => {
        const blob = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' });
        const res = await uploadImageApi.request(
            '/upload-image', createUploadRequest(blob, 'big.png'), createEnv()
        );

        expect(res.status).toBe(413);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('同一 IP 超过每分钟上限时返回 429', async () => {
        const bucket = Math.floor(Date.now() / 60000);
        const env = createEnv({
            USER_SESSIONS: createKvStub({ [`rl_upload_1.2.3.4_${bucket}`]: '20' })
        });

        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
        const res = await uploadImageApi.request('/upload-image', {
            ...createUploadRequest(blob),
            headers: { 'CF-Connecting-IP': '1.2.3.4' }
        }, env);

        expect(res.status).toBe(429);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('只填域名时自动按 https 处理', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            result: 'success', code: 200, url: `${PHOTO_HOST}/i/x.webp`
        }), { status: 201 }));

        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
        const res = await uploadImageApi.request(
            '/upload-image', createUploadRequest(blob),
            createEnv({ CF_PHOTOS_ENDPOINT: 'photo.example.test/' })
        );

        expect(res.status).toBe(200);
        expect(fetchSpy.mock.calls[0][0]).toBe(`${PHOTO_HOST}/upload`);
    });

    it('没配置图床地址时报错而不是静默失败', async () => {
        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
        const res = await uploadImageApi.request(
            '/upload-image', createUploadRequest(blob),
            createEnv({ CF_PHOTOS_ENDPOINT: '' })
        );

        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toContain('CF_PHOTOS_ENDPOINT');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('图床返回错误时透出 502', async () => {
        fetchSpy.mockResolvedValue(new Response('Unauthorized: 鉴权失败', { status: 401 }));

        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
        const res = await uploadImageApi.request(
            '/upload-image', createUploadRequest(blob), createEnv()
        );

        expect(res.status).toBe(502);
        await expect(res.json()).resolves.toMatchObject({ success: false });
    });
});
