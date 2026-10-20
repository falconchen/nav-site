// 公开发布的记事（/n/<公开 id>，页面是 note-public.html）：只读，不需要登录。
// 内容是别人写的，渲染一律走 note-render.js 的过滤
(function () {
    const container = document.getElementById('publicNote');
    const { renderNoteContent, mountNoteToc, formatNoteTime } = NoteRender;
    const NOT_FOUND = '这条记事不存在，或者作者已经取消发布。';

    function showMessage(text) {
        container.innerHTML = `<p class="notes-empty">${escapeHtml(text)}</p>`;
    }

    function render(note) {
        const { html, plain } = renderNoteContent(note.content, note.syntax);
        document.title = `${note.title} · 皮皮2047`;
        container.innerHTML = `
            <p class="note-meta">${escapeHtml(formatNoteTime(note.updatedAt))}修改 · ${note.content.length.toLocaleString('zh-CN')} 字</p>
            <article class="note-content${plain ? ' note-plain' : ''}">${html}</article>`;
        if (!plain) mountNoteToc(container.querySelector('.note-content'));
    }

    // 服务端（/n/:id 路由）内联的数据：{ note } 或 { note: null }。超限、存储故障时不内联，返回 undefined
    function readInlined() {
        const element = document.getElementById('publicNoteData');
        if (!element) return undefined;
        try {
            return JSON.parse(element.textContent);
        } catch {
            return undefined;
        }
    }

    async function load() {
        const inlined = readInlined();
        if (inlined) {
            if (inlined.note) render(inlined.note);
            else showMessage(NOT_FOUND);
            return;
        }

        const publicId = location.pathname.split('/')[2] || '';
        let response;
        try {
            response = await fetch(`/api/public/notes/${encodeURIComponent(publicId)}`);
        } catch (error) {
            showMessage('网络连接失败，稍后再试。');
            return;
        }
        if (response.status === 404) {
            showMessage(NOT_FOUND);
            return;
        }
        if (!response.ok) {
            showMessage(response.status === 429 ? '打开得太频繁了，稍后再试。' : '暂时打不开，稍后再试。');
            return;
        }

        const { note } = await response.json();
        render(note);
    }

    load();
})();
