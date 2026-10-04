// 浏览器脚本在独立 VM 中运行，使用真实异步回调模拟 IndexedDB 和网络故障。
// 由 npm run test:frontend 执行；不放进 Workers 的 Vitest 运行时。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

function element() {
    const classes = new Set();
    return {
        hidden: false, dataset: {}, textContent: '', attributes: {}, onclick: null,
        classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
        setAttribute(key, value) { this.attributes[key] = value; }
    };
}

function sandbox(initial = {}) {
    const elements = Object.fromEntries(['navLoadStatus', 'navLoadMessage', 'navLoadRetry', 'content'].map(id => [id, element()]));
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        document: {
            addEventListener() {},
            getElementById: id => elements[id] || null,
            querySelector: selector => selector === '.content-area' ? elements.content : null
        },
        addEventListener() {}, removeEventListener() {},
        // 缩短网络重试的 1 秒等待，不改操作超时或事件顺序。
        setTimeout: (fn, ms) => setTimeout(fn, ms === 1000 ? 1 : ms),
        clearTimeout, setInterval, clearInterval, AbortController,
        localStorage: storage(initial), authToken: 'fixture-token',
        elements, renders: 0
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const name of ['utils.js', 'data.js', 'sync.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', name), 'utf8'), ctx, { filename: name });
    }
    ctx.dbStorage.timeoutMs = 8;
    ctx.renderCategoryList = () => {};
    ctx.loadWebsitesFromData = () => { ctx.renders++; };
    ctx.updateCategoryDropdown = () => {};
    const request = ctx.fetchJSONWithRetry;
    ctx.fetchJSONWithRetry = (url, options, controls) => request(url, options, { ...controls, timeoutMs: 8 });
    return ctx;
}

function idb(entries = {}) {
    const state = { openMode: 'ok', transactionMode: 'ok', opens: 0, closes: 0, aborts: 0, openRequests: [], values: new Map(Object.entries(entries)) };
    state.makeDB = () => {
        const db = {
            close() { state.closes++; db.onclose?.(); },
            transaction() {
                const tx = {
                    error: null,
                    abort() { state.aborts++; queueMicrotask(() => tx.onabort?.()); },
                    objectStore() {
                        const request = (key, value, writing) => {
                            const req = { result: writing ? key : state.values.get(key) };
                            queueMicrotask(() => {
                                if (state.transactionMode === 'hang') return;
                                req.onsuccess?.();
                                if (state.transactionMode === 'abort') {
                                    tx.error = new Error('aborted after request success');
                                    tx.onabort?.();
                                } else {
                                    if (writing) state.values.set(key, value);
                                    tx.oncomplete?.();
                                }
                            });
                            return req;
                        };
                        return { get: key => request(key), put: (value, key) => request(key, value, true) };
                    }
                };
                return tx;
            }
        };
        return db;
    };
    state.open = () => {
        state.opens++;
        const req = {};
        state.openRequests.push(req);
        queueMicrotask(() => {
            if (state.openMode === 'hang') return;
            if (state.openMode === 'blocked') return req.onblocked?.();
            req.onsuccess?.({ target: { result: state.makeDB() } });
        });
        return req;
    };
    return state;
}

const cloudData = () => ({ categories: [{ id: 'demo', name: '测试', order: 1 }], websites: { demo: [{ title: '收藏', url: 'https://example.com' }] }, version: 42 });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('数据库打开无回调时超时，重试一次，并关闭迟到的连接', async () => {
    const ctx = sandbox();
    const db = idb();
    db.openMode = 'hang'; ctx.indexedDB = db;
    await assert.rejects(ctx.dbStorage.getItem('missing'), { name: 'TimeoutError' });
    assert.equal(db.opens, 2);
    db.openRequests[0].onsuccess({ target: { result: db.makeDB() } });
    assert.equal(db.closes, 1);
    assert.equal(ctx.dbStorage.db, null);
});

test('并发读取共享打开请求，正常事务完成后返回数据', async () => {
    const ctx = sandbox(); const db = idb({ first: ['value'], second: {} }); ctx.indexedDB = db;
    const values = await Promise.all([ctx.dbStorage.getItem('first'), ctx.dbStorage.getItem('second')]);
    assert.equal(db.opens, 1);
    assert.equal(values[0][0], 'value');
    assert.equal(typeof values[1], 'object');
});

test('事务无回调时中止并重新连接，不永远等待', async () => {
    const ctx = sandbox(); const db = idb(); db.transactionMode = 'hang'; ctx.indexedDB = db;
    await assert.rejects(ctx.dbStorage.getItem('missing'), { name: 'TimeoutError' });
    assert.equal(db.opens, 2); assert.equal(db.aborts, 2); assert.equal(db.closes, 2);
});

test('put 成功但事务 abort 不能报告保存成功；降级数据保留对象类型和最新副本', async () => {
    const ctx = sandbox(); const db = idb({ example: { old: true } }); db.transactionMode = 'abort'; ctx.indexedDB = db;
    await ctx.dbStorage.setItem('example', { latest: true });
    assert.equal(ctx.localStorage.getItem('example'), '{"latest":true}');
    assert.equal(ctx.localStorage.getItem('navSiteStorageFallback:example'), '1');
    db.transactionMode = 'ok';
    assert.equal((await ctx.dbStorage.getItem('example')).latest, true);
    await ctx.dbStorage.setItem('example', { repaired: true });
    assert.equal(ctx.localStorage.getItem('navSiteStorageFallback:example'), null);
    assert.equal((await ctx.dbStorage.getItem('example')).repaired, true);
});

test('打开阻塞和无法降级的写入都会明确失败', async () => {
    const ctx = sandbox(); const db = idb(); db.openMode = 'blocked'; ctx.indexedDB = db;
    ctx.localStorage.setItem = () => { throw new Error('quota'); };
    await assert.rejects(ctx.dbStorage.setItem('example', {}), /quota/);
    assert.equal(db.opens, 2);
});

test('读取失败保留失败提示和重试按钮，不生成默认收藏；重试成功后渲染', async () => {
    const ctx = sandbox(); const db = idb(); db.openMode = 'hang'; ctx.indexedDB = db;
    await ctx.loadData();
    assert.equal(ctx.navDataLoadFailed, true); assert.equal(ctx.navDataReady, false);
    assert.equal(Object.keys(ctx.websites).length, 0); assert.equal(ctx.renders, 0);
    assert.match(ctx.elements.navLoadMessage.textContent, /超时/);
    assert.equal(ctx.elements.navLoadRetry.hidden, false);
    db.openMode = 'ok'; db.values.set('navSiteCategories', cloudData().categories); db.values.set('navSiteWebsites', cloudData().websites);
    await ctx.loadData(true);
    assert.equal(ctx.navDataLoadFailed, false); assert.equal(ctx.renders, 1);
    assert.equal(ctx.elements.navLoadStatus.hidden, true);
});

test('新用户正常使用默认收藏，成功后移除加载提示', async () => {
    const ctx = sandbox(); ctx.indexedDB = idb();
    await ctx.loadData();
    assert.equal(ctx.navDataReady, true); assert.equal(ctx.hasStoredNavData, false);
    assert.ok(Object.keys(ctx.websites).length > 1);
    assert.equal(ctx.elements.navLoadStatus.hidden, true);
});

test('云端下载的响应体卡住也会超时、中止并重试', async () => {
    const ctx = sandbox(); let calls = 0; let aborted = 0;
    ctx.fetch = async (_url, options) => {
        calls++; options.signal.addEventListener('abort', () => aborted++);
        return { ok: true, status: 200, text: () => new Promise(() => {}) };
    };
    await assert.rejects(ctx.fetchJSONWithRetry('/fixture'), { name: 'TimeoutError' });
    assert.equal(calls, 2); assert.equal(aborted, 2);
});

test('5xx 重试一次，401 不自动重试', async () => {
    const ctx = sandbox(); let calls = 0;
    ctx.fetch = async () => response({}, ++calls === 1 ? 503 : 200);
    assert.equal((await ctx.fetchJSONWithRetry('/fixture')).response.status, 200);
    assert.equal(calls, 2);
    calls = 0; ctx.fetch = async () => { calls++; return response({ needReauth: true }, 401); };
    await ctx.fetchJSONWithRetry('/fixture'); assert.equal(calls, 1);
});

test('写入请求和成功响应的格式错误不会自动重试', async () => {
    const ctx = sandbox(); let calls = 0;
    ctx.fetch = async () => { calls++; throw new Error('offline'); };
    await assert.rejects(ctx.fetchJSONWithRetry('/fixture', { method: 'POST' }));
    assert.equal(calls, 1);
    calls = 0;
    ctx.fetch = async () => { calls++; return { ok: true, status: 200, text: async () => 'not JSON' }; };
    await assert.rejects(ctx.fetchJSONWithRetry('/fixture'), { name: 'DataFormatError' });
    assert.equal(calls, 1);
});

test('旧加载结束不会隐藏新加载或失败提示', () => {
    const ctx = sandbox(); const old = ctx.showNavLoadStatus('本机'); const latest = ctx.showNavLoadStatus('云端');
    old.complete(); assert.equal(ctx.elements.navLoadMessage.textContent, '云端');
    latest.fail('失败', () => {}); old.complete();
    assert.equal(ctx.elements.navLoadStatus.hidden, false); assert.equal(ctx.elements.navLoadStatus.dataset.state, 'error');
});

test('静默的云端检查不弹出加载提示，失败才显示；提示已显示时原地换成加载中', () => {
    const ctx = sandbox(); ctx.showNavLoadStatus('本机').complete();
    const quiet = ctx.showNavLoadStatus('正在检查云端收藏…', { quiet: true });
    assert.equal(ctx.elements.navLoadStatus.hidden, true);
    quiet.update('正在重试…'); assert.equal(ctx.elements.navLoadStatus.hidden, true);
    quiet.fail('云端响应超时，请重试。', () => {});
    assert.equal(ctx.elements.navLoadStatus.hidden, false); assert.equal(ctx.elements.navLoadStatus.dataset.state, 'error');
    const retry = ctx.showNavLoadStatus('正在检查云端收藏…', { quiet: true });
    assert.equal(ctx.elements.navLoadStatus.dataset.state, 'loading'); assert.equal(ctx.elements.navLoadRetry.hidden, true);
    retry.complete(); assert.equal(ctx.elements.navLoadStatus.hidden, true);
});

test('下载完成后先渲染；缓存失败不推进版本，保存标记正常复位', async () => {
    const ctx = sandbox({ dataVersion: '10' }); const rejectWrites = [];
    ctx.dbStorage.setItem = () => new Promise((_, reject) => { rejectWrites.push(reject); });
    const pending = ctx.updateLocalData(cloudData());
    assert.equal(ctx.renders, 1); assert.equal(ctx.navDataReady, true); assert.equal(ctx.isUpdatingFromCloud, false);
    // 两个并行写入都明确失败。
    rejectWrites.forEach(reject => reject(new Error('cache failure')));
    assert.equal(await pending, false);
    assert.equal(ctx.localStorage.getItem('dataVersion'), '10');
});

test('本地读取失败但有未上传改动时，不下载覆盖，也不上传空内存', async () => {
    const ctx = sandbox({ pendingCloudSave: '1' }); ctx.navDataLoadFailed = true;
    ctx.fetch = () => { throw new Error('should not request'); };
    await ctx.checkForCloudUpdates({ force: true });
    assert.match(ctx.elements.navLoadMessage.textContent, /本机收藏读取失败/);
    assert.equal(ctx.localStorage.getItem('pendingCloudSave'), '1');
    assert.equal(ctx.renders, 0);
});

test('版本相同但本地读取失败时仍会下载恢复', async () => {
    const ctx = sandbox({ dataVersion: '42' }); ctx.navDataLoadFailed = true;
    let downloads = 0; ctx.loadUserData = async () => { downloads++; };
    ctx.fetch = async () => response({ hasData: true, version: 42 });
    await ctx.checkForCloudUpdates(); assert.equal(downloads, 1);
});

test('云端检查失败后手动重试绕过 10 秒节流', async () => {
    const ctx = sandbox(); ctx.navDataReady = true; ctx.hasStoredNavData = true;
    ctx.fetch = async () => { throw new Error('offline'); };
    await ctx.checkForCloudUpdates(); assert.equal(ctx.elements.navLoadRetry.hidden, false);
    ctx.fetch = async () => response({ hasData: true, version: 0 });
    await ctx.elements.navLoadRetry.onclick(); assert.equal(ctx.elements.navLoadStatus.hidden, true);
});

test('下载期间切换账号或修改收藏时，不应用旧响应', async () => {
    for (const change of ['account', 'edit']) {
        const ctx = sandbox(); let finish;
        ctx.fetch = () => new Promise(resolve => { finish = resolve; });
        ctx.decompressData = async () => cloudData();
        const pending = ctx.loadUserData(); await tick();
        if (change === 'account') ctx.authToken = 'another-token'; else ctx.navDataRevision++;
        finish(response({ data: 'fixture', lastUpdated: 'now' }));
        await pending; assert.equal(ctx.renders, 0);
    }
});

test('并发触发下载只发一次请求，成功后允许再次重试', async () => {
    const ctx = sandbox(); let requests = 0;
    ctx.fetch = async () => { requests++; return response({ data: 'fixture', lastUpdated: 'now' }); };
    ctx.decompressData = async () => cloudData(); ctx.dbStorage.setItem = async () => {};
    await Promise.all([ctx.loadUserData(), ctx.loadUserData()]);
    assert.equal(requests, 1); assert.equal(ctx.renders, 1); assert.equal(ctx.elements.navLoadStatus.hidden, true);
    await ctx.loadUserData(); assert.equal(requests, 2);
});

test('新设备默认示例补全属性不会触发自动上传', async () => {
    const ctx = sandbox(); ctx.indexedDB = idb();
    await ctx.loadData();
    const script = fs.readFileSync(path.join(__dirname, '../public/script.js'), 'utf8');
    const start = script.indexOf('function validatePinnedStatus()');
    vm.runInContext(script.slice(start, script.indexOf('// 渲染分类列表', start)), ctx);
    let saves = 0; ctx.saveNavData = () => { saves++; };
    ctx.validatePinnedStatus(); assert.equal(saves, 0);
});

test('云端状态检查期间修改收藏时，不启动覆盖下载', async () => {
    const ctx = sandbox({ dataVersion: '1' }); let finish; let downloads = 0;
    ctx.navDataReady = true; ctx.hasStoredNavData = true;
    ctx.loadUserData = () => { downloads++; };
    ctx.fetch = () => new Promise(resolve => { finish = resolve; });
    const pending = ctx.checkForCloudUpdates(); await tick(); ctx.navDataRevision++;
    finish(response({ hasData: true, version: 42 })); await pending;
    assert.equal(downloads, 0);
});

test('切换账号后新账号下载不被旧请求锁住', async () => {
    const ctx = sandbox(); const finishes = [];
    ctx.fetch = () => new Promise(resolve => { finishes.push(resolve); });
    ctx.decompressData = async () => cloudData(); ctx.dbStorage.setItem = async () => {};
    const first = ctx.loadUserData(); await tick();
    ctx.authToken = 'another-token';
    const second = ctx.loadUserData(); await tick();
    assert.equal(finishes.length, 2);
    finishes[1](response({ data: 'fixture', lastUpdated: 'now' })); await second;
    finishes[0](response({ data: 'fixture', lastUpdated: 'now' })); await first;
    assert.equal(ctx.renders, 1); assert.equal(ctx.elements.navLoadStatus.hidden, true);
});
