import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeWebsite, categoryByDomain, truncateDescription } from '../server/lib/website-analyzer.js';

const PAGE_HTML = `
<html>
  <head>
    <title>Claude Code - GitHub</title>
    <meta name="description" content="页面自带的 meta 描述">
    <link rel="icon" href="/favicon.png">
  </head>
  <body><p>${'正文内容。'.repeat(60)}</p></body>
</html>`;

const CATEGORIES = [
    { id: 'social', name: 'AIGC', order: 3 },
    { id: 'dev', name: '开发技术', order: 8 },
    { id: 'uncategorized', name: '未分类', order: 1000 }
];

const SITES = {
    social: [{ title: 'Claude', url: 'https://claude.ai/', weight: 200 }],
    dev: [
        { title: 'Hono', url: 'https://github.com/honojs/hono', weight: 150 },
        { title: 'Vitest', url: 'https://github.com/vitest-dev/vitest', weight: 120 }
    ],
    uncategorized: []
};

function htmlResponse(html, init = {}) {
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' }, ...init });
}

// 分类调用返回 category JSON，描述调用返回一段文本
function stubAi({ category = { category_index: 1, confidence: 'high' }, description = 'AI 写的描述。' } = {}) {
    return vi.fn(async (_model, options) => {
        if (options.response_format) {
            if (category instanceof Error) throw category;
            return { response: JSON.stringify(category) };
        }
        if (description instanceof Error) throw description;
        return { response: description };
    });
}

function analyze(env, overrides = {}) {
    return analyzeWebsite(env, {
        url: 'https://github.com/anthropics/claude-code',
        categories: CATEGORIES,
        sitesByCategory: SITES,
        timeouts: { fetchMs: 50, aiMs: 50 },
        ...overrides
    });
}

describe('analyzeWebsite 兜底链', () => {
    let fetchSpy;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('一切正常时标题取网页、分类和描述取 AI、图标取网页', async () => {
        fetchSpy.mockResolvedValue(htmlResponse(PAGE_HTML));
        const aiRun = stubAi();

        const result = await analyze({ AI: { run: aiRun } });

        expect(result).toMatchObject({
            title: 'Claude Code - GitHub',
            category: 'social',
            description: 'AI 写的描述。',
            icon: 'https://github.com/favicon.png'
        });
        expect(result.analysis).toEqual({
            sources: { title: 'page', category: 'ai', description: 'ai', icon: 'page' },
            categoryConfidence: 'high',
            warnings: []
        });
    });

    it('分类 prompt 里的样例由服务端从已收录站点构造', async () => {
        fetchSpy.mockResolvedValue(htmlResponse(PAGE_HTML));
        const aiRun = stubAi();

        await analyze({ AI: { run: aiRun } });

        const classifyCall = aiRun.mock.calls.find(([, options]) => options.response_format);
        const prompt = classifyCall[1].messages[1].content;
        expect(prompt).toContain('2. 开发技术\n   已收录：Hono (github.com)、Vitest (github.com)');
    });

    it('抓取被拦截时用扩展传来的标题和正文，并记 fetch_blocked', async () => {
        fetchSpy.mockResolvedValue(new Response('Forbidden', { status: 403 }));
        const aiRun = stubAi();

        const result = await analyze({ AI: { run: aiRun } }, {
            hints: { title: '标签页标题', description: '扩展拿到的描述', content: '扩展看到的正文' }
        });

        expect(result.title).toBe('标签页标题');
        expect(result.analysis.sources.title).toBe('hint');
        expect(result.analysis.warnings).toContain('fetch_blocked');

        const descCall = aiRun.mock.calls.find(([, options]) => !options.response_format);
        expect(descCall[1].messages[1].content).toContain('扩展看到的正文');
    });

    it('状态码 200 的反爬质询页也算被拦截', async () => {
        fetchSpy.mockResolvedValue(htmlResponse('<html><head><title>Just a moment...</title></head><body>checking</body></html>'));

        const result = await analyze({ AI: { run: stubAi() } });

        expect(result.analysis.warnings).toContain('fetch_blocked');
        // 不能拿质询页标题当网站标题
        expect(result.title).toBe('github.com');
        expect(result.analysis.sources.title).toBe('domain');
    });

    it('抓取超时记 fetch_timeout', async () => {
        fetchSpy.mockImplementation((_url, init) => new Promise((_, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason));
        }));

        const result = await analyze({ AI: { run: stubAi() } });

        expect(result.analysis.warnings).toContain('fetch_timeout');
    });

    it('网页太薄时用扩展传来的正文，并记 content_thin', async () => {
        fetchSpy.mockResolvedValue(htmlResponse('<html><head><title>SPA</title></head><body><div id="app"></div></body></html>'));
        const aiRun = stubAi();

        const result = await analyze({ AI: { run: aiRun } }, { hints: { content: '扩展渲染后的完整正文' } });

        expect(result.analysis.warnings).toContain('content_thin');
        const descCall = aiRun.mock.calls.find(([, options]) => !options.response_format);
        expect(descCall[1].messages[1].content).toContain('扩展渲染后的完整正文');
    });

    it('AI 置信度低时按同域名归类，描述退回 meta 描述', async () => {
        fetchSpy.mockResolvedValue(htmlResponse(PAGE_HTML));

        const result = await analyze({ AI: { run: stubAi({ category: { category_index: 1, confidence: 'low' }, description: '' }) } });

        expect(result.category).toBe('dev');
        expect(result.description).toBe('页面自带的 meta 描述');
        expect(result.analysis.sources).toMatchObject({ category: 'domain', description: 'page' });
        expect(result.analysis.categoryConfidence).toBe('domain');
        expect(result.analysis.warnings).toEqual(['ai_category_low_confidence', 'ai_description_failed']);
    });

    it('AI 抛异常时同样走兜底', async () => {
        fetchSpy.mockResolvedValue(htmlResponse(PAGE_HTML));

        const result = await analyze({ AI: { run: stubAi({ category: new Error('模型炸了'), description: new Error('模型炸了') }) } });

        expect(result.category).toBe('dev');
        expect(result.analysis.warnings).toEqual(['ai_category_failed', 'ai_description_failed']);
    });

    it('AI 超时算失败，不会一直等', async () => {
        fetchSpy.mockResolvedValue(htmlResponse(PAGE_HTML));
        const hang = vi.fn(() => new Promise(() => {}));

        const result = await analyze({ AI: { run: hang } });

        expect(result.category).toBe('dev');
        expect(result.analysis.warnings).toEqual(['ai_category_failed', 'ai_description_failed']);
    });

    it('没有任何网页内容时不让 AI 写描述，但照样分类', async () => {
        fetchSpy.mockResolvedValue(new Response('Forbidden', { status: 403 }));
        const aiRun = stubAi();

        const result = await analyze({ AI: { run: aiRun } });

        expect(aiRun).toHaveBeenCalledTimes(1);
        expect(aiRun.mock.calls[0][1].response_format).toBeTruthy();
        expect(result).toMatchObject({ category: 'social', description: '' });
        expect(result.analysis.warnings).toEqual(['fetch_blocked', 'ai_description_skipped']);
    });

    it('AI 描述是拒答时丢弃，退回 meta 描述', async () => {
        fetchSpy.mockResolvedValue(htmlResponse(PAGE_HTML));

        const result = await analyze({ AI: { run: stubAi({ description: '无相关信息可供总结。' }) } });

        expect(result.description).toBe('页面自带的 meta 描述');
        expect(result.analysis.warnings).toEqual(['ai_description_failed']);
    });

    it('没有同域名站点时放进「未分类」', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 500 }));

        const result = await analyze({}, { url: 'https://unknown.example/page' });

        expect(result).toMatchObject({ title: 'unknown.example', category: 'uncategorized', description: '', icon: '' });
        expect(result.analysis).toEqual({
            sources: { title: 'domain', category: 'fallback', description: 'none', icon: 'none' },
            categoryConfidence: 'fallback',
            warnings: ['fetch_failed', 'ai_unavailable']
        });
    });

    it('没有「未分类」时放进 order 最小的分类', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 500 }));

        const result = await analyze({}, {
            url: 'https://unknown.example/page',
            categories: CATEGORIES.filter(cat => cat.id !== 'uncategorized')
        });

        expect(result.category).toBe('social');
    });

    it('调用方给了分类和描述时不调 AI', async () => {
        fetchSpy.mockResolvedValue(htmlResponse(PAGE_HTML));
        const aiRun = stubAi();

        const result = await analyze({ AI: { run: aiRun } }, {
            provided: { category: 'dev', description: '自己写的描述' }
        });

        expect(aiRun).not.toHaveBeenCalled();
        expect(result).toMatchObject({ category: 'dev', description: '自己写的描述', title: 'Claude Code - GitHub' });
        expect(result.analysis.categoryConfidence).toBe('provided');
    });

    it('标题、分类、描述都给了就不抓网页', async () => {
        const result = await analyze({ AI: { run: stubAi() } }, {
            provided: { title: 't', category: 'dev', description: 'd' }
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.analysis.warnings).toEqual([]);
    });

    it('分类和描述两轮 AI 并行发出', async () => {
        fetchSpy.mockResolvedValue(htmlResponse(PAGE_HTML));
        const pending = [];
        const aiRun = vi.fn((_model, options) => new Promise(resolve => {
            pending.push(() => resolve({
                response: options.response_format ? JSON.stringify({ category_index: 2, confidence: 'high' }) : '描述。'
            }));
        }));

        const promise = analyze({ AI: { run: aiRun } }, { timeouts: { fetchMs: 50, aiMs: 1000 } });
        await vi.waitFor(() => expect(aiRun).toHaveBeenCalledTimes(2));
        pending.forEach(release => release());

        await expect(promise).resolves.toMatchObject({ category: 'dev', description: '描述。' });
    });
});

describe('categoryByDomain', () => {
    it('忽略 www 和大小写，取同 host 最多的分类', () => {
        expect(categoryByDomain('https://WWW.GitHub.com/x', SITES, ['social', 'dev'])).toBe('dev');
        expect(categoryByDomain('https://nothing.example', SITES, ['social', 'dev'])).toBe('');
    });
});

describe('页面解析', () => {
    it('title 带属性也能取到，HTML 实体会解码', async () => {
        const { extractPageInfo } = await import('../server/lib/website-analyzer.js');
        const info = extractPageInfo(
            '<html><head><title data-rh="true">OpenAI | Research &amp; Deployment &#8212; &#x4e2d;</title>' +
            '<meta name="description" content="Tom&#39;s &quot;site&quot;"></head><body></body></html>',
            'https://openai.com/'
        );
        expect(info.title).toBe('OpenAI | Research & Deployment — 中');
        expect(info.description).toBe('Tom\'s "site"');
    });
});

describe('truncateDescription', () => {
    const REAL = 'Token Unlimited 中转站已上线 GPT 6 Sol 和 Luna，提供全网独有的超低价 Azure OpenAI 渠道。该站点直接连接 Azure Foundry API，保证满血不降智，且提供高质量的 GPT Image 生成服务。';

    it('上限内原样返回', () => {
        expect(truncateDescription(REAL)).toBe(REAL);
    });

    it('超长时在最后一个标点处截断，不留半截词', () => {
        const out = truncateDescription(REAL, 120);
        expect(out).toBe('Token Unlimited 中转站已上线 GPT 6 Sol 和 Luna，提供全网独有的超低价 Azure OpenAI 渠道。该站点直接连接 Azure Foundry API，保证满血不降智');
    });

    it('找不到靠后的标点时硬截', () => {
        expect(truncateDescription('啊'.repeat(300), 200)).toBe('啊'.repeat(200));
    });
});

describe('Jina Reader 兜底', () => {
    let fetchSpy;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    const READER_DATA = {
        code: 200,
        data: {
            title: 'Claude Code 仓库',
            description: 'Jina 拿到的描述 &gt; 带实体',
            url: 'https://github.com/anthropics/claude-code',
            content: '# 标题\n\n![图](https://x/y.png) 这是[正文](https://a.b)。' + '正文内容。'.repeat(60),
            metadata: { 'og:site_name': 'GitHub' },
            external: {
                icon: { 'https://github.com/favicon.ico': {} },
                'apple-touch-icon': { 'https://github.com/apple.png': { sizes: '180x180' } }
            },
            httpStatus: 200
        }
    };

    // 第一次是自己抓（按 blockedResponse 返回），打到 r.jina.ai 的返回 readerData
    function stubFetch(blockedResponse, readerData = READER_DATA) {
        fetchSpy.mockImplementation(async (input) => {
            if (String(input).startsWith('https://r.jina.ai/')) {
                return new Response(JSON.stringify(readerData), { headers: { 'Content-Type': 'application/json' } });
            }
            return blockedResponse();
        });
    }

    function readerCalls() {
        return fetchSpy.mock.calls.filter(([input]) => String(input).startsWith('https://r.jina.ai/'));
    }

    it('自己抓取被拦截时改用 Jina，结果按网页来源处理并记 fetched_via_reader', async () => {
        stubFetch(() => new Response('Forbidden', { status: 403 }));
        const aiRun = stubAi();

        const result = await analyze({ AI: { run: aiRun }, JINA_API_KEY: 'jina_test' });

        expect(result).toMatchObject({
            title: 'Claude Code 仓库',
            description: 'AI 写的描述。',
            icon: 'https://github.com/apple.png'
        });
        expect(result.analysis.sources.title).toBe('page');
        expect(result.analysis.warnings).toEqual(['fetched_via_reader']);

        const [[input, init]] = readerCalls();
        expect(input).toBe('https://r.jina.ai/https://github.com/anthropics/claude-code');
        expect(init.headers.Authorization).toBe('Bearer jina_test');
        expect(init.headers.Accept).toBe('application/json');

        // Markdown 转成纯文本再喂给 AI
        const descCall = aiRun.mock.calls.find(([, options]) => !options.response_format);
        const prompt = descCall[1].messages[1].content;
        expect(prompt).toContain('标题 这是正文。');
        expect(prompt).not.toContain('](');
    });

    it('Jina 的 metadata 字段是数组时取第一个（同名 meta 出现多次）', async () => {
        stubFetch(() => new Response('Forbidden', { status: 403 }), {
            code: 200,
            data: {
                ...READER_DATA.data,
                title: '',
                metadata: { 'og:site_name': ['Medium', 'Medium'], keywords: ['a', 'b'], viewport: ['x', 'y'] }
            }
        });

        const result = await analyze({ AI: { run: stubAi() }, JINA_API_KEY: 'jina_test' });

        expect(result.title).toBe('Medium');
        expect(result.analysis.warnings).toEqual(['fetched_via_reader']);
    });

    it('状态码 200 的质询页也会改用 Jina', async () => {
        stubFetch(() => htmlResponse('<html><head><title>Just a moment...</title></head><body></body></html>'));

        const result = await analyze({ AI: { run: stubAi() }, JINA_API_KEY: 'jina_test' });

        expect(result.title).toBe('Claude Code 仓库');
        expect(readerCalls()).toHaveLength(1);
    });

    it('没配 JINA_API_KEY 时不调 Jina', async () => {
        stubFetch(() => new Response('Forbidden', { status: 403 }));

        const result = await analyze({ AI: { run: stubAi() } });

        expect(readerCalls()).toHaveLength(0);
        expect(result.analysis.warnings).toContain('fetch_blocked');
    });

    it('扩展已经传来足够的正文时不花 Jina 的额度', async () => {
        stubFetch(() => new Response('Forbidden', { status: 403 }));

        await analyze({ AI: { run: stubAi() }, JINA_API_KEY: 'jina_test' }, {
            hints: { title: '标签页标题', content: '扩展看到的正文。'.repeat(40) }
        });

        expect(readerCalls()).toHaveLength(0);
    });

    it('Jina 那边也被目标站拦截时当作抓取失败', async () => {
        stubFetch(() => new Response('Forbidden', { status: 403 }), {
            code: 200,
            data: { ...READER_DATA.data, title: 'Just a moment...', content: '', httpStatus: 403 }
        });

        const result = await analyze({ AI: { run: stubAi() }, JINA_API_KEY: 'jina_test' });

        expect(result.analysis.warnings).toContain('fetch_blocked');
        expect(result.analysis.warnings).not.toContain('fetched_via_reader');
        expect(result.analysis.sources.title).toBe('domain');
    });
});

