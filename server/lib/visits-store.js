/**
 * 访问统计的云端存储（Redis）：给「访问最多」多端同步用
 *
 * 一个用户一个 key（visits:<userId>），和收藏数据分开存：收藏是整份覆盖并且每次上传都生成版本快照，
 * 点一次卡片就传一次的访问次数放进去会互相覆盖、冲掉历史版本。
 * 这里是合并不是覆盖：设备只上报「上次同步之后新增的访问」，服务端把增量加到记录上。
 *
 * key 不能用 user: 开头：auth.js 的 findUserByEmail 会 KEYS user:* 把它们当用户记录扫。
 * 读写走 redis.js，失败会抛 RedisError：读失败如果当成「没有数据」，下一步写回就会把记录清空。
 */

import { redisGet, redisSet } from './redis.js';

export const LIMITS = {
    entries: 500,      // 最多记多少个网址，和前端 VISIT_MAX_ENTRIES 一致
    samples: 10,       // 每个网址保留最近几次访问时间，和前端 VISIT_SAMPLE_SIZE 一致
    deltaKeys: 600,    // 单次上报最多带多少个网址（首次同步会把本机整份传上来）
    keyLength: 512,
    count: 1000000,
    pins: 200,
    batches: 20        // 记住最近多少个批次号，用来丢掉重发的批次
};

const DAY_MS = 24 * 60 * 60 * 1000;
// 移除记录（墓碑）留多久：离线超过这么久的设备，攒着的旧点击可能把移除的网址带回来
const TOMBSTONE_TTL = 30 * DAY_MS;

// 和 public/visit-stats.js 的 VISIT_AGE_WEIGHTS / frecencyScore 同一套规则，改一边要同步另一边
const VISIT_AGE_WEIGHTS = [
    { days: 4, weight: 100 },
    { days: 14, weight: 70 },
    { days: 31, weight: 50 },
    { days: 90, weight: 30 },
    { days: Infinity, weight: 10 }
];

export class VisitError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'VisitError';
        this.status = status;
        this.code = code;
    }
}

function invalid(message) {
    return new VisitError(400, 'INVALID_VISITS', message);
}

function frecencyScore(entry, now) {
    if (!entry.count || entry.visits.length === 0) return 0;
    const total = entry.visits.reduce((sum, time) => {
        const days = (now - time) / DAY_MS;
        return sum + VISIT_AGE_WEIGHTS.find(bucket => days <= bucket.days).weight;
    }, 0);
    return entry.count * (total / entry.visits.length);
}

function emptyRecord() {
    return { entries: {}, removed: {}, pins: {}, pinsUpdatedAt: 0, batches: [] };
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function checkKey(key) {
    if (!key || key.length > LIMITS.keyLength) throw invalid('Invalid url key');
}

// 设备的时钟可能快几分钟，未来的时间按现在算，不因此拒掉整批
function checkTime(value, now) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw invalid('Invalid timestamp');
    return Math.min(Math.floor(value), now);
}

function sortedUnique(times) {
    return [...new Set(times)].sort((a, b) => a - b);
}

/**
 * 校验并规整上报内容，不合规抛 VisitError
 */
export function parseVisitUpdate(body, now = Date.now()) {
    const update = { delta: {}, removed: {}, pins: null, pinsUpdatedAt: 0, batchId: null };

    if (body.batchId !== undefined) {
        if (typeof body.batchId !== 'string' || !body.batchId || body.batchId.length > 64) throw invalid('Invalid batchId');
        update.batchId = body.batchId;
    }

    if (body.delta !== undefined) {
        if (!isPlainObject(body.delta)) throw invalid('delta must be an object');
        const keys = Object.keys(body.delta);
        if (keys.length > LIMITS.deltaKeys) throw new VisitError(413, 'TOO_MANY_VISITS', 'Too many urls in one update');
        keys.forEach(key => {
            checkKey(key);
            const item = body.delta[key];
            if (!isPlainObject(item)) throw invalid('Invalid delta entry');
            if (!Number.isInteger(item.count) || item.count < 1 || item.count > LIMITS.count) throw invalid('Invalid count');
            if (!Array.isArray(item.visits) || item.visits.length < 1 || item.visits.length > LIMITS.samples) {
                throw invalid('Invalid visits');
            }
            update.delta[key] = { count: item.count, visits: sortedUnique(item.visits.map(time => checkTime(time, now))) };
        });
    }

    if (body.removed !== undefined) {
        if (!isPlainObject(body.removed)) throw invalid('removed must be an object');
        const keys = Object.keys(body.removed);
        if (keys.length > LIMITS.deltaKeys) throw new VisitError(413, 'TOO_MANY_VISITS', 'Too many urls in one update');
        keys.forEach(key => {
            checkKey(key);
            update.removed[key] = checkTime(body.removed[key], now);
        });
    }

    if (body.pins !== undefined) {
        if (!isPlainObject(body.pins)) throw invalid('pins must be an object');
        const keys = Object.keys(body.pins);
        if (keys.length > LIMITS.pins) throw invalid('Too many pins');
        update.pins = {};
        keys.forEach(key => {
            checkKey(key);
            const slot = body.pins[key];
            if (!Number.isInteger(slot) || slot < 0 || slot > 1000) throw invalid('Invalid pin position');
            update.pins[key] = slot;
        });
        update.pinsUpdatedAt = checkTime(body.pinsUpdatedAt, now);
    }

    return update;
}

/**
 * 把一次上报合并进记录（原地修改并返回）
 */
export function mergeVisitUpdate(record, update, now = Date.now()) {
    // 设备没收到上一次的响应会原样重发，同一批不能加两遍
    const duplicate = update.batchId && record.batches.includes(update.batchId);

    if (!duplicate) {
        // 移除：只清掉移除时间之前的访问。别的设备在那之后的访问已经先传上来的话留着，次数按留下的算
        Object.entries(update.removed).forEach(([key, time]) => {
            if (time <= (record.removed[key] || 0)) return;
            record.removed[key] = time;
            const entry = record.entries[key];
            if (!entry) return;
            const visits = entry.visits.filter(visit => visit > time);
            if (visits.length) {
                record.entries[key] = { count: visits.length, visits };
            } else {
                delete record.entries[key];
            }
        });

        Object.entries(update.delta).forEach(([key, item]) => {
            // 早于移除时间的访问丢掉：离线设备攒的旧点击不能把移除的网址带回来
            const tombstone = record.removed[key] || 0;
            const visits = item.visits.filter(visit => visit > tombstone);
            if (visits.length === 0) return;
            const count = visits.length < item.visits.length ? visits.length : item.count;
            const entry = record.entries[key] || { count: 0, visits: [] };
            record.entries[key] = {
                count: Math.min(entry.count + count, LIMITS.count),
                visits: sortedUnique([...entry.visits, ...visits]).slice(-LIMITS.samples)
            };
        });

        // 固定位置是一次拖拽的结果，没法逐条合并，整份按最后改的为准
        if (update.pins && update.pinsUpdatedAt > record.pinsUpdatedAt) {
            record.pins = update.pins;
            record.pinsUpdatedAt = update.pinsUpdatedAt;
        }

        if (update.batchId) {
            record.batches = [...record.batches, update.batchId].slice(-LIMITS.batches);
        }
    }

    Object.keys(record.removed).forEach(key => {
        if (now - record.removed[key] > TOMBSTONE_TTL) delete record.removed[key];
    });

    const keys = Object.keys(record.entries);
    if (keys.length > LIMITS.entries) {
        keys.sort((a, b) => frecencyScore(record.entries[a], now) - frecencyScore(record.entries[b], now))
            .slice(0, keys.length - LIMITS.entries)
            .forEach(key => delete record.entries[key]);
    }

    return record;
}

function recordKey(userId) {
    return `visits:${userId}`;
}

async function readRecord(env, userId) {
    const saved = await redisGet(env, recordKey(userId));
    return isPlainObject(saved) ? { ...emptyRecord(), ...saved } : emptyRecord();
}

// 返回给前端的部分：墓碑和批次号是服务端合并用的，不下发
function publicView(record) {
    return { entries: record.entries, pins: record.pins, pinsUpdatedAt: record.pinsUpdatedAt };
}

export async function getVisits(env, userId) {
    return publicView(await readRecord(env, userId));
}

/**
 * 读-改-写不是原子的：同一个用户的两台设备在同一瞬间上报，后写的会盖掉先写的那一批，
 * 代价是某个网址少记一两次，可以接受。
 */
export async function applyVisitUpdate(env, userId, update) {
    const record = mergeVisitUpdate(await readRecord(env, userId), update);
    await redisSet(env, recordKey(userId), record);
    return publicView(record);
}
