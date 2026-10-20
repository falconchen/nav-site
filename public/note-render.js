// 记事正文的渲染和下载，记事本页（notes.html）和公开页（note-public.html）共用。
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

    // ---- 大纲 ----
    // 正文过了 DOMPurify，标题上没有 id（禁掉了），记事本页又靠 hash 路由，所以大纲不用锚点链接，
    // 点击时直接滚到对应的标题元素
    const TOC_SELECTOR = 'h1, h2, h3, h4';
    const TOC_MIN_ITEMS = 2;

    function tocHeadings(article) {
        const headings = Array.from(article.querySelectorAll(TOC_SELECTOR)).filter(h => h.textContent.trim());
        // 正文第一行写成 `# 标题` 时它就是记事标题，不进大纲
        if (headings[0] && headings[0] === article.firstElementChild) headings.shift();
        return headings;
    }

    const headingLevel = heading => Number(heading.tagName.slice(1));

    // 标题停在吸顶页眉下面留这么多空。不用 scrollIntoView + 全站的 scroll-padding-top：
    // 那个值算进了首页 tab 栏的高度，记事本页没有 tab 栏，标题上方会多空出一截
    const TOC_SCROLL_GAP = 12;

    function stickyHeaderBottom() {
        return document.querySelector('.header')?.getBoundingClientRect().bottom || 0;
    }

    /**
     * 给渲染好的 Markdown 正文加大纲，插在 article 前面。标题不到 2 个时不加
     * @returns {HTMLElement|null}
     */
    function mountNoteToc(article) {
        const headings = tocHeadings(article);
        if (headings.length < TOC_MIN_ITEMS) return null;

        const topLevel = Math.min(...headings.map(headingLevel));
        const nav = document.createElement('nav');
        nav.className = 'note-toc';
        nav.setAttribute('aria-label', '大纲');
        nav.innerHTML = `
            <button type="button" class="note-toc-toggle" aria-expanded="false">
                <i class="fas fa-list-ul"></i> 大纲 <span class="note-toc-count">${headings.length}</span>
                <i class="fas fa-chevron-down note-toc-caret"></i>
            </button>
            <p class="note-toc-heading">大纲</p>
            <ol class="note-toc-list"></ol>`;
        const list = nav.querySelector('.note-toc-list');
        const items = headings.map((heading, index) => {
            const item = document.createElement('li');
            item.style.setProperty('--toc-depth', headingLevel(heading) - topLevel);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'note-toc-item';
            button.dataset.tocIndex = index;
            button.textContent = heading.textContent.trim();
            item.appendChild(button);
            list.appendChild(item);
            return button;
        });
        article.before(nav);

        const toggle = nav.querySelector('.note-toc-toggle');
        nav.addEventListener('click', e => {
            if (e.target.closest('.note-toc-toggle')) {
                const open = !nav.classList.contains('open');
                nav.classList.toggle('open', open);
                toggle.setAttribute('aria-expanded', String(open));
                return;
            }
            const button = e.target.closest('.note-toc-item');
            if (!button) return;
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const heading = headings[Number(button.dataset.tocIndex)];
            const top = window.scrollY + heading.getBoundingClientRect().top - stickyHeaderBottom() - TOC_SCROLL_GAP;
            window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
        });

        // 高亮当前读到的那一节：最后一个顶端已经越过页眉的标题
        let frame = 0;
        function highlight() {
            frame = 0;
            // 记事本页切走时整块重画，旧的大纲不在页面上了，顺手摘掉监听
            if (!nav.isConnected) {
                window.removeEventListener('scroll', onScroll);
                return;
            }
            const offset = stickyHeaderBottom() + TOC_SCROLL_GAP + 8;
            let current = -1;
            headings.forEach((heading, index) => {
                if (heading.getBoundingClientRect().top <= offset) current = index;
            });
            items.forEach((button, index) => {
                if (index === current) button.setAttribute('aria-current', 'true');
                else button.removeAttribute('aria-current');
            });
        }
        function onScroll() {
            if (!frame) frame = requestAnimationFrame(highlight);
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        highlight();
        return nav;
    }

    function formatNoteTime(value, now = Date.now()) {
        const time = new Date(value).getTime();
        if (Number.isNaN(time)) return '';
        const minutes = Math.floor((now - time) / 60000);
        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes} 分钟前`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} 小时前`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} 天前`;
        const date = new Date(time);
        const pad = number => String(number).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    // 下载用的文件名：标题换掉文件系统不认的字符，纯文本 .txt、Markdown .md。
    // usedNames 用来给同一批里重名的文件编号（打包导出时传同一个 Set）
    function noteFileName(note, usedNames = new Set()) {
        let title = String(note.title || '无标题').normalize('NFC')
            .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_');
        title = Array.from(title).slice(0, 50).join('').replace(/^[.\s]+|[.\s]+$/g, '') || '无标题';
        if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title)) title = '_' + title;
        const extension = note.syntax === 'markdown' ? '.md' : '.txt';
        let name = title + extension;
        let suffix = 2;
        while (usedNames.has(name.toLowerCase())) name = `${title} (${suffix++})${extension}`;
        usedNames.add(name.toLowerCase());
        return name;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        try {
            document.body.appendChild(link);
            link.click();
        } finally {
            setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 100);
        }
    }

    // 「下载笔记」：正文原样存成一个文件，不附加任何信息
    function downloadNote(note) {
        const type = note.syntax === 'markdown' ? 'text/markdown' : 'text/plain';
        downloadBlob(new Blob([String(note.content ?? '')], { type: type + ';charset=utf-8' }), noteFileName(note));
    }

    globalThis.NoteRender = { renderNoteContent, renderPlain, mountNoteToc, formatNoteTime, noteFileName, downloadBlob, downloadNote };
})();
