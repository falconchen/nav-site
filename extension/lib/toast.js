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
                    --card: #fff; --ink: #1c1b19; --ink-2: #55514a; --ink-3: #8a857b; --line: #e4e0d6;
                    --accent: #c4412a; --success: #2f7a55; --error: #b3261e;
                    display: flex; gap: 12px; align-items: flex-start;
                    width: 312px; padding: 14px 14px 14px 16px; box-sizing: border-box;
                    border: 1px solid var(--line); border-radius: 14px;
                    background: var(--card); color: var(--ink);
                    box-shadow: 0 2px 6px rgba(28, 27, 25, 0.06), 0 24px 48px -16px rgba(28, 27, 25, 0.32);
                    font: 14px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
                    -webkit-font-smoothing: antialiased;
                    animation: enter 0.32s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @media (prefers-color-scheme: dark) {
                    .toast {
                        --card: #1c1b19; --ink: #edeae3; --ink-2: #b3ada2; --ink-3: #7f796f; --line: #2a2825;
                        --accent: #e2664c; --success: #5cb88a; --error: #ef6a5f;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 24px 48px -16px rgba(0, 0, 0, 0.8);
                    }
                }
                @keyframes enter { from { opacity: 0; transform: translateY(-8px) scale(0.98); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                .icon {
                    flex-shrink: 0; display: grid; place-items: center; box-sizing: border-box;
                    width: 20px; height: 20px; margin-top: 1px; border-radius: 50%;
                    color: #fff; font-size: 11px; font-weight: 800; line-height: 1;
                }
                .loading .icon {
                    border: 2px solid var(--line); border-top-color: var(--accent);
                    animation: spin 0.8s linear infinite;
                }
                .success .icon { background: var(--success); }
                .error .icon { background: var(--error); }
                .text { flex: 1; min-width: 0; }
                .title { font-weight: 600; letter-spacing: -0.005em; }
                .message {
                    margin-top: 2px; color: var(--ink-2); font-size: 13px; line-height: 1.6;
                    white-space: pre-line; overflow-wrap: anywhere;
                }
                .message:empty { display: none; }
                .close {
                    flex-shrink: 0; display: grid; place-items: center;
                    width: 24px; height: 24px; margin: -2px -4px 0 0; padding: 0;
                    border: none; border-radius: 6px; background: none;
                    color: var(--ink-3); font-size: 16px; line-height: 1; cursor: pointer;
                }
                .close:hover { color: var(--ink); background: rgba(128, 120, 108, 0.14); }
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
