// 公开发布的记事（/n/<公开 id>，页面是 note-public.html）：只读，不需要登录。
// 内容是别人写的，渲染一律走 note-render.js 的过滤
(function () {
    const container = document.getElementById('publicNote');
    const { renderNoteContent, formatNoteTime } = NoteRender;

    function showMessage(text) {
        container.innerHTML = `<p class="notes-empty">${escapeHtml(text)}</p>`;
    }

    async function load() {
        const publicId = location.pathname.split('/')[2] || '';
        let response;
        try {
            response = await fetch(`/api/public/notes/${encodeURIComponent(publicId)}`);
        } catch (error) {
            showMessage(I18n.t("网络连接失败，稍后再试。"));
            return;
        }
        if (response.status === 404) {
            showMessage(I18n.t("这条记事不存在，或者作者已经取消发布。"));
            return;
        }
        if (!response.ok) {
            showMessage(response.status === 429 ? I18n.t("打开得太频繁了，稍后再试。") : I18n.t("暂时打不开，稍后再试。"));
            return;
        }

        const { note } = await response.json();
        const { html, plain } = renderNoteContent(note.content, note.syntax);
        document.title = I18n.t("{0} · 皮皮2047", { 0: note.title });
        container.innerHTML = `
            <p class="note-meta">${I18n.html("{0}修改 · {1} 字", { 0: formatNoteTime(note.updatedAt), 1: note.content.length.toLocaleString(I18n.locale) })}</p>
            <article class="note-content${plain ? ' note-plain' : ''}">${html}</article>`;
    }

    load();
})();
