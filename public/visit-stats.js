// 访问统计：给「访问最多」tab 排序用
// 本机存 IndexedDB（key: navSiteVisits），不走 saveNavData：
// 收藏的云端同步是整份覆盖，多设备的次数会互相覆盖；而且每次点击都会生成版本快照，冲掉只保留 5 份的历史。
// 登录后走单独的 /api/visits 多端同步（文件后半部分）：只上报上次同步之后新增的访问，由服务端合并

const VISIT_STORAGE_KEY = 'navSiteVisits';
const VISIT_SAMPLE_SIZE = 10; // 每个网址保留最近几次访问时间，用来算近期权重
const VISIT_MAX_ENTRIES = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

// 仿 Firefox frecency：按访问距今的天数取权重。
// 服务端裁剪时用同一套（server/lib/visits-store.js），改一边要同步另一边
const VISIT_AGE_WEIGHTS = [
    { days: 4, weight: 100 },
    { days: 14, weight: 70 },
    { days: 31, weight: 50 },
    { days: 90, weight: 30 },
    { days: Infinity, weight: 10 }
];

let visitStats = {};
let visitStatsSaveTimer = null;

// 与服务端 urlKey()（server/api/v1.js）同一套规则：忽略协议、www.、#hash、末尾斜杠
function visitUrlKey(value) {
    try {
        const url = new URL(value.includes('://') ? value : `http://${value}`);
        const path = url.pathname.replace(/\/+$/, '');
        return `${url.host.toLowerCase().replace(/^www\./, '')}${path}${url.search}`;
    } catch (e) {
        return null;
    }
}

function frecencyScore(entry, now = Date.now()) {
    if (!entry || !entry.count || !Array.isArray(entry.visits) || entry.visits.length === 0) return 0;
    const total = entry.visits.reduce((sum, time) => {
        const days = (now - time) / DAY_MS;
        return sum + VISIT_AGE_WEIGHTS.find(bucket => days <= bucket.days).weight;
    }, 0);
    return entry.count * (total / entry.visits.length);
}

function getVisitScore(url) {
    const key = visitUrlKey(url);
    return key ? frecencyScore(visitStats[key]) : 0;
}

function scheduleVisitStatsSave() {
    clearTimeout(visitStatsSaveTimer);
    visitStatsSaveTimer = setTimeout(() => {
        dbStorage.setItem(VISIT_STORAGE_KEY, visitStats).catch(error => {
            console.error('保存访问统计失败:', error);
        });
    }, 1000);
}

function pruneVisitStats() {
    const keys = Object.keys(visitStats);
    if (keys.length <= VISIT_MAX_ENTRIES) return;
    const now = Date.now();
    keys.sort((a, b) => frecencyScore(visitStats[a], now) - frecencyScore(visitStats[b], now))
        .slice(0, keys.length - VISIT_MAX_ENTRIES)
        .forEach(key => delete visitStats[key]);
}

function recordVisit(url) {
    const key = visitUrlKey(url);
    if (!key) return;
    const entry = visitStats[key] || { count: 0, visits: [] };
    entry.count += 1;
    entry.visits = [...entry.visits, Date.now()].slice(-VISIT_SAMPLE_SIZE);
    visitStats[key] = entry;
    pruneVisitStats();
    scheduleVisitStatsSave();
    queueVisitDelta(key, entry.visits[entry.visits.length - 1]);
}

// 从「访问最多」里移除：清掉这个网址的全部记录
function removeVisitStats(url) {
    const key = visitUrlKey(url);
    if (!key || !visitStats[key]) return;
    delete visitStats[key];
    scheduleVisitStatsSave();
    queueVisitRemoval(key);

    const pins = getFrequentPins();
    if (key in pins) {
        delete pins[key];
        setFrequentPins(pins);
    }
}

// 「访问最多」里亲手拖过的网站固定在拖到的位置：{ 归一化网址: 第几位（从 0 数） }。
// 没拖过的继续按访问得分浮动，填进剩下的位置。存本机 localStorage，登录后和访问统计一起同步：
// 整份按最后改的为准（frequentPinsUpdatedAt），不逐条合并
const FREQUENT_PINS_KEY = 'frequentPins';
const FREQUENT_PINS_TIME_KEY = 'frequentPinsUpdatedAt';

function getFrequentPins() {
    try {
        const pins = JSON.parse(localStorage.getItem(FREQUENT_PINS_KEY) || '{}');
        return pins && typeof pins === 'object' && !Array.isArray(pins) ? pins : {};
    } catch {
        return {};
    }
}

function storeFrequentPins(pins, updatedAt) {
    try {
        if (Object.keys(pins).length) {
            localStorage.setItem(FREQUENT_PINS_KEY, JSON.stringify(pins));
        } else {
            localStorage.removeItem(FREQUENT_PINS_KEY);
        }
        localStorage.setItem(FREQUENT_PINS_TIME_KEY, String(updatedAt));
    } catch {
        // 隐私模式下写不进去，只是这次拖的位置刷新后不保留
    }
}

// 传空对象表示恢复自动排序
function setFrequentPins(pins) {
    storeFrequentPins(pins, Date.now());
    queuePinsUpload();
}

// 按访问得分排好的列表里，把固定的网站放回各自的位置，其余的保持得分顺序填空。
// 位置从小到大依次插入，先插的不会被后插的挤走；位置超出列表长度的排到末尾
function applyFrequentPins(sites) {
    const pins = getFrequentPins();
    const slotOf = site => pins[visitUrlKey(site.url)];
    const result = sites.filter(site => slotOf(site) == null);
    sites.filter(site => slotOf(site) != null)
        .sort((a, b) => slotOf(a) - slotOf(b))
        .forEach(site => result.splice(Math.min(slotOf(site), result.length), 0, site));
    return result;
}

// 页面关闭前把防抖中的写入落盘
window.addEventListener('pagehide', () => {
    if (visitStatsSaveTimer) {
        clearTimeout(visitStatsSaveTimer);
        visitStatsSaveTimer = null;
        dbStorage.setItem(VISIT_STORAGE_KEY, visitStats);
    }
});

// 本机从没存过导航数据才算新用户；老用户只是没点过卡片，不能给他塞默认次数
async function isFirstLaunch() {
    if (localStorage.getItem('navSiteCategories')) return false;
    return !(await dbStorage.getItem('navSiteCategories'));
}

// 新用户的「访问最多」按 defaultVisitCounts 预置，访问时间摊在最近几天，保证排在前面。
// seed 记下预置了几次：这些不是真实访问，同步时不上传
function seedDefaultVisits() {
    if (typeof defaultVisitCounts === 'undefined') return;
    const now = Date.now();
    Object.entries(defaultVisitCounts).forEach(([url, count]) => {
        const key = visitUrlKey(url);
        if (!key) return;
        const visits = Array.from({ length: Math.min(count, VISIT_SAMPLE_SIZE) },
            (_, i) => now - (i + 1) * DAY_MS / 3).reverse();
        visitStats[key] = { count, visits, seed: count };
    });
    scheduleVisitStatsSave();
}

window.visitStatsLoaded = (async () => {
    try {
        const saved = await dbStorage.getItem(VISIT_STORAGE_KEY);
        if (saved && typeof saved === 'object') {
            visitStats = saved;
        } else if (await isFirstLaunch()) {
            seedDefaultVisits();
        }
    } catch (error) {
        console.error('读取访问统计失败:', error);
    }
})();

// ---------- 多端同步 ----------
//
// 登录后访问统计和固定位置走 /api/visits 同步，和收藏数据分开。设备只上报「上次同步之后新增的访问」，
// 服务端把增量加到云端记录上再返回合并后的整份，本机用它替换：两台设备各点几次，次数是相加而不是互相覆盖。
// 未登录时不上报，行为和以前一样。
//
// 待上传的内容记在 localStorage（同步写入，关页面时也来得及）：
//   delta / removed / pinsDirty 是还没发的；sending 是已经发出、还没确认成功的那一批，带批次号，
//   失败后原样重发，服务端按批次号去重，不会加两遍
const VISIT_PENDING_KEY = 'visitsPending';
// 这台设备的统计已经并进了哪个账号。没有这个键说明从没同步过，第一次要把本机整份传上去
const VISIT_SYNCED_USER_KEY = 'visitsSyncedUser';
const VISIT_SYNC_DELAY = 5000;
const VISIT_PULL_INTERVAL = 60000;
const VISIT_KEEPALIVE_LIMIT = 60 * 1024;

let visitSyncTimer = null;
let visitSyncing = false;
let visitSyncStopped = true;
let lastVisitSync = 0;

function loadVisitPending() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(VISIT_PENDING_KEY) || 'null');
    } catch {
        // 解析不了当作没有
    }
    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    if (!isObject(saved)) saved = {};
    return {
        sending: isObject(saved.sending) ? saved.sending : null,
        sendingUser: saved.sendingUser || null,
        delta: isObject(saved.delta) ? saved.delta : {},
        removed: isObject(saved.removed) ? saved.removed : {},
        pinsDirty: saved.pinsDirty === true
    };
}

function saveVisitPending(pending) {
    try {
        if (pending.sending || hasVisitChanges(pending)) {
            localStorage.setItem(VISIT_PENDING_KEY, JSON.stringify(pending));
        } else {
            localStorage.removeItem(VISIT_PENDING_KEY);
        }
    } catch {
        // 写不进去只是这几次访问不同步
    }
}

function hasVisitChanges(pending) {
    return Object.keys(pending.delta).length > 0 || Object.keys(pending.removed).length > 0 || pending.pinsDirty;
}

// 从没同步过的设备不记增量：第一次同步会把本机整份传上去
function isVisitSyncEnabled(pending) {
    return !!localStorage.getItem(VISIT_SYNCED_USER_KEY) || !!pending.sending;
}

function mergeVisitEntry(entry, delta) {
    return {
        ...entry,
        count: (entry ? entry.count : 0) + delta.count,
        visits: [...new Set([...(entry ? entry.visits : []), ...delta.visits])]
            .sort((a, b) => a - b).slice(-VISIT_SAMPLE_SIZE)
    };
}

function queueVisitDelta(key, time) {
    const pending = loadVisitPending();
    if (!isVisitSyncEnabled(pending)) return;
    pending.delta[key] = mergeVisitEntry(pending.delta[key], { count: 1, visits: [time] });
    saveVisitPending(pending);
    scheduleVisitSync();
}

function queueVisitRemoval(key) {
    const pending = loadVisitPending();
    if (!isVisitSyncEnabled(pending)) return;
    delete pending.delta[key];
    pending.removed[key] = Date.now();
    saveVisitPending(pending);
    scheduleVisitSync();
}

function queuePinsUpload() {
    const pending = loadVisitPending();
    if (!isVisitSyncEnabled(pending)) return;
    pending.pinsDirty = true;
    saveVisitPending(pending);
    scheduleVisitSync();
}

function getFrequentPinsTime() {
    return parseInt(localStorage.getItem(FREQUENT_PINS_TIME_KEY) || '0', 10) || 0;
}

function pinsPayload() {
    // 加同步之前拖的位置没有时间，给 1：云端有固定位置时以云端为准，没有才用本机的
    return { pins: getFrequentPins(), pinsUpdatedAt: getFrequentPinsTime() || 1 };
}

// 令牌由 auth.js 校验通过后才赋值给 authToken，校验未成功前这里拿不到，也就不会同步
function visitSyncToken() {
    return (typeof authToken !== 'undefined' && authToken) || null;
}

function tokenUserId(token) {
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(payload)).userId || null;
    } catch {
        return null;
    }
}

// 这台设备第一次同步：把本机整份统计当作增量，和云端相加。预置的默认次数（seed）不算
function initialVisitUpload() {
    const delta = {};
    Object.entries(visitStats).forEach(([key, entry]) => {
        const count = entry.count - (entry.seed || 0);
        const visits = count > 0 ? entry.visits.slice(-Math.min(count, VISIT_SAMPLE_SIZE)) : [];
        if (visits.length) delta[key] = { count, visits };
    });
    const body = { delta };
    if (Object.keys(getFrequentPins()).length) Object.assign(body, pinsPayload());
    return body;
}

// 决定这次发什么，返回要 POST 的内容；没有要上传的返回 null（只拉取）
function prepareVisitBatch(userId) {
    let pending = loadVisitPending();
    const syncedUser = localStorage.getItem(VISIT_SYNCED_USER_KEY);
    const empty = { sending: null, sendingUser: null, delta: {}, removed: {}, pinsDirty: false };

    if (pending.sending && pending.sendingUser !== userId) {
        pending.sending = null;
        pending.sendingUser = null;
    }
    if (syncedUser && syncedUser !== userId) {
        // 换了账号：本机的统计是上一个账号的，不传给这个账号，直接用云端的
        pending = { ...empty };
        storeFrequentPins({}, 0);
    } else if (!pending.sending) {
        let body = null;
        if (!syncedUser) {
            body = initialVisitUpload();
        } else if (hasVisitChanges(pending)) {
            body = { delta: pending.delta, removed: pending.removed };
            if (pending.pinsDirty) Object.assign(body, pinsPayload());
        }
        if (body) {
            body.batchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
            pending = { ...empty, sending: body, sendingUser: userId };
        }
    }
    saveVisitPending(pending);
    return pending.sending;
}

// 用云端合并后的结果替换本机统计，再把请求期间新攒的增量叠上去。返回「访问最多」的内容有没有变
function applyCloudVisits(data, pending) {
    const before = JSON.stringify([visitStats, getFrequentPins()]);
    const cloudEntries = data.entries && typeof data.entries === 'object' ? data.entries : {};
    const next = {};

    // 预置的默认次数只在本机，云端还没有这个网址时留着，免得新用户一登录「访问最多」就空了
    Object.entries(visitStats).forEach(([key, entry]) => {
        if (entry.seed && !(key in cloudEntries)) next[key] = entry;
    });
    Object.entries(cloudEntries).forEach(([key, entry]) => {
        if (entry && entry.count > 0 && Array.isArray(entry.visits)) {
            next[key] = { count: entry.count, visits: entry.visits };
        }
    });
    Object.keys(pending.removed).forEach(key => delete next[key]);
    Object.entries(pending.delta).forEach(([key, delta]) => {
        next[key] = mergeVisitEntry(next[key], delta);
    });
    visitStats = next;
    scheduleVisitStatsSave();

    // 本机刚拖过还没传上去、或者正在整理时不动固定位置，下次同步再说
    const cloudPinsTime = data.pinsUpdatedAt || 0;
    if (!pending.pinsDirty && !document.body.classList.contains('reordering') &&
        cloudPinsTime !== getFrequentPinsTime()) {
        storeFrequentPins(data.pins && typeof data.pins === 'object' ? data.pins : {}, cloudPinsTime);
    }

    return JSON.stringify([visitStats, getFrequentPins()]) !== before;
}

// render：云端结果和本机不一样时要不要立刻重排「访问最多」。点击之后的上报不重排（卡片不在眼前挪位置），
// 打开页面、回到前台时的拉取才重排
async function syncVisits({ keepalive = false, render = true } = {}) {
    if (visitSyncStopped || visitSyncing) return;
    const token = visitSyncToken();
    const userId = token && tokenUserId(token);
    if (!userId) return;

    visitSyncing = true;
    clearTimeout(visitSyncTimer);
    visitSyncTimer = null;
    try {
        await window.visitStatsLoaded;
        if (visitSyncStopped || visitSyncToken() !== token) return;
        const batch = prepareVisitBatch(userId);
        const options = { headers: { 'Authorization': `Bearer ${token}` } };
        if (batch) {
            options.method = 'POST';
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(batch);
            // keepalive 请求的正文有大小上限，太大的留到下次在前台时再发
            if (keepalive && options.body.length > VISIT_KEEPALIVE_LIMIT) return;
            options.keepalive = keepalive;
        }

        const response = await fetch('/api/visits', options);
        // 请求期间用户可能已退出或换了账号
        if (visitSyncToken() !== token) return;

        if (!response.ok) {
            if (response.status === 401) {
                // 不删令牌：是否真过期由 auth.js 的校验流程判断
                visitSyncStopped = true;
            } else if (batch && response.status >= 400 && response.status < 500 && response.status !== 429) {
                // 内容被服务端拒收，重发也一样，丢掉这一批，免得一直卡住后面的
                console.error('访问统计被拒收:', response.status);
                const pending = loadVisitPending();
                if (pending.sending && pending.sending.batchId === batch.batchId) {
                    pending.sending = null;
                    pending.sendingUser = null;
                    saveVisitPending(pending);
                }
            }
            return;
        }

        const data = await response.json();
        if (visitSyncToken() !== token) return;

        const pending = loadVisitPending();
        if (batch && pending.sending && pending.sending.batchId === batch.batchId) {
            pending.sending = null;
            pending.sendingUser = null;
            saveVisitPending(pending);
        }
        localStorage.setItem(VISIT_SYNCED_USER_KEY, userId);
        lastVisitSync = Date.now();

        const changed = applyCloudVisits(data, pending);
        if (changed && render && !document.body.classList.contains('reordering') &&
            typeof renderFrequentCategory === 'function') {
            renderFrequentCategory();
        }
        // 请求期间又点了卡片。只在成功后接着发，失败了等联网、回到前台或下次点击，不空转重试
        if (hasVisitChanges(pending)) scheduleVisitSync();
    } catch (error) {
        // 断网、超时：待上传的内容还在 localStorage 里，联网或下次打开时重发
        console.error('同步访问统计失败:', error);
    } finally {
        visitSyncing = false;
    }
}

function scheduleVisitSync() {
    if (visitSyncStopped) return;
    clearTimeout(visitSyncTimer);
    visitSyncTimer = setTimeout(() => syncVisits({ render: false }), VISIT_SYNC_DELAY);
}

// 登录校验通过后由 auth.js 调用
function startVisitSync() {
    visitSyncStopped = false;
    syncVisits();
}

// 退出登录时调用。本机统计和没传上去的增量都留着：同一个账号再登录时接着传，换了账号则丢掉
function stopVisitSync() {
    visitSyncStopped = true;
    clearTimeout(visitSyncTimer);
    visitSyncTimer = null;
}

// 点卡片通常会打开新标签页、本页转到后台：这时立刻上报，不等去抖
function flushVisitsBeforeHide() {
    if (!visitSyncTimer) return;
    syncVisits({ keepalive: true, render: false });
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        flushVisitsBeforeHide();
    } else if (Date.now() - lastVisitSync > VISIT_PULL_INTERVAL) {
        syncVisits();
    }
});
window.addEventListener('pagehide', flushVisitsBeforeHide);
window.addEventListener('online', () => syncVisits());
