/**
 * MCP 的记事本工具：文件夹和记事的增删改查，公开 / 取消公开
 *
 * 直接调 notes-store.js，不经过 /api/notes（那组接口只认网页登录）。
 * 记事没有回收站和版本历史，所以改写整篇必须带 base_updated_at，逼调用方先读再改；
 * 只是往后加内容就用 append，免得模型为了加一段话把长文重写一遍、悄悄丢掉内容。
 * 每条记事都带上它在记事本页的链接（要登录才能看）和公开链接（发布过才有）。
 */

import { isRateLimited } from '../lib/rate-limit.js';
import { RedisError } from '../lib/redis.js';
import {
    LIMITS,
    NoteError,
    SYNTAXES,
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    getNote,
    listNotes,
    publishNote,
    renameFolder,
    unpublishNote,
    updateNote
} from '../lib/notes-store.js';
import { ToolError } from './protocol.js';

// 和网页端 /api/notes 共用一个计数
const WRITE_RATE_LIMIT = 60;
const LIST_DEFAULT_LIMIT = 30;
const LIST_MAX_LIMIT = 100;

const NOTE_ERROR_MESSAGES = {
    NOTE_NOT_FOUND: '找不到这条记事，id 可能不对或已被删除。',
    FOLDER_NOT_FOUND: '找不到这个文件夹。',
    NOTE_EMPTY: '记事内容不能为空。',
    NOTE_TOO_LONG: `记事内容太长，上限 ${LIMITS.maxContentLength} 个字符。`,
    INVALID_CONTENT: '记事内容必须是文本。',
    INVALID_SYNTAX: `格式只能是 ${SYNTAXES.join(' 或 ')}。`,
    NOTE_LIMIT: `记事数量已达上限（${LIMITS.maxNotes} 条），请先删掉一些。`,
    FOLDER_LIMIT: `文件夹数量已达上限（${LIMITS.maxFolders} 个）。`,
    FOLDER_EXISTS: '已经有同名的文件夹了。',
    INVALID_FOLDER_NAME: '文件夹名称不能为空。',
    PUBLIC_LIMIT: `公开的记事已达上限（${LIMITS.maxPublicNotes} 条），请先取消公开一些。`,
    NOTE_CONFLICT: '这条记事在别处被改过了。请重新调用 get_note 拿到最新内容和 updatedAt，在最新内容上修改后再提交。'
};

// 存储层的错误转成能讲给模型听的话
function wrap(handler, { write = false } = {}) {
    return async (args, context) => {
        const { c, userId } = context;
        if (write && await isRateLimited(c, { scope: 'notes_write', limit: WRITE_RATE_LIMIT, key: userId })) {
            throw new ToolError('操作太频繁了，请过一分钟再试。');
        }
        try {
            return await handler(args, context);
        } catch (error) {
            if (error instanceof NoteError) {
                throw new ToolError(NOTE_ERROR_MESSAGES[error.code] || error.message);
            }
            if (error instanceof RedisError) {
                console.error('记事本存储不可用:', error.message);
                throw new ToolError('记事本存储暂时不可用，请稍后再试。');
            }
            throw error;
        }
    };
}

const isUnfiled = (ref) => ref === null || ref === '' || ref === 'none';

/**
 * 文件夹可以写 id 也可以写名称；null、空串、none 表示未归档
 * @returns {Object|null} 文件夹记录，未归档返回 null
 */
function resolveFolder(folders, ref) {
    if (isUnfiled(ref)) return null;
    if (typeof ref !== 'string') throw new ToolError('文件夹要填名称或 id。');
    const key = ref.trim();
    const folder = folders.find((item) => item.id === key) || folders.find((item) => item.name === key);
    if (!folder) {
        const names = folders.map((item) => item.name).join('、') || '（还没有文件夹）';
        throw new ToolError(`找不到文件夹「${ref}」。已有的文件夹：${names}`);
    }
    return folder;
}

// url 是记事本页里这条记事的地址，要登录才能看；publicUrl 是公开链接，没发布时为 null
function noteView(note, folders, origin) {
    return {
        id: note.id,
        title: note.title,
        folder: folders.find((item) => item.id === note.folderId)?.name || null,
        syntax: note.syntax,
        length: note.length,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        published: !!note.publicId,
        url: `${origin}/notes.html#/n/${note.id}`,
        publicUrl: note.publicId ? `${origin}/n/${note.publicId}` : null
    };
}

function clampInt(value, fallback, min, max) {
    const number = Number.isFinite(value) ? Math.trunc(value) : fallback;
    return Math.min(max, Math.max(min, number));
}

const FOLDER_ARG = '文件夹名称或 id。';

const listFolders = {
    name: 'list_note_folders',
    title: '记事本文件夹',
    description: '列出记事本的全部文件夹（分类）和每个文件夹里的记事数量，以及没归到任何文件夹的数量。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: wrap(async (args, { env, userId }) => {
        const { notes, folders } = await listNotes(env, userId);
        const count = (folderId) => notes.filter((note) => (note.folderId || null) === folderId).length;
        return {
            folders: folders.map((folder) => ({ id: folder.id, name: folder.name, count: count(folder.id) })),
            unfiled: count(null),
            total: notes.length
        };
    })
};

const list = {
    name: 'list_notes',
    title: '记事列表',
    description: '列出记事本里的记事，按最后修改时间从新到旧，只返回标题等概要、不含正文；要看正文用 get_note。标题就是正文的第一行。',
    inputSchema: {
        type: 'object',
        properties: {
            folder: { type: 'string', description: `只看这个文件夹里的，填${FOLDER_ARG}填 none 只看没归档的。` },
            query: { type: 'string', description: '只看标题里包含这段文字的（不搜正文）。' },
            limit: { type: 'integer', minimum: 1, maximum: LIST_MAX_LIMIT, description: `最多返回多少条，默认 ${LIST_DEFAULT_LIMIT}。` },
            offset: { type: 'integer', minimum: 0, description: '跳过前面多少条，翻页用。' }
        },
        additionalProperties: false
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: wrap(async (args, { env, userId, origin }) => {
        const { notes, folders } = await listNotes(env, userId);

        let matched = notes;
        if (args.folder !== undefined) {
            const folderId = resolveFolder(folders, args.folder)?.id || null;
            matched = matched.filter((note) => (note.folderId || null) === folderId);
        }
        if (typeof args.query === 'string' && args.query.trim()) {
            const keyword = args.query.trim().toLowerCase();
            matched = matched.filter((note) => String(note.title).toLowerCase().includes(keyword));
        }
        matched = matched.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

        const offset = clampInt(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);
        const limit = clampInt(args.limit, LIST_DEFAULT_LIMIT, 1, LIST_MAX_LIMIT);
        return {
            total: matched.length,
            offset,
            items: matched.slice(offset, offset + limit).map((note) => noteView(note, folders, origin))
        };
    })
};

const get = {
    name: 'get_note',
    title: '读取记事',
    description: '读取一条记事的完整正文。id 从 list_notes 拿。返回的 updatedAt 在用 update_note 改写整篇时要原样带上。',
    inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '记事 id。' } },
        required: ['id'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: wrap(async (args, { env, userId, origin }) => {
        const [note, { folders }] = await Promise.all([
            getNote(env, userId, args.id),
            listNotes(env, userId)
        ]);
        return { ...noteView(note, folders, origin), content: note.content };
    })
};

const create = {
    name: 'create_note',
    title: '新建记事',
    description: [
        '在记事本里新建一条记事。没有单独的标题字段，正文第一行就是标题，所以第一行要写成一个简短的标题',
        '（Markdown 可以写成 # 标题）。要放进某个文件夹就填 folder，必须是已有的文件夹（见 list_note_folders），',
        '没有合适的可以先用 create_note_folder 建一个。'
    ].join(''),
    inputSchema: {
        type: 'object',
        properties: {
            content: { type: 'string', description: `记事正文，第一行是标题。最多 ${LIMITS.maxContentLength} 个字符。` },
            syntax: { type: 'string', enum: SYNTAXES, description: '正文格式，默认 markdown；plain 是纯文本。' },
            folder: { type: 'string', description: `放进哪个文件夹，填${FOLDER_ARG}不填就不归档。` }
        },
        required: ['content'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: wrap(async (args, { env, userId, origin }) => {
        const { folders } = await listNotes(env, userId);
        const folder = args.folder === undefined ? null : resolveFolder(folders, args.folder);
        const note = await createNote(env, userId, {
            content: args.content,
            syntax: args.syntax || 'markdown',
            folderId: folder?.id || null
        });
        return { created: true, note: noteView(note, folders, origin) };
    }, { write: true })
};

const update = {
    name: 'update_note',
    title: '修改记事',
    description: [
        '修改一条已有的记事。往末尾加内容用 mode: "append"，content 只写要追加的部分。',
        '改写整篇用 mode: "replace"（默认）：content 是修改后的完整正文，会整个覆盖原文且无法恢复，',
        '所以必须先 get_note、在原文基础上改，并把它返回的 updatedAt 填进 base_updated_at。',
        '只移动文件夹或只改格式时不用填 content。'
    ].join(''),
    inputSchema: {
        type: 'object',
        properties: {
            id: { type: 'string', description: '记事 id。' },
            mode: { type: 'string', enum: ['replace', 'append'], description: 'replace 覆盖整篇（默认），append 追加到末尾。' },
            content: { type: 'string', description: 'replace 时是完整的新正文，append 时是要追加的内容。' },
            base_updated_at: { type: 'string', description: 'replace 时必填：get_note 返回的 updatedAt，用来确认期间没被别处改过。' },
            syntax: { type: 'string', enum: SYNTAXES, description: '改成这个格式。' },
            folder: { type: 'string', description: `移到这个文件夹，填${FOLDER_ARG}填 none 移出文件夹。` }
        },
        required: ['id'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: wrap(async (args, { env, userId, origin }) => {
        const { folders } = await listNotes(env, userId);
        const changes = {};

        if (args.content !== undefined) {
            if (typeof args.content !== 'string' || !args.content.trim()) {
                throw new ToolError(NOTE_ERROR_MESSAGES.NOTE_EMPTY);
            }
            if (args.mode === 'append') {
                const current = await getNote(env, userId, args.id);
                changes.content = `${current.content.replace(/\s+$/, '')}\n\n${args.content}`;
                changes.baseUpdatedAt = current.updatedAt;
            } else {
                if (typeof args.base_updated_at !== 'string' || !args.base_updated_at) {
                    throw new ToolError('改写整篇需要 base_updated_at：请先调用 get_note，在它返回的正文上修改，并把返回的 updatedAt 填进来。只是追加内容请用 mode: "append"。');
                }
                changes.content = args.content;
                changes.baseUpdatedAt = args.base_updated_at;
            }
        }
        if (args.syntax !== undefined) changes.syntax = args.syntax;
        if (args.folder !== undefined) changes.folderId = resolveFolder(folders, args.folder)?.id || null;

        if (Object.keys(changes).length === 0) {
            throw new ToolError('没有要修改的内容：content、syntax、folder 至少填一个。');
        }

        const note = await updateNote(env, userId, args.id, changes);
        return { updated: true, note: noteView(note, folders, origin) };
    }, { write: true })
};

const remove = {
    name: 'delete_note',
    title: '删除记事',
    description: '永久删除一条记事。记事本没有回收站，删了就找不回来；如果它发布过公开链接，链接也一起失效。只在用户明确要求删除时调用。',
    inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '记事 id。' } },
        required: ['id'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    handler: wrap(async (args, { env, userId }) => {
        const { notes } = await listNotes(env, userId);
        const title = notes.find((note) => note.id === args.id)?.title;
        await deleteNote(env, userId, args.id);
        return { deleted: true, id: args.id, title };
    }, { write: true })
};

const createFolderTool = {
    name: 'create_note_folder',
    title: '新建文件夹',
    description: '在记事本里新建一个文件夹（分类）。名称不能和已有的重复。',
    inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: `文件夹名称，最多 ${LIMITS.maxFolderNameLength} 个字符。` } },
        required: ['name'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: wrap(async (args, { env, userId }) => {
        const folder = await createFolder(env, userId, args.name);
        return { created: true, folder: { id: folder.id, name: folder.name } };
    }, { write: true })
};

const renameFolderTool = {
    name: 'rename_note_folder',
    title: '重命名文件夹',
    description: '给记事本的文件夹改名，里面的记事不受影响。',
    inputSchema: {
        type: 'object',
        properties: {
            folder: { type: 'string', description: `要改名的文件夹，填${FOLDER_ARG}` },
            name: { type: 'string', description: '新名称。' }
        },
        required: ['folder', 'name'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: wrap(async (args, { env, userId }) => {
        const { folders } = await listNotes(env, userId);
        const target = resolveFolder(folders, args.folder);
        if (!target) throw new ToolError('请指定要改名的文件夹。');
        const folder = await renameFolder(env, userId, target.id, args.name);
        return { renamed: true, folder: { id: folder.id, name: folder.name } };
    }, { write: true })
};

const deleteFolderTool = {
    name: 'delete_note_folder',
    title: '删除文件夹',
    description: '删除记事本的一个文件夹。里面的记事不会被删，只是变成未归档。',
    inputSchema: {
        type: 'object',
        properties: { folder: { type: 'string', description: `要删除的文件夹，填${FOLDER_ARG}` } },
        required: ['folder'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    handler: wrap(async (args, { env, userId }) => {
        const { notes, folders } = await listNotes(env, userId);
        const target = resolveFolder(folders, args.folder);
        if (!target) throw new ToolError('请指定要删除的文件夹。');
        await deleteFolder(env, userId, target.id);
        return {
            deleted: true,
            folder: target.name,
            notesMovedToUnfiled: notes.filter((note) => note.folderId === target.id).length
        };
    }, { write: true })
};

const setPublic = {
    name: 'set_note_public',
    title: '公开或取消公开记事',
    description: [
        '把一条记事设为公开或取消公开。公开后任何拿到公开链接的人都能看到正文（不需要登录，页面不显示作者），',
        '只在用户明确要求公开时调用。已经公开的再设一次不会换链接；取消公开后旧链接立即失效，以后再公开会换一个新链接。',
        '返回的 publicUrl 就是公开链接。'
    ].join(''),
    inputSchema: {
        type: 'object',
        properties: {
            id: { type: 'string', description: '记事 id。' },
            public: { type: 'boolean', description: 'true 公开，false 取消公开。' }
        },
        required: ['id', 'public'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: wrap(async (args, { env, userId, origin }) => {
        if (typeof args.public !== 'boolean') {
            throw new ToolError('public 只能是 true 或 false。');
        }
        const note = args.public
            ? await publishNote(env, userId, args.id)
            : await unpublishNote(env, userId, args.id);
        const { folders } = await listNotes(env, userId);
        return { note: noteView(note, folders, origin) };
    }, { write: true })
};

export const noteTools = [listFolders, list, get, create, update, remove, createFolderTool, renameFolderTool, deleteFolderTool];
// 后加的工具排在全部工具的最后，见 server/mcp/index.js
export const noteSharingTools = [setPublic];
