/**
 * 右键菜单一键收藏：只传 url 和 hints，由服务端 AI 补全
 *
 * 保存要跑 AI，要等好几秒。进度和结果画在网页右上角（lib/toast.js），工具栏图标同时挂角标；
 * 网页不让注入脚本时才退回系统通知，macOS 上 Chrome 的系统通知经常被关掉，不能只靠它。
 */

import { createClient, describeError, loadSettings } from './lib/api.js';
import { getPageHints, isSavableUrl } from './lib/page.js';
import { renderToast } from './lib/toast.js';

const MENU_PAGE = 'save-page';
const MENU_LINK = 'save-link';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    // 更新扩展时也会触发，菜单还在，先清空再建，避免重复 id 报错
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({ id: MENU_PAGE, title: '一键收藏到皮皮2047', contexts: ['page'] });
    chrome.contextMenus.create({ id: MENU_LINK, title: '一键收藏此链接到皮皮2047', contexts: ['link'] });

    if (reason === 'install') {
        const { serverUrl, token } = await loadSettings();
        if (!serverUrl || !token) chrome.runtime.openOptionsPage();
    }
});

function notify(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title,
        message
    });
}

const BADGE = {
    loading: { text: '…', color: '#4f46e5' },
    success: { text: '✓', color: '#059669' },
    error: { text: '!', color: '#dc2626' }
};
const BADGE_CLEAR_DELAY_MS = 5000;

async function setBadge(tabId, state) {
    if (!tabId) return;
    try {
        const { text, color } = BADGE[state];
        await chrome.action.setBadgeBackgroundColor({ tabId, color });
        await chrome.action.setBadgeText({ tabId, text });
        // 成功的角标过一会儿清掉；失败的留着，等用户切走或刷新标签页
        if (state === 'success') {
            setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), BADGE_CLEAR_DELAY_MS);
        }
    } catch {
        // 标签页已经关了
    }
}

/**
 * 在发起收藏的标签页上报告进度和结果
 */
function createReporter(tabId) {
    let toastWorks = Boolean(tabId);

    return async function report(state, title, message = '') {
        setBadge(tabId, state);
        if (toastWorks) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    func: renderToast,
                    args: [state, title, message]
                });
                return;
            } catch (error) {
                // chrome://、应用商店等页面不允许注入，或者标签页已经关了
                console.warn('无法在页面上显示提示，改用系统通知：', error);
                toastWorks = false;
            }
        }
        if (state !== 'loading') notify(title, message);
    };
}

async function quickSave(url, hints, report) {
    const settings = await loadSettings();
    if (!settings.serverUrl || !settings.token) {
        await report('error', '还没有设置导航站', '请在打开的设置页里填写导航站地址和个人令牌');
        chrome.runtime.openOptionsPage();
        return;
    }

    const client = createClient(settings);
    try {
        const [{ website, analysis }, { categories }] = await Promise.all([
            client.save({ url, hints }),
            client.categories()
        ]);
        const name = categories.find((cat) => cat.id === website.category)?.name || website.category;
        const unsure = ['domain', 'fallback'].includes(analysis.sources.category);
        await report(
            'success',
            `已收藏到「${name}」`,
            unsure ? `${website.title}\nAI 没能确定分类，可以在导航站调整` : website.title
        );
    } catch (error) {
        if (error.code === 'DUPLICATE') {
            await report('success', '已经收藏过了', error.body.website?.title || url);
            return;
        }
        await report('error', '收藏失败', describeError(error));
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const report = createReporter(tab?.id);

    if (info.menuItemId === MENU_PAGE) {
        if (!tab || !isSavableUrl(tab.url)) {
            await report('error', '收藏失败', '只能收藏 http/https 网页');
            return;
        }
        await report('loading', '正在收藏…', 'AI 正在识别名称、分类和描述，大约需要几秒');
        await quickSave(tab.url, await getPageHints(tab), report);
        return;
    }

    if (info.menuItemId === MENU_LINK) {
        if (!isSavableUrl(info.linkUrl)) {
            await report('error', '收藏失败', '只能收藏 http/https 链接');
            return;
        }
        await report('loading', '正在收藏链接…', 'AI 正在识别名称、分类和描述，大约需要几秒');
        // 链接指向的页面没打开，拿不到 hints，全靠服务端抓取
        await quickSave(info.linkUrl, {}, report);
    }
});
