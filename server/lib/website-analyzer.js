/**
 * 网站分析：抓网页、提取元信息、AI 分类和写描述
 *
 * 两个入口共用：
 * - /api/analyze-website（网页端「AI识别」按钮），见 server/api/analyze.js
 * - /api/v1/websites 与 /api/v1/websites/analyze（扩展只传 url 时自动补全），用 analyzeWebsite() 编排兜底链
 */

import * as htmlparser2 from 'htmlparser2';

// 分类和描述用同一个模型。70B 支持 JSON 模式（response_format），
// 分类要的是稳定的结构化输出，不是文采，所以 temperature 给 0。
export const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// 分类只需要判断「这是个什么站」，不需要全文；描述是摘要任务，需要更多正文
const CONTENT_CHARS_FOR_CATEGORY = 800;
const CONTENT_CHARS_FOR_DESCRIPTION = 3000;
// AI 描述的长度上限。两句中文加英文专名常超过 120 字
const MAX_DESCRIPTION_CHARS = 200;

// 这些标签里的文本两份都不要
const HARD_SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'template']);

// 导航类结构区域：正文里最先出现的往往就是这些，对判断网站是什么毫无帮助
const CHROME_TAGS = new Set(['nav', 'header', 'footer', 'aside']);

// 过滤后正文短于这个长度就认为过滤过头了，退回未过滤的版本
const MIN_MAIN_CONTENT_CHARS = 200;

// 每个分类最多放几个已收录站点当样例，以及单条样例的长度上限。
// 5 个太少：实测 AIGC 有 50 个站点，按权重取前 5 全是对话类产品，
// 覆盖不到里面一大簇 AI 相关的 GitHub 仓库，导致那些站点被判去「开发技术」。
export const MAX_SAMPLES_PER_CATEGORY = 12;
const MAX_SAMPLE_CHARS = 60;

const FETCH_TIMEOUT_MS = 6000;
const AI_TIMEOUT_MS = 10000;
// 只读前 1MB：够拿到 head 和正文开头，防止超大页面吃内存
const MAX_HTML_BYTES = 1024 * 1024;
// 正文少于这个长度认为页面太「薄」（SPA 空壳、登录墙），改用扩展传来的正文
const THIN_CONTENT_CHARS = 200;

// 模型拿不到内容时会写「无相关信息可供总结」这类拒答，存下来比留空更糟
const DESCRIPTION_REFUSAL_PATTERN = /无相关信息|没有(足够的?|相关的?|具体的?)?信息|信息不足|无法(生成|总结|提供|确定|判断)|暂无(描述|信息)|^(抱歉|很抱歉)|i'?m sorry|i cannot|not enough information|no (relevant )?information/i;

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// 反爬质询页的标题特征，这类页面状态码可能是 200
const CHALLENGE_TITLE_PATTERN = /just a moment|attention required|access denied|请稍候|安全验证|verify you are human/i;

// ---------- 抓取 ----------

async function readLimited(response, maxBytes) {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = '';
    while (received < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        text += decoder.decode(value, { stream: true });
    }
    // 没读完就主动取消，不再下载剩余内容
    if (received >= maxBytes) {
        reader.cancel().catch(() => {});
    }
    return text + decoder.decode();
}

/**
 * 抓网页
 *
 * @returns {Promise<{ok: boolean, html?: string, finalUrl: string, failure?: string, status?: number}>}
 *   failure: timeout / blocked / http_error / not_html / fetch_failed
 */
export async function fetchPage(url, env = {}, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
    const urlObj = new URL(url);
    let response;
    try {
        response = await fetch(url, {
            headers: {
                'User-Agent': env.USER_AGENT || DEFAULT_USER_AGENT,
                'Accept-Language': env.ACCEPT_LANGUAGE || 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Referer': 'https://www.google.com/search?q=' + encodeURIComponent(urlObj.host)
            },
            signal: AbortSignal.timeout(timeoutMs)
        });
    } catch (error) {
        const failure = error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'fetch_failed';
        console.log(`抓取失败 (${failure}):`, url, error && error.message);
        return { ok: false, finalUrl: url, failure };
    }

    // 获取跳转后的最终URL。没有跳转信息时退回请求的 URL，
    // 否则拼相对图标地址的 new URL() 会抛
    const finalUrl = response.url || url;

    if (!response.ok) {
        const blocked = [401, 403, 429, 503].includes(response.status) || response.headers.get('cf-mitigated');
        return { ok: false, finalUrl, status: response.status, failure: blocked ? 'blocked' : 'http_error' };
    }

    // 只拦明确不是网页的类型；没写或写成 text/plain 的照样当网页解析
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (/^(image|video|audio|font)\/|^application\/(pdf|zip|octet-stream)/.test(contentType)) {
        response.body?.cancel().catch(() => {});
        return { ok: false, finalUrl, status: response.status, failure: 'not_html' };
    }

    const html = await readLimited(response, MAX_HTML_BYTES);
    return { ok: true, html, finalUrl, status: response.status };
}

/**
 * 页面是不是反爬质询页（状态码 200 但内容是「Just a moment...」之类）
 */
export function isChallengePage(info) {
    return CHALLENGE_TITLE_PATTERN.test(info.title || '') && (info.content || '').length < 500;
}

// ---------- 解析 ----------

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»' };

/**
 * 解码正则抠出来的 title、meta 里的 HTML 实体（&amp;、&#39;、&#x4e2d; 之类）
 */
function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
        if (entity[0] === '#') {
            const code = entity[1] === 'x' || entity[1] === 'X'
                ? parseInt(entity.slice(2), 16)
                : parseInt(entity.slice(1), 10);
            try {
                return String.fromCodePoint(code);
            } catch {
                return match;
            }
        }
        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

function cleanText(text) {
    return decodeEntities(text.replace(/\s+/g, ' ')).trim();
}

/**
 * 取 og:* 之类带 property 的 meta 内容，两种属性顺序都试
 */
function extractMetaProperty(html, property) {
    const value =
        html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
        html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'));
    return value && value[1] ? cleanText(value[1]) : '';
}

/**
 * 取第一个 h1 的纯文本。比正文开头那堆菜单名有信息量得多。
 */
function extractHeading(html) {
    const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!match) return '';
    return cleanText(match[1].replace(/<[^>]+>/g, ' ')).slice(0, 120);
}

function resolveIconUrl(iconUrl, finalUrl) {
    const urlObj = new URL(finalUrl);
    if (iconUrl.startsWith('//')) {
        // 协议相对URL（以//开头）
        return `${urlObj.protocol}${iconUrl}`;
    }
    if (iconUrl.startsWith('/')) {
        // 根相对路径
        return `${urlObj.origin}${iconUrl}`;
    }
    if (!iconUrl.startsWith('http')) {
        // 相对路径
        return `${urlObj.origin}/${iconUrl}`;
    }
    return iconUrl;
}

function extractIcon(html, finalUrl) {
    // 1. 优先从meta itemprop="image"提取
    const metaImageMatch = html.match(/<meta[^>]*content=["']?([^"'\s>]+)["']?[^>]*itemprop=["']?image["']?[^>]*>/i) ||
        html.match(/<meta[^>]*itemprop=["']?image["']?[^>]*content=["']?([^"'\s>]+)["']?[^>]*>/i);
    // 2. 从alt="logo"的img标签提取
    const logoImgMatch = html.match(/<img[^>]*src=["']?([^"'\s>]+)["']?[^>]*alt=["']?logo["']?[^>]*>/i) ||
        html.match(/<img[^>]*alt=["']?logo["']?[^>]*src=["']?([^"'\s>]+)["']?[^>]*>/i);
    // 3. apple-touch-icon（优先于 favicon）
    const appleTouchIconMatch = html.match(/<link\s+[^>]*?rel=["']?apple-touch-icon["']?[^>]*?href=["']?([^"'\s>]+)["']?[^>]*?>/i) ||
        html.match(/<link\s+[^>]*?href=["']?([^"'\s>]+)["']?[^>]*?rel=["']?apple-touch-icon["']?[^>]*?>/i);
    // 4. link 标签里的 favicon
    const faviconMatch = html.match(/<link\s+[^>]*?rel=["']?(?:icon|shortcut icon)["']?[^>]*?href=["']?([^"'\s>]+)["']?[^>]*?>/i) ||
        html.match(/<link\s+[^>]*?href=["']?([^"'\s>]+)["']?[^>]*?rel=["']?(?:icon|shortcut icon)["']?[^>]*?>/i);
    // 5. 第一个img标签的src（排除引号或反引号包裹的script字符串中的<img）
    const firstImgMatch = html.match(/(?:^|[^"'`])<img[^>]*src=["']?([^"'\s>]+)["']?[^>]*>/i);

    const match = [metaImageMatch, logoImgMatch, appleTouchIconMatch, faviconMatch, firstImgMatch]
        .find(m => m && m[1]);
    return match ? resolveIconUrl(match[1], finalUrl) : '';
}

/**
 * 页面里没找到图标时，探测 origin/favicon.ico 是否存在
 */
export async function probeFavicon(finalUrl) {
    const faviconUrl = `${new URL(finalUrl).origin}/favicon.ico`;
    try {
        const headResp = await fetch(faviconUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
        // 仅当请求成功且返回的是图片类型才使用
        if (headResp.ok && (headResp.headers.get('content-type') || '').startsWith('image')) {
            return faviconUrl;
        }
    } catch (_) {
        // 忽略错误
    }
    return '';
}

/**
 * 从 HTML 提取元信息和正文
 */
export function extractPageInfo(html, finalUrl) {
    // 标题。知乎这类站点的 title 带属性（<title data-rh="true">）
    let title = '';
    const titleMatch = html.match(/<title(?:\s[^>]*)?>(.*?)<\/title>/is);
    if (titleMatch && titleMatch[1]) {
        title = cleanText(titleMatch[1]);
    }

    // 描述；不少站点只写 og:description 不写 meta description
    let description = '';
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/is);
    if (descMatch && descMatch[1]) {
        description = cleanText(descMatch[1]);
    }
    if (!description) {
        description = extractMetaProperty(html, 'og:description');
    }

    let keywords = '';
    const kwMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["'](.*?)["']/i);
    if (kwMatch && kwMatch[1]) {
        keywords = cleanText(kwMatch[1]);
    }

    // 第一段文本，AI 和 meta 都没有描述时兜底
    let firstParagraph = '';
    const paragraphMatch = html.match(/<p[^>]*>(.*?)<\/p>/is);
    if (paragraphMatch && paragraphMatch[1]) {
        const text = paragraphMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        firstParagraph = text.substring(0, 100) + (text.length > 100 ? '...' : '');
    }

    // 提取纯文本内容（用于AI分析）
    //
    // 同时收两份：mainContent 跳过导航/页头页脚这些结构性区域，allContent 只跳
    // script/style。因为取的是正文「前 N 字」，而现代网站 body 里最先出现的文本
    // 几乎必然是导航栏和菜单名——实测 github.com 的前 800 字全是
    // "Skip to content Navigation Menu Sign in Platform..." 这种，喂给模型纯属噪声。
    let mainContent = '';
    let allContent = '';
    let hardSkipDepth = 0;   // script/style 等，两份都不要
    let chromeSkipDepth = 0; // 导航类区域，只有 mainContent 不要

    const parser = new htmlparser2.Parser({
        onopentagname(name) {
            if (HARD_SKIP_TAGS.has(name)) hardSkipDepth++;
            else if (CHROME_TAGS.has(name)) chromeSkipDepth++;
        },
        ontext(text) {
            if (hardSkipDepth > 0) return;
            allContent += text + ' ';
            if (chromeSkipDepth === 0) mainContent += text + ' ';
        },
        onclosetag(name) {
            // 用计数而不是布尔量，嵌套时才不会提前解除跳过
            if (HARD_SKIP_TAGS.has(name) && hardSkipDepth > 0) hardSkipDepth--;
            else if (CHROME_TAGS.has(name) && chromeSkipDepth > 0) chromeSkipDepth--;
        }
    }, { decodeEntities: true });
    parser.write(html);
    parser.end();

    const cleanedMain = mainContent.replace(/\s+/g, ' ').trim();
    const cleanedAll = allContent.replace(/\s+/g, ' ').trim();

    // 有些站点整页都塞在 header/aside 里，过滤后就没东西了，这时退回未过滤版本
    const content = cleanedMain.length >= MIN_MAIN_CONTENT_CHARS ? cleanedMain : cleanedAll;
    console.log(`正文提取: 过滤后 ${cleanedMain.length} 字 / 未过滤 ${cleanedAll.length} 字，采用${cleanedMain.length >= MIN_MAIN_CONTENT_CHARS ? '过滤后' : '未过滤'}`);

    return {
        host: new URL(finalUrl).host,
        title,
        description,
        keywords,
        // 这两个字段信息密度远高于正文开头那堆菜单名
        siteName: extractMetaProperty(html, 'og:site_name'),
        heading: extractHeading(html),
        icon: extractIcon(html, finalUrl),
        firstParagraph,
        content
    };
}

// ---------- AI ----------

/**
 * 把分类列表整理成编号候选
 *
 * 关键点：给模型看的是分类**名称**和已收录站点，不是 id。
 * 用户会改分类名而 id 不变（比如「社交媒体」改成 AIGC 但 id 还是 social），
 * 让模型输出 id 会被这种错位带偏；改成输出编号后，id 只在服务端做下标映射。
 *
 * @param {Array} categories [{id, name, samples?}]
 * @returns {{list: Array, prompt: string}}
 */
export function buildCategoryCandidates(categories) {
    const list = categories
        .filter(cat => cat && cat.id && cat.name)
        .map(cat => ({
            id: String(cat.id),
            name: String(cat.name).slice(0, 40),
            // 传什么都做一次防御性裁剪，避免撑爆 prompt
            samples: Array.isArray(cat.samples)
                ? cat.samples
                    .filter(sample => typeof sample === 'string' && sample.trim())
                    .slice(0, MAX_SAMPLES_PER_CATEGORY)
                    .map(sample => sample.trim().slice(0, MAX_SAMPLE_CHARS))
                : []
        }));

    const prompt = list.map((cat, index) => {
        const line = `${index + 1}. ${cat.name}`;
        // 样例是「稍后阅读」「工作相关」这类个人分类唯一的判断依据：
        // 这些分类光看网页内容判断不出来，只能看用户已经怎么分的
        return cat.samples.length
            ? `${line}\n   已收录：${cat.samples.join('、')}`
            : line;
    }).join('\n');

    return { list, prompt };
}

/**
 * 解析模型返回的分类结果
 *
 * @param {*} raw AI.run 的返回
 * @param {Array} list buildCategoryCandidates 产出的候选列表
 * @returns {{category: string, confidence: string}} category 为空串表示没判断出来
 */
export function parseCategoryResponse(raw, list) {
    const text = typeof raw === 'string' ? raw : (raw && raw.response);
    if (!text) {
        return { category: '', confidence: 'low' };
    }

    let index = null;
    let confidence = 'low';

    try {
        const parsed = typeof text === 'object' ? text : JSON.parse(text);
        index = parsed.category_index;
        confidence = parsed.confidence || 'low';
    } catch {
        // JSON 模式偶尔会失手（比如裹在 ``` 里），退一步从文本里抠第一个数字
        const match = String(text).match(/\d+/);
        if (match) {
            index = parseInt(match[0], 10);
            confidence = 'medium';
        }
    }

    // 低置信度不自作主张，宁可留空让用户自己选——错分比不分更烦
    if (confidence === 'low') {
        return { category: '', confidence: 'low' };
    }

    const position = Number(index);
    if (!Number.isInteger(position) || position < 1 || position > list.length) {
        return { category: '', confidence: 'low' };
    }

    return { category: list[position - 1].id, confidence };
}

/**
 * AI 分类。AI 调用出错时抛异常，由调用方决定怎么兜底
 *
 * @returns {Promise<{category: string, confidence: string}>}
 */
export async function classifyCategory(env, info, categories) {
    // 候选分类用编号列出，模型返回编号，服务端按下标映射回 id。
    // 不让模型输出 id：用户改了分类名但 id 不变（「社交媒体」改成 AIGC、
    // id 仍是 social），输出 id 会被这种错位带偏；编号制还顺带消灭了
    // 原来那套「模型输出里包含分类名就算命中」的子串匹配。
    const { list: candidates, prompt: candidatePrompt } = buildCategoryCandidates(categories || []);

    // 没有可选分类就没什么好判断的
    if (candidates.length === 0) {
        return { category: '', confidence: 'low' };
    }

    // 空字段不进 prompt，省 token 也少一点干扰
    const siteInfo = [
        ['域名', info.host],
        ['站点名', info.siteName],
        ['标题', info.title],
        ['主标题', info.heading],
        ['描述', info.description],
        ['关键词', info.keywords],
        ['正文摘要', (info.content || '').substring(0, CONTENT_CHARS_FOR_CATEGORY)]
    ].filter(([, value]) => value && String(value).trim())
        .map(([label, value]) => `${label}：${value}`)
        .join('\n');

    const input = `请判断这个网站应该归到哪个分类。

候选分类：
${candidatePrompt}

待分类网站：
${siteInfo}

判断规则：
1. 优先对照各分类下「已收录」的站点。分类名可能是个人化的（比如「稍后阅读」
   「工作相关」），光看网站内容判断不出来，只能看用户实际把什么样的站点放进去了。
2. 一个站点同时符合多个分类时，选已收录样例里最相似的那个，而不是主题上最宽泛的那个。
   比如一个讲 AI 工具的 GitHub 仓库，如果某个分类的样例里已经有很多 AI 相关仓库，
   就该归到那个分类，而不是笼统归到「开发技术」。
3. 确实对不上任何分类的样例风格，confidence 返回 low，不要硬猜。

返回该分类的编号。`;

    console.log('AI分类输入:', input.substring(0, 800));

    const aiResponse = await env.AI.run(AI_MODEL, {
        messages: [
            { role: 'system', content: '你是网站分类助手。从候选分类中选出最匹配的一个，返回它的编号。只有在确实匹配时才给出 high 或 medium 置信度；拿不准就返回 low，不要硬猜。' },
            { role: 'user', content: input }
        ],
        temperature: 0,
        response_format: {
            type: 'json_schema',
            json_schema: {
                type: 'object',
                properties: {
                    category_index: { type: 'integer' },
                    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
                },
                required: ['category_index', 'confidence']
            }
        }
    });

    const parsed = parseCategoryResponse(aiResponse, candidates);
    console.log('AI返回的分类:', parsed.category || '(未判断)', parsed.confidence);
    return parsed;
}

/**
 * 描述超长时在上限内最后一个标点处截断，避免把词切成半截（如「GPT Image 生」）。
 * 上限内找不到合适标点才硬截
 */
export function truncateDescription(text, max = MAX_DESCRIPTION_CHARS) {
    const chars = [...text];
    if (chars.length <= max) return text;
    const head = chars.slice(0, max).join('');
    const cut = Math.max(...[...'。！？；，、.!?;,'].map(p => head.lastIndexOf(p)));
    // 标点太靠前说明截掉的太多，宁可硬截
    // 句中标点去掉，由调用方补句号
    if (cut >= max / 2) return head.slice(0, cut + 1).replace(/[，、,；;]$/, '');
    return head;
}

/**
 * AI 生成简洁中文描述。出错时抛异常，模型没返回内容时返回空串
 */
export async function summarizeDescription(env, info) {
    const descPrompt = `请根据以下网页信息，用简体中文生成不超过两句话的简洁总结，直接给出描述内容，不要包含"简洁总结"或类似前缀，也不要添加任何解释:\n标题: ${info.title}\n关键词: ${info.keywords}\n描述: ${info.description}\n正文内容: ${(info.content || '').substring(0, CONTENT_CHARS_FOR_DESCRIPTION)}`;

    console.log('AI描述输入:', descPrompt.substring(0, 500) + (descPrompt.length > 500 ? '...[截断]' : ''));

    const aiDescResp = await env.AI.run(AI_MODEL, {
        messages: [
            { role: 'system', content: '你是一个网页描述生成器。用于收藏网页时使用，请根据用户提供信息生成极简、连贯的中文总结，不超过两句，每句尽量简短。不要包含任何前缀或解释，如Here is the simplified summary: ' },
            { role: 'user', content: descPrompt }
        ],
        temperature: 0.3
    });

    let aiDesc = (aiDescResp && aiDescResp.response || '').trim();
    // 取前两句：按句末标点切分并保留标点
    const parts = aiDesc
        .replace(/\n+/g, ' ')
        .split(/(?<=[。！？.!?])/)
        .map(p => p.trim())
        .filter(Boolean);
    aiDesc = truncateDescription(parts.slice(0, 2).join(''));
    if (aiDesc && !/[。！？.!?]$/.test(aiDesc)) {
        aiDesc += '。';
    }
    console.log('AI描述输出:', aiDesc);
    if (DESCRIPTION_REFUSAL_PATTERN.test(aiDesc)) {
        console.log('AI 描述是拒答，丢弃');
        return '';
    }
    return aiDesc;
}

// ---------- v1 的编排和兜底 ----------

const FETCH_FAILURE_WARNINGS = {
    timeout: 'fetch_timeout',
    blocked: 'fetch_blocked',
    http_error: 'fetch_failed',
    fetch_failed: 'fetch_failed',
    not_html: 'not_html'
};

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                const error = new Error(`timed out after ${ms}ms`);
                error.name = 'TimeoutError';
                reject(error);
            }, ms);
        })
    ]).finally(() => clearTimeout(timer));
}

function hostKey(value) {
    try {
        return new URL(value).host.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
}

/**
 * 同域名历史归类：已收录网址里同 host 最多的分类
 */
export function categoryByDomain(url, sitesByCategory, categoryIds) {
    const host = hostKey(url);
    if (!host) return '';

    let best = '';
    let bestCount = 0;
    for (const id of categoryIds) {
        const count = (sitesByCategory[id] || []).filter(site => hostKey(site.url) === host).length;
        if (count > bestCount) {
            best = id;
            bestCount = count;
        }
    }
    return best;
}

/**
 * 从用户云端数据构造分类候选和样例，规则与前端 collectCategorySamples() 一致：
 * 按 weight 倒序取前 12 个站点的「标题 (host)」
 */
export function buildCategoriesWithSamples(categories, sitesByCategory) {
    return categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        samples: [...(sitesByCategory[cat.id] || [])]
            .sort((a, b) => (b.weight || 100) - (a.weight || 100))
            .slice(0, MAX_SAMPLES_PER_CATEGORY)
            .map(site => {
                let host = '';
                try {
                    host = new URL(site.url).host;
                } catch {
                    // URL 存坏了就只用标题
                }
                const title = (site.title || '').trim();
                if (!title && !host) return '';
                return host ? `${title} (${host})` : title;
            })
            .filter(Boolean)
    }));
}

/**
 * 为只给了 url 的网址补全标题、分类、描述、图标，每个字段各有一条兜底链，不会因为补全失败而抛异常
 *
 * @param {Object} env Worker env（用到 AI）
 * @param {Object} options
 * @param {string} options.url 已规范化的 http(s) 网址
 * @param {Object} [options.provided] 调用方已给的字段 { title, description, category, imageData }，给了就不再推断
 * @param {Object} [options.hints] 扩展从当前页拿到的 { title, description, content, icon }
 * @param {Array} options.categories 真实分类 [{id, name, order}]（不含虚拟分类）
 * @param {Object} options.sitesByCategory 云端 websites 对象
 * @param {Object} [options.timeouts] { fetchMs, aiMs }，测试用
 */
export async function analyzeWebsite(env, {
    url,
    provided = {},
    hints = {},
    categories,
    sitesByCategory = {},
    timeouts = {}
}) {
    const warnings = [];
    const sources = {};
    const needTitle = !provided.title;
    const needDescription = !provided.description;
    const needCategory = !provided.category;
    const needIcon = !provided.imageData;

    // 1. 抓网页。标题、描述、分类都给了就不抓，只缺图标不值得多等一次抓取
    let page = null;
    if (needTitle || needDescription || needCategory) {
        const fetched = await fetchPage(url, env, { timeoutMs: timeouts.fetchMs });
        if (fetched.ok) {
            page = extractPageInfo(fetched.html, fetched.finalUrl);
            page.finalUrl = fetched.finalUrl;
            if (isChallengePage(page)) {
                warnings.push('fetch_blocked');
                page = null;
            }
        } else {
            warnings.push(FETCH_FAILURE_WARNINGS[fetched.failure] || 'fetch_failed');
        }
    }

    // 2. 合并页面信息和扩展传来的 hints。正文太薄时用扩展看到的正文
    const pageContent = page?.content || '';
    let content = pageContent;
    if (pageContent.length < THIN_CONTENT_CHARS) {
        if (page) warnings.push('content_thin');
        if ((hints.content || '').length > pageContent.length) content = hints.content;
    }

    const info = {
        host: new URL(url).host,
        title: provided.title || hints.title || page?.title || page?.siteName || '',
        description: page?.description || hints.description || '',
        keywords: page?.keywords || '',
        siteName: page?.siteName || '',
        heading: page?.heading || '',
        content
    };

    // 3. 分类和描述两轮 AI 并行跑
    const hasAi = !!(env.AI && typeof env.AI.run === 'function');
    if (!hasAi && (needCategory || needDescription)) warnings.push('ai_unavailable');
    const aiMs = timeouts.aiMs || AI_TIMEOUT_MS;

    // 手里没有任何网页内容（抓取失败、也没有 hints）时不让模型写描述，它只能瞎编或拒答。
    // 分类照跑：光凭域名和标题，模型对知名站点也能判断
    const hasDescriptionMaterial = !!(info.description || info.content);
    const runDescriptionAi = needDescription && hasAi && hasDescriptionMaterial;
    if (needDescription && hasAi && !hasDescriptionMaterial) warnings.push('ai_description_skipped');

    const [categoryResult, descriptionResult] = await Promise.allSettled([
        needCategory && hasAi
            ? withTimeout(classifyCategory(env, info, buildCategoriesWithSamples(categories, sitesByCategory)), aiMs)
            : Promise.resolve(null),
        runDescriptionAi
            ? withTimeout(summarizeDescription(env, info), aiMs)
            : Promise.resolve(null)
    ]);

    // 标题
    let title = provided.title;
    if (title) sources.title = 'provided';
    else if (hints.title) { title = hints.title; sources.title = 'hint'; }
    else if (page?.title) { title = page.title; sources.title = 'page'; }
    else if (page?.siteName) { title = page.siteName; sources.title = 'page'; }
    else { title = info.host.replace(/^www\./, ''); sources.title = 'domain'; }

    // 分类
    let category = provided.category;
    let categoryConfidence = 'provided';
    if (category) {
        sources.category = 'provided';
    } else {
        if (categoryResult.status === 'fulfilled' && categoryResult.value?.category) {
            category = categoryResult.value.category;
            categoryConfidence = categoryResult.value.confidence;
            sources.category = 'ai';
        } else if (hasAi) {
            warnings.push(categoryResult.status === 'rejected' ? 'ai_category_failed' : 'ai_category_low_confidence');
            if (categoryResult.status === 'rejected') console.error('AI 分类失败:', categoryResult.reason);
        }

        if (!category) {
            category = categoryByDomain(url, sitesByCategory, categories.map(cat => cat.id));
            if (category) {
                categoryConfidence = 'domain';
                sources.category = 'domain';
            }
        }

        if (!category) {
            const fallback = categories.find(cat => cat.id === 'uncategorized') ||
                [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
            category = fallback?.id || '';
            categoryConfidence = 'fallback';
            sources.category = 'fallback';
        }
    }

    // 描述
    let description = provided.description;
    if (description) {
        sources.description = 'provided';
    } else {
        const aiDesc = descriptionResult.status === 'fulfilled' ? descriptionResult.value : '';
        if (runDescriptionAi && !aiDesc) {
            warnings.push('ai_description_failed');
            if (descriptionResult.status === 'rejected') console.error('AI 描述失败:', descriptionResult.reason);
        }
        if (aiDesc) { description = aiDesc; sources.description = 'ai'; }
        else if (page?.description) { description = page.description; sources.description = 'page'; }
        else if (hints.description) { description = hints.description; sources.description = 'hint'; }
        else if (page?.firstParagraph) { description = page.firstParagraph; sources.description = 'page'; }
        else { description = ''; sources.description = 'none'; }
    }

    // 图标
    let icon = provided.imageData;
    if (icon) {
        sources.icon = 'provided';
    } else if (hints.icon) {
        icon = hints.icon;
        sources.icon = 'hint';
    } else if (page?.icon) {
        icon = page.icon;
        sources.icon = 'page';
    } else if (page && needIcon) {
        icon = await probeFavicon(page.finalUrl);
        sources.icon = icon ? 'page' : 'none';
    } else {
        icon = '';
        sources.icon = 'none';
    }

    return {
        title,
        description,
        category,
        icon,
        analysis: { sources, categoryConfidence, warnings }
    };
}
