// 剪贴板网址识别：页面加载或切回前台时读剪贴板，是没收录过的网址就弹「添加网站」并自动填写
// 只有 Chromium 系能在无点击时读剪贴板（首次弹权限框），Firefox / Safari 不支持，菜单项直接隐藏。
// 默认关闭，用户在账户菜单里打开；开关只存本机 localStorage

const CLIPBOARD_WATCH_KEY = 'clipboardWatch';
const CLIPBOARD_LAST_KEY = 'lastClipboardUrl'; // 上次提示过的内容，同一段不再弹，保存或取消都算

let clipboardCheckTimer = null;
let clipboardChecking = false;

function isClipboardWatchEnabled() {
    return localStorage.getItem(CLIPBOARD_WATCH_KEY) === '1';
}

// 'granted' / 'prompt' / 'denied'，浏览器不支持时返回 null
async function queryClipboardPermission() {
    if (!navigator.clipboard?.readText || !navigator.permissions?.query) return null;
    try {
        const status = await navigator.permissions.query({ name: 'clipboard-read' });
        return status.state;
    } catch (e) {
        return null;
    }
}

// 用户正在做别的事时不打断
function isUserBusy() {
    if (document.querySelector('.modal-overlay.active, .version-selection-modal, .context-menu.active, #categorySheet.active')) {
        return true;
    }
    const active = document.activeElement;
    return !!active && active.matches('input:not(.search-box), textarea, [contenteditable="true"]');
}

async function checkClipboardForUrl() {
    if (clipboardChecking || !isClipboardWatchEnabled()) return;
    if (document.visibilityState !== 'visible' || !document.hasFocus() || isUserBusy()) return;

    clipboardChecking = true;
    try {
        // 权限还没给时不在这里请求：无点击时弹权限框很突兀，开关打开那一下已经请求过
        if (await queryClipboardPermission() !== 'granted') return;

        const url = parseHttpUrl(await navigator.clipboard.readText());
        if (!url || url === localStorage.getItem(CLIPBOARD_LAST_KEY)) return;
        localStorage.setItem(CLIPBOARD_LAST_KEY, url);

        if (isUrlCollected(url) || isUserBusy()) return;
        openAddWebsiteWithUrl(url, '已从剪贴板识别到网址');
    } catch (e) {
        // 页面失焦、权限被收回等都会抛错，静默跳过
    } finally {
        clipboardChecking = false;
    }
}

// focus 和 visibilitychange 常常一起来，合并成一次
function scheduleClipboardCheck() {
    clearTimeout(clipboardCheckTimer);
    clipboardCheckTimer = setTimeout(checkClipboardForUrl, 300);
}

function syncClipboardMenuItems() {
    const enabled = isClipboardWatchEnabled();
    document.querySelectorAll('.clipboard-menu-item').forEach(item => {
        item.querySelector('.menu-item-state').textContent = enabled ? '开' : '关';
        item.classList.toggle('is-on', enabled);
    });
}

// 菜单项点击（有用户手势），打开时顺带请求权限
async function toggleClipboardWatch() {
    if (isClipboardWatchEnabled()) {
        localStorage.removeItem(CLIPBOARD_WATCH_KEY);
        syncClipboardMenuItems();
        showNotification('已关闭剪贴板网址识别', 'info');
        return;
    }

    if (await queryClipboardPermission() === 'denied') {
        showNotification('浏览器已禁止本站读取剪贴板，请在地址栏左侧的网站设置里允许', 'error');
        return;
    }

    try {
        // 手势内调用一次，Chrome 在这里弹权限框
        const text = await navigator.clipboard.readText();
        // 打开时剪贴板里已有的内容不弹，免得刚打开就冒出弹窗
        const url = parseHttpUrl(text);
        if (url) localStorage.setItem(CLIPBOARD_LAST_KEY, url);
    } catch (e) {
        showNotification('没有获得读取剪贴板的权限', 'error');
        return;
    }

    localStorage.setItem(CLIPBOARD_WATCH_KEY, '1');
    syncClipboardMenuItems();
    showNotification('已开启：复制网址后切回本页，会自动弹出添加网站', 'success');
}

document.addEventListener('DOMContentLoaded', async () => {
    // 浏览器不支持就不显示开关
    if (await queryClipboardPermission() === null) return;

    document.querySelectorAll('.clipboard-menu-item').forEach(item => { item.hidden = false; });
    syncClipboardMenuItems();

    if (window.dataLoaded) await window.dataLoaded;
    window.addEventListener('focus', scheduleClipboardCheck);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleClipboardCheck();
    });
    scheduleClipboardCheck();
});
