import { describe, it, expect, afterEach } from 'vitest';
import { collectHints } from '../extension/lib/page.js';

// collectHints() 是注入到网页里跑的，这里用最小的假 document 代替
function fakeDocument(links, { description = '页面描述', text = '正文  内容' } = {}) {
    const linkNodes = links.map(attrs => ({
        href: attrs.href,
        getAttribute: name => (name in attrs ? attrs[name] : null)
    }));
    return {
        title: '页面标题',
        body: { innerText: text },
        querySelector: () => (description ? { getAttribute: () => description } : null),
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
