// 视图 tab：最近添加 / 访问最多 / 特别关注 / 全部网站
// 当前 tab 写在 <html data-tab>，index.html 的内联脚本在首屏前就设好了，CSS 按它切换面板

const VIEW_TABS = ['recent', 'frequent', 'pinned', 'all'];
// 每个 tab 各自记住滚动位置，来回切换时不用重新往下翻
const tabScrollPositions = {};

function getActiveTab() {
    const tab = document.documentElement.getAttribute('data-tab');
    return VIEW_TABS.includes(tab) ? tab : 'pinned';
}

function switchTab(tab, options = {}) {
    if (!VIEW_TABS.includes(tab)) return;

    // 搜索时显示的是全部网站的结果，点 tab 视为结束搜索
    const searchBox = document.querySelector('.search-box');
    if (searchBox && searchBox.value) {
        searchBox.value = '';
        searchBox.dispatchEvent(new Event('input'));
    }

    const current = getActiveTab();
    if (tab === current) return;

    // 访问最多在点击卡片后不立即重排（免得卡片在光标下跳动），切过来时再按最新次数排
    if (tab === 'frequent' && typeof renderFrequentCategory === 'function') {
        renderFrequentCategory();
    }

    tabScrollPositions[current] = window.scrollY;
    document.documentElement.setAttribute('data-tab', tab);
    try {
        localStorage.setItem('activeTab', tab);
    } catch (e) {
        // 隐私模式下写不进去，不影响本次切换
    }
    updateTabButtons();

    window.scrollTo({ top: tabScrollPositions[tab] || 0 });

    if (options.animate) {
        const panel = document.getElementById(`tab-${tab}`);
        if (panel) {
            const direction = VIEW_TABS.indexOf(tab) > VIEW_TABS.indexOf(current) ? 'right' : 'left';
            panel.classList.remove('slide-in-left', 'slide-in-right');
            // 强制回流，连续切换时动画能重新播放
            void panel.offsetWidth;
            panel.classList.add(`slide-in-${direction}`);
            panel.addEventListener('animationend', () => {
                panel.classList.remove('slide-in-left', 'slide-in-right');
            }, { once: true });
        }
    }
}

function updateTabButtons() {
    const active = getActiveTab();
    document.querySelectorAll('.view-tab').forEach(btn => {
        const selected = btn.dataset.tab === active;
        btn.classList.toggle('active', selected);
        btn.setAttribute('aria-selected', String(selected));
    });
}

// 移动端左右滑动切换 tab：只在松手时判断一次，不跟手，避免和纵向滚动抢手势
function setupTabSwipe() {
    const MIN_DISTANCE = 60;
    const MAX_DURATION = 600;
    let start = null;

    document.addEventListener('touchstart', (e) => {
        start = null;
        if (e.touches.length !== 1) return;
        if (document.body.classList.contains('searching')) return;
        if (document.querySelector('.modal-overlay.active')) return;
        if (e.target.closest('input, textarea, select, .header, .mobile-category-dropdown, .context-menu')) return;

        const touch = e.touches[0];
        start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!start) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        const elapsed = Date.now() - start.time;
        start = null;

        if (elapsed > MAX_DURATION) return;
        if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;

        const index = VIEW_TABS.indexOf(getActiveTab());
        // 手指左滑看右边的 tab，右滑回左边的，到头不循环
        const next = VIEW_TABS[index + (dx < 0 ? 1 : -1)];
        if (next) {
            switchTab(next, { animate: true });
        }
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        start = null;
    }, { passive: true });
}

// tab 栏吸顶在头部下面，移动端头部是两行且高度会变，按实际高度写进 CSS 变量
function trackHeaderHeight() {
    const header = document.querySelector('.header');
    if (!header) return;
    const apply = () => {
        document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
    };
    apply();
    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(apply).observe(header);
    } else {
        window.addEventListener('resize', apply);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    trackHeaderHeight();
    updateTabButtons();

    document.querySelectorAll('.view-tab').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab, { animate: true }));
    });

    setupTabSwipe();

    // 从打开的网站切回来时，刷新访问最多的排序
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && getActiveTab() === 'frequent' &&
            typeof renderFrequentCategory === 'function') {
            renderFrequentCategory();
        }
    });
});
