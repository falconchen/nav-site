/**
 * RESTful API v1
 *
 * 给浏览器扩展、脚本等第三方客户端用，鉴权接受个人访问令牌（navpat_ 开头）或网页登录 JWT。
 * 数据仍是整份存在 Redis 里的 { categories, websites }，写操作是读-改-写整份数据，
 * 并照常生成版本快照，所以误操作可以在「版本历史」里恢复。
 *
 * 写入后云端 version 变大，已打开的网页在获得焦点时会发现并下载新数据。
 */

import { Hono } from 'hono';
import { getBearerToken, verifySessionToken } from '../lib/session-auth.js';
import { isPersonalToken, verifyPersonalToken } from '../lib/personal-tokens.js';
import { isRateLimited, getClientIp } from '../lib/rate-limit.js';
import { getUserFromRedis } from './auth.js';
import {
    loadDataFromRedis,
    parseUserAgent,
    saveDataToRedis,
    saveVersionToRedis
} from './user-data.js';

const app = new Hono();

// 这两个是前端虚拟出来的分类，网站不直接存在里面
const VIRTUAL_CATEGORY_IDS = new Set(['pinned', 'recent']);
const WRITE_RATE_LIMIT = 30;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_IMAGE_DATA_LENGTH = 256 * 1024;
const DEFAULT_ICON = 'fas fa-globe';

// ---------- 鉴权 ----------

const requireApiAuth = async (c, next) => {
    const token = getBearerToken(c);
    if (!token) {
        return c.json({ error: 'Missing or invalid authorization header' }, 401);
    }

    if (isPersonalToken(token)) {
        if (!c.env.USER_SESSIONS) {
            return c.json({ error: 'Token storage not available' }, 503);
        }
        const record = await verifyPersonalToken(c.env.USER_SESSIONS, token, {
            waitUntil: getWaitUntil(c)
        });
        if (!record) {
            return c.json({ error: 'Invalid or revoked token' }, 401);
        }
        c.set('auth', { userId: record.userId, via: 'token', tokenName: record.name });
    } else {
        const { payload, error } = await verifySessionToken(c, token);
        if (error) {
            return c.json(error, 401);
        }
        c.set('auth', { userId: payload.userId, via: 'session' });
    }

    await next();
};

function getWaitUntil(c) {
    try {
        const ctx = c.executionCtx;
        return ctx.waitUntil.bind(ctx);
    } catch {
        // 单测里直接调 app.request 没有 executionCtx
        return undefined;
    }
}

const limitWrites = async (c, next) => {
    if (await isRateLimited(c, { scope: 'api_v1_write', limit: WRITE_RATE_LIMIT })) {
        return c.json({ error: 'Too many requests, please try again later' }, 429);
    }
    await next();
};

app.use('/v1/*', requireApiAuth);

// ---------- 工具函数 ----------

/**
 * 解析并规范化网址：只接受 http(s)，去掉 #hash
 */
export function parseHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const url = new URL(value.trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        url.hash = '';
        return url.href;
    } catch {
        return null;
    }
}

/**
 * 查重用的比较键：忽略协议、大小写不敏感的主机、末尾斜杠
 */
export function urlKey(value) {
    const href = parseHttpUrl(value);
    if (!href) return null;
    const url = new URL(href);
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.host.replace(/^www\./, '')}${path}${url.search}`;
}

function realCategories(data) {
    return (Array.isArray(data?.categories) ? data.categories : [])
        .filter((cat) => cat && cat.id && !VIRTUAL_CATEGORY_IDS.has(cat.id));
}

function findCategory(data, ref) {
    if (typeof ref !== 'string' || !ref.trim()) return null;
    const key = ref.trim();
    const cats = realCategories(data);
    // 优先按 id 匹配，找不到再按名称，方便脚本直接写分类名
    return cats.find((cat) => cat.id === key) || cats.find((cat) => cat.name === key) || null;
}

function siteView(site, categoryId) {
    const imageData = typeof site.imageData === 'string' && site.imageData.startsWith('data:')
        ? null // 旧版 base64 图标动辄几十 KB，列表里不返回
        : site.imageData || null;
    return {
        title: site.title,
        url: site.url,
        description: site.description || '',
        icon: site.icon || DEFAULT_ICON,
        imageData,
        pinned: !!site.pinned,
        weight: site.weight || 100,
        addedTime: site.addedTime || null,
        editedTime: site.editedTime || null,
        category: categoryId
    };
}

function maxWeight(sites) {
    if (!Array.isArray(sites) || sites.length === 0) return 100;
    return Math.max(...sites.map((site) => site.weight || 100));
}

async function loadUserData(c, userId) {
    const data = await loadDataFromRedis(c, userId);
    // 云端没有分类数据时拒绝写入：否则网页端发现云端版本更新，会用这份残缺数据覆盖本地
    if (!data || realCategories(data).length === 0) return null;
    return data;
}

async function persist(c, userId, data, description) {
    const userIP = getClientIp(c);
    const { restoredFrom, ...rest } = data;
    const dataToSave = {
        ...rest,
        userId,
        version: Date.now(),
        lastUpdated: new Date().toISOString(),
        deviceInfo: parseUserAgent(c.req.header('User-Agent') || ''),
        userIP: userIP === 'unknown' ? '未知IP' : userIP,
        userCountry: c.req.header('CF-IPCountry') || '未知国家'
    };

    const saved = await saveDataToRedis(c, userId, dataToSave);
    if (!saved) return null;
    await saveVersionToRedis(c, userId, dataToSave, description);
    return dataToSave;
}

const NO_CLOUD_DATA = {
    error: 'No cloud data found. Open the website and sync once before using the API.',
    code: 'NO_CLOUD_DATA'
};

// ---------- 路由 ----------

// 当前令牌对应的用户，扩展可以用它校验令牌是否有效
app.get('/v1/me', async (c) => {
    const auth = c.get('auth');
    const user = await getUserFromRedis(c, auth.userId);
    const provider = user?.providers?.[0];
    return c.json({
        success: true,
        user: {
            id: auth.userId,
            login: user?.login || provider?.login || null,
            name: user?.name || provider?.name || null,
            avatar_url: user?.avatar_url || provider?.avatar_url || null
        },
        auth: { via: auth.via, tokenName: auth.tokenName || null }
    });
});

app.get('/v1/categories', async (c) => {
    const auth = c.get('auth');
    const data = await loadDataFromRedis(c, auth.userId);
    const websites = data?.websites || {};
    const categories = realCategories(data)
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((cat) => ({
            id: cat.id,
            name: cat.name,
            icon: cat.icon || null,
            order: cat.order ?? 0,
            count: Array.isArray(websites[cat.id]) ? websites[cat.id].length : 0
        }));
    return c.json({ success: true, categories });
});

// 支持 ?category=<id|名称> 和 ?url=<网址> 过滤；url 用于扩展判断当前页是否已收藏
app.get('/v1/websites', async (c) => {
    const auth = c.get('auth');
    const data = await loadDataFromRedis(c, auth.userId);
    if (!data) {
        return c.json({ success: true, websites: [] });
    }

    const categoryRef = c.req.query('category');
    let categoryIds = realCategories(data).map((cat) => cat.id);
    if (categoryRef) {
        const cat = findCategory(data, categoryRef);
        if (!cat) {
            return c.json({ error: 'Category not found' }, 404);
        }
        categoryIds = [cat.id];
    }

    const urlFilter = c.req.query('url');
    const targetKey = urlFilter ? urlKey(urlFilter) : null;
    if (urlFilter && !targetKey) {
        return c.json({ error: 'Invalid url parameter' }, 400);
    }

    const result = [];
    for (const id of categoryIds) {
        for (const site of data.websites?.[id] || []) {
            if (targetKey && urlKey(site.url) !== targetKey) continue;
            result.push(siteView(site, id));
        }
    }

    return c.json({ success: true, websites: result });
});

app.post('/v1/websites', limitWrites, async (c) => {
    const auth = c.get('auth');

    let body;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
    }
    if (!body || typeof body !== 'object') {
        return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const url = parseHttpUrl(body.url);
    if (!url) {
        return c.json({ error: 'Field "url" must be an http(s) URL' }, 400);
    }

    const title = (typeof body.title === 'string' ? body.title.trim() : '').slice(0, MAX_TITLE_LENGTH)
        || new URL(url).hostname;
    const description = (typeof body.description === 'string' ? body.description.trim() : '')
        .slice(0, MAX_DESCRIPTION_LENGTH);

    // 前端把 icon 拼进 class 属性，只放行 Font Awesome 类名这类安全字符
    let icon = DEFAULT_ICON;
    if (body.icon !== undefined) {
        if (typeof body.icon !== 'string' || !/^[a-z0-9 -]{1,60}$/i.test(body.icon)) {
            return c.json({ error: 'Field "icon" must be a Font Awesome class name' }, 400);
        }
        icon = body.icon;
    }

    let imageData;
    if (body.imageData !== undefined && body.imageData !== null && body.imageData !== '') {
        const value = body.imageData;
        const ok = typeof value === 'string' && value.length <= MAX_IMAGE_DATA_LENGTH &&
            (parseHttpUrl(value) || /^data:image\/(png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,/i.test(value));
        if (!ok) {
            return c.json({ error: 'Field "imageData" must be an http(s) URL or a base64 image data URL (≤256KB)' }, 400);
        }
        // 存规范化后的 href：引号、尖括号会被百分号编码，不会破坏前端拼出的 <img src="">
        imageData = parseHttpUrl(value) || value;
    }

    const data = await loadUserData(c, auth.userId);
    if (!data) {
        return c.json(NO_CLOUD_DATA, 409);
    }

    const category = findCategory(data, body.category);
    if (!category) {
        return c.json({
            error: 'Field "category" must be an existing category id or name',
            categories: realCategories(data).map((cat) => ({ id: cat.id, name: cat.name }))
        }, 400);
    }

    const websites = { ...(data.websites || {}) };
    const key = urlKey(url);
    for (const [catId, sites] of Object.entries(websites)) {
        const existing = (sites || []).find((site) => urlKey(site.url) === key);
        if (existing) {
            return c.json({
                error: 'Website already exists',
                code: 'DUPLICATE',
                website: siteView(existing, catId)
            }, 409);
        }
    }

    // 权重规则与网页端一致：置顶取全局最大 +10，否则取所在分类最大 +10
    const pinned = body.pinned === true;
    const weight = pinned
        ? Math.max(100, ...Object.values(websites).map(maxWeight)) + 10
        : maxWeight(websites[category.id]) + (websites[category.id]?.length ? 10 : 0);

    const now = Date.now();
    const site = {
        title,
        url,
        description,
        icon,
        imageData,
        weight,
        pinned,
        addedTime: now,
        editedTime: now
    };
    websites[category.id] = [...(websites[category.id] || []), site];

    const via = auth.via === 'token' ? `令牌「${auth.tokenName}」` : 'API';
    const saved = await persist(c, auth.userId, { ...data, websites }, `通过${via}添加：${title}`);
    if (!saved) {
        return c.json({ error: 'Failed to save data' }, 500);
    }

    return c.json({ success: true, website: siteView(site, category.id), version: saved.version }, 201);
});

// 按网址删除：DELETE /api/v1/websites?url=<网址>[&category=<id|名称>]
app.delete('/v1/websites', limitWrites, async (c) => {
    const auth = c.get('auth');
    const key = urlKey(c.req.query('url'));
    if (!key) {
        return c.json({ error: 'Query parameter "url" must be an http(s) URL' }, 400);
    }

    const data = await loadUserData(c, auth.userId);
    if (!data) {
        return c.json({ error: 'Website not found' }, 404);
    }

    let categoryIds = Object.keys(data.websites || {});
    const categoryRef = c.req.query('category');
    if (categoryRef) {
        const cat = findCategory(data, categoryRef);
        if (!cat) {
            return c.json({ error: 'Category not found' }, 404);
        }
        categoryIds = [cat.id];
    }

    const websites = { ...(data.websites || {}) };
    const removed = [];
    for (const id of categoryIds) {
        const sites = websites[id] || [];
        const kept = sites.filter((site) => urlKey(site.url) !== key);
        if (kept.length !== sites.length) {
            removed.push(...sites.filter((site) => urlKey(site.url) === key).map((site) => siteView(site, id)));
            websites[id] = kept;
        }
    }

    if (removed.length === 0) {
        return c.json({ error: 'Website not found' }, 404);
    }

    const via = auth.via === 'token' ? `令牌「${auth.tokenName}」` : 'API';
    const saved = await persist(c, auth.userId, { ...data, websites }, `通过${via}删除：${removed[0].title}`);
    if (!saved) {
        return c.json({ error: 'Failed to save data' }, 500);
    }

    return c.json({ success: true, removed, version: saved.version });
});

export default app;
