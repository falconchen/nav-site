/**
 * 右键一键收藏的页内提示
 *
 * 系统通知在 macOS 上经常看不到（Chrome 的通知权限没开、专注模式），而保存要跑 AI，要等好几秒，
 * 所以进度和结果直接画在网页右上角。
 */

// 注入到网页里执行，只能用网页自己的 DOM，不能引用外部变量。
// 跑在扩展的隔离环境里，挂在 window 上的引用网页脚本看不到，多次注入之间能共用
export function renderToast(state, title, message) {
    const HIDE_DELAY = { success: 4000, error: 8000 };

    let toast = window.__pipi2047Toast;
    if (!toast || !toast.host.isConnected) {
        const host = document.createElement('div');
        host.style.cssText = 'all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647;';
        // 用 shadow DOM 隔开网页样式
        const root = host.attachShadow({ mode: 'closed' });
        root.innerHTML = `
            <style>
                .toast {
                    --bg: #fff; --text: #1e293b; --muted: #64748b; --border: #e2e8f0;
                    --primary: #4f46e5; --success: #059669; --error: #dc2626;
                    display: flex; gap: 10px; align-items: flex-start;
                    width: 300px; padding: 12px 14px; box-sizing: border-box;
                    border: 1px solid var(--border); border-radius: 10px;
                    background: var(--bg); color: var(--text);
                    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
                    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
                    animation: enter 0.18s ease-out;
                }
                @media (prefers-color-scheme: dark) {
                    .toast {
                        --bg: #1e293b; --text: #f1f5f9; --muted: #94a3b8; --border: #334155;
                        --primary: #818cf8; --success: #34d399; --error: #f87171;
                    }
                }
                @keyframes enter { from { opacity: 0; transform: translateY(-6px); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                .icon {
                    flex-shrink: 0; display: grid; place-items: center;
                    width: 20px; height: 20px; margin-top: 1px; border-radius: 50%;
                    color: #fff; font-size: 13px; font-weight: 700; line-height: 1;
                }
                .loading .icon {
                    box-sizing: border-box; border: 2.5px solid var(--border); border-top-color: var(--primary);
                    animation: spin 0.8s linear infinite;
                }
                .success .icon { background: var(--success); }
                .error .icon { background: var(--error); }
                .text { flex: 1; min-width: 0; }
                .title { font-weight: 600; }
                .message {
                    margin-top: 2px; color: var(--muted); font-size: 13px;
                    white-space: pre-line; overflow-wrap: anywhere;
                }
                .message:empty { display: none; }
                .close {
                    flex-shrink: 0; border: none; background: none; padding: 0 2px;
                    color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer;
                }
                .close:hover { color: var(--text); }
            </style>
            <div class="toast" role="status" aria-live="polite">
                <span class="icon" aria-hidden="true"></span>
                <div class="text">
                    <div class="title"></div>
                    <div class="message"></div>
                </div>
                <button type="button" class="close" aria-label="关闭">×</button>
            </div>`;
        toast = {
            host,
            box: root.querySelector('.toast'),
            icon: root.querySelector('.icon'),
            title: root.querySelector('.title'),
            message: root.querySelector('.message'),
            timer: 0
        };
        root.querySelector('.close').addEventListener('click', () => host.remove());
        (document.body || document.documentElement).appendChild(host);
        window.__pipi2047Toast = toast;
    }

    toast.box.className = `toast ${state}`;
    toast.icon.textContent = { success: '✓', error: '!' }[state] || '';
    toast.title.textContent = title;
    toast.message.textContent = message || '';

    clearTimeout(toast.timer);
    if (HIDE_DELAY[state]) {
        toast.timer = setTimeout(() => toast.host.remove(), HIDE_DELAY[state]);
    }
}
