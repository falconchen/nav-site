/**
 * 从当前标签页拿收藏需要的信息
 */

// 注入到网页里执行，只能用网页自己的 DOM，不能引用外部变量
function collectHints() {
    const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
    const text = (document.body && document.body.innerText) || '';
    return {
        title: document.title,
        description: meta ? meta.getAttribute('content') || '' : '',
        content: text.replace(/\s+/g, ' ').trim().slice(0, 3000)
    };
}

export function isSavableUrl(url) {
    return /^https?:\/\//i.test(url || '');
}

/**
 * 取 hints。chrome:// 页面、应用商店等不允许注入脚本，这时只用标签页自带的标题和图标
 */
export async function getPageHints(tab) {
    const hints = { title: tab.title || '', icon: tab.favIconUrl || '' };
    try {
        const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: collectHints
        });
        if (injection && injection.result) Object.assign(hints, injection.result);
    } catch (error) {
        console.warn('无法读取页面内容，只用标签页标题：', error);
    }
    // 服务端会丢掉不合法的图标（比如 SVG data URL），这里原样传
    if (!hints.icon) delete hints.icon;
    return hints;
}
