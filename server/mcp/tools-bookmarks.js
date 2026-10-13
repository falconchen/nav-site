/**
 * MCP 的收藏工具：查分类、搜索、添加
 *
 * 只读 + 添加，不提供删除和修改。私密收藏、被隐藏的描述不交给 AI，规则在 bookmark-query.js。
 */

import { loadDataFromRedis } from '../api/user-data.js';
import { createWebsite } from '../api/v1.js';
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

export const bookmarkTools = [listCategories, search, add];
