/**
 * 右键菜单收藏：打开和点工具栏图标一样的收藏弹窗，由用户确认名称、分类、描述后再保存
 *
 * 以前是「一键收藏」：点了直接保存，名称、分类、描述全凭 AI，用户没有确认和修改的机会，存错了还得回导航站改。
 * 现在不再有不经确认的保存。弹窗打不开时在网页右上角提示（lib/toast.js），网页不让注入脚本时退回系统通知。
 */

import { ext } from './lib/ext.js';
import { loadSettings } from './lib/api.js';
import { renderToast } from './lib/toast.js';

const MENU_PAGE = 'save-page';
const MENU_LINK = 'save-link';

ext.runtime.onInstalled.addListener(async ({ reason }) => {
    // 更新扩展时也会触发，菜单还在，先清空再建，避免重复 id 报错
    await ext.contextMenus.removeAll();
    ext.contextMenus.create({ id: MENU_PAGE, title: '收藏到皮皮2047', contexts: ['page'] });
    ext.contextMenus.create({ id: MENU_LINK, title: '收藏此链接到皮皮2047', contexts: ['link'] });

    if (reason === 'install') {
        const { serverUrl, token } = await loadSettings();
        if (!serverUrl || !token) ext.runtime.openOptionsPage();
    }
});

function notify(title, message) {
    ext.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title,
        message
    });
}

// 弹窗没打开时在工具栏图标上挂个角标，留到用户切走或刷新标签页
async function setErrorBadge(tabId) {
    if (!tabId) return;
    try {
        await ext.action.setBadgeBackgroundColor({ tabId, color: '#b3261e' });
        await ext.action.setBadgeText({ tabId, text: '!' });
    } catch {
        // 标签页已经关了
    }
}

/**
 * 在发起收藏的标签页上报告错误
 */
async function reportError(tabId, title, message) {
    setErrorBadge(tabId);
    if (tabId) {
        try {
            await ext.scripting.executeScript({
                target: { tabId },
                func: renderToast,
                args: ['error', title, message]
            });
            return;
        } catch (error) {
            // chrome://、应用商店等页面不允许注入，或者标签页已经关了
            console.warn('无法在页面上显示提示，改用系统通知：', error);
        }
    }
    notify(title, message);
}

// 「收藏此链接」要收藏的不是当前标签页：先记在这里，弹窗打开后来取（take-link-target）。
// 只在点菜单到弹窗打开的这一小会儿有效，过期的不给，免得之后点工具栏图标打开弹窗时收藏成上次的链接
let pendingLink = null;
const PENDING_LINK_TTL_MS = 5000;

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'take-link-target') return;
    const fresh = pendingLink && Date.now() - pendingLink.at < PENDING_LINK_TTL_MS;
    sendResponse({ url: fresh ? pendingLink.url : '' });
    pendingLink = null;
});

ext.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_PAGE && info.menuItemId !== MENU_LINK) return;

    pendingLink = info.menuItemId === MENU_LINK ? { url: info.linkUrl || '', at: Date.now() } : null;

    // Firefox 要求 openPopup() 在用户操作的处理函数里同步调用，前面不能有 await
    let opening;
    try {
        opening = ext.action.openPopup();
    } catch (error) {
        opening = Promise.reject(error);
    }
    Promise.resolve(opening).catch((error) => {
        // 旧版 Chrome（127 之前）不让普通扩展调 openPopup()，窗口没有焦点、已经开着别的弹窗时也会失败
        console.warn('打不开收藏弹窗：', error);
        pendingLink = null;
        reportError(tab?.id, '没能打开收藏窗口', '请点工具栏上的扩展图标收藏');
    });
});
