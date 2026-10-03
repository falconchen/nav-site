// 记事正文的渲染，记事本页（notes.html）和公开页（note-public.html）共用。
// 依赖 utils.js 的 escapeHtml，以及 vendor 里的 marked、DOMPurify。
// 公开页渲染的是别人写的内容，所以这里出来的 HTML 必须是过滤过的，调用方直接塞进 innerHTML
(function () {
    const LINK_REL = 'noopener nofollow ugc';
    // 网址到空白、引号、尖括号或中文标点为止
    const URL_PATTERN = /https?:\/\/[^\s<>"'，。；！？、（）【】《》]+/g;
    // 句子里网址后面跟着的英文标点不算网址的一部分
    const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

    let hooksReady = false;

    function setupSanitizer() {
        if (hooksReady) return;
        hooksReady = true;
        DOMPurify.addHook('afterSanitizeAttributes', node => {
            if (node.tagName === 'A') {
                node.setAttribute('target', '_blank');
                node.setAttribute('rel', LINK_REL);
            }
            if (node.tagName === 'IMG') {
                node.setAttribute('loading', 'lazy');
                node.setAttribute('referrerpolicy', 'no-referrer');
            }
            // 只留任务列表的勾选框，而且不能点；别的输入框可以拿来伪造登录表单
            if (node.tagName === 'INPUT') {
                if (node.getAttribute('type') === 'checkbox') {
                    node.setAttribute('disabled', '');
                } else {
                    node.remove();
                }
            }
        });
    }

    function renderMarkdown(content) {
        setupSanitizer();
        const html = marked.parse(content, { gfm: true, breaks: true });
        return DOMPurify.sanitize(html, {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'option'],
            // 不让正文带样式和 id：能盖住页面别的部分，或者顶替页面脚本要找的元素
            FORBID_ATTR: ['style', 'class', 'id', 'name']
        });
    }

    // 纯文本：全部转义，只把网址变成链接；换行靠 CSS 的 pre-wrap 保留
    function renderPlain(content) {
        let html = '';
        let last = 0;
        for (const match of content.matchAll(URL_PATTERN)) {
            const url = match[0].replace(TRAILING_PUNCTUATION, '');
            html += escapeHtml(content.slice(last, match.index));
            html += `<a href="${escapeHtml(url)}" target="_blank" rel="${LINK_REL}">${escapeHtml(url)}</a>`;
            last = match.index + url.length;
        }
        return html + escapeHtml(content.slice(last));
    }

    const canRenderMarkdown = () => typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined';

    /**
     * @returns {{ html: string, plain: boolean }} plain 为真时容器要加 .note-plain 保留换行
     */
    function renderNoteContent(content, syntax) {
        const text = String(content ?? '');
        // 库没加载上（网络问题）时退回纯文本，宁可难看也不显示没过滤的 HTML
        if (syntax === 'markdown' && canRenderMarkdown()) {
            return { html: renderMarkdown(text), plain: false };
        }
        return { html: renderPlain(text), plain: true };
    }

    function formatNoteTime(value, now = Date.now()) {
        const time = new Date(value).getTime();
        if (Number.isNaN(time)) return '';
        const minutes = Math.floor((now - time) / 60000);
        if (minutes < 1) return I18n.t("刚刚");
        if (minutes < 60) return I18n.relativeTime(-minutes, 'minute');
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return I18n.relativeTime(-hours, 'hour');
        const days = Math.floor(hours / 24);
        if (days < 30) return I18n.relativeTime(-days, 'day');
        const date = new Date(time);
        return new Intl.DateTimeFormat(I18n.locale).format(date);
    }

    globalThis.NoteRender = { renderNoteContent, renderPlain, formatNoteTime };
})();
