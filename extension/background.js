/**
 * 右键菜单一键收藏：只传 url 和 hints，由服务端 AI 补全，完成后用系统通知告知结果
 */

import { createClient, describeError, loadSettings } from './lib/api.js';
import { getPageHints, isSavableUrl } from './lib/page.js';

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

async function quickSave(url, hints) {
    const settings = await loadSettings();
    if (!settings.serverUrl || !settings.token) {
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
        notify(
            `已收藏到「${name}」`,
            unsure ? `${website.title}\nAI 没能确定分类，可以在导航站调整` : website.title
        );
    } catch (error) {
        if (error.code === 'DUPLICATE') {
            notify('已经收藏过了', error.body.website?.title || url);
            return;
        }
        notify('收藏失败', describeError(error));
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_PAGE) {
        if (!tab || !isSavableUrl(tab.url)) {
            notify('收藏失败', '只能收藏 http/https 网页');
            return;
        }
        await quickSave(tab.url, await getPageHints(tab));
        return;
    }

    if (info.menuItemId === MENU_LINK) {
        if (!isSavableUrl(info.linkUrl)) {
            notify('收藏失败', '只能收藏 http/https 链接');
            return;
        }
        // 链接指向的页面没打开，拿不到 hints，全靠服务端抓取
        await quickSave(info.linkUrl, {});
    }
});
