/**
 * 从当前标签页拿收藏需要的信息
 */

import { ext } from './ext.js';

// 注入到网页里执行，只能用网页自己的 DOM，不能引用外部变量
export function collectHints() {
    const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
    const text = (document.body && document.body.innerText) || '';
    const hints = {
        title: document.title,
        description: meta ? meta.getAttribute('content') || '' : '',
        content: text.replace(/\s+/g, ' ').trim().slice(0, 3000)
    };

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
