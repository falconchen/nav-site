// 访问统计：给「访问最多」tab 排序用
// 只存本机 IndexedDB（key: navSiteVisits），不走 saveNavData：
// 云端同步是整份覆盖，多设备的次数会互相覆盖；而且每次点击都会生成版本快照，冲掉只保留 5 份的历史

const VISIT_STORAGE_KEY = 'navSiteVisits';
const VISIT_SAMPLE_SIZE = 10; // 每个网址保留最近几次访问时间，用来算近期权重
const VISIT_MAX_ENTRIES = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

// 仿 Firefox frecency：按访问距今的天数取权重
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
}

// 从「访问最多」里移除：清掉这个网址的全部记录
function removeVisitStats(url) {
    const key = visitUrlKey(url);
    if (!key || !visitStats[key]) return;
    delete visitStats[key];
    scheduleVisitStatsSave();
}

// 页面关闭前把防抖中的写入落盘
window.addEventListener('pagehide', () => {
    if (visitStatsSaveTimer) {
        clearTimeout(visitStatsSaveTimer);
        visitStatsSaveTimer = null;
        dbStorage.setItem(VISIT_STORAGE_KEY, visitStats);
    }
});

window.visitStatsLoaded = (async () => {
    try {
        const saved = await dbStorage.getItem(VISIT_STORAGE_KEY);
        if (saved && typeof saved === 'object') {
            visitStats = saved;
        }
    } catch (error) {
        console.error('读取访问统计失败:', error);
    }
})();
