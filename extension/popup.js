import { createClient, describeError, loadSettings } from './lib/api.js';
import { getPageHints, isSavableUrl } from './lib/page.js';

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

const openOptions = () => chrome.runtime.openOptionsPage();

function showError(error) {
    const needsSettings = error?.status === 401;
    showMessage(describeError(error), needsSettings ? { label: '打开设置', onClick: openOptions } : null);
}

function categoryName(id) {
    return categories.find((cat) => cat.id === id)?.name || id;
}

function setIcon(img, src) {
    img.hidden = !src;
    if (src) img.src = src;
}

function renderDuplicate(site) {
    $('dupCategory').textContent = categoryName(site.category);
    $('dupTitle').textContent = site.title;
    $('dupDesc').textContent = site.description || '';
    setIcon($('dupIcon'), site.imageData);
    show('viewDuplicate');
}

function renderForm({ website, analysis }) {
    const select = $('category');
    select.replaceChildren(...categories.map((cat) => new Option(cat.name, cat.id)));
    select.value = website.category;

    $('title').value = website.title;
    $('description').value = website.description;
    $('pinned').checked = false;
    setIcon($('iconPreview'), website.imageData);

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
}

async function save(event) {
    event.preventDefault();
    const button = $('saveBtn');
    button.disabled = true;
    button.textContent = '保存中…';

    try {
        const { website } = await client.save({
            url: tab.url,
            title: $('title').value.trim(),
            category: $('category').value,
            description: $('description').value.trim(),
            imageData: suggestion.website.imageData || undefined,
            pinned: $('pinned').checked
        });
        showMessage(`已保存到「${categoryName(website.category)}」`);
        setTimeout(() => window.close(), DONE_CLOSE_DELAY_MS);
    } catch (error) {
        if (error.code === 'DUPLICATE') {
            renderDuplicate(error.body.website);
            return;
        }
        showError(error);
    } finally {
        button.disabled = false;
        button.textContent = '保存';
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

    const settings = await loadSettings();
    if (!settings.serverUrl || !settings.token) {
        showMessage('还没有设置导航站地址和个人令牌。', { label: '去设置', onClick: openOptions });
        return;
    }
    client = createClient(settings);

    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
            return;
        }
        suggestion = result;
        renderForm(result);
    } catch (error) {
        showError(error);
    }
}

init();
