/**
 * MCP 的收藏工具：查分类、搜索、添加、修改
 *
 * 不提供删除。私密收藏、被隐藏的描述不交给 AI，规则在 bookmark-query.js；修改时私密收藏当作不存在，
 * 被隐藏的描述不让覆盖。
 */

import { loadDataFromRedis } from '../api/user-data.js';
import { MAX_UPDATES_PER_CALL, createWebsite, updateWebsites } from '../api/v1.js';
import { isRateLimited } from '../lib/rate-limit.js';
import {
    SEARCH_DEFAULT_LIMIT,
    SEARCH_MAX_LIMIT,
    findCategory,
    listCategoryCounts,
    parseTimeParam,
    realCategories,
    searchBookmarks,
    toShanghaiIso
} from '../lib/bookmark-query.js';
import { ToolError } from './protocol.js';

const WRITE_RATE_LIMIT = 30;

async function loadBookmarks({ c, userId }) {
    const data = await loadDataFromRedis(c, userId);
    if (!data) {
        throw new ToolError('读不到云端的收藏数据：可能还没在网页端登录同步过，或者存储暂时不可用。');
    }
    return data;
}

function categoryNames(data) {
    return realCategories(data).map((cat) => cat.name).join('、') || '（还没有分类）';
}

function timeArg(value, name) {
    const ms = parseTimeParam(value);
    if (ms === null) {
        throw new ToolError(`参数 ${name} 不是有效的时间，请用 2026-10-13 或 2026-10-13T08:00:00+08:00 这样的格式。`);
    }
    return ms;
}

const listCategories = {
    name: 'list_categories',
    title: '收藏分类',
    description: '列出网址收藏的全部分类和每个分类下的网址数量。添加收藏前想指定分类、或者想按分类浏览时先调用它。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, context) {
        const data = await loadBookmarks(context);
        return { categories: listCategoryCounts(data) };
    }
};

const search = {
    name: 'search_bookmarks',
    title: '搜索收藏',
    description: [
        '搜索或列出用户收藏的网址，默认按添加时间从新到旧。所有条件都可以不填、也可以组合。',
        '常见用法：今天收藏了什么 → added_after 填今天的日期；最近关注了哪些 → pinned 填 true；',
        '关于某个话题的收藏 → query 填关键词，没结果就换同义词、换中英文，或把 match 设成 any。',
        '日期按 Asia/Shanghai 理解，结果里的 now 是服务器当前时间。total 大于返回条数时用 offset 翻页。',
        '私密收藏不会出现在结果里。'
    ].join(''),
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: '关键词，多个用空格分开。匹配标题、网址、描述和分类名，不区分大小写。' },
            match: { type: 'string', enum: ['all', 'any'], description: '多个关键词要全部命中（all，默认）还是命中任意一个（any）。' },
            category: { type: 'string', description: '只看这个分类，填分类名或 id。' },
            pinned: { type: 'boolean', description: 'true 只看「特别关注」的网址，false 只看没关注的。' },
            added_after: { type: 'string', description: '添加时间不早于它（含）。日期 2026-10-13 表示当天 0 点，也可以写完整时间。' },
            added_before: { type: 'string', description: '添加时间早于它（不含）。查某一天：added_after 填当天，added_before 填第二天。' },
            sort: {
                type: 'string',
                enum: ['added_desc', 'pinned_order'],
                description: 'added_desc 按添加时间从新到旧；pinned_order 按特别关注的顺序（最近关注的在前，用户手动调过顺序后以调整后的为准）。pinned 为 true 时默认 pinned_order。'
            },
            limit: { type: 'integer', minimum: 1, maximum: SEARCH_MAX_LIMIT, description: `最多返回多少条，默认 ${SEARCH_DEFAULT_LIMIT}。` },
            offset: { type: 'integer', minimum: 0, description: '跳过前面多少条，翻页用。' }
        },
        additionalProperties: false
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, context) {
        const data = await loadBookmarks(context);

        let categoryId;
        if (typeof args.category === 'string' && args.category.trim()) {
            const category = findCategory(data, args.category);
            if (!category) {
                throw new ToolError(`找不到分类「${args.category}」。已有的分类：${categoryNames(data)}`);
            }
            categoryId = category.id;
        }

        const result = searchBookmarks(data, {
            query: args.query,
            match: args.match,
            categoryId,
            pinned: typeof args.pinned === 'boolean' ? args.pinned : undefined,
            addedAfter: timeArg(args.added_after, 'added_after'),
            addedBefore: timeArg(args.added_before, 'added_before'),
            sort: args.sort,
            limit: args.limit,
            offset: args.offset
        });
        return { now: toShanghaiIso(Date.now()), ...result };
    }
};

// 已收藏的条目回给模型前按同样的私密规则处理
function existingView(website, categoryName) {
    if (website.private) return null;
    const view = { title: website.title, url: website.url, category: categoryName, pinned: website.pinned };
    if (!website.hideDescription) view.description = website.description;
    return view;
}

const add = {
    name: 'add_bookmark',
    title: '添加收藏',
    description: [
        '把一个网址加进用户的收藏。只有 url 必填：标题、描述、分类没给的会由服务器抓取网页后自动补全，',
        '所以除非用户指定了，否则不用自己编。网址已经收藏过时不会重复添加，返回 added: false。'
    ].join(''),
    inputSchema: {
        type: 'object',
        properties: {
            url: { type: 'string', description: '要收藏的网址，必须是 http 或 https。' },
            title: { type: 'string', description: '标题，不填自动取网页标题。' },
            description: { type: 'string', description: '一两句话的描述，不填自动生成。' },
            category: { type: 'string', description: '分类名或 id，必须是已有的分类（见 list_categories），不填自动归类。' },
            pinned: { type: 'boolean', description: '是否同时设为「特别关注」，默认否。' }
        },
        required: ['url'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async handler(args, { c, userId, auth }) {
        if (await isRateLimited(c, { scope: 'mcp_bookmark_write', limit: WRITE_RATE_LIMIT, key: userId })) {
            throw new ToolError('添加得太频繁了，请过一分钟再试。');
        }

        const { status, body } = await createWebsite(c, auth, {
            url: args.url,
            title: args.title,
            description: args.description,
            category: args.category,
            pinned: args.pinned === true
        });

        if (status === 201) {
            const { website, analysis, categoryName } = body;
            return {
                added: true,
                bookmark: {
                    title: website.title,
                    url: website.url,
                    description: website.description,
                    category: categoryName,
                    pinned: website.pinned
                },
                // 哪些字段是自动补的、补的时候出了什么状况，方便模型如实转告用户
                autoFilled: Object.entries(analysis.sources)
                    .filter(([field, source]) => field !== 'icon' && source !== 'provided')
                    .map(([field]) => field),
                warnings: analysis.warnings
            };
        }

        if (body.code === 'DUPLICATE') {
            const bookmark = existingView(body.website, body.categoryName);
            return bookmark
                ? { added: false, reason: '这个网址已经收藏过了', bookmark }
                : { added: false, reason: '这个网址已经收藏过了' };
        }
        if (body.code === 'NO_CLOUD_DATA') {
            throw new ToolError('云端还没有收藏数据，请先在网页端登录并同步一次。');
        }
        if (Array.isArray(body.categories)) {
            throw new ToolError(`找不到分类「${args.category}」。已有的分类：${body.categories.map((cat) => cat.name).join('、')}`);
        }
        if (status === 429) {
            throw new ToolError('自动补全调用得太频繁了，请过一分钟再试，或者把标题、描述、分类都填上。');
        }
        if (status === 400) {
            throw new ToolError(`参数不对：${body.error}`);
        }
        throw new ToolError('保存失败，请稍后再试。');
    }
};

const UPDATE_FAILURES = {
    INVALID_ITEM: '这一项的格式不对',
    INVALID_URL: '网址不合法',
    NOT_FOUND: '收藏里没有这个网址（网址要和 search_bookmarks 返回的一致）',
    INVALID_TITLE: '标题不能为空',
    INVALID_DESCRIPTION: '描述必须是文本',
    INVALID_PINNED: 'pinned 只能是 true 或 false',
    DESCRIPTION_HIDDEN: '这个网址的描述被用户隐藏了，不能在这里修改；其它字段可以改',
    CATEGORY_NOT_FOUND: '分类不存在'
};

const update = {
    name: 'update_bookmarks',
    title: '修改收藏',
    description: [
        '修改已收藏网址的分类、标题、描述或「特别关注」状态，用来整理收藏：比如把网址移到另一个分类、改个更清楚的标题。',
        `一次可以改多个（最多 ${MAX_UPDATES_PER_CALL} 个），每一项用 url 指明是哪个网址，只填要改的字段，没填的保持不变。`,
        '要改多个网址时放进同一次调用，不要一个一个调、更不要并行调用：每次调用都会整份保存一次并占掉一个历史版本（只保留最近 5 个）。',
        '分类必须是已有的（见 list_categories），这里不能新建分类。每一项各自成败，结果里逐项说明。不能删除收藏，也不能改网址本身。'
    ].join(''),
    inputSchema: {
        type: 'object',
        properties: {
            updates: {
                type: 'array',
                minItems: 1,
                maxItems: MAX_UPDATES_PER_CALL,
                description: '要修改的网址列表。',
                items: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: '要修改的收藏的网址，用 search_bookmarks 返回的 url。' },
                        category: { type: 'string', description: '移到这个分类，填分类名或 id。' },
                        title: { type: 'string', description: '新标题。' },
                        description: { type: 'string', description: '新描述，填空字符串表示清空。' },
                        pinned: { type: 'boolean', description: 'true 设为「特别关注」，false 取消。' }
                    },
                    required: ['url'],
                    additionalProperties: false
                }
            }
        },
        required: ['updates'],
        additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async handler(args, { c, userId, auth }) {
        if (!Array.isArray(args.updates) || args.updates.length === 0) {
            throw new ToolError('updates 要填一个列表，每一项至少有 url 和一个要改的字段。');
        }
        if (args.updates.length > MAX_UPDATES_PER_CALL) {
            throw new ToolError(`一次最多改 ${MAX_UPDATES_PER_CALL} 个网址，请分几次调用。`);
        }
        if (await isRateLimited(c, { scope: 'mcp_bookmark_write', limit: WRITE_RATE_LIMIT, key: userId })) {
            throw new ToolError('修改得太频繁了，请过一分钟再试。');
        }

        const { status, body } = await updateWebsites(c, auth, args.updates, { forAi: true });
        if (body.code === 'NO_CLOUD_DATA') {
            throw new ToolError('云端还没有收藏数据，请先在网页端登录并同步一次。');
        }
        if (status !== 200) {
            throw new ToolError(status === 400 ? `参数不对：${body.error}` : '保存失败，这次的修改都没有生效，请稍后再试。');
        }

        const results = body.results.map((item) => {
            if (!item.ok) return { url: item.url, status: 'failed', reason: UPDATE_FAILURES[item.code] || item.error };
            if (item.changed.length === 0) return { url: item.url, status: 'unchanged' };
            return {
                url: item.url,
                status: 'updated',
                changed: item.changed,
                title: item.website.title,
                category: item.categoryName,
                pinned: item.website.pinned
            };
        });
        const count = (value) => results.filter((item) => item.status === value).length;
        const summary = { updated: count('updated'), unchanged: count('unchanged'), failed: count('failed'), results };
        // 有分类填错的，顺手把可选的分类告诉模型，省一次 list_categories
        if (body.results.some((item) => item.code === 'CATEGORY_NOT_FOUND')) {
            summary.categories = categoryNames(await loadBookmarks({ c, userId }));
        }
        return summary;
    }
};

export const bookmarkTools = [listCategories, search, add];
// 后加的工具单独导出，排在全部工具的最后：工具列表的前缀不变，客户端和提示词的缓存还能用
export const bookmarkEditTools = [update];
