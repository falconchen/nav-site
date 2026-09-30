import { ext } from './lib/ext.js';
import { createClient, describeError, loadSettings } from './lib/api.js';
import { getPageHints, isSavableUrl } from './lib/page.js';
import { createLetterIcon } from './lib/letter-icon.js';
import { uploadIconToPhotoHost } from './lib/icon-upload.js';

const $ = (id) => document.getElementById(id);

// 降级原因翻成给用户看的话，只挑会影响用户判断的
const WARNING_TEXT = {
    fetch_timeout: '网页加载超时',
    fetch_blocked: '网页拒绝了服务器访问',
    fetch_failed: '服务器没能打开网页',
    not_html: '这个网址不是网页',
    content_thin: '网页正文太少，用了你看到的页面内容',
    ai_unavailable: 'AI 不可用',
    ai_category_failed: 'AI 分类失败',
    ai_description_failed: 'AI 没能生成描述',
    ai_description_skipped: '没有网页内容，未生成描述'
};

const DONE_CLOSE_DELAY_MS = 1200;

let client;
let tab;
let categories = [];
let suggestion = null;
let serverUrl = '';
// 弹窗打开后在后台转存图标，保存时先等它（最多等 ICON_UPLOAD_WAIT_MS）
let iconUpload = null;
const ICON_UPLOAD_WAIT_MS = 5000;

function show(viewId) {
    for (const view of document.querySelectorAll('.view')) {
        view.hidden = view.id !== viewId;
    }
}

function showMessage(text, action) {
    $('messageText').textContent = text;
    const button = $('messageAction');
    button.hidden = !action;
    if (action) {
        button.textContent = action.label;
        button.onclick = action.onClick;
    }
    show('viewMessage');
}

const openOptions = () => ext.runtime.openOptionsPage();

function showError(error) {
    const needsSettings = error?.status === 401;
    showMessage(describeError(error), needsSettings ? { label: '打开设置', onClick: openOptions } : null);
}

function categoryName(id) {
    return categories.find((cat) => cat.id === id)?.name || id;
}

// 有图片显示图片，没有或加载失败时显示首字图标（和导航站卡片一样）
function setIcon(box, src, title, url) {
    const letter = () => createLetterIcon(title, url);
    if (!src) {
        box.replaceChildren(letter());
        return;
    }
    const img = new Image();
    img.alt = '';
    img.addEventListener('error', () => box.replaceChildren(letter()), { once: true });
    img.src = src;
    box.replaceChildren(img);
}

function renderDuplicate(site) {
    $('dupCategory').textContent = categoryName(site.category);
    $('dupTitle').textContent = site.title;
    // 私密收藏的描述可能带密钥，弹窗里也不直接显示
    // 描述里可能记着账号密码，私密和隐藏描述的网站在弹窗里也不显示
    $('dupDesc').textContent = site.private ? '私密收藏，描述已隐藏'
        : site.hideDescription ? '描述已隐藏' : site.description || '';
    setIcon($('dupIcon'), site.imageData, site.title, site.url);
    show('viewDuplicate');
}

// 重复收藏时把收藏时间刷新成现在，方便在「最近添加」里找到。失败不影响弹窗
async function touchDuplicate() {
    try {
        await client.touch(tab.url);
        $('dupTouched').hidden = false;
    } catch {
        // 忽略
    }
}

function renderForm({ website, analysis }) {
    const select = $('category');
    select.replaceChildren(...categories.map((cat) => new Option(cat.name, cat.id)));
    select.value = website.category;

    $('title').value = website.title;
    $('description').value = website.description;
    $('pinned').checked = false;
    $('private').checked = false;
    $('hideDescription').checked = false;
    syncPrivate();
    setIcon($('iconPreview'), website.imageData, website.title, tab.url);

    // 分类不是 AI 有把握给出的，提醒用户确认
    const notice = $('categoryNotice');
    const source = analysis.sources.category;
    notice.hidden = source === 'ai';
    if (source === 'domain') {
        notice.textContent = `AI 没把握，按同域名已收藏的网址归到了「${categoryName(website.category)}」，请确认`;
    } else if (source === 'fallback') {
        notice.textContent = 'AI 没能判断分类，请选择一个';
    }

    const reasons = analysis.warnings.map((code) => WARNING_TEXT[code]).filter(Boolean);
    $('warnings').hidden = reasons.length === 0;
    $('warnings').textContent = reasons.join('；');

    show('viewForm');
    $('title').focus();

    if (website.imageData) startIconUpload(website.imageData);
}

// 图标一拿到就转存图床，成功后预览换成图床地址，保存时直接用。
// 失败就保留原地址，保存时服务端还会再试一次
function startIconUpload(src) {
    iconUpload = uploadIconToPhotoHost(serverUrl, src)
        .then((url) => {
            if (suggestion?.website.imageData !== src) return;
            suggestion.website.imageData = url;
            setIcon($('iconPreview'), url, $('title').value, tab.url);
        })
        .catch((error) => console.warn('图标转存图床失败，保存时由服务端再试：', error));
}

async function save(event) {
    event.preventDefault();
    const button = $('saveBtn');
    button.disabled = true;
    button.textContent = '保存中…';

    try {
        // 图标还在上传就等一会儿，等不到就先用原地址保存
        if (iconUpload) {
            await Promise.race([iconUpload, new Promise((resolve) => setTimeout(resolve, ICON_UPLOAD_WAIT_MS))]);
        }
        const { website } = await client.save({
            url: tab.url,
            title: $('title').value.trim(),
            category: $('category').value,
            description: $('description').value.trim(),
            imageData: suggestion.website.imageData || undefined,
            pinned: $('pinned').checked,
            private: $('private').checked,
            hideDescription: $('hideDescription').checked
        });
        const note = website.private ? '，只在私密收藏中显示' : '';
        showMessage(`已保存到「${categoryName(website.category)}」${note}`);
        setTimeout(() => window.close(), DONE_CLOSE_DELAY_MS);
    } catch (error) {
        if (error.code === 'DUPLICATE') {
            renderDuplicate(error.body.website);
            touchDuplicate();
            return;
        }
        showError(error);
    } finally {
        button.disabled = false;
        button.textContent = '保存';
    }
}

// 私密收藏不进特别关注，与网页端一致
function syncPrivate() {
    const isPrivate = $('private').checked;
    // 私密网站不进特别关注，描述也本来就遮住，这两项一起禁用
    for (const id of ['pinned', 'hideDescription']) {
        $(id).disabled = isPrivate;
        if (isPrivate) $(id).checked = false;
    }
}

async function remove() {
    const button = $('removeBtn');
    // 点两次才删，防止误触
    if (!button.dataset.confirming) {
        button.dataset.confirming = '1';
        button.textContent = '确认移除';
        return;
    }

    button.disabled = true;
    try {
        await client.remove(tab.url);
        showMessage('已从导航站移除');
        setTimeout(() => window.close(), DONE_CLOSE_DELAY_MS);
    } catch (error) {
        showError(error);
    }
}

async function init() {
    $('openOptions').addEventListener('click', openOptions);
    $('viewForm').addEventListener('submit', save);
    $('removeBtn').addEventListener('click', remove);
    $('private').addEventListener('change', syncPrivate);
    // 没有图片时预览的首字跟着标题变
    $('title').addEventListener('input', () => {
        if (suggestion && !suggestion.website.imageData) {
            setIcon($('iconPreview'), '', $('title').value, tab.url);
        }
    });

    const settings = await loadSettings();
    if (!settings.serverUrl || !settings.token) {
        showMessage('还没有设置导航站地址和个人令牌。', { label: '去设置', onClick: openOptions });
        return;
    }
    client = createClient(settings);
    serverUrl = settings.serverUrl;

    [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (!tab || !isSavableUrl(tab.url)) {
        showMessage('只能收藏 http/https 网页。');
        return;
    }

    try {
        const hints = await getPageHints(tab);
        const [categoryList, result] = await Promise.all([
            client.categories(),
            client.analyze({ url: tab.url, hints })
        ]);
        categories = categoryList.categories;

        if (result.duplicate) {
            renderDuplicate(result.duplicate);
            touchDuplicate();
            return;
        }
        suggestion = result;
        renderForm(result);
    } catch (error) {
        showError(error);
    }
}

init();
