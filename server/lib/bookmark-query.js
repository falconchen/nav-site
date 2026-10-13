/**
 * 收藏数据的只读查询：分类、过滤、搜索、排序、分页
 *
 * 都是纯函数，输入是 Redis 里那份 { categories, websites }。/api/v1 和 MCP 共用分类解析，
 * 搜索和私密规则只给 MCP 用：交给 AI 的内容会发到 AI 服务商，所以这里比 /api/v1 收得紧，
 * 私密收藏整个不返回，「隐藏描述」的网站不返回描述、也不拿描述参与搜索（否则能靠换关键词试出内容）。
 */

// 旧版本前端把「置顶」「最近添加」当分类存进数据，现在已不再写入；云端旧数据里仍可能有，读取时过滤掉
export const VIRTUAL_CATEGORY_IDS = new Set(['pinned', 'recent']);

export const SEARCH_DEFAULT_LIMIT = 50;
export const SEARCH_MAX_LIMIT = 200;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function realCategories(data) {
    return (Array.isArray(data?.categories) ? data.categories : [])
        .filter((cat) => cat && cat.id && !VIRTUAL_CATEGORY_IDS.has(cat.id));
}

export function findCategory(data, ref) {
    if (typeof ref !== 'string' || !ref.trim()) return null;
    const key = ref.trim();
    const cats = realCategories(data);
    // 优先按 id 匹配，找不到再按名称，方便脚本直接写分类名
    return cats.find((cat) => cat.id === key) || cats.find((cat) => cat.name === key) || null;
}

/**
 * 时间戳转成带 +08:00 的 ISO 字符串，没有时间返回 null
 */
export function toShanghaiIso(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return new Date(ms + SHANGHAI_OFFSET_MS).toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

/**
 * 解析时间参数。只写日期（2026-10-13）或不带时区的时间都按 Asia/Shanghai 算。
 * @returns {number|null|undefined} 毫秒时间戳；没传返回 undefined；格式不对返回 null
 */
export function parseTimeParam(value) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    let ms;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        ms = Date.parse(`${text}T00:00:00+08:00`);
    } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
        ms = Date.parse(`${text.replace(' ', 'T')}+08:00`);
    } else {
        ms = Date.parse(text);
    }
    return Number.isFinite(ms) ? ms : null;
}

function timeOf(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value) || Date.parse(value) || 0;
    return 0;
}

/**
 * AI 能看到的全部网站，带上所在分类。私密收藏在这里就剔掉，后面的步骤拿不到
 */
function visibleSites(data) {
    const result = [];
    for (const cat of realCategories(data)) {
        for (const site of data.websites?.[cat.id] || []) {
            if (!site || site.private) continue;
            result.push({ site, category: cat });
        }
    }
    return result;
}

function bookmarkView({ site, category }) {
    const view = {
        title: site.title || '',
        url: site.url,
        category: category.name,
        pinned: !!site.pinned,
        addedAt: toShanghaiIso(timeOf(site.addedTime))
    };
    if (site.hideDescription) {
        view.descriptionHidden = true;
    } else {
        view.description = site.description || '';
    }
    return view;
}

/**
 * 分类列表，数量不含私密收藏
 */
export function listCategoryCounts(data) {
    const counts = new Map();
    for (const { category } of visibleSites(data)) {
        counts.set(category.id, (counts.get(category.id) || 0) + 1);
    }
    return realCategories(data)
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((cat) => ({ id: cat.id, name: cat.name, count: counts.get(cat.id) || 0 }));
}

function clampInt(value, fallback, min, max) {
    const number = Number.isFinite(value) ? Math.trunc(value) : fallback;
    return Math.min(max, Math.max(min, number));
}

/**
 * 搜索 / 列出收藏
 *
 * @param {Object} data 云端收藏数据
 * @param {Object} options
 * @param {string} [options.query] 关键词，空白分隔；匹配标题、网址、描述、分类名，不区分大小写
 * @param {'all'|'any'} [options.match] 多个关键词要全部命中还是命中一个就算，默认 all
 * @param {string} [options.categoryId] 只看这个分类
 * @param {boolean} [options.pinned] 只看特别关注（true）或非特别关注（false）
 * @param {number} [options.addedAfter] 添加时间下限（含）
 * @param {number} [options.addedBefore] 添加时间上限（不含）
 * @param {'added_desc'|'pinned_order'} [options.sort] 默认按添加时间从新到旧；只看特别关注时默认按关注顺序
 * @returns {{ total: number, offset: number, items: Object[] }}
 */
export function searchBookmarks(data, options = {}) {
    const terms = typeof options.query === 'string'
        ? options.query.toLowerCase().split(/\s+/).filter(Boolean)
        : [];
    const matchAny = options.match === 'any';

    const matched = visibleSites(data).filter(({ site, category }) => {
        if (options.categoryId && category.id !== options.categoryId) return false;
        if (typeof options.pinned === 'boolean' && !!site.pinned !== options.pinned) return false;

        const added = timeOf(site.addedTime);
        if (options.addedAfter !== undefined && added < options.addedAfter) return false;
        if (options.addedBefore !== undefined && added >= options.addedBefore) return false;

        if (terms.length === 0) return true;
        const haystack = [
            site.title,
            site.url,
            site.hideDescription ? '' : site.description,
            category.name
        ].filter(Boolean).join('\n').toLowerCase();
        const hit = (term) => haystack.includes(term);
        return matchAny ? terms.some(hit) : terms.every(hit);
    });

    const sort = options.sort || (options.pinned === true ? 'pinned_order' : 'added_desc');
    const byAddedDesc = (a, b) => timeOf(b.site.addedTime) - timeOf(a.site.addedTime);
    if (sort === 'pinned_order') {
        // 和网页端「特别关注」同一个排序键：新关注的 pinnedOrder 最大
        const order = ({ site }) => site.pinnedOrder ?? site.weight ?? 100;
        matched.sort((a, b) => order(b) - order(a) || byAddedDesc(a, b));
    } else {
        matched.sort(byAddedDesc);
    }

    const offset = clampInt(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = clampInt(options.limit, SEARCH_DEFAULT_LIMIT, 1, SEARCH_MAX_LIMIT);
    return {
        total: matched.length,
        offset,
        items: matched.slice(offset, offset + limit).map(bookmarkView)
    };
}
