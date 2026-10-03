// 记事本（notes.html）：记事列表、查看、编辑，文件夹，公开发布。接口见 server/api/notes.js。
// 必须登录、只存云端；本机只暂存没保存的草稿（localStorage noteDraft:<id>）。
// 不加载 auth.js（它依赖首页页眉的 DOM），登录令牌直接读 localStorage authToken
(function () {
    const CONFIRM_MS = 3000;
    const DRAFT_SAVE_DELAY = 500;
    const SAVED_FEEDBACK_MS = 2000;
    const DRAFT_PREFIX = 'noteDraft:';
    const NEW_NOTE = 'new';
    const NO_FOLDER = 'none';

    const ERROR_MESSAGES = {
        NOTE_EMPTY: I18n.t("内容不能为空"),
        NOTE_TOO_LONG: I18n.t("内容太长，一条记事最多 10 万字"),
        NOTE_LIMIT: I18n.t("记事数量已到上限，删掉一些再建"),
        NOTE_NOT_FOUND: I18n.t("这条记事不存在，可能已经被删除"),
        FOLDER_NOT_FOUND: I18n.t("这个文件夹不存在，可能已经被删除"),
        FOLDER_EXISTS: I18n.t("已经有同名的文件夹"),
        FOLDER_LIMIT: I18n.t("文件夹数量已到上限"),
        INVALID_FOLDER_NAME: I18n.t("文件夹名不能为空"),
        PUBLIC_LIMIT: I18n.t("公开发布的记事数量已到上限"),
        RATE_LIMITED: I18n.t("操作太频繁，稍后再试"),
        STORAGE_UNAVAILABLE: I18n.t("云端存储暂时不可用，稍后再试"),
        BODY_TOO_LARGE: I18n.t("内容太长，一条记事最多 10 万字"),
        NETWORK: I18n.t("网络连接失败，稍后再试")
    };

    const { renderNoteContent, formatNoteTime } = NoteRender;
    const app = document.getElementById('notesApp');

    // 索引（不含正文）在页面里缓存一份，各视图共用
    const state = {
        notes: [],
        folders: [],
        loaded: false
    };
    // 每次切视图加一；异步请求回来时对不上就说明用户已经去了别的视图，结果丢掉
    let routeSerial = 0;
    // 当前编辑器的状态，不在编辑视图时为 null
    let editor = null;
    let changingLanguage = false;

    class ApiError extends Error {
        constructor(status, code) {
            super(ERROR_MESSAGES[code] || I18n.t("操作失败，稍后再试"));
            this.status = status;
            this.code = code;
        }
    }

    // ---- 请求 ----

    const getToken = () => {
        try {
            return localStorage.getItem('authToken');
        } catch (error) {
            return null;
        }
    };

    async function api(path, { method = 'GET', body } = {}) {
        let response;
        try {
            response = await fetch(`/api/notes${path}`, {
                method,
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    ...(body ? { 'Content-Type': 'application/json' } : {})
                },
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (error) {
            throw new ApiError(0, 'NETWORK');
        }
        let data = {};
        try {
            data = await response.json();
        } catch (error) {}
        if (!response.ok) throw new ApiError(response.status, data.code);
        return data;
    }

    // 401 不删令牌：是不是真的过期由首页的校验流程判断，这里只请用户回首页
    function handleError(error) {
        if (error.status === 401) {
            renderGate(I18n.t("登录已过期，请回首页重新登录。"));
            return;
        }
        showNotification(error.message, 'error');
    }

    async function loadIndex() {
        const data = await api('');
        state.notes = data.notes;
        state.folders = data.folders;
        state.loaded = true;
    }

    // ---- 小工具 ----

    const folderName = id => state.folders.find(folder => folder.id === id)?.name || '';
    const byUpdatedDesc = (a, b) => (a.updatedAt < b.updatedAt ? 1 : -1);
    const listHash = filter => (filter && filter !== 'all' ? `#/f/${filter}` : '#/');

    function replaceNote(note) {
        const { content, ...meta } = note;
        const index = state.notes.findIndex(item => item.id === meta.id);
        if (index >= 0) state.notes[index] = meta;
        else state.notes.unshift(meta);
    }

    // 危险操作不弹确认框：3 秒内点第二次才执行（和个人令牌的「吊销」一样）
    function confirmTwice(button, label) {
        if (button.classList.contains('confirming')) {
            clearTimeout(button._confirmTimer);
            return true;
        }
        const original = button.innerHTML;
        button.classList.add('confirming');
        button.textContent = label;
        button._confirmTimer = setTimeout(() => {
            button.classList.remove('confirming');
            button.innerHTML = original;
        }, CONFIRM_MS);
        return false;
    }

    function folderOptions(selected) {
        return [`<option value="">${I18n.html("未归档")}</option>`]
            .concat(state.folders.map(folder =>
                `<option value="${escapeHtml(folder.id)}"${folder.id === selected ? ' selected' : ''}>${escapeHtml(folder.name)}</option>`))
            .join('');
    }

    function setTitle(title) {
        document.title = title ? I18n.t("{0} · 记事本 · 皮皮2047", { 0: title }) : I18n.t("记事本 · 皮皮2047");
    }

    // ---- 草稿 ----

    function readDraft(id) {
        try {
            return JSON.parse(localStorage.getItem(DRAFT_PREFIX + id));
        } catch (error) {
            return null;
        }
    }

    function writeDraft(id, draft) {
        try {
            localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(draft));
        } catch (error) {}
    }

    function clearDraft(id) {
        try {
            localStorage.removeItem(DRAFT_PREFIX + id);
        } catch (error) {}
    }

    // ---- 视图：未登录 / 加载中 / 出错 ----

    function renderGate(message) {
        setTitle('');
        app.innerHTML = `
            <div class="notes-gate">
                <h1 class="notes-title">${I18n.html("记事本")}</h1>
                <p>${escapeHtml(message)}</p>
                <a class="btn btn-primary" href="/">${I18n.html("回首页登录")}</a>
            </div>`;
    }

    function renderLoading() {
        app.innerHTML = `<p class="notes-empty">${I18n.html("加载中…")}</p>`;
    }

    function renderMissing(message) {
        app.innerHTML = `
            <div class="notes-bar"><a class="doc-back" href="#/"><i class="fas fa-arrow-left"></i>${I18n.html("记事本")}</a></div>
            <p class="notes-empty">${escapeHtml(message)}</p>`;
    }

    // ---- 视图：列表 ----

    // folderForm: null | { mode: 'new' } | { mode: 'rename' }，在筛选条下面展开一行输入
    function renderList(filter, folderForm = null) {
        setTitle('');
        const activeFolder = state.folders.find(folder => folder.id === filter);
        const notes = state.notes
            .filter(note => {
                if (filter === 'all') return true;
                if (filter === NO_FOLDER) return !note.folderId;
                return note.folderId === filter;
            })
            .sort(byUpdatedDesc);
        const countIn = id => state.notes.filter(note => note.folderId === id).length;
        const unfiled = state.notes.filter(note => !note.folderId).length;

        const chip = (key, label, count) => `
            <a class="notes-folder${filter === key ? ' active' : ''}" href="${listHash(key)}">
                ${escapeHtml(label)}<span class="notes-folder-count">${count}</span>
            </a>`;

        const folderBar = state.folders.length ? `
            <nav class="notes-folders" aria-label="${I18n.html("文件夹")}">
                ${chip('all', I18n.t("全部"), state.notes.length)}
                ${chip(NO_FOLDER, I18n.t("未归档"), unfiled)}
                ${state.folders.map(folder => chip(folder.id, folder.name, countIn(folder.id))).join('')}
            </nav>` : '';

        const folderTools = activeFolder && !folderForm ? `
            <div class="notes-folder-tools">
                <span>${I18n.html("文件夹「{0}」", { 0: activeFolder.name })}</span>
                <button type="button" class="tool-text-btn" data-action="rename-folder"><i class="fas fa-pen"></i> ${I18n.html("改名")}</button>
                <button type="button" class="tool-text-btn" data-action="delete-folder"><i class="fas fa-trash"></i> ${I18n.html("删除")}</button>
            </div>` : '';

        const form = folderForm ? `
            <form class="notes-folder-form" data-mode="${folderForm.mode}">
                <input type="text" class="form-input" name="name" maxlength="50" autocomplete="off"
                    placeholder="${I18n.html("文件夹名")}" aria-label="${I18n.html("文件夹名")}"
                    value="${folderForm.mode === 'rename' ? escapeHtml(activeFolder.name) : ''}">
                <button type="submit" class="btn btn-primary">${folderForm.mode === 'rename' ? I18n.t("改名") : I18n.t("新建")}</button>
                <button type="button" class="btn btn-secondary" data-action="cancel-folder-form">${I18n.html("取消")}</button>
            </form>` : '';

        const emptyText = state.notes.length
            ? I18n.t("这个文件夹里还没有记事。")
            : I18n.t("还没有记事。点「新建记事」写第一条。");

        const items = notes.map(note => {
            const meta = [
                I18n.t("{0} 字", { 0: note.length.toLocaleString(I18n.locale) }),
                formatNoteTime(note.updatedAt),
                note.syntax === 'markdown' ? 'Markdown' : '',
                filter === 'all' && note.folderId ? escapeHtml(folderName(note.folderId)) : ''
            ].filter(Boolean).join(' · ');
            return `
                <li>
                    <a class="notes-item" href="#/n/${escapeHtml(note.id)}">
                        <span class="notes-item-title">${escapeHtml(note.title)}</span>
                        <span class="notes-item-meta">${meta}${note.publicId ? `<span class="notes-badge">${I18n.html("已发布")}</span>` : ''}</span>
                    </a>
                </li>`;
        }).join('');

        app.innerHTML = `
            <div class="notes-head">
                <h1 class="notes-title">${I18n.html("记事本")}</h1>
                <div class="notes-head-actions">
                    <button type="button" class="btn btn-secondary" data-action="new-folder"><i class="fas fa-folder-plus"></i> ${I18n.html("新建文件夹")}</button>
                    <a class="btn btn-primary" href="#/new"><i class="fas fa-plus"></i> ${I18n.html("新建记事")}</a>
                </div>
            </div>
            ${folderBar}
            ${folderTools}
            ${form}
            ${notes.length ? `<ul class="notes-list">${items}</ul>` : `<p class="notes-empty">${emptyText}</p>`}`;

        if (folderForm) app.querySelector('.notes-folder-form input').focus();
    }

    async function showList(filter) {
        const serial = routeSerial;
        // 有缓存先画出来，再去云端拿最新的（可能在别的设备上改过）
        if (state.loaded) renderList(filter);
        else renderLoading();
        try {
            await loadIndex();
        } catch (error) {
            if (serial === routeSerial) {
                if (!state.loaded && error.status !== 401) renderMissing(error.message);
                handleError(error);
            }
            return;
        }
        if (serial !== routeSerial) return;
        // 文件夹在别处被删了：回到全部
        if (filter !== 'all' && filter !== NO_FOLDER && !folderName(filter)) {
            location.hash = '#/';
            return;
        }
        // 正在填文件夹名时不重画，免得把输入冲掉
        if (!app.querySelector('.notes-folder-form')) renderList(filter);
    }

    async function submitFolderForm(form, filter) {
        const name = form.elements.name.value.trim();
        if (!name) {
            form.elements.name.focus();
            return;
        }
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
            if (form.dataset.mode === 'rename') {
                const { folder } = await api(`/folders/${filter}`, { method: 'PUT', body: { name } });
                state.folders = state.folders.map(item => (item.id === folder.id ? folder : item));
                renderList(filter);
            } else {
                const { folder } = await api('/folders', { method: 'POST', body: { name } });
                state.folders.push(folder);
                // 新建完直接进这个文件夹，接着就能在里面建记事
                location.hash = listHash(folder.id);
            }
        } catch (error) {
            submit.disabled = false;
            handleError(error);
        }
    }

    async function deleteFolder(button, filter) {
        if (!confirmTwice(button, I18n.t("再点一次删除（记事会保留）"))) return;
        try {
            await api(`/folders/${filter}`, { method: 'DELETE' });
            state.folders = state.folders.filter(folder => folder.id !== filter);
            state.notes.forEach(note => {
                if (note.folderId === filter) note.folderId = null;
            });
            showNotification(I18n.t("文件夹已删除，里面的记事回到未归档"), 'success');
            location.hash = '#/';
        } catch (error) {
            handleError(error);
        }
    }

    // ---- 视图：查看 ----

    function renderNote(note) {
        setTitle(note.title);
        const { html, plain } = renderNoteContent(note.content, note.syntax);
        const publicUrl = note.publicId ? `${location.origin}/n/${note.publicId}` : '';
        const meta = [
            I18n.t("{0}修改", { 0: formatNoteTime(note.updatedAt) }),
            I18n.t("{0} 字", { 0: note.length.toLocaleString(I18n.locale) }),
            note.syntax === 'markdown' ? 'Markdown' : I18n.t("纯文本")
        ].join(' · ');

        const publish = note.publicId ? `
            <div class="note-public">
                <p class="note-public-hint"><i class="fas fa-globe"></i> ${I18n.html("已公开发布，拿到链接的人不用登录就能看到这条记事。")}</p>
                <div class="note-public-row">
                    <input type="text" class="form-input" readonly value="${escapeHtml(publicUrl)}" aria-label="${I18n.html("公开链接")}">
                    <button type="button" class="btn btn-secondary" data-action="copy-link"><i class="fas fa-copy"></i> ${I18n.html("复制链接")}</button>
                    <button type="button" class="btn btn-secondary" data-action="unpublish">${I18n.html("取消发布")}</button>
                </div>
            </div>` : '';

        app.innerHTML = `
            <div class="notes-bar">
                <a class="doc-back" href="${listHash(note.folderId)}"><i class="fas fa-arrow-left"></i>${note.folderId ? escapeHtml(folderName(note.folderId)) : I18n.t("记事本")}</a>
                <a class="btn btn-primary" href="#/n/${escapeHtml(note.id)}/edit"><i class="fas fa-pen"></i> ${I18n.html("编辑")}</a>
            </div>
            <p class="note-meta">${meta}</p>
            <article class="note-content${plain ? ' note-plain' : ''}">${html}</article>
            ${publish}
            <div class="note-tools">
                <label class="note-tools-field">
                    <span class="form-label">${I18n.html("文件夹")}</span>
                    <select class="form-select" data-action="move" aria-label="${I18n.html("移动到文件夹")}">${folderOptions(note.folderId)}</select>
                </label>
                <div class="note-tools-buttons">
                    <button type="button" class="btn btn-secondary" data-action="copy"><i class="fas fa-copy"></i> ${I18n.html("复制全文")}</button>
                    ${note.publicId ? '' : `<button type="button" class="btn btn-secondary" data-action="publish"><i class="fas fa-globe"></i> ${I18n.html("公开发布")}</button>`}
                    <button type="button" class="btn btn-secondary note-danger" data-action="delete"><i class="fas fa-trash"></i> ${I18n.html("删除")}</button>
                </div>
            </div>`;
    }

    // 查看视图的操作都要用到完整的记事，放在闭包里
    async function showNote(id) {
        const serial = routeSerial;
        renderLoading();
        let note;
        try {
            if (!state.loaded) await loadIndex();
            note = (await api(`/${id}`)).note;
        } catch (error) {
            if (serial !== routeSerial) return;
            if (error.status === 401) handleError(error);
            else renderMissing(error.message);
            return;
        }
        if (serial !== routeSerial) return;
        replaceNote(note);
        renderNote(note);

        const update = changed => {
            note = { ...note, ...changed };
            replaceNote(note);
            renderNote(note);
        };

        viewActions = {
            async move(select) {
                try {
                    const result = await api(`/${id}`, { method: 'PUT', body: { folderId: select.value || null } });
                    update(result.note);
                    showNotification(select.value ? I18n.t("已移到「{0}」", { 0: folderName(select.value) }) : I18n.t("已移到未归档"), 'success');
                } catch (error) {
                    select.value = note.folderId || '';
                    handleError(error);
                }
            },
            copy(button) {
                copyText(note.content)
                    .then(() => showNotification(I18n.t("全文已复制"), 'success'))
                    .catch(() => showNotification(I18n.t("复制失败，请手动复制"), 'error'));
            },
            async publish(button) {
                if (!confirmTwice(button, I18n.t("再点一次确认公开"))) return;
                try {
                    update((await api(`/${id}/publish`, { method: 'POST' })).note);
                    showNotification(I18n.t("已发布，链接在正文下面"), 'success');
                } catch (error) {
                    handleError(error);
                }
            },
            async unpublish(button) {
                if (!confirmTwice(button, I18n.t("再点一次取消发布"))) return;
                try {
                    update((await api(`/${id}/publish`, { method: 'DELETE' })).note);
                    showNotification(I18n.t("已取消发布，原来的链接失效了"), 'success');
                } catch (error) {
                    handleError(error);
                }
            },
            'copy-link'() {
                copyText(`${location.origin}/n/${note.publicId}`)
                    .then(() => showNotification(I18n.t("链接已复制"), 'success'))
                    .catch(() => showNotification(I18n.t("复制失败，请手动复制"), 'error'));
            },
            async delete(button) {
                if (!confirmTwice(button, I18n.t("再点一次删除"))) return;
                try {
                    await api(`/${id}`, { method: 'DELETE' });
                    state.notes = state.notes.filter(item => item.id !== id);
                    clearDraft(id);
                    showNotification(I18n.t("记事已删除"), 'success');
                    location.hash = listHash(note.folderId);
                } catch (error) {
                    handleError(error);
                }
            }
        };
    }

    let viewActions = {};

    // ---- 视图：编辑 ----

    function renderEditor() {
        const { id, content, syntax, folderId, restored } = editor;
        const isNew = id === NEW_NOTE;
        setTitle(isNew ? I18n.t("新建记事") : I18n.t("编辑记事"));
        app.innerHTML = `
            <form class="note-editor">
                <div class="notes-bar">
                    <button type="button" class="doc-back" data-action="cancel-edit"><i class="fas fa-arrow-left"></i>${I18n.html("返回")}</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> ${I18n.html("保存")}</button>
                </div>
                <div class="note-banner" id="noteBanner" hidden></div>
                <textarea class="form-textarea note-editor-text" name="content" spellcheck="false"
                    placeholder="${I18n.html("第一行会当作标题")}" aria-label="${I18n.html("记事内容")}"></textarea>
                <article class="note-content note-preview" hidden></article>
                <div class="note-editor-options">
                    <div class="option-chips" role="radiogroup" aria-label="${I18n.html("格式")}">
                        <label class="option-chip"><input type="radio" name="syntax" value="plain"${syntax === 'plain' ? ' checked' : ''}> ${I18n.html("纯文本")}</label>
                        <label class="option-chip"><input type="radio" name="syntax" value="markdown"${syntax === 'markdown' ? ' checked' : ''}> Markdown</label>
                        <label class="option-chip note-preview-toggle"><input type="checkbox" name="preview"> <i class="fas fa-eye"></i> ${I18n.html("预览")}</label>
                    </div>
                    <label class="note-tools-field">
                        <span class="form-label">${I18n.html("文件夹")}</span>
                        <select class="form-select" name="folderId" aria-label="${I18n.html("文件夹")}">${folderOptions(folderId)}</select>
                    </label>
                    <span class="note-count" aria-live="polite"></span>
                </div>
            </form>`;

        const form = app.querySelector('.note-editor');
        form.elements.content.value = content;
        if (restored) {
            showBanner(I18n.t("已恢复上次没保存的内容。"), isNew ? null : { label: I18n.t("丢弃，用云端的"), action: 'discard-draft' });
        }
        syncEditorUi();
        form.elements.content.focus();
    }

    function showBanner(text, button) {
        const banner = document.getElementById('noteBanner');
        banner.innerHTML = `<span>${escapeHtml(text)}</span>` +
            (button ? `<button type="button" class="tool-text-btn" data-action="${button.action}">${escapeHtml(button.label)}</button>` : '');
        banner.hidden = false;
    }

    // 预览开关只对 Markdown 有意义；字数跟着输入变
    function syncEditorUi() {
        const form = app.querySelector('.note-editor');
        const isMarkdown = form.elements.syntax.value === 'markdown';
        const previewToggle = form.querySelector('.note-preview-toggle');
        previewToggle.hidden = !isMarkdown;
        if (!isMarkdown) form.elements.preview.checked = false;

        const previewing = form.elements.preview.checked;
        const preview = form.querySelector('.note-preview');
        form.elements.content.hidden = previewing;
        preview.hidden = !previewing;
        if (previewing) preview.innerHTML = renderNoteContent(form.elements.content.value, 'markdown').html;

        form.querySelector('.note-count').textContent = I18n.t("{0} 字", { 0: form.elements.content.value.length.toLocaleString(I18n.locale) });
    }

    function readEditorForm() {
        const form = app.querySelector('.note-editor');
        return {
            content: form.elements.content.value,
            syntax: form.elements.syntax.value,
            folderId: form.elements.folderId.value || null
        };
    }

    const isDirty = () => {
        if (!editor) return false;
        const current = readEditorForm();
        return current.content !== editor.original.content ||
            current.syntax !== editor.original.syntax ||
            current.folderId !== editor.original.folderId;
    };

    // 没保存的内容随手记到本机，标签页被关掉、浏览器崩了也能找回来
    function scheduleDraftSave() {
        clearTimeout(editor.draftTimer);
        editor.draftTimer = setTimeout(saveDraftNow, DRAFT_SAVE_DELAY);
    }

    function saveDraftNow() {
        if (!editor) return;
        clearTimeout(editor.draftTimer);
        if (isDirty()) writeDraft(editor.id, readEditorForm());
        else clearDraft(editor.id);
    }

    async function showEditor(id, defaultFolderId) {
        const serial = routeSerial;
        renderLoading();
        let original = { content: '', syntax: 'plain', folderId: defaultFolderId || null };
        let baseUpdatedAt;
        try {
            if (!state.loaded) await loadIndex();
            if (id !== NEW_NOTE) {
                const { note } = await api(`/${id}`);
                original = { content: note.content, syntax: note.syntax, folderId: note.folderId };
                baseUpdatedAt = note.updatedAt;
            }
        } catch (error) {
            if (serial !== routeSerial) return;
            if (error.status === 401) handleError(error);
            else renderMissing(error.message);
            return;
        }
        if (serial !== routeSerial) return;
        if (original.folderId && !folderName(original.folderId)) original.folderId = null;

        const draft = readDraft(id);
        const restored = Boolean(draft && typeof draft.content === 'string' &&
            (draft.content !== original.content || draft.syntax !== original.syntax || draft.folderId !== original.folderId));
        const start = restored ? draft : original;
        editor = {
            id,
            original,
            baseUpdatedAt,
            restored,
            content: start.content,
            syntax: start.syntax === 'markdown' ? 'markdown' : 'plain',
            folderId: start.folderId && folderName(start.folderId) ? start.folderId : null,
            draftTimer: null,
            saving: false
        };
        renderEditor();
    }

    // 保存按钮的三种样子：平时、保存中（转圈）、刚保存完（对勾，过一会儿变回去）
    function setSaveButton(button, status) {
        const labels = {
            idle: `<i class="fas fa-check"></i> ${I18n.html("保存")}`,
            saving: `<i class="fas fa-spinner fa-spin"></i> ${I18n.html("保存中…")}`,
            saved: `<i class="fas fa-check"></i> ${I18n.html("已保存")}`
        };
        clearTimeout(button._savedTimer);
        button.innerHTML = labels[status];
        button.disabled = status === 'saving';
        button.classList.toggle('is-saved', status === 'saved');
        if (status === 'saved') {
            button._savedTimer = setTimeout(() => setSaveButton(button, 'idle'), SAVED_FEEDBACK_MS);
        }
    }

    // 保存后留在编辑页接着写。force：云端被别处改过时，用户选了覆盖
    async function saveEditor(force = false) {
        if (editor.saving) return;
        const session = editor;
        const saved = readEditorForm();
        if (!saved.content.trim()) {
            showNotification(I18n.t("内容不能为空"), 'error');
            return;
        }
        const submit = app.querySelector('.note-editor [type="submit"]');
        session.saving = true;
        setSaveButton(submit, 'saving');

        // 请求没有真实进度，页眉的进度条先走到一半，再慢慢往前蹭，回来后走满
        const progress = showHeaderProgress();
        let percent = 40;
        progress.update(percent);
        const creep = setInterval(() => {
            percent += (90 - percent) * 0.2;
            progress.update(percent);
        }, 200);

        try {
            let note;
            if (session.id === NEW_NOTE) {
                note = (await api('', { method: 'POST', body: saved })).note;
            } else {
                const body = { ...saved };
                if (!force) body.baseUpdatedAt = session.baseUpdatedAt;
                note = (await api(`/${session.id}`, { method: 'PUT', body })).note;
            }
            clearInterval(creep);
            progress.complete(true);
            session.saving = false;
            clearDraft(session.id);
            replaceNote(note);

            // 等结果的这会儿用户已经去了别的视图：数据存好了，界面不用管
            if (editor !== session) return;

            // 新建的记事有了 id：网址换成它的编辑地址。用 replaceState 不触发 hashchange，编辑器不重画
            if (session.id === NEW_NOTE) {
                session.id = note.id;
                history.replaceState(null, '', `#/n/${note.id}/edit`);
            }
            session.original = saved;
            session.baseUpdatedAt = note.updatedAt;
            session.restored = false;
            document.getElementById('noteBanner').hidden = true;
            setTitle(I18n.t("编辑记事"));
            setSaveButton(submit, 'saved');
            // 保存期间又打了字：这些还没存，照常留草稿
            scheduleDraftSave();
        } catch (error) {
            clearInterval(creep);
            progress.complete(false);
            session.saving = false;
            if (editor !== session) return;
            setSaveButton(submit, 'idle');
            if (error.code === 'NOTE_CONFLICT') {
                showBanner(I18n.t("这条记事在别处被改过。覆盖会丢掉那边的修改。"), { label: I18n.t("用我的覆盖"), action: 'force-save' });
                return;
            }
            handleError(error);
        }
    }

    function cancelEdit(button) {
        if (isDirty() && !confirmTwice(button, I18n.t("再点一次放弃修改"))) return;
        const { id, original } = editor;
        clearTimeout(editor.draftTimer);
        clearDraft(id);
        editor = null;
        location.hash = id === NEW_NOTE ? listHash(original.folderId) : `#/n/${id}`;
    }

    function discardDraft() {
        clearTimeout(editor.draftTimer);
        clearDraft(editor.id);
        Object.assign(editor, editor.original, { restored: false });
        renderEditor();
    }

    // ---- 路由 ----

    let currentFilter = 'all';

    function route() {
        // 离开编辑视图（比如按了浏览器的后退）前把草稿落盘
        if (editor) {
            saveDraftNow();
            editor = null;
        }
        routeSerial += 1;
        viewActions = {};

        if (!getToken()) {
            renderGate(I18n.t("记事本保存在云端，需要先登录。"));
            return;
        }

        const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
        window.scrollTo(0, 0);
        if (parts[0] === 'new') {
            showEditor(NEW_NOTE, currentFilter !== 'all' && currentFilter !== NO_FOLDER ? currentFilter : null);
        } else if (parts[0] === 'n' && parts[1]) {
            if (parts[2] === 'edit') showEditor(parts[1]);
            else showNote(parts[1]);
        } else {
            currentFilter = parts[0] === 'f' && parts[1] ? parts[1] : 'all';
            showList(currentFilter);
        }
    }

    // ---- 事件 ----

    app.addEventListener('click', e => {
        const target = e.target.closest('[data-action]');
        if (!target || target.tagName === 'SELECT') return;
        const action = target.dataset.action;
        switch (action) {
            case 'new-folder':
                renderList(currentFilter, { mode: 'new' });
                break;
            case 'rename-folder':
                renderList(currentFilter, { mode: 'rename' });
                break;
            case 'cancel-folder-form':
                renderList(currentFilter);
                break;
            case 'delete-folder':
                deleteFolder(target, currentFilter);
                break;
            case 'cancel-edit':
                cancelEdit(target);
                break;
            case 'discard-draft':
                discardDraft();
                break;
            case 'force-save':
                saveEditor(true);
                break;
            default:
                if (viewActions[action]) viewActions[action](target);
        }
    });

    app.addEventListener('change', e => {
        if (e.target.dataset.action === 'move') {
            viewActions.move?.(e.target);
            return;
        }
        if (editor && e.target.closest('.note-editor')) {
            syncEditorUi();
            scheduleDraftSave();
        }
    });

    app.addEventListener('input', e => {
        if (editor && e.target.name === 'content') {
            syncEditorUi();
            scheduleDraftSave();
        }
    });

    app.addEventListener('submit', e => {
        e.preventDefault();
        if (e.target.classList.contains('notes-folder-form')) submitFolderForm(e.target, currentFilter);
        else if (e.target.classList.contains('note-editor')) saveEditor();
    });

    document.addEventListener('keydown', e => {
        if (editor && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveEditor();
        }
    });

    // 草稿已经在本机，这里只是提醒一下还没传到云端
    window.addEventListener('beforelanguagechange', e => {
        if (!editor) return;
        if (editor.saving) {
            e.preventDefault();
            showNotification(I18n.t('请等待保存完成后再切换语言'), 'info');
            return;
        }
        saveDraftNow();
        if (isDirty() && JSON.stringify(readDraft(editor.id)) !== JSON.stringify(readEditorForm())) {
            e.preventDefault();
            showNotification(I18n.t('无法保存草稿，请先保存记事再切换语言'), 'error');
            return;
        }
        changingLanguage = true;
    });
    window.addEventListener('beforeunload', e => {
        if (!editor) return;
        saveDraftNow();
        if (isDirty() && !changingLanguage) e.preventDefault();
    });

    window.addEventListener('hashchange', route);
    // 在首页登录或退出后切回这个标签页，跟着变
    window.addEventListener('storage', e => {
        if (e.key === 'authToken' && !editor) route();
    });

    route();
})();
