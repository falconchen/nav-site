/**
 * /add：iOS 快捷指令「显示网页」浮层里的添加网站页
 *
 * 浮层和 Safari、主屏幕 PWA 的存储是隔离的，这里没有登录令牌，也没有本机收藏数据。
 * 快捷指令先调 POST /api/share/draft 换来带短时令牌的网址，页面拿令牌（X-Share-Token 头）
 * 走 /api/v1 直接写云端，流程和浏览器扩展的弹窗一样：analyze 预填 → 用户确认 → POST /websites。
 * 令牌只能调「添加网站」用到的几个接口，保存成功后作废。
 *
 * 页面没法自己关掉浮层，所以保存、取消之后都只提示用户点左上角关闭。
 */

const SHARE_TOKEN_KEY = 'shareToken';
const CLOSE_HINT = '点左上角 ✕ 关闭';
// 图标还在转存图床时，保存最多等这么久，等不到就用原地址（服务端保存时会再转存一次）
const ICON_UPLOAD_WAIT_MS = 5000;

// 降级原因翻成给用户看的话，和扩展弹窗一致
const WARNING_TEXT = {
    fetch_timeout: '网页加载超时',
    fetch_blocked: '网页拒绝了服务器访问',
    fetch_failed: '服务器没能打开网页',
    not_html: '这个网址不是网页',
    ai_unavailable: 'AI 不可用',
    ai_category_failed: 'AI 分类失败',
    ai_description_failed: 'AI 没能生成描述',
    ai_description_skipped: '没有网页内容，未生成描述'
};

const $ = (id) => document.getElementById(id);

let shareToken = '';
let categories = [];
let iconUrl = '';
let iconUpload = null;
// 自动填写可以重复点，只认最后一次的结果
let analyzeSerial = 0;

class ApiError extends Error {
    constructor(status, body) {
        super(body?.error || `请求失败（${status}）`);
        this.status = status;
        this.code = body?.code;
        this.body = body || {};
    }
}

function readShareToken() {
    // 头部内联脚本已经把网址里的 t 存好并从地址栏去掉；无痕模式下 sessionStorage 可能不可用，用内存里的那份
    if (window.__shareToken) return window.__shareToken;
    try {
        return sessionStorage.getItem(SHARE_TOKEN_KEY) || '';
    } catch {
        return '';
    }
}

function clearShareToken() {
    shareToken = '';
    window.__shareToken = '';
    try {
        sessionStorage.removeItem(SHARE_TOKEN_KEY);
    } catch {
        // 忽略
    }
}

async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch(`/api/v1${path}`, {
        method,
        headers: {
            'X-Share-Token': shareToken,
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        // 非 JSON 响应按失败处理
    }
    if (!response.ok) throw new ApiError(response.status, data);
    return data;
}

// 只认单个 http(s) 网址，和首页 ?add= 的规则一致
function parseHttpUrl(text) {
    const value = (text || '').trim();
    if (!value || value.length > 2048 || /\s/.test(value)) return null;
    if (!/^https?:\/\//i.test(value)) return null;
    try {
        new URL(value);
        return value;
    } catch {
        return null;
    }
}

function categoryName(id) {
    return categories.find((cat) => cat.id === id)?.name || id;
}

// ---------- 提示块 ----------

const MESSAGE_ICONS = {
    loading: 'fas fa-spinner fa-spin',
    success: 'fas fa-circle-check',
    info: 'fas fa-circle-info',
    error: 'fas fa-triangle-exclamation'
};

// 显示提示并收起表单；页面关不掉浮层，结束状态都带上「点左上角关闭」
function showMessage(type, text, hint = '') {
    const box = $('addMessage');
    box.dataset.type = type;
    box.hidden = false;
    $('addMessageIcon').className = MESSAGE_ICONS[type];
    $('addMessageText').textContent = text;
    $('addMessageHint').textContent = hint;
    $('addMessageHint').hidden = !hint;
    $('addForm').hidden = true;
}

function showForm() {
    $('addMessage').hidden = true;
    $('addForm').hidden = false;
}

// 401 / 403 是令牌过期、已用过或无效；其它错误照原样提示
function showError(error) {
    if (error?.status === 401 || error?.status === 403) {
        clearShareToken();
        showMessage('error', '链接已过期', '请重新从共享菜单运行快捷指令');
        return;
    }
    if (error?.code === 'NO_CLOUD_DATA') {
        showMessage('error', '云端还没有收藏数据', '请先在浏览器里登录导航站并同步一次');
        return;
    }
    if (error?.status === 429) {
        showMessage('error', '操作太频繁了', '请稍后再试');
        return;
    }
    showMessage('error', error instanceof ApiError ? error.message : '网络出了点问题', '请稍后重新运行快捷指令');
}

function showDuplicate(site) {
    showMessage('info', `这个网址已经收录在「${categoryName(site.category)}」里了`, CLOSE_HINT);
}

// ---------- 图标 ----------

function renderIcon() {
    const tile = $('addIconTile');
    if (tile.dataset.state === 'uploading') return;

    if (!iconUrl) {
        tile.dataset.state = 'letter';
        tile.innerHTML = letterIconHTML($('addTitle').value, $('addUrl').value);
        $('addIconHint').textContent = '用标题首字 · 点击图标上传图片';
        return;
    }
    tile.dataset.state = 'image';
    tile.innerHTML = `<img src="${escapeHtml(iconUrl)}" alt="网站图标">`;
    $('addIconHint').innerHTML = '点击图标更换 · <button type="button" class="icon-link" id="addIconRemove">改用首字图标</button>';
}

function setIcon(url) {
    iconUrl = url || '';
    iconUpload = null;
    $('addIconTile').dataset.state = '';
    renderIcon();
}

// 自动填写拿到的远程图标在后台转存图床（压成 WebP），成功后换成图床地址。
// 失败就保留原地址，保存时服务端还会再试一次
function startIconRehost(remoteUrl) {
    const upload = uploadIconFromUrl(remoteUrl)
        .then((url) => {
            if (iconUrl !== remoteUrl) return;
            iconUrl = url;
            renderIcon();
        })
        .catch((error) => console.warn('图标转存图床失败，保存时由服务端再试：', error));
    iconUpload = upload;
}

async function handleIconFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        showNotification('请选择图片文件', 'error');
        return;
    }

    const tile = $('addIconTile');
    tile.dataset.state = 'uploading';
    tile.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    $('addIconHint').textContent = '正在上传图标…';

    try {
        const { url } = await uploadIconFile(file);
        setIcon(url);
    } catch (error) {
        console.error('图标上传失败:', error);
        showNotification(`图标上传失败: ${error.message}`, 'error');
        tile.dataset.state = '';
        renderIcon();
    }
}

// ---------- 表单 ----------

// 私密收藏不进特别关注、描述本来就遮住，另外两项一起禁用，与网页端一致
function syncPrivate() {
    const isPrivate = $('addPrivate').checked;
    for (const id of ['addPinned', 'addHideDescription']) {
        const input = $(id);
        input.disabled = isPrivate;
        if (isPrivate) input.checked = false;
        input.closest('.option-chip').classList.toggle('disabled', isPrivate);
    }
}

function renderCategories() {
    $('addCategory').replaceChildren(
        new Option('请选择分类', ''),
        ...categories.map((cat) => new Option(cat.name, cat.id))
    );
}

function fillForm({ website, analysis }) {
    $('addTitle').value = website.title || '';
    $('addDescription').value = website.description || '';
    $('addCategory').value = website.category || '';
    setIcon(website.imageData);
    if (website.imageData) startIconRehost(website.imageData);

    // 分类不是 AI 有把握给出的，提醒用户确认
    const notes = [];
    const source = analysis?.sources?.category;
    if (source === 'domain') {
        notes.push(`AI 没把握，按同域名已收藏的网址归到了「${categoryName(website.category)}」，请确认`);
    } else if (source === 'fallback') {
        notes.push('AI 没能判断分类，请确认');
    }
    notes.push(...(analysis?.warnings || []).map((code) => WARNING_TEXT[code]).filter(Boolean));
    $('addNotice').textContent = notes.join('；');
    $('addNotice').hidden = notes.length === 0;
}

/**
 * 抓网页并预填表单。已收录时直接结束；分析失败（不是令牌问题）不挡路，留给用户手填
 *
 * @returns {Promise<boolean>} false 表示页面已切到结束状态，不用再显示表单
 */
async function analyze(url) {
    const serial = ++analyzeSerial;
    const button = $('addAnalyzeBtn');
    button.disabled = true;
    button.classList.add('loading');
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 识别中';

    try {
        const result = await api('/websites/analyze', { method: 'POST', body: { url } });
        if (serial !== analyzeSerial) return true;
        if (result.duplicate) {
            showDuplicate(result.duplicate);
            return false;
        }
        fillForm(result);
        return true;
    } catch (error) {
        if (serial !== analyzeSerial) return true;
        if (error.status === 401 || error.status === 403 || error.code === 'NO_CLOUD_DATA') {
            showError(error);
            return false;
        }
        console.error('自动填写失败:', error);
        showNotification(error.status === 429 ? '自动填写太频繁了，请手动填写' : '自动填写失败，请手动填写', 'error');
        return true;
    } finally {
        if (serial === analyzeSerial) {
            button.disabled = false;
            button.classList.remove('loading');
            button.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> 自动填写';
        }
    }
}

async function save(event) {
    event.preventDefault();

    const url = parseHttpUrl($('addUrl').value);
    if (!url) {
        showNotification('网址要以 http:// 或 https:// 开头', 'error');
        return;
    }

    const button = $('addSaveBtn');
    button.disabled = true;
    button.textContent = '保存中…';

    try {
        if (iconUpload) {
            await Promise.race([iconUpload, new Promise((resolve) => setTimeout(resolve, ICON_UPLOAD_WAIT_MS))]);
        }
        const { website } = await api('/websites', {
            method: 'POST',
            body: {
                url,
                title: $('addTitle').value.trim(),
                category: $('addCategory').value,
                description: $('addDescription').value.trim(),
                imageData: iconUrl || undefined,
                pinned: $('addPinned').checked,
                private: $('addPrivate').checked,
                hideDescription: $('addHideDescription').checked
            }
        });
        // 服务端已经把令牌作废了，本机这份也不留
        clearShareToken();
        const note = website.private ? '，只在私密收藏中显示' : '';
        showMessage('success', `已保存到「${categoryName(website.category)}」${note}`, CLOSE_HINT);
    } catch (error) {
        if (error.code === 'DUPLICATE') {
            showDuplicate(error.body.website);
        } else if (error.status === 400) {
            // 字段不合法（比如图标太大），留在表单里让用户改
            showNotification(`保存失败：${error.message}`, 'error');
        } else {
            showError(error);
        }
    } finally {
        button.disabled = false;
        button.textContent = '保存';
    }
}

function bindForm() {
    $('addForm').addEventListener('submit', save);
    $('addPrivate').addEventListener('change', syncPrivate);
    $('addCancelBtn').addEventListener('click', () => showNotification(`没有保存，${CLOSE_HINT}`, 'info'));

    $('addAnalyzeBtn').addEventListener('click', async () => {
        const url = parseHttpUrl($('addUrl').value);
        if (!url) {
            showNotification('网址要以 http:// 或 https:// 开头', 'error');
            return;
        }
        await analyze(url);
    });

    // 没有图片时首字图标跟着标题、网址变
    for (const id of ['addTitle', 'addUrl']) {
        $(id).addEventListener('input', () => { if (!iconUrl) renderIcon(); });
    }

    $('addIconTile').addEventListener('click', () => $('addIconFile').click());
    $('addIconFile').addEventListener('change', (event) => {
        const [file] = event.target.files;
        event.target.value = '';
        if (file) handleIconFile(file);
    });
    $('addIconHint').addEventListener('click', (event) => {
        if (event.target.id === 'addIconRemove') setIcon('');
    });
}

async function init() {
    const url = parseHttpUrl(new URLSearchParams(location.search).get('url'));
    shareToken = readShareToken();

    // 没有令牌：不是从新快捷指令来的（比如在 Safari 里直接打开），交给首页的 ?add= 流程，那边用的是登录状态
    if (!shareToken) {
        location.replace(url ? `/?add=${encodeURIComponent(url)}` : '/');
        return;
    }
    if (!url) {
        showMessage('error', '链接里的网址无效', '只能收藏 http:// 或 https:// 开头的网址');
        return;
    }

    bindForm();
    $('addUrl').value = url;

    try {
        // 账号和分类先拿到：显示存进哪个账号，令牌无效也在这一步发现
        const [me, categoryList] = await Promise.all([api('/me'), api('/categories')]);
        categories = categoryList.categories || [];

        const account = me.user?.name || me.user?.login;
        if (account) {
            $('addAccount').textContent = account;
            $('addAccount').hidden = false;
        }
        if (categories.length === 0) {
            showError({ code: 'NO_CLOUD_DATA' });
            return;
        }
        renderCategories();
        setIcon('');
        syncPrivate();

        if (await analyze(url)) showForm();
    } catch (error) {
        showError(error);
    }
}

init();
