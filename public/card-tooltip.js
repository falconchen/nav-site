// 网址卡片悬浮提示：鼠标停留在卡片上时，在卡片旁显示完整标题、网址和描述
// 卡片在多处渲染并会被整体重建，因此用 document 级事件委托，内容直接从卡片 DOM 读取
// 离开卡片后留一段宽限期，鼠标移进提示框即可保持显示，在上面点网址打开或复制网址/Markdown 链接
(function () {
    const SHOW_DELAY = 400;
    const HIDE_DELAY = 250;
    const GAP = 10;          // 留出箭头伸出的位置
    const CARET_ANCHOR = 28; // 箭头对准卡片顶部往下这么多像素（大致是图标/标题行）
    const CARET_INSET = 14;  // 箭头离提示框上下边缘的最小距离
    const VIEWPORT_MARGIN = 8;
    const COPIED_FEEDBACK_MS = 1200;

    // 触屏设备没有悬浮，长按会触发右键菜单，不显示提示
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');

    let tooltip = null;
    let hoverCard = null;   // 鼠标当前所在的卡片
    let activeCard = null;  // 提示框当前展示的卡片
    let showTimer = null;
    let hideTimer = null;
    let data = { title: '', url: '' };

    function ensureTooltip() {
        if (tooltip) return tooltip;
        tooltip = document.createElement('div');
        tooltip.className = 'card-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.innerHTML = `
            <div class="card-tooltip-body">
                <div class="card-tooltip-title"></div>
                <a class="card-tooltip-url" target="_blank" rel="noopener noreferrer"><span class="card-tooltip-url-text"></span><i class="fas fa-external-link-alt" aria-hidden="true"></i></a>
                <div class="card-tooltip-description"></div>
            </div>
            <div class="card-tooltip-actions">
                <button type="button" data-action="copy-url"><i class="fas fa-link"></i><span>复制网址</span></button>
                <button type="button" data-action="copy-markdown"><i class="fab fa-markdown"></i><span>复制为Markdown</span></button>
            </div>
        `;
        tooltip.addEventListener('click', handleActionClick);
        document.body.appendChild(tooltip);
        return tooltip;
    }

    function textOf(card, selector) {
        const el = card.querySelector(selector);
        return el ? el.textContent.trim() : '';
    }

    function isVisible() {
        return !!tooltip && tooltip.classList.contains('visible');
    }

    function contains(root, el) {
        return !!root && !!el && root.contains(el);
    }

    function position(card) {
        const rect = card.getBoundingClientRect();
        const tipWidth = tooltip.offsetWidth;
        const tipHeight = tooltip.offsetHeight;
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;

        // 优先放在卡片右侧，放不下再放左侧，都放不下则贴右边缘
        let left = rect.right + GAP;
        let side = 'right';
        if (left + tipWidth > vw - VIEWPORT_MARGIN) {
            const leftSide = rect.left - GAP - tipWidth;
            if (leftSide >= VIEWPORT_MARGIN) {
                left = leftSide;
                side = 'left';
            } else {
                left = vw - VIEWPORT_MARGIN - tipWidth;
                side = 'edge';
            }
        }

        let top = rect.top;
        top = Math.min(top, vh - VIEWPORT_MARGIN - tipHeight);
        top = Math.max(top, VIEWPORT_MARGIN);

        tooltip.style.left = `${Math.max(left, VIEWPORT_MARGIN)}px`;
        tooltip.style.top = `${top}px`;
        tooltip.dataset.side = side;

        // 提示框被视口夹住上下移位时，箭头仍要对准卡片
        const caretTarget = rect.top + Math.min(CARET_ANCHOR, rect.height / 2) - top;
        const caretY = Math.min(Math.max(caretTarget, CARET_INSET), tipHeight - CARET_INSET);
        tooltip.style.setProperty('--caret-y', `${caretY}px`);
    }

    function show(card) {
        showTimer = null;
        // 编辑模式下卡片可拖拽，提示会挡视线
        if (card.classList.contains('editing') || !card.isConnected) return;

        const title = textOf(card, '.card-title');
        if (!title) return;
        // 私密卡片的描述点开前在提示里也只显示掩码
        const masked = card.classList.contains('private-card') && !card.querySelector('.card-secret.revealed');
        const description = masked ? '••••••' : textOf(card, '.card-description');
        data = { title, url: textOf(card, '.card-url') };

        ensureTooltip();
        cancelHide();
        tooltip.querySelector('.card-tooltip-title').textContent = title;
        const urlLink = tooltip.querySelector('.card-tooltip-url');
        urlLink.querySelector('.card-tooltip-url-text').textContent = data.url;
        urlLink.href = toFullUrl(data.url);
        tooltip.querySelector('.card-tooltip-description').textContent = description;
        tooltip.querySelector('.card-tooltip-description').hidden = !description;
        tooltip.querySelectorAll('button.copied').forEach(resetCopiedButton);

        tooltip.classList.remove('visible');
        tooltip.style.left = '-9999px';
        tooltip.style.top = '0px';
        position(card);
        tooltip.classList.add('visible');
        activeCard = card;
    }

    function scheduleShow(card) {
        clearTimeout(showTimer);
        showTimer = setTimeout(() => show(card), SHOW_DELAY);
    }

    function cancelShow() {
        clearTimeout(showTimer);
        showTimer = null;
    }

    // 宽限期结束只收起当前提示框，不能动排队中的 show：
    // 从卡片 A 移到卡片 B 时两个计时器同时在跑，HIDE_DELAY 比 SHOW_DELAY 短，
    // 若在这里取消 show，B 的提示就不会出现，要等鼠标在 B 里再移动才触发
    function scheduleHide() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(dismiss, HIDE_DELAY);
    }

    function cancelHide() {
        clearTimeout(hideTimer);
        hideTimer = null;
    }

    function dismiss() {
        cancelHide();
        activeCard = null;
        if (tooltip) tooltip.classList.remove('visible');
    }

    // 点击、滚动等场景：连同排队中的 show 一起清掉
    function hide() {
        cancelShow();
        hoverCard = null;
        dismiss();
    }

    // ---- 提示框上的操作 ----

    function toFullUrl(url) {
        // 与卡片点击保持一致：没有协议的网址补 http://
        return url.includes('://') ? url : `http://${url}`;
    }

    // [标题](链接)：标题里的方括号会提前闭合链接文本，链接里的空格和圆括号会截断地址
    function toMarkdownLink(title, url) {
        const text = title.replace(/[\\[\]]/g, '\\$&');
        const href = toFullUrl(url).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
        return `[${text}](${href})`;
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        }
        return fallbackCopy(text);
    }

    function fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        const ok = document.execCommand('copy');
        textArea.remove();
        return ok ? Promise.resolve() : Promise.reject(new Error('execCommand copy failed'));
    }

    function markCopied(button) {
        const label = button.querySelector('span');
        const icon = button.querySelector('i');
        if (!button.dataset.label) button.dataset.label = label.textContent;
        if (!button.dataset.icon) button.dataset.icon = icon.className;
        label.textContent = '已复制';
        icon.className = 'fas fa-check';
        button.classList.add('copied');
        clearTimeout(button._copiedTimer);
        button._copiedTimer = setTimeout(() => resetCopiedButton(button), COPIED_FEEDBACK_MS);
    }

    function resetCopiedButton(button) {
        clearTimeout(button._copiedTimer);
        button.classList.remove('copied');
        if (button.dataset.label) button.querySelector('span').textContent = button.dataset.label;
        if (button.dataset.icon) button.querySelector('i').className = button.dataset.icon;
    }

    function handleActionClick(e) {
        // 网址本身是链接，交给浏览器在新标签页打开，这里只负责收起提示框
        if (e.target.closest('.card-tooltip-url')) {
            hide();
            return;
        }

        const button = e.target.closest('button[data-action]');
        if (!button) return;

        switch (button.dataset.action) {
            case 'copy-url':
            case 'copy-markdown': {
                const text = button.dataset.action === 'copy-url'
                    ? data.url
                    : toMarkdownLink(data.title, data.url);
                copyText(text)
                    .then(() => markCopied(button))
                    .catch(() => {
                        if (typeof showNotification === 'function') {
                            showNotification('复制失败，请手动复制', 'error');
                        }
                    });
                break;
            }
        }
    }

    // ---- 悬浮进出 ----

    document.addEventListener('mouseover', (e) => {
        if (!canHover.matches) return;

        // 进入提示框：取消隐藏，也取消可能正在排队的其它卡片
        if (contains(tooltip, e.target)) {
            cancelHide();
            cancelShow();
            return;
        }

        const card = e.target.closest && e.target.closest('.website-card');
        if (!card || card === hoverCard) return;

        hoverCard = card;
        if (card === activeCard) {
            cancelHide();
            cancelShow();
            return;
        }
        if (isVisible()) scheduleHide();
        scheduleShow(card);
    });

    document.addEventListener('mouseout', (e) => {
        const fromTracked = contains(hoverCard, e.target) || contains(activeCard, e.target) || contains(tooltip, e.target);
        if (!fromTracked) return;

        // 在卡片或提示框内部移动，或在两者之间来回，都不算离开
        const to = e.relatedTarget;
        if (contains(hoverCard, to) || contains(activeCard, to) || contains(tooltip, to)) return;

        hoverCard = null;
        cancelShow();
        if (isVisible()) scheduleHide();
    });

    // 点击打开网站、右键菜单、滚动都会让提示位置或意义失效；提示框内部的点击除外
    document.addEventListener('mousedown', (e) => {
        if (!contains(tooltip, e.target)) hide();
    }, true);
    document.addEventListener('contextmenu', (e) => {
        if (!contains(tooltip, e.target)) hide();
    }, true);
    // 私密卡片点开或收起描述时，点击已经把提示收掉了，鼠标还在卡片上就按新状态重新显示
    document.addEventListener('private-card-change', (e) => {
        const card = e.target;
        if (!canHover.matches || !card.matches(':hover')) return;
        hoverCard = card;
        scheduleShow(card);
    });
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
})();
