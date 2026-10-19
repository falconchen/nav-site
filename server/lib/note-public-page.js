/**
 * 公开记事页（/n/<公开 id>）的服务端预填
 *
 * 只填 <title>、分享卡片用的 og / twitter 标签，再把记事数据以 JSON 内联进页面，省掉页面再调一次接口。
 * 正文仍由浏览器端 note-render.js 用 marked + DOMPurify 渲染：Workers 里没有 DOM，跑不了 DOMPurify，
 * 不要在这里另写一套 HTML 过滤去渲染正文。
 */

const SITE_NAME = '皮皮2047';
const EXCERPT_LENGTH = 120;
const DEFAULT_DESCRIPTION = '皮皮2047 上公开的一条记事';

export const NOTE_DATA_ID = 'publicNoteData';

function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 放进 <script type="application/json">：转义 < 就不会提前遇到 </script> 或 <!--
function scriptJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

// 去掉 Markdown 记号，只留读得懂的文字
function stripMarkdown(text) {
    return text
        .replace(/^\s*(```|~~~).*$/gm, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, '')
        .replace(/[*_~`]+/g, '');
}

/**
 * 分享卡片的摘要：标题之后的正文压成一行，截到 120 字
 */
export function noteExcerpt(content, syntax, maxLength = EXCERPT_LENGTH) {
    const lines = String(content ?? '').split('\n');
    // 标题就是第一个非空行，摘要不再重复它
    const titleLine = lines.findIndex(line => line.trim());
    let body = titleLine === -1 ? '' : lines.slice(titleLine + 1).join('\n');
    if (syntax === 'markdown') body = stripMarkdown(body);
    const text = body.replace(/\s+/g, ' ').trim();
    const chars = Array.from(text);
    return chars.length > maxLength ? `${chars.slice(0, maxLength).join('')}…` : text;
}

function metaTags({ title, description, url, image }) {
    const tags = [
        ['name', 'description', description],
        ['property', 'og:type', 'article'],
        ['property', 'og:site_name', SITE_NAME],
        ['property', 'og:title', title],
        ['property', 'og:description', description],
        ['property', 'og:url', url],
        ['property', 'og:image', image],
        ['property', 'og:image:width', '1200'],
        ['property', 'og:image:height', '630'],
        ['property', 'og:locale', 'zh_CN'],
        ['name', 'twitter:card', 'summary'],
        ['name', 'twitter:title', title],
        ['name', 'twitter:description', description],
        ['name', 'twitter:image', image]
    ];
    return tags.map(([key, name, value]) => `<meta ${key}="${name}" content="${escapeAttr(value)}">`).join('');
}

/**
 * 把公开页模板改写成带数据的页面
 *
 * @param {Response} template ASSETS 取回的 note-public.html
 * @param {Object} options
 * @param {Object|null} options.note getPublicNote() 的结果，null 表示记事不存在或已取消发布
 * @param {URL} options.url 页面网址，og:url 和图片地址按它的 origin 拼
 */
export function renderPublicNotePage(template, { note, url }) {
    const dataScript = `<script type="application/json" id="${NOTE_DATA_ID}">${scriptJson({ note })}</script>`;
    let rewriter = new HTMLRewriter().on('#publicNote', {
        element(el) { el.after(dataScript, { html: true }); }
    });

    if (note) {
        const meta = metaTags({
            title: note.title,
            description: noteExcerpt(note.content, note.syntax) || DEFAULT_DESCRIPTION,
            url: `${url.origin}${url.pathname}`,
            image: `${url.origin}/img/og-cover.png`
        });
        rewriter = rewriter
            .on('title', { element(el) { el.setInnerContent(`${note.title} · ${SITE_NAME}`); } })
            .on('head', { element(el) { el.append(meta, { html: true }); } });
    }

    return rewriter.transform(template);
}
