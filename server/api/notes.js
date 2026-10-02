/**
 * 记事本接口
 *
 * /notes 下的都只接受网页登录的 JWT（和 /tokens 一样，个人令牌不能用）；
 * /public/notes/:publicId 给公开页用，不鉴权，只能读已发布的记事。
 * 存储和校验在 server/lib/notes-store.js。
 */

import { Hono } from 'hono';
import { requireSession } from '../lib/session-auth.js';
import { isRateLimited } from '../lib/rate-limit.js';
import { RedisError } from '../lib/redis.js';
import {
    LIMITS,
    NoteError,
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    getNote,
    getPublicNote,
    listNotes,
    publishNote,
    renameFolder,
    unpublishNote,
    updateNote
} from '../lib/notes-store.js';

const WRITE_RATE_LIMIT = 60;
const PUBLIC_RATE_LIMIT = 60;
// 10 万个汉字的 JSON 大约 300KB，留出余量
const MAX_BODY_BYTES = 512 * 1024;

const app = new Hono();

app.use('/notes', requireSession);
app.use('/notes/*', requireSession);

// 业务错误和存储故障转成约定的响应格式
function handle(handler) {
    return async (c) => {
        try {
            return await handler(c, c.get('user')?.userId);
        } catch (error) {
            if (error instanceof NoteError) {
                return c.json({ error: error.message, code: error.code }, error.status);
            }
            if (error instanceof RedisError) {
                console.error('记事本存储不可用:', error.message);
                return c.json({ error: 'Note storage unavailable', code: 'STORAGE_UNAVAILABLE' }, 503);
            }
            throw error;
        }
    };
}

const limitWrites = async (c, next) => {
    if (await isRateLimited(c, { scope: 'notes_write', limit: WRITE_RATE_LIMIT, key: c.get('user').userId })) {
        return c.json({ error: 'Too many requests, please try again later', code: 'RATE_LIMITED' }, 429);
    }
    await next();
};

async function readBody(c) {
    if (parseInt(c.req.header('Content-Length') || '0', 10) > MAX_BODY_BYTES) {
        throw new NoteError(413, 'BODY_TOO_LARGE', 'Request body too large');
    }
    let body;
    try {
        body = await c.req.json();
    } catch {
        throw new NoteError(400, 'INVALID_JSON', 'Invalid JSON body');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new NoteError(400, 'INVALID_JSON', 'Invalid JSON body');
    }
    return body;
}

app.get('/notes', handle(async (c, userId) => {
    const { notes, folders } = await listNotes(c.env, userId);
    return c.json({ success: true, notes, folders, limits: LIMITS });
}));

app.post('/notes', limitWrites, handle(async (c, userId) => {
    const { content, syntax, folderId } = await readBody(c);
    const note = await createNote(c.env, userId, { content, syntax, folderId });
    return c.json({ success: true, note }, 201);
}));

// 文件夹路由要在 /notes/:id 前面，否则 folders 会被当成记事 id
app.post('/notes/folders', limitWrites, handle(async (c, userId) => {
    const { name } = await readBody(c);
    const folder = await createFolder(c.env, userId, name);
    return c.json({ success: true, folder }, 201);
}));

app.put('/notes/folders/:id', limitWrites, handle(async (c, userId) => {
    const { name } = await readBody(c);
    const folder = await renameFolder(c.env, userId, c.req.param('id'), name);
    return c.json({ success: true, folder });
}));

app.delete('/notes/folders/:id', limitWrites, handle(async (c, userId) => {
    await deleteFolder(c.env, userId, c.req.param('id'));
    return c.json({ success: true });
}));

app.get('/notes/:id', handle(async (c, userId) => {
    const note = await getNote(c.env, userId, c.req.param('id'));
    return c.json({ success: true, note });
}));

app.put('/notes/:id', limitWrites, handle(async (c, userId) => {
    const { content, syntax, folderId, baseUpdatedAt } = await readBody(c);
    const note = await updateNote(c.env, userId, c.req.param('id'), { content, syntax, folderId, baseUpdatedAt });
    return c.json({ success: true, note });
}));

app.delete('/notes/:id', limitWrites, handle(async (c, userId) => {
    await deleteNote(c.env, userId, c.req.param('id'));
    return c.json({ success: true });
}));

app.post('/notes/:id/publish', limitWrites, handle(async (c, userId) => {
    const note = await publishNote(c.env, userId, c.req.param('id'));
    return c.json({ success: true, note });
}));

app.delete('/notes/:id/publish', limitWrites, handle(async (c, userId) => {
    const note = await unpublishNote(c.env, userId, c.req.param('id'));
    return c.json({ success: true, note });
}));

app.get('/public/notes/:publicId', handle(async (c) => {
    // 取消发布要立刻生效，不让浏览器和中间缓存留着
    c.header('Cache-Control', 'no-store');
    if (await isRateLimited(c, { scope: 'notes_public', limit: PUBLIC_RATE_LIMIT })) {
        return c.json({ error: 'Too many requests, please try again later', code: 'RATE_LIMITED' }, 429);
    }
    const note = await getPublicNote(c.env, c.req.param('publicId'));
    if (!note) {
        return c.json({ error: 'Note not found', code: 'NOTE_NOT_FOUND' }, 404);
    }
    return c.json({ success: true, note });
}));

export default app;
