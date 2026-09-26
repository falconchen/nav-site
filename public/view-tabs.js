// 视图 tab：全部网站 / 最近添加 / 访问最多 / 特别关注 / 私密收藏
// 当前 tab 写在 <html data-tab>，index.html 的内联脚本在首屏前就设好了，CSS 按它切换面板

// 默认顺序。用户可以调整，调整后的顺序存 localStorage tabOrder（只存本机），
// index.html 在 tab 栏后面的内联脚本按它重排 DOM，所以当前顺序一律以 DOM 为准
const VIEW_TABS = ['all', 'recent', 'frequent', 'pinned', 'private'];

function getTabOrder() {
    return Array.from(document.querySelectorAll('.view-tab'), btn => btn.dataset.tab);
}

// 私密收藏只能点 tab 进入，左右滑动不会滑过去，免得误触
function getSwipeTabs() {
    return getTabOrder().filter(tab => tab !== 'private');
}
// 每个 tab 各自记住滚动位置，来回切换时不用重新往下翻
const tabScrollPositions = {};

function getActiveTab() {
    const tab = document.documentElement.getAttribute('data-tab');
    return VIEW_TABS.includes(tab) ? tab : 'all';
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
        // 私密收藏不记忆，刷新后回到上一个普通 tab
        if (tab !== 'private') localStorage.setItem('activeTab', tab);
    } catch (e) {
        // 隐私模式下写不进去，不影响本次切换
    }
    updateTabButtons();

    window.scrollTo({ top: tabScrollPositions[tab] || 0 });

    if (options.animate) {
        const panel = document.getElementById(`tab-${tab}`);
        if (panel) {
            const order = getTabOrder();
            const direction = order.indexOf(tab) > order.indexOf(current) ? 'right' : 'left';
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

        const swipeTabs = getSwipeTabs();
        const index = swipeTabs.indexOf(getActiveTab());
        if (index < 0) return;
        // 手指左滑看右边的 tab，右滑回左边的，到头不循环
        const next = swipeTabs[index + (dx < 0 ? 1 : -1)];
        if (next) {
            switchTab(next, { animate: true });
        }
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        start = null;
    }, { passive: true });
}

// ---- 调整分区顺序：tab 栏上右键或长按打开弹窗，上下移动 ----

function applyTabOrder(order) {
    const inner = document.querySelector('.view-tabs-inner');
    if (!inner) return;
    order.forEach(tab => {
        const btn = inner.querySelector(`.view-tab[data-tab="${tab}"]`);
        if (btn) inner.appendChild(btn);
    });
    try {
        // 和默认顺序一样就不存，以后默认顺序变了也能跟上
        if (order.join() === VIEW_TABS.join()) {
            localStorage.removeItem('tabOrder');
        } else {
            localStorage.setItem('tabOrder', JSON.stringify(order));
        }
    } catch (e) {
        // 隐私模式下写不进去，只影响刷新后是否保留
    }
    renderTabOrderList();
}

function renderTabOrderList() {
    const list = document.getElementById('tabOrderList');
    if (!list) return;
    const order = getTabOrder();
    list.innerHTML = order.map((tab, index) => {
        const btn = document.querySelector(`.view-tab[data-tab="${tab}"]`);
        const icon = btn.querySelector('i').className;
        const label = btn.querySelector('.tab-label').textContent;
        return `
            <li class="tab-order-item" data-tab="${tab}">
                <i class="${icon}"></i>
                <span>${label}</span>
                <button type="button" class="tab-order-move" data-move="-1" aria-label="上移${label}" ${index === 0 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button type="button" class="tab-order-move" data-move="1" aria-label="下移${label}" ${index === order.length - 1 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-down"></i>
                </button>
            </li>
        `;
    }).join('');
}

function openTabOrderModal() {
    renderTabOrderList();
    openModal('tabOrderModal');
}

function setupTabOrder() {
    const list = document.getElementById('tabOrderList');
    if (!list) return;

    list.addEventListener('click', (e) => {
        const button = e.target.closest('.tab-order-move');
        if (!button) return;
        const order = getTabOrder();
        const from = order.indexOf(button.closest('.tab-order-item').dataset.tab);
        const to = from + Number(button.dataset.move);
        if (to < 0 || to >= order.length) return;
        [order[from], order[to]] = [order[to], order[from]];
        applyTabOrder(order);
        // 列表重渲染后焦点会丢，放回同一个分区的同方向按钮上，方便连续移动
        const moved = list.querySelector(`.tab-order-item[data-tab="${order[to]}"] [data-move="${button.dataset.move}"]`);
        (moved && !moved.disabled ? moved : list.querySelector(`.tab-order-item[data-tab="${order[to]}"] .tab-order-move:not(:disabled)`))?.focus();
    });

    document.getElementById('tabOrderReset')?.addEventListener('click', () => applyTabOrder([...VIEW_TABS]));

    const tabBar = document.querySelector('.view-tabs');
    tabBar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openTabOrderModal();
    });

    // iOS Safari 长按不触发 contextmenu，自己计时。长按后松手产生的 click 不能再切 tab
    const LONG_PRESS_MS = 500;
    let pressTimer = null;
    let pressStart = null;
    tabBar.addEventListener('touchstart', (e) => {
        // 安卓长按还会触发 contextmenu，之后不一定有 click 来清标记，每次按下先清掉
        delete tabBar.dataset.longPressed;
        if (e.touches.length !== 1) return;
        pressStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
            pressTimer = null;
            tabBar.dataset.longPressed = '1';
            openTabOrderModal();
        }, LONG_PRESS_MS);
    }, { passive: true });
    tabBar.addEventListener('touchmove', (e) => {
        if (!pressStart) return;
        const touch = e.touches[0];
        if (Math.abs(touch.clientX - pressStart.x) > 10 || Math.abs(touch.clientY - pressStart.y) > 10) {
            clearTimeout(pressTimer);
        }
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(type => tabBar.addEventListener(type, () => {
        clearTimeout(pressTimer);
        pressStart = null;
    }, { passive: true }));
    tabBar.addEventListener('click', (e) => {
        if (tabBar.dataset.longPressed) {
            delete tabBar.dataset.longPressed;
            e.stopPropagation();
        }
    }, true);
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
    setupTabOrder();

    // 从打开的网站切回来时，刷新访问最多的排序
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && getActiveTab() === 'frequent' &&
            typeof renderFrequentCategory === 'function') {
            renderFrequentCategory();
        }
    });
});
