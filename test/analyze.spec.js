import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import analyzeApi from '../server/api/analyze.js';

const PAGE_HTML = `
<html>
  <head>
    <title>某个测试站点</title>
    <meta name="description" content="这是一个测试站点的描述">
    <meta name="keywords" content="测试,示例">
  </head>
  <body><p>正文内容若干。</p><script>var noise = "不该进 prompt";</script></body>
</html>`;

// 极简 KV 桩，只实现限流用到的 get/put
function createKvStub(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        store,
        get: async (key) => (store.has(key) ? store.get(key) : null),
        put: async (key, value) => { store.set(key, value); }
    };
}

const CATEGORIES = [
    { id: 'social', name: 'AIGC', samples: ['Claude (claude.ai)', 'Midjourney (midjourney.com)'] },
    { id: 'tools', name: '实用工具', samples: ['百度网盘 (pan.baidu.com)'] },
    { id: 'category-1752130480351', name: '个人项目', samples: ['我的博客 (blog.me)'] }
];

function createEnv({ aiRun, kv } = {}) {
    return {
        USER_SESSIONS: kv || createKvStub(),
        AI: aiRun ? { run: aiRun } : undefined
    };
}

function analyzeRequest(body) {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' },
        body: JSON.stringify(body)
    };
}

describe('POST /analyze-website 的分类', () => {
    let fetchSpy;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        // 抓网页那一次
        fetchSpy.mockResolvedValue(new Response(PAGE_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
        }));
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    // 分类调用返回 category JSON，描述调用返回一段文本
    function stubAi(categoryPayload, descText = '一句话描述。') {
        return vi.fn(async (_model, options) => {
            if (options.response_format) {
                return { response: typeof categoryPayload === 'string'
                    ? categoryPayload
                    : JSON.stringify(categoryPayload) };
            }
            return { response: descText };
        });
    }

    it('按编号映射回分类 id', async () => {
        const aiRun = stubAi({ category_index: 3, confidence: 'high' });
        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        // 第 3 个候选是「个人项目」
        expect(body.category).toBe('category-1752130480351');
        expect(body.categoryConfidence).toBe('high');
    });

    it('prompt 里给的是分类名称和已收录站点，不是 id', async () => {
        const aiRun = stubAi({ category_index: 1, confidence: 'high' });
        await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        const userMessage = aiRun.mock.calls[0][1].messages[1].content;
        expect(userMessage).toContain('1. AIGC');
        expect(userMessage).toContain('Claude (claude.ai)');
        // 语义已经和分类名脱钩的 id 不该出现在候选列表里
        expect(userMessage).not.toContain('category-1752130480351');
        expect(userMessage).not.toContain('AIGC(social)');
    });

    it('置信度为 low 时留空，不硬猜', async () => {
        const aiRun = stubAi({ category_index: 2, confidence: 'low' });
        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        const body = await res.json();
        expect(body.category).toBe('');
        expect(body.categoryConfidence).toBe('low');
    });

    it('编号越界时留空', async () => {
        const aiRun = stubAi({ category_index: 99, confidence: 'high' });
        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        expect((await res.json()).category).toBe('');
    });

    it('返回不是 JSON 时退回抠数字', async () => {
        const aiRun = stubAi('```\n2\n```');
        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        const body = await res.json();
        expect(body.category).toBe('tools');
        expect(body.categoryConfidence).toBe('medium');
    });

    it('样例超量超长时被裁剪，不会撑爆 prompt', async () => {
        const aiRun = stubAi({ category_index: 1, confidence: 'high' });
        const fat = [{
            id: 'social',
            name: 'AIGC',
            samples: Array.from({ length: 30 }, (_, i) => `站点${i}${'长'.repeat(200)}`)
        }];

        await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: fat }),
            createEnv({ aiRun })
        );

        const userMessage = aiRun.mock.calls[0][1].messages[1].content;
        const sampleLine = userMessage.split('\n').find(l => l.includes('已收录'));
        expect(sampleLine.split('、')).toHaveLength(12);
        expect(sampleLine.length).toBeLessThan(12 * 60 + 40);
    });

    it('分类正文被截到 800 字，描述用更长的正文', async () => {
        const aiRun = stubAi({ category_index: 1, confidence: 'high' });
        const longBody = '内容'.repeat(3000);
        fetchSpy.mockResolvedValue(new Response(
            `<html><head><title>T</title></head><body><p>${longBody}</p></body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
        ));

        await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        const categoryPrompt = aiRun.mock.calls[0][1].messages[1].content;
        const descPrompt = aiRun.mock.calls[1][1].messages[1].content;
        expect(categoryPrompt.length).toBeLessThan(2000);
        expect(descPrompt.length).toBeGreaterThan(2500);
    });

    it('导航栏等结构区域的文字不进 prompt', async () => {
        const aiRun = stubAi({ category_index: 1, confidence: 'high' });
        fetchSpy.mockResolvedValue(new Response(`
            <html><head><title>T</title></head><body>
              <header>Skip to content 登录 注册</header>
              <nav>首页 产品 价格 文档 博客 关于我们 联系方式</nav>
              <main>${'这是真正的正文内容，讲的是某个具体产品。'.repeat(20)}</main>
              <footer>版权所有 隐私政策 服务条款</footer>
            </body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
        ));

        await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        const prompt = aiRun.mock.calls[0][1].messages[1].content;
        expect(prompt).toContain('这是真正的正文内容');
        expect(prompt).not.toContain('Skip to content');
        expect(prompt).not.toContain('隐私政策');
        expect(prompt).not.toContain('联系方式');
    });

    it('整页都在结构区域里时退回未过滤的正文', async () => {
        const aiRun = stubAi({ category_index: 1, confidence: 'high' });
        // 全部内容塞在 header 里，过滤后会空掉
        fetchSpy.mockResolvedValue(new Response(
            `<html><head><title>T</title></head><body><header>${'某个站点的全部说明文字。'.repeat(30)}</header></body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
        ));

        await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        expect(aiRun.mock.calls[0][1].messages[1].content).toContain('某个站点的全部说明文字');
    });

    it('og:site_name 和 h1 进 prompt，og:description 兜底 description', async () => {
        const aiRun = stubAi({ category_index: 1, confidence: 'high' });
        fetchSpy.mockResolvedValue(new Response(`
            <html><head>
              <title>T</title>
              <meta property="og:site_name" content="某某平台">
              <meta property="og:description" content="来自 og 的描述">
            </head><body><main><h1>核心功能介绍</h1>${'正文'.repeat(200)}</main></body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
        ));

        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        const prompt = aiRun.mock.calls[0][1].messages[1].content;
        expect(prompt).toContain('站点名：某某平台');
        expect(prompt).toContain('主标题：核心功能介绍');
        expect(prompt).toContain('来自 og 的描述');
        // 没有 meta keywords，这一行就不该出现
        expect(prompt).not.toContain('关键词：');
        await res.json();
    });

    it('没有分类可选时返回空分类', async () => {
        const aiRun = stubAi({ category_index: 1, confidence: 'high' });
        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: [] }),
            createEnv({ aiRun })
        );

        expect((await res.json()).category).toBe('');
        // 没候选就不该白跑一次分类模型
        const categoryCalls = aiRun.mock.calls.filter(c => c[1].response_format);
        expect(categoryCalls).toHaveLength(0);
    });

    it('没有 AI 绑定时退回关键词规则', async () => {
        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv()
        );

        expect(res.status).toBe(200);
        expect((await res.json()).categoryConfidence).toBe('fallback');
    });

    it('AI 抛异常时退回关键词规则而不是 500', async () => {
        const aiRun = vi.fn(async () => { throw new Error('模型炸了'); });
        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        expect(res.status).toBe(200);
        expect((await res.json()).categoryConfidence).toBe('fallback');
    });

    it('同一 IP 超过每分钟上限时返回 429', async () => {
        const bucket = Math.floor(Date.now() / 60000);
        const kv = createKvStub({ [`rl_analyze_9.9.9.9_${bucket}`]: '10' });

        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun: stubAi({ category_index: 1, confidence: 'high' }), kv })
        );

        expect(res.status).toBe(429);
        // 超限时连网页都不该去抓
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('描述生成', () => {
    let fetchSpy;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(PAGE_HTML, {
            status: 200, headers: { 'Content-Type': 'text/html' }
        }));
    });

    afterEach(() => fetchSpy.mockRestore());

    it('取前两句，而不是整段塞进去', async () => {
        const aiRun = vi.fn(async (_model, options) => {
            if (options.response_format) {
                return { response: JSON.stringify({ category_index: 1, confidence: 'high' }) };
            }
            return { response: '第一句。第二句。第三句。第四句。' };
        });

        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://example.com/', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        // 原来的正则带 $ 锚点，切不开，四句会全留下
        expect((await res.json()).description).toBe('第一句。第二句。');
    });

    it('目标站拦截抓取时返回 502 + fetchFailed，带上状态码，不调 AI', async () => {
        fetchSpy.mockResolvedValue(new Response('Just a moment...', {
            status: 403,
            headers: { 'Content-Type': 'text/html', 'cf-mitigated': 'challenge' }
        }));
        const aiRun = vi.fn();
        const res = await analyzeApi.request(
            '/analyze-website',
            analyzeRequest({ url: 'https://v2ex.com/t/1', categories: CATEGORIES }),
            createEnv({ aiRun })
        );

        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.fetchFailed).toBe(true);
        expect(body.error).toContain('HTTP 403');
        expect(aiRun).not.toHaveBeenCalled();
    });
});
