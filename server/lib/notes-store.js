/**
 * 记事本的存储（Upstash Redis）
 *
 * - notes:<userId>            索引：记事的元数据列表 + 文件夹列表，不含正文
 * - note:<userId>:<noteId>    单条记事的正文，列表页不用把全部正文拉下来
 * - note_public:<publicId>    公开链接 → { userId, noteId } 的反查表
 *
 * key 不能用 user: 开头：auth.js 的 findUserByEmail 会 KEYS user:* 把它们当用户记录扫。
 * 索引是读-改-写，没有并发保护，和 personal-tokens.js、user-data.js 的版本列表一样。
 */

import { redisDel, redisGet, redisSet } from './redis.js';

export const LIMITS = {
    maxNotes: 500,
    maxFolders: 50,
    maxPublicNotes: 50,
    maxContentLength: 100000,
    maxFolderNameLength: 50
};

export const SYNTAXES = ['plain', 'markdown'];

const MAX_TITLE_LENGTH = 100;
const UNTITLED = '无标题';
// id 直接拼进 Redis 的请求路径，只放行不需要转义的字符
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 可以直接回给前端的业务错误
 */
export class NoteError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'NoteError';
        this.status = status;
        this.code = code;
    }
}

const indexKey = (userId) => `notes:${userId}`;
const contentKey = (userId, noteId) => `note:${userId}:${noteId}`;
const publicKey = (publicId) => `note_public:${publicId}`;

async function readIndex(env, userId) {
    const index = await redisGet(env, indexKey(userId));
    return {
        notes: Array.isArray(index?.notes) ? index.notes : [],
        folders: Array.isArray(index?.folders) ? index.folders : []
    };
}

function writeIndex(env, userId, index) {
    return redisSet(env, indexKey(userId), index);
}

function assertId(id, what) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        throw new NoteError(404, `${what}_NOT_FOUND`, `${what === 'NOTE' ? 'Note' : 'Folder'} not found`);
    }
}

function findNote(index, noteId) {
    assertId(noteId, 'NOTE');
    const note = index.notes.find(item => item.id === noteId);
    if (!note) throw new NoteError(404, 'NOTE_NOT_FOUND', 'Note not found');
    return note;
}

function findFolder(index, folderId) {
    assertId(folderId, 'FOLDER');
    const folder = index.folders.find(item => item.id === folderId);
    if (!folder) throw new NoteError(404, 'FOLDER_NOT_FOUND', 'Folder not found');
    return folder;
}

/**
 * 标题就是正文第一个非空行，去掉 Markdown 的标题井号，和 V2EX 的记事本一样不单独填标题
 */
export function deriveTitle(content) {
    const firstLine = String(content).split('\n').map(line => line.trim()).find(Boolean) || '';
    return firstLine.replace(/^#{1,6}\s+/, '').trim().slice(0, MAX_TITLE_LENGTH) || UNTITLED;
}

function normalizeContent(content) {
    if (typeof content !== 'string') {
        throw new NoteError(400, 'INVALID_CONTENT', 'Field "content" must be a string');
    }
    if (!content.trim()) {
        throw new NoteError(400, 'NOTE_EMPTY', 'Field "content" must not be empty');
    }
    if (content.length > LIMITS.maxContentLength) {
        throw new NoteError(413, 'NOTE_TOO_LONG', `Field "content" must be at most ${LIMITS.maxContentLength} characters`);
    }
    return content;
}

function normalizeSyntax(syntax) {
    if (!SYNTAXES.includes(syntax)) {
        throw new NoteError(400, 'INVALID_SYNTAX', `Field "syntax" must be one of: ${SYNTAXES.join(', ')}`);
    }
    return syntax;
}

// null 表示未归档；传了文件夹就必须是自己已有的
function normalizeFolderId(index, folderId) {
    if (folderId === null || folderId === undefined || folderId === '') return null;
    return findFolder(index, folderId).id;
}

function normalizeFolderName(index, name, exceptId) {
    const value = typeof name === 'string' ? name.trim().slice(0, LIMITS.maxFolderNameLength) : '';
    if (!value) {
        throw new NoteError(400, 'INVALID_FOLDER_NAME', 'Field "name" must be a non-empty string');
    }
    if (index.folders.some(folder => folder.id !== exceptId && folder.name === value)) {
        throw new NoteError(409, 'FOLDER_EXISTS', 'A folder with this name already exists');
    }
    return value;
}

function newPublicId() {
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}

export async function listNotes(env, userId) {
    return readIndex(env, userId);
}

export async function getNote(env, userId, noteId) {
    const index = await readIndex(env, userId);
    const note = findNote(index, noteId);
    const stored = await redisGet(env, contentKey(userId, note.id));
    return { ...note, content: typeof stored?.content === 'string' ? stored.content : '' };
}

export async function createNote(env, userId, { content, syntax = 'plain', folderId } = {}) {
    const index = await readIndex(env, userId);
    if (index.notes.length >= LIMITS.maxNotes) {
        throw new NoteError(409, 'NOTE_LIMIT', `Note limit reached (${LIMITS.maxNotes})`);
    }

    const text = normalizeContent(content);
    const now = new Date().toISOString();
    const note = {
        id: crypto.randomUUID(),
        title: deriveTitle(text),
        syntax: normalizeSyntax(syntax),
        folderId: normalizeFolderId(index, folderId),
        length: text.length,
        createdAt: now,
        updatedAt: now,
        publicId: null
    };

    // 先写正文再写索引：中途失败只会留下一条没人引用的正文，不会出现索引指向空正文
    await redisSet(env, contentKey(userId, note.id), { content: text });
    index.notes.unshift(note);
    await writeIndex(env, userId, index);
    return { ...note, content: text };
}

/**
 * 只传要改的字段。改正文或格式才刷新 updatedAt，单纯移动文件夹不算修改。
 * baseUpdatedAt 是客户端打开编辑时看到的 updatedAt，对不上说明别处改过。
 */
export async function updateNote(env, userId, noteId, changes = {}) {
    const index = await readIndex(env, userId);
    const note = findNote(index, noteId);
    const { content, syntax, folderId, baseUpdatedAt } = changes;

    if (baseUpdatedAt !== undefined && baseUpdatedAt !== note.updatedAt) {
        throw new NoteError(409, 'NOTE_CONFLICT', 'Note was modified elsewhere');
    }

    let text;
    if (content !== undefined) {
        text = normalizeContent(content);
        note.title = deriveTitle(text);
        note.length = text.length;
    }
    if (syntax !== undefined) {
        note.syntax = normalizeSyntax(syntax);
    }
    if (folderId !== undefined) {
        note.folderId = normalizeFolderId(index, folderId);
    }
    if (content !== undefined || syntax !== undefined) {
        note.updatedAt = new Date().toISOString();
    }

    if (text !== undefined) {
        await redisSet(env, contentKey(userId, note.id), { content: text });
    }
    await writeIndex(env, userId, index);
    return note;
}

export async function deleteNote(env, userId, noteId) {
    const index = await readIndex(env, userId);
    const note = findNote(index, noteId);

    // 先从索引里拿掉：之后的步骤就算失败，这条记事和它的公开链接也已经读不到了
    index.notes = index.notes.filter(item => item.id !== note.id);
    await writeIndex(env, userId, index);
    if (note.publicId) await redisDel(env, publicKey(note.publicId));
    await redisDel(env, contentKey(userId, note.id));
}

export async function publishNote(env, userId, noteId) {
    const index = await readIndex(env, userId);
    const note = findNote(index, noteId);
    if (note.publicId) return note;

    if (index.notes.filter(item => item.publicId).length >= LIMITS.maxPublicNotes) {
        throw new NoteError(409, 'PUBLIC_LIMIT', `Published note limit reached (${LIMITS.maxPublicNotes})`);
    }

    note.publicId = newPublicId();
    await redisSet(env, publicKey(note.publicId), { userId, noteId: note.id });
    await writeIndex(env, userId, index);
    return note;
}

export async function unpublishNote(env, userId, noteId) {
    const index = await readIndex(env, userId);
    const note = findNote(index, noteId);
    if (!note.publicId) return note;

    const publicId = note.publicId;
    note.publicId = null;
    // 公开页读取时会核对索引里的 publicId，所以索引一改旧链接就失效，反查表删不掉也没关系
    await writeIndex(env, userId, index);
    await redisDel(env, publicKey(publicId));
    return note;
}

/**
 * 公开页用：不需要登录。只返回内容本身，不带作者和内部 id。
 * @returns {Promise<Object|null>} 没发布过、已取消发布、已删除都返回 null
 */
export async function getPublicNote(env, publicId) {
    if (typeof publicId !== 'string' || !ID_PATTERN.test(publicId)) return null;

    const target = await redisGet(env, publicKey(publicId));
    if (!target?.userId || !target?.noteId) return null;

    const index = await readIndex(env, target.userId);
    const note = index.notes.find(item => item.id === target.noteId);
    if (!note || note.publicId !== publicId) return null;

    const stored = await redisGet(env, contentKey(target.userId, note.id));
    return {
        title: note.title,
        content: typeof stored?.content === 'string' ? stored.content : '',
        syntax: note.syntax,
        updatedAt: note.updatedAt
    };
}

export async function createFolder(env, userId, name) {
    const index = await readIndex(env, userId);
    if (index.folders.length >= LIMITS.maxFolders) {
        throw new NoteError(409, 'FOLDER_LIMIT', `Folder limit reached (${LIMITS.maxFolders})`);
    }
    const folder = {
        id: crypto.randomUUID(),
        name: normalizeFolderName(index, name),
        createdAt: new Date().toISOString()
    };
    index.folders.push(folder);
    await writeIndex(env, userId, index);
    return folder;
}

export async function renameFolder(env, userId, folderId, name) {
    const index = await readIndex(env, userId);
    const folder = findFolder(index, folderId);
    folder.name = normalizeFolderName(index, name, folder.id);
    await writeIndex(env, userId, index);
    return folder;
}

/**
 * 删文件夹不删记事，里面的记事回到未归档
 */
export async function deleteFolder(env, userId, folderId) {
    const index = await readIndex(env, userId);
    const folder = findFolder(index, folderId);
    index.folders = index.folders.filter(item => item.id !== folder.id);
    index.notes.forEach(note => {
        if (note.folderId === folder.id) note.folderId = null;
    });
    await writeIndex(env, userId, index);
}
