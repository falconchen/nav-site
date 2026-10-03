/**
 * 整理模式：拖拽调整卡片顺序（SortableJS）
 *
 * 卡片菜单里点「调整顺序」进入，整理的是当前 tab：「全部网站」下每个分类各自可拖（不能跨分类），
 * 特别关注、私密收藏、访问最多各是一个列表。最近添加、搜索结果是算出来的顺序，不支持。
 * 前三种分区各有排序键，数值越大越靠前，拖完整个分区重新编号：
 *   分类 -> weight，特别关注 -> pinnedOrder，私密收藏 -> privateOrder
 * 访问最多不改网站数据：只有亲手拖过的网站固定在拖到的位置，其余继续按访问得分浮动，
 * 固定的位置存本机，登录后跟访问统计一起同步（visit-stats.js 的 setFrequentPins）
 */

const REORDER_TABS = ['all', 'pinned', 'private', 'frequent'];

// 整理中的状态：{ tab, sortables, siteOf: WeakMap<卡片, 网站数据>, dirty, blurAfter }
let reorderState = null;

function isReordering() {
    return !!reorderState;
}

// 卡片所在分区能不能整理（菜单里据此显示「调整顺序」）
function canReorderSection(sectionId) {
    return !!sectionId && (!isVirtualSection(sectionId) || REORDER_TABS.includes(sectionId));
}

function reorderKeysDescending(sites, field) {
    sites.forEach((site, index) => {
        site[field] = 100 + 10 * (sites.length - 1 - index);
    });
}

// 当前 tab 里可以拖的分区 id
function reorderSectionIds(tab) {
    if (tab !== 'all') return [tab];
    return Array.from(document.querySelectorAll('#tab-all .category-section'))
        .map(section => section.id)
        .filter(id => Array.isArray(websites[id]));
}

// 进入时记下每张卡对应的网站数据，拖动后 DOM 下标就对不上了
function mapCardsToSites(sectionId, container, siteOf) {
    const cards = Array.from(container.querySelectorAll('.website-card'));
    if (isVirtualSection(sectionId)) {
        cards.forEach(card => {
            const title = card.querySelector('.card-title').textContent;
            const url = card.querySelector('.card-url').textContent;
            const site = (websites[card.dataset.originalCategory] || [])
                .find(item => item.title === title && item.url === url);
            if (site) siteOf.set(card, site);
        });
        return;
    }
    const visible = websites[sectionId].filter(site => !site.private);
    cards.forEach((card, index) => {
        if (visible[index]) siteOf.set(card, visible[index]);
    });
}

// 特别关注没拖过时按 weight 排。分类重新编号会改 weight，先把现在的顺序固定到 pinnedOrder 上
function freezePinnedOrder() {
    Object.values(websites).forEach(sites => {
        if (!Array.isArray(sites)) return;
        sites.forEach(site => {
            if (site.pinned && site.pinnedOrder == null) site.pinnedOrder = site.weight || 100;
        });
    });
}

// 访问最多：只把这次拖的那张固定到新位置。以前固定过的卡片可能被这次拖动挤了一格，
// 按现在看到的位置更新；没固定的不记，下次渲染仍按得分排。当前不在榜上的固定记录原样留着，重新上榜时回到原位
function pinFrequentCard(cards, sites, draggedCard) {
    const pins = getFrequentPins();
    const draggedSite = reorderState.siteOf.get(draggedCard);
    if (!draggedSite) return;
    const draggedKey = visitUrlKey(draggedSite.url);
    sites.forEach((site, index) => {
        const key = visitUrlKey(site.url);
        if (key === draggedKey || key in pins) pins[key] = index;
    });
    setFrequentPins(pins);
    cards.forEach((card, index) => {
        card.classList.toggle('frequent-fixed', visitUrlKey(sites[index].url) in pins);
    });
}

// 按 DOM 里的新顺序改写数据
function applyReorder(sectionId, container, evt) {
    if (!reorderState) return;
    const cards = Array.from(container.querySelectorAll('.website-card'));
    const sites = cards.map(card => reorderState.siteOf.get(card)).filter(Boolean);
    if (sites.length !== cards.length) return;

    if (sectionId === 'frequent') {
        // 不动网站数据，所以不标 dirty、不触发收藏的云端保存（固定位置由 visit-stats.js 自己同步）。放回原位不算拖过
        if (evt.oldIndex !== evt.newIndex) {
            pinFrequentCard(cards, sites, evt.item);
            updateReorderResetBtn();
        }
        return;
    }
    if (sectionId === 'pinned') {
        reorderKeysDescending(sites, 'pinnedOrder');
    } else if (sectionId === 'private') {
        reorderKeysDescending(sites, 'privateOrder');
    } else {
        freezePinnedOrder();
        // 私密网站不在这个分区显示，留在数组里原来的位置
        let next = 0;
        const reordered = websites[sectionId].map(site => (site.private ? site : sites[next++]));
        reorderKeysDescending(reordered, 'weight');
        websites[sectionId] = reordered;
        cards.forEach(card => {
            card.dataset.weight = reorderState.siteOf.get(card).weight;
        });
    }
    reorderState.dirty = true;
}

// 「恢复自动排序」只在访问最多里、且有固定的网站时出现
function updateReorderResetBtn() {
    const show = !!reorderState && reorderState.tab === 'frequent' && Object.keys(getFrequentPins()).length > 0;
    document.getElementById('reorderResetBtn').hidden = !show;
}

function resetFrequentOrder() {
    setFrequentPins({});
    // 重新渲染访问最多时会顺带退出整理模式
    renderFrequentCategory();
}

function enterReorderMode() {
    if (reorderState || typeof Sortable === 'undefined') return;
    const tab = getActiveTab();
    if (!REORDER_TABS.includes(tab) || document.body.classList.contains('searching')) return;
    if (tab === 'private' && !isPrivateRevealed()) return;

    hideContextMenu();
    remaskDescriptions();

    const state = { tab, sortables: [], siteOf: new WeakMap(), dirty: false, blurAfter: false };
    reorderSectionIds(tab).forEach(sectionId => {
        const container = document.getElementById(`${sectionId}-cards`);
        if (!container) return;
        mapCardsToSites(sectionId, container, state.siteOf);
        state.sortables.push(Sortable.create(container, {
            draggable: '.website-card',
            animation: 150,
            // 鼠标和触屏走同一套实现；原生拖拽在模糊的私密卡片上拖影不对
            forceFallback: true,
            fallbackTolerance: 4,
            // 手机上快速划动仍是滚动页面，按住片刻才开始拖
            delay: 150,
            delayOnTouchOnly: true,
            ghostClass: 'reorder-ghost',
            chosenClass: 'reorder-chosen',
            dragClass: 'reorder-drag',
            onEnd: (evt) => applyReorder(sectionId, container, evt)
        }));
    });
    if (state.sortables.length === 0) return;

    // 私密卡片默认是模糊的，认不出来没法排，整理期间先全部显示
    if (tab === 'private' && !privateAllRevealed) {
        state.blurAfter = true;
        setPrivateAllRevealed(true);
    }

    reorderState = state;
    document.body.classList.add('reordering');
    document.getElementById('reorderBar').hidden = false;
    updateReorderResetBtn();
}

// 退出并保存。拖动期间不保存：每次上传都生成一份版本快照，历史只留 5 份，连拖几下就冲掉了
function exitReorderMode() {
    if (!reorderState) return;
    const state = reorderState;
    reorderState = null;

    state.sortables.forEach(sortable => sortable.destroy());
    document.body.classList.remove('reordering');
    document.getElementById('reorderBar').hidden = true;
    if (state.blurAfter) setPrivateAllRevealed(false);

    if (!state.dirty) return;
    // 分类重新编号后，别的视图（比如没拖过的特别关注）可能跟着变
    if (state.tab === 'all') renderVirtualViews();
    if (window.saveNavData) window.saveNavData();
}

// 某个分区要重新渲染了：会换掉 Sortable 绑着的 DOM，正在整理它的话先退出（退出时保存拖好的顺序）。
// tab 传 'all' 表示分类 section
function exitReorderModeFor(tab) {
    if (reorderState && reorderState.tab === tab) exitReorderMode();
}

// 页面转到后台时把拖过的顺序先存下来，整理模式不退出
function saveReorderBeforeHide() {
    if (!reorderState || !reorderState.dirty) return;
    reorderState.dirty = false;
    if (window.saveNavData) window.saveNavData();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reorderDoneBtn').addEventListener('click', exitReorderMode);
    document.getElementById('reorderResetBtn').addEventListener('click', resetFrequentOrder);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isReordering()) exitReorderMode();
    });

    // 开始搜索就退出：搜索结果不能排序
    document.addEventListener('input', (e) => {
        if (isReordering() && e.target.matches('.search-box')) exitReorderMode();
    }, true);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) saveReorderBeforeHide();
    });
    window.addEventListener('pagehide', saveReorderBeforeHide);
});
