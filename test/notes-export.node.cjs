const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JSZip = require('../public/vendor/jszip.min.js');
const readZip = async download => JSZip.loadAsync(new Uint8Array(await download.blob.arrayBuffer()), { checkCRC32: true });

function fixture(count = 7) {
    const folders = [{ id: 'work', name: '工作' }, { id: 'life', name: '生活' }, { id: 'empty', name: '空文件夹' }];
    const notes = Array.from({ length: count }, (_, i) => ({
        id: `n${i}`, title: `中文笔记 ${i}`, content: `# 中文笔记 ${i}\n\n**原文。**下一句\n<&>`,
        syntax: i % 2 ? 'plain' : 'markdown', folderId: i % 3 === 0 ? null : i % 3 === 1 ? 'work' : 'life',
        length: 32, createdAt: '2026-10-01T01:02:03.000Z', updatedAt: '2026-10-04T01:02:03.000Z', publicId: i ? null : 'public-id'
    }));
    return { folders, notes };
}

function sandbox(data = fixture(), respond) {
    const requests = [], downloads = [], messages = [], timers = new Map(), blobs = new Map(), revoked = [];
    const handlers = {};
    let html = '', timerId = 0, active = 0, maxActive = 0;
    const button = { dataset: { action: 'export-notes' }, disabled: false, innerHTML: '', setAttribute() {} };
    const app = {
        addEventListener(name, fn) { handlers[name] = fn; },
        querySelector(selector) { return selector === '[data-action="export-notes"]' && html.includes('data-action="export-notes"') ? button : null; },
        get innerHTML() { return html; },
        set innerHTML(value) { html = value; button.disabled = /data-action="export-notes" disabled/.test(value); }
    };
    const storage = { token: 'test-session', getItem(key) { return key === 'authToken' ? this.token : null; } };
    const ctx = vm.createContext({
        Blob, AbortController, JSZip, console, localStorage: storage,
        location: { hash: '#/' }, window: { addEventListener() {} },
        document: {
            getElementById: () => app, addEventListener() {}, body: { appendChild() {} },
            createElement() { return { click() { downloads.push({ filename: this.download, blob: blobs.get(this.href) }); }, remove() { this.removed = true; } }; }
        },
        URL: {
            createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; },
            revokeObjectURL(url) { revoked.push(url); }
        },
        setTimeout(fn, ms) { const id = ++timerId; if (ms === 100) queueMicrotask(fn); else timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); },
        escapeHtml: value => String(value),
        showNotification: (message, kind) => messages.push({ message, kind }),
        fetch: async (url, init) => {
            requests.push({ url, init }); active++; maxActive = Math.max(maxActive, active);
            try {
                await new Promise(resolve => setImmediate(resolve));
                if (respond) {
                    const response = await respond(url, init, storage);
                    if (response) return response;
                }
                const payload = url === '/api/notes'
                    ? { folders: data.folders, notes: data.notes.map(({ content, ...meta }) => meta) }
                    : { note: data.notes.find(note => url.endsWith(`/${note.id}`)) };
                return { ok: true, status: 200, json: async () => structuredClone(payload) };
            } finally { active--; }
        }
    });
    // 文件名和下载在共用的 note-render.js 里，用真实实现。
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/note-render.js'), 'utf8'), ctx);
    const source = fs.readFileSync(path.join(__dirname, '../public/notes.js'), 'utf8');
    // 保留真实导出、渲染和事件处理，只跳过启动时的云端读取。
    vm.runInContext(source.replace('    route();\n})();', '    globalThis.testNotes = { exportNotes, renderList, showNote, state, actions: () => viewActions };\n})();'), ctx);
    ctx.testNotes.state.notes = data.notes.map(({ content, ...meta }) => meta);
    ctx.testNotes.state.folders = data.folders;
    ctx.testNotes.renderList('all');
    return { ctx, app, button, handlers, storage, requests, downloads, messages, timers, blobs, revoked, maxActive: () => maxActive };
}

test('按钮位于新建文件夹之前；筛选页仍打包全部原文及时间、分类', async () => {
    const data = fixture(), s = sandbox(data);
    s.ctx.testNotes.renderList('work');
    assert.ok(s.app.innerHTML.indexOf('data-action="export-notes"') < s.app.innerHTML.indexOf('data-action="new-folder"'));
    await s.ctx.testNotes.exportNotes();
    assert.equal(s.downloads.length, 1);
    const downloaded = s.downloads[0];
    assert.match(downloaded.filename, /^皮皮2047_所有笔记_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/);
    assert.equal(downloaded.blob.type, 'application/zip');
    const zip = await readZip(downloaded);
    assert.equal(Object.keys(zip.files).length, data.notes.length);
    for (const note of data.notes) {
        const text = await zip.file(note.title + (note.syntax === 'markdown' ? '.md' : '.txt')).async('string');
        assert.ok(text.startsWith(note.content + '\n\n'));
        const category = data.folders.find(folder => folder.id === note.folderId)?.name || '未归档';
        const time = String.raw`\d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}`;
        const footer = text.slice(note.content.length + 2);
        if (note.syntax === 'markdown') {
            assert.match(footer, new RegExp('^---\\n- 分类：`' + category + '`\\n- 添加于：`2026-10-01 ' + time + '`\\n- 最后编辑：`2026-10-04 ' + time + '`\\n$'));
        } else {
            assert.match(footer, new RegExp('^---\\n分类：' + category + '\\n添加于：2026-10-01 ' + time + '\\n最后编辑：2026-10-04 ' + time + '\\n$'));
        }
    }
    assert.equal(s.requests.length, 8);
    assert.equal(s.maxActive(), 4);
    assert.ok(s.requests.every(request => request.init.headers.Authorization === 'Bearer test-session'));
    assert.equal(s.revoked.length, 1);
    assert.equal(s.button.disabled, false);
    assert.equal(s.timers.size, 0);
});

test('空账号导出有效的空 ZIP，不请求不存在的正文', async () => {
    const s = sandbox({ notes: [], folders: [] });
    await s.ctx.testNotes.exportNotes();
    const zip = await readZip(s.downloads[0]);
    assert.deepEqual(Object.keys(zip.files), []);
    assert.equal(s.requests.length, 1);
});

test('点击事件触发导出；导出中重复点击和列表重画不产生重复请求', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const s = sandbox(fixture(1), async url => { if (url === '/api/notes') await gate; });
    s.handlers.click({ target: { closest: () => s.button } });
    assert.equal(s.button.disabled, true);
    s.ctx.testNotes.renderList('work');
    assert.equal(s.button.disabled, true);
    await s.ctx.testNotes.exportNotes();
    release();
    for (let i = 0; i < 100 && s.button.disabled; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(s.button.disabled, false);
    assert.equal(s.downloads.length, 1);
    assert.equal(s.requests.length, 2);
});

test('正文读取失败不下载部分文件，按钮恢复后可以重试', async () => {
    let fail = true;
    const s = sandbox(fixture(), async url => { if (fail && url.endsWith('/n2')) throw new Error('offline'); });
    await s.ctx.testNotes.exportNotes();
    assert.equal(s.downloads.length, 0);
    assert.equal(s.blobs.size, 0);
    assert.equal(s.button.disabled, false);
    assert.ok(s.messages.some(item => item.kind === 'error'));
    assert.equal(s.requests.length, 5); // 首批失败，未继续取下一批。
    fail = false;
    await s.ctx.testNotes.exportNotes();
    assert.equal(s.downloads.length, 1);
});

test('响应缺少正文或索引格式异常时不生成备份', async () => {
    for (const payload of [{ notes: [] }, { note: { id: 'n0' } }]) {
        const s = sandbox(fixture(1), async url => {
            if (url === '/api/notes' && !payload.note || url.endsWith('/n0') && payload.note) {
                return { ok: true, status: 200, json: async () => payload };
            }
        });
        await s.ctx.testNotes.exportNotes();
        assert.equal(s.downloads.length, 0);
        assert.equal(s.button.disabled, false);
        assert.ok(s.messages.some(item => item.kind === 'error'));
    }
});

test('导出期间切换登录账号会停止，不能下载混合账号的内容', async () => {
    const s = sandbox(fixture(5), async (url, init, storage) => { if (url.endsWith('/n0')) storage.token = 'another-session'; });
    await s.ctx.testNotes.exportNotes();
    assert.equal(s.downloads.length, 0);
    assert.equal(s.button.disabled, false);
    assert.ok(s.messages.some(item => item.message.includes('登录状态已变化')));
    assert.ok(!s.requests.some(item => item.url.endsWith('/n4')));
});

test('会话失效提示重新登录，不下载且不删除现有令牌', async () => {
    const s = sandbox(fixture(1), async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await s.ctx.testNotes.exportNotes();
    assert.equal(s.downloads.length, 0);
    assert.equal(s.storage.token, 'test-session');
    assert.match(s.app.innerHTML, /登录已过期/);
    assert.equal(s.requests.length, 1);
    assert.equal(s.timers.size, 0);
});

test('网络请求超时会中止读取并恢复按钮', async () => {
    const s = sandbox(fixture(1), async (url, init) => {
        await new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('timeout'))));
    });
    const pending = s.ctx.testNotes.exportNotes();
    await new Promise(resolve => setImmediate(resolve));
    for (const timeout of s.timers.values()) timeout();
    await pending;
    assert.equal(s.requests[0].init.signal.aborted, true);
    assert.equal(s.downloads.length, 0);
    assert.equal(s.button.disabled, false);
    assert.equal(s.timers.size, 0);
});

test('中文同名、大小写重复、路径字符、保留名称和过长标题不覆盖文件', async () => {
    const data = fixture(7);
    const titles = ['同名', '../危险\\路径:*?', '同名', 'CON', '同名 (2)', 'con', '😀中文'.repeat(100)];
    data.notes.forEach((note, i) => { note.title = titles[i]; });
    const s = sandbox(data);
    await s.ctx.testNotes.exportNotes();
    const zip = await readZip(s.downloads[0]);
    const names = Object.keys(zip.files);
    assert.equal(names.length, 7);
    assert.equal(new Set(names.map(name => name.toLowerCase())).size, 7);
    assert.ok(names.includes('同名.md'));
    assert.ok(names.includes('同名 (2).md'));
    assert.ok(names.includes('同名 (2) (2).md'));
    assert.ok(names.includes('_CON.txt'));
    assert.ok(names.includes('_con (2).txt'));
    for (const name of names) {
        assert.doesNotMatch(name, /[\\/:*?<>|]/);
        assert.ok(Buffer.byteLength(name) <= 255);
        assert.ok(!zip.files[name].dir);
    }
    const contents = await Promise.all(names.map(name => zip.files[name].async('string')));
    for (const note of data.notes) assert.ok(contents.some(text => text.startsWith(note.content + '\n\n')));
});

test('分类按字面放进行内代码，反引号不会截断；正文末尾换行不删改', async () => {
    const data = fixture(2);
    data.notes[0].content = '原文[^note-export-created]\n\n[^note-export-created]: 原有脚注\n';
    data.notes[0].folderId = 'work';
    data.folders[0].name = '[分类](危险)<文本>``\n第二行`';
    data.notes[1].content = '保留结尾空行\r\n\r\n';
    const s = sandbox(data);
    await s.ctx.testNotes.exportNotes();
    const zip = await readZip(s.downloads[0]);
    const md = await zip.file('中文笔记 0.md').async('string');
    assert.ok(md.startsWith(data.notes[0].content + '\n---\n- 分类：``` [分类](危险)<文本>`` 第二行` ```\n- 添加于：`'));
    assert.ok(!md.includes('[^note-export-2'));
    const txt = await zip.file('中文笔记 1.txt').async('string');
    assert.ok(txt.startsWith(data.notes[1].content + '---\n分类：'));
});

test('查看页「下载笔记」在复制全文之前，单独下载 txt / md，内容是原文、不附加尾部信息', async () => {
    const data = fixture(2);
    data.notes[1].title = 'a/b:c';
    data.notes[1].folderId = 'work';
    data.notes[1].content = '结尾换行原样保留\r\n\r\n';
    const s = sandbox(data);
    for (const [note, name, type] of [[data.notes[0], '中文笔记 0.md', 'text/markdown;charset=utf-8'], [data.notes[1], 'a_b_c.txt', 'text/plain;charset=utf-8']]) {
        await s.ctx.testNotes.showNote(note.id);
        assert.ok(s.app.innerHTML.indexOf('data-action="download"') < s.app.innerHTML.indexOf('data-action="copy"'));
        s.ctx.testNotes.actions().download();
        const downloaded = s.downloads.at(-1);
        assert.equal(downloaded.filename, name);
        assert.equal(downloaded.blob.type, type);
        assert.equal(await downloaded.blob.text(), note.content);
    }
    assert.equal(s.downloads.length, 2);
    assert.equal(s.revoked.length, 2);
});

test('公开页有「下载笔记」，下载的是原文', async () => {
    const note = { title: '公开: 笔记', content: '# 公开\n\n<b>原文</b>\n', syntax: 'markdown', updatedAt: '2026-10-04T01:02:03.000Z' };
    const downloads = [], blobs = new Map();
    let html = '', onClick;
    const container = {
        get innerHTML() { return html; }, set innerHTML(value) { html = value; },
        querySelector: selector => (selector === '[data-action="download"]' && html.includes('data-action="download"')
            ? { addEventListener(name, fn) { if (name === 'click') onClick = fn; } } : null)
    };
    const ctx = vm.createContext({
        Blob, console, setTimeout: fn => queueMicrotask(fn),
        location: { pathname: '/n/public-id' }, escapeHtml: value => String(value),
        document: {
            title: '', getElementById: () => container, body: { appendChild() {} },
            createElement() { return { click() { downloads.push({ filename: this.download, blob: blobs.get(this.href) }); }, remove() {} }; }
        },
        URL: { createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
        fetch: async url => {
            assert.equal(url, '/api/public/notes/public-id');
            return { ok: true, status: 200, json: async () => ({ note }) };
        }
    });
    for (const file of ['note-render.js', 'note-public.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'), ctx);
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(html.indexOf('note-content') < html.indexOf('data-action="download"'));
    onClick();
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].filename, '公开_ 笔记.md');
    assert.equal(downloads[0].blob.type, 'text/markdown;charset=utf-8');
    assert.equal(await downloads[0].blob.text(), note.content);
});

test('ZIP 组件缺失或打包失败时不下载，按钮恢复', async () => {
    for (const implementation of [undefined, class extends JSZip { generateAsync() { return Promise.reject(new Error('打包失败')); } }]) {
        const s = sandbox(fixture(1));
        s.ctx.JSZip = implementation;
        await s.ctx.testNotes.exportNotes();
        assert.equal(s.downloads.length, 0);
        assert.equal(s.button.disabled, false);
        assert.ok(s.messages.some(item => item.kind === 'error'));
    }
});
