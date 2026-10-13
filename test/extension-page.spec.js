import { describe, it, expect, afterEach } from 'vitest';
import { collectHints } from '../extension/lib/page.js';

// collectHints() 是注入到网页里跑的，这里用最小的假 document 代替
function el(tag, children = [], { hidden = false } = {}) {
    const node = { nodeType: 1, tagName: tag.toUpperCase(), checkVisibility: () => !hidden, firstChild: null };
    const nodes = children.map(child => (typeof child === 'string' ? { nodeType: 3, nodeValue: child } : child));
    nodes.forEach((child, index) => { child.nextSibling = nodes[index + 1] || null; });
    node.firstChild = nodes[0] || null;
    return node;
}

function fakeDocument(links, { description = '页面描述', text = '正文  内容', body, keywords, siteName, heading } = {}) {
    const linkNodes = links.map(attrs => ({
        href: attrs.href,
        getAttribute: name => (name in attrs ? attrs[name] : null)
    }));
    const meta = value => (value ? { getAttribute: () => value } : null);
    return {
        title: '页面标题',
        body: body || el('body', [text]),
        querySelector: selector => {
            if (selector === 'h1') return heading ? { textContent: heading } : null;
            if (selector.includes('name="keywords"')) return meta(keywords);
            if (selector.includes('og:site_name')) return meta(siteName);
            return meta(description);
        },
        querySelectorAll: () => linkNodes
    };
}

function hintsFor(links, options) {
    globalThis.document = fakeDocument(links, options);
    return collectHints();
}

describe('扩展 collectHints 挑图标', () => {
    afterEach(() => {
        delete globalThis.document;
    });

    it('V2EX：取 apple-touch-icon，不取 32px 的 favicon', () => {
        const hints = hintsFor([
            { rel: 'icon', sizes: '192x192', href: 'https://www.v2ex.com/static/icon-192.png' },
            { rel: 'apple-touch-icon', sizes: '180x180', href: 'https://www.v2ex.com/static/apple-touch-icon-180.png?v=1' },
            { rel: 'shortcut icon', type: 'image/png', href: 'https://www.v2ex.com/static/favicon.ico' }
        ]);
        expect(hints.icon).toBe('https://www.v2ex.com/static/apple-touch-icon-180.png?v=1');
        expect(hints).toMatchObject({ title: '页面标题', description: '页面描述', content: '正文 内容' });
    });

    it('没有 apple-touch-icon 时取声明尺寸最大的 icon', () => {
        const hints = hintsFor([
            { rel: 'icon', href: 'https://example.com/favicon.ico' },
            { rel: 'icon', sizes: '32x32', href: 'https://example.com/icon-32.png' },
            { rel: 'icon', sizes: '16x16 192x192', href: 'https://example.com/icon-192.png' },
            { rel: 'mask-icon', href: 'https://example.com/mask.svg' },
            { rel: 'stylesheet', href: 'https://example.com/icon.css' }
        ]);
        expect(hints.icon).toBe('https://example.com/icon-192.png');
    });

    it('apple-touch-icon 有多个时取最大的，precomposed 也算', () => {
        const hints = hintsFor([
            { rel: 'apple-touch-icon', sizes: '120x120', href: 'https://example.com/touch-120.png' },
            { rel: 'apple-touch-icon-precomposed', sizes: '180x180', href: 'https://example.com/touch-180.png' },
            { rel: 'icon', sizes: '512x512', href: 'https://example.com/icon-512.png' }
        ]);
        expect(hints.icon).toBe('https://example.com/touch-180.png');
    });

    it('都没写尺寸时取先出现的，SVG 排在位图后面', () => {
        expect(hintsFor([
            { rel: 'icon', type: 'image/svg+xml', href: 'https://example.com/icon.svg' },
            { rel: 'icon', href: 'https://example.com/favicon.ico' },
            { rel: 'alternate icon', href: 'https://example.com/other.png' }
        ]).icon).toBe('https://example.com/favicon.ico');

        expect(hintsFor([{ rel: 'icon', sizes: 'any', href: 'https://example.com/icon.svg?v=2' }]).icon)
            .toBe('https://example.com/icon.svg?v=2');
    });

    it('页面没声明图标或只有 data: 图标时不带 icon，留给标签页图标兜底', () => {
        expect('icon' in hintsFor([])).toBe(false);
        expect('icon' in hintsFor([{ rel: 'icon', href: 'data:image/png;base64,AAAA' }])).toBe(false);
    });
});

describe('扩展 collectHints 取正文', () => {
    afterEach(() => {
        delete globalThis.document;
    });

    const ARTICLE = '这是一段足够长的正文。'.repeat(30);

    it('跳过导航、页眉、页脚、侧栏，以及脚本和看不见的元素', () => {
        const hints = hintsFor([], {
            body: el('body', [
                el('header', [el('a', ['首页']), el('a', ['注册'])]),
                el('nav', ['菜单一 菜单二']),
                el('script', ['var tracking = 1;']),
                el('div', ['弹窗里的字'], { hidden: true }),
                el('main', [el('h1', ['文章标题']), el('p', [ARTICLE])]),
                el('aside', ['相关推荐']),
                el('footer', ['版权所有'])
            ])
        });
        expect(hints.content).toBe(`文章标题 ${ARTICLE}`);
    });

    it('去掉导航后剩得太少时退回整页文字', () => {
        const hints = hintsFor([], {
            body: el('body', [
                el('header', [el('div', ['整页都包在 header 里的站点'])]),
                el('script', ['var tracking = 1;']),
                el('footer', ['版权所有'])
            ])
        });
        expect(hints.content).toBe('整页都包在 header 里的站点 版权所有');
    });

    it('相邻元素的文字用空格隔开，最多 3000 字', () => {
        const hints = hintsFor([], {
            body: el('body', [el('div', [el('span', ['甲']), el('span', ['乙\n  丙'])]), el('p', ['丁'.repeat(4000)])])
        });
        expect(hints.content.startsWith('甲 乙 丙 丁丁')).toBe(true);
        expect(hints.content).toHaveLength(3000);
    });

    it('补传关键词、站点名、主标题，没有的不带', () => {
        expect(hintsFor([], { keywords: ' dns, whois ', siteName: 'V2EX', heading: '  做了一个\n网络工具 ' }))
            .toMatchObject({ keywords: 'dns, whois', siteName: 'V2EX', heading: '做了一个 网络工具' });

        const bare = hintsFor([]);
        expect('keywords' in bare || 'siteName' in bare || 'heading' in bare).toBe(false);
    });
});
