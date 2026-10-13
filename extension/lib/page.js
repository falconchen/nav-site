/**
 * 从当前标签页拿收藏需要的信息
 */

import { ext } from './ext.js';

// 注入到网页里执行，只能用网页自己的 DOM，不能引用外部变量
export function collectHints() {
    const CONTENT_LIMIT = 3000;
    // 去掉导航后正文短于这个长度认为去过头了（整页都包在 header / aside 里），退回没去的版本
    const MIN_MAIN_CHARS = 200;
    const SKIP_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE'];
    const CHROME_TAGS = ['NAV', 'HEADER', 'FOOTER', 'ASIDE'];

    const metaContent = selector => {
        const meta = document.querySelector(selector);
        return ((meta && meta.getAttribute('content')) || '').replace(/\s+/g, ' ').trim();
    };

    // 正文照服务端 extractPageInfo() 的规则取：跳过导航、页眉、页脚、侧栏，否则前 3000 字常被菜单占掉。
    // 服务端拿到够用的正文就不再自己抓网页，这里取得好不好直接决定分类和描述的质量。
    // 不用 innerText：它没法按区域跳过。看不见的元素（display: none 的菜单、弹窗）靠 checkVisibility() 排除
    let main = '';
    let all = '';
    const walk = (node, inChrome) => {
        for (let child = node.firstChild; child; child = child.nextSibling) {
            if (main.length >= CONTENT_LIMIT) return;
            if (child.nodeType === 3) {
                const text = (child.nodeValue || '').replace(/\s+/g, ' ').trim();
                if (!text) continue;
                if (all.length < CONTENT_LIMIT) all += text + ' ';
                if (!inChrome) main += text + ' ';
            } else if (child.nodeType === 1) {
                const tag = String(child.tagName).toUpperCase();
                if (SKIP_TAGS.includes(tag)) continue;
                if (typeof child.checkVisibility === 'function' && !child.checkVisibility()) continue;
                walk(child, inChrome || CHROME_TAGS.includes(tag));
            }
        }
    };
    if (document.body) walk(document.body, false);

    const heading = document.querySelector('h1');
    const hints = {
        title: document.title,
        description: metaContent('meta[name="description"], meta[property="og:description"]'),
        content: (main.trim().length >= MIN_MAIN_CHARS ? main : all).trim().slice(0, CONTENT_LIMIT),
        // 这三项只给服务端的 AI 分类做参考
        keywords: metaContent('meta[name="keywords"]'),
        siteName: metaContent('meta[property="og:site_name"]'),
        heading: ((heading && heading.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    };
    for (const field of ['keywords', 'siteName', 'heading']) {
        if (!hints[field]) delete hints[field];
    }

    // 图标照服务端 extractIcon() 的规则从页面声明里挑：先 apple-touch-icon，再 rel="icon"，同类里取声明尺寸最大的。
    // 标签页的 favIconUrl 是浏览器给标签栏挑的小图（V2EX 是 32px 带边框那张），和网页端「自动填写」拿到的不是同一张。
    // SVG 排在位图后面：右键一键收藏靠服务端转存，那边不收 SVG
    let best = null;
    for (const link of document.querySelectorAll('link[rel][href]')) {
        const rel = (link.getAttribute('rel') || '').toLowerCase().split(/\s+/);
        const apple = rel.some(token => token.startsWith('apple-touch-icon'));
        if (!apple && !rel.includes('icon')) continue;
        if (!/^https?:\/\//i.test(link.href || '')) continue;
        const svg = /svg/i.test(link.getAttribute('type') || '') || /\.svg(?:[?#]|$)/i.test(link.href);
        const size = Math.max(0, ...(link.getAttribute('sizes') || '').split(/\s+/).map(token => parseInt(token, 10) || 0));
        const rank = (apple ? 2e6 : 0) + (svg ? 0 : 1e6) + Math.min(size, 99999);
        // 同分取先出现的
        if (!best || rank > best.rank) best = { rank, href: link.href };
    }
    if (best) hints.icon = best.href;
    return hints;
}

export function isSavableUrl(url) {
    return /^https?:\/\//i.test(url || '');
}

/**
 * 取 hints。页面没声明图标时用标签页的图标；chrome:// 页面、应用商店等不允许注入脚本，这时只用标签页自带的标题和图标
 */
export async function getPageHints(tab) {
    const hints = { title: tab.title || '', icon: tab.favIconUrl || '' };
    try {
        const [injection] = await ext.scripting.executeScript({
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
