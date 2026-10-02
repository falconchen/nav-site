// 主题切换功能
function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    syncThemeControls();
}

// 页眉按钮显示「要切到的那一种」的图标；小屏账户菜单里的那一项同时改文案
function syncThemeControls() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const icon = dark ? 'fas fa-sun' : 'fas fa-moon';
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.className = icon;
    document.querySelectorAll('.theme-menu-item').forEach(item => {
        item.querySelector('i').className = icon;
        item.querySelector('.theme-menu-label').textContent = dark ? '浅色模式' : '深色模式';
    });
}

// 强调色切换
function setAccent(accent) {
    const html = document.documentElement;
    if (!accent) {
        html.removeAttribute('data-accent');
        localStorage.removeItem('accent');
        return;
    }
    html.setAttribute('data-accent', accent);
    localStorage.setItem('accent', accent);
}

// 初始化强调色选择器
document.addEventListener('DOMContentLoaded', function () {
    const accentSwatch = document.getElementById('accentSwatch');
    // 小圆点在小屏循环切换：默认 -> cadetblue -> blue-1772f6 -> 默认
    if (accentSwatch) {
        const applySwatchColor = () => {
            // 让按钮背景随当前主色
            accentSwatch.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
        };
        applySwatchColor();
        // 在主题/accent变化时重新同步颜色
        const observer = new MutationObserver(applySwatchColor);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent', 'data-theme'] });

        accentSwatch.addEventListener('click', function () {
            const current = localStorage.getItem('accent') || '';
            let next = '';
            if (current === '') next = 'cadetblue';
            else if (current === 'cadetblue') next = 'blue-1772f6';
            else if (current === 'blue-1772f6') next = 'pink-ff1365';
            else next = '';
            setAccent(next);
            applySwatchColor();
        });
    }

    // 同步版本号到 footer
    const versionSpan = document.getElementById('version');
    const footerVersionText = document.getElementById('footerVersionText');
    if (versionSpan && footerVersionText) {
        footerVersionText.textContent = 'v.' + versionSpan.textContent;
    }
});

// 分类切换功能
function showCategory(categoryId) {
    if (isEditingCategories) return; // 编辑模式下不允许切换分类

    // 分类只在「全部网站」tab 下展示
    if (typeof switchTab === 'function') {
        switchTab('all');
    }

    // 获取目标分类区域
    const targetSection = document.getElementById(categoryId);
    if (targetSection) {
        // 扣掉吸顶的头部和 tab 栏
        const header = document.querySelector('.header');
        const viewTabs = document.querySelector('.view-tabs');
        const headerH = header ? header.offsetHeight : 0;
        const tabsH = viewTabs ? viewTabs.offsetHeight : 0;
        const extraGap = 10; // 轻微留白
        const offset = headerH + tabsH + extraGap;

        const rect = targetSection.getBoundingClientRect();
        const targetY = rect.top + window.pageYOffset - offset;

        window.scrollTo({
            top: Math.max(0, targetY),
            behavior: 'smooth'
        });
    }

    // 更新侧边栏选中状态
    const categoryItems = document.querySelectorAll('.category-item');
    categoryItems.forEach(item => item.classList.remove('active'));

    const selectedItem = document.querySelector(`.category-item[data-category="${categoryId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('active');
    }
}

// 切换分类列表的压缩/展开模式
function toggleCategoriesMode() {
    const mainContainer = document.querySelector('.main-container');
    const sidebar = document.querySelector('.categories-sidebar');
    const contentArea = document.querySelector('.content-area');
    const html = document.documentElement;

    // 检查当前是否处于编辑模式，如果是则不允许切换
    if (sidebar.classList.contains('editing')) {
        alert('请先退出编辑模式');
        return;
    }

    // 切换压缩/展开模式
    sidebar.classList.toggle('compact-mode');
    mainContainer.classList.toggle('compact-mode');
    contentArea.classList.toggle('compact-mode');

    // 更新HTML的data-sidebar属性
    const isCompactMode = sidebar.classList.contains('compact-mode');
    html.setAttribute('data-sidebar', isCompactMode ? 'compact' : 'normal');

    // 保存当前模式到本地存储，以便下次访问时保持相同模式
    localStorage.setItem('categoriesCompactMode', isCompactMode);

    syncCategoriesModeIcons(isCompactMode);
}

// 同步侧边栏和页眉两个「切换显示模式」按钮的图标
function syncCategoriesModeIcons(isCompactMode) {
    const iconClass = isCompactMode
        ? 'fa-solid fa-up-right-and-down-left-from-center'
        : 'fa-solid fa-down-left-and-up-right-to-center';
    document.querySelectorAll('.categories-mode-icon').forEach(icon => {
        icon.className = `${iconClass} categories-mode-icon`;
    });
}

// 加载压缩模式设置
function loadCategoriesMode() {
    const isCompactMode = localStorage.getItem('categoriesCompactMode') === 'true';

    if (isCompactMode) {
        const mainContainer = document.querySelector('.main-container');
        const sidebar = document.querySelector('.categories-sidebar');
        const contentArea = document.querySelector('.content-area');

        sidebar.classList.add('compact-mode');
        mainContainer.classList.add('compact-mode');
        contentArea.classList.add('compact-mode');
    }

    syncCategoriesModeIcons(isCompactMode);
}

// 模态框管理
let currentEditingCard = null;

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
    document.body.style.overflow = '';

    // 描述里可能有账号密码，关掉就从 DOM 里清掉
    if (modalId === 'descriptionModal') {
        document.getElementById('descriptionView').textContent = '';
    }

    // 如果是网站模态框，清除图片上传区域
    if (modalId === 'websiteModal') {
        // 清空图片数据
        const iconInput = document.getElementById('websiteIcon');
        if (iconInput) {
            iconInput.dataset.imageData = '';
        }

        // 重置上传区域
        resetIconUpload();
    }

    // 重置当前编辑卡片引用
    if (currentEditingCard) {
        currentEditingCard = null;
    }

    // 清除编辑状态
    document.querySelectorAll('.website-card.editing').forEach((card, index) => {
        try {
            // 检查卡片在DOM中是否有效
            if (card.isConnected) {
                card.classList.remove('editing');
            }
        } catch (error) {
            console.error(`移除editing类时出错:`, error);
        }
    });

    // 最终检查是否还有卡片带有editing类
    const remainingEditingCards = document.querySelectorAll('.website-card.editing');

    if (remainingEditingCards.length > 0) {
        // 强制再次尝试清理
        remainingEditingCards.forEach(card => {
            // 使用替代方法尝试移除类
            try {
                card.className = card.className.replace('editing', '').trim();
            } catch (error) {
                console.error('替代清理方法失败:', error);
            }
        });
    }
}

// 卡片上的网址：协议单独包一层，CSS 隐藏掉减少视觉噪音。
// 元素的 textContent 仍是完整网址，打开、复制、编辑都直接读它
function cardUrlHTML(url) {
    const value = String(url || '');
    const match = value.match(/^(https?:\/\/)(.*)$/i);
    if (!match) return escapeHtml(value);
    return `<span class="card-url-protocol">${escapeHtml(match[1])}</span>${escapeHtml(match[2])}`;
}

// 图标图片加载失败（图床挂了、内网图片在外网打不开、链接失效）时换成首字图标，不显示破图。
// error 事件不冒泡，只能在捕获阶段统一接；不用内联 onerror，imageData 不可信
document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const cardIcon = img.parentElement;
    if (!cardIcon) return;
    // 弹窗里的图标预览：图片打不开就显示首字，imageData 不动（用户可以自己改用首字图标）
    if (cardIcon.id === 'iconUploadArea') {
        cardIcon.innerHTML = letterIconHTML(document.getElementById('websiteName').value, document.getElementById('websiteUrl').value);
        return;
    }
    if (!cardIcon.classList.contains('card-icon')) return;
    const card = cardIcon.closest('.website-card');
    const title = card?.querySelector('.card-title')?.textContent || '';
    const url = card?.querySelector('.card-url')?.textContent || '';
    cardIcon.classList.remove('with-img');
    cardIcon.innerHTML = letterIconHTML(title, url);
}, true);

// 根据数据创建卡片HTML
function createCardHTML(website) {
    // 确保权重数据存在
    const weight = website.weight || 100;
    // 添加置顶样式类。私密网站不进特别关注，星星也不显示
    const pinnedClass = website.pinned && !website.private ? 'pinned' : '';
    const privateClass = website.private ? 'private-card' : '';
    // 隐藏描述：网站照常显示、可搜索，只有描述遮住（私密网站的描述本来就遮住，不叠加）
    const descHiddenClass = website.hideDescription && !website.private ? 'desc-hidden-card' : '';
    // 根据是否有图片决定是否添加背景去除类
    const withImgClass = website.imageData ? 'with-img' : '';

    // 有图片用图片，没有就用首字图标（website.icon 的 Font Awesome 类名已不再渲染）。
    // 图片加载失败时由 handleCardIconError 换成首字图标
    const iconContent = website.imageData
        ? `<img src="${escapeHtml(website.imageData)}" alt="${escapeHtml(website.title)}">`
        : letterIconHTML(website.title, website.url);

    return `
        <div class="website-card ${pinnedClass} ${privateClass} ${descHiddenClass}" data-weight="${weight}">
            <button class="card-pin-btn" title="取消特别关注" aria-label="取消特别关注"><i class="fas fa-star"></i></button>
            <div class="card-header">
                <div class="card-icon ${withImgClass}">
                    ${iconContent}
                </div>
                <div>
                    <div class="card-title">${escapeHtml(website.title)}</div>
                    <div class="card-url">${cardUrlHTML(website.url)}</div>
                </div>
            </div>
            ${hasSecretDescription(website)
                ? `<div class="card-description card-secret" title="点击查看描述">${SECRET_DESCRIPTION_MASK}</div>`
                : `<div class="card-description">${escapeHtml(website.description)}</div>`}
            <div class="card-footer">
                <button class="card-menu-btn" aria-label="菜单">
                    <i class="fas fa-minus"></i>
                </button>
            </div>
        </div>
    `;
}

// 「隐藏描述」的网站，描述里记着账号密码，默认只渲染占位符，
// 真实文本登记在 secretDescriptions（按卡片元素），点击后才填进 DOM。
// 私密网站不走这套：和隐藏描述互斥，描述照常显示，只跟着卡片一起模糊
const SECRET_DESCRIPTION_MASK = '•••••• 点击查看';
const secretDescriptions = new WeakMap();

function hasSecretDescription(website) {
    return !!website.hideDescription && !website.private;
}

// 把网站渲染成卡片追加到容器末尾，描述被遮住的卡片顺手登记真实描述。返回新加的卡片
function appendCards(container, sites) {
    const start = container.children.length;
    container.insertAdjacentHTML('beforeend', sites.map(createCardHTML).join(''));
    const cards = Array.from(container.children).slice(start);
    cards.forEach((card, index) => {
        if (hasSecretDescription(sites[index])) {
            secretDescriptions.set(card, sites[index].description || '');
        }
    });
    return cards;
}

function toggleSecretDescription(card) {
    const description = card.querySelector('.card-description');
    if (!description) return;
    const revealed = description.classList.toggle('revealed');
    description.textContent = revealed
        ? (secretDescriptions.get(card) || '（无描述）')
        : SECRET_DESCRIPTION_MASK;
    notifyPrivateCardChange(card);
}

// 鼠标一直停在卡片上不会再触发 mouseover，通知悬浮提示按新状态显示或收起
function notifyPrivateCardChange(card) {
    card.dispatchEvent(new CustomEvent('private-card-change', { bubbles: true }));
}

// 私密卡片的图标、标题、网址、描述默认模糊（CSS 按 .revealed 切换），只有这里能让它们变清晰。
// 工具栏「显示全部」：所有私密卡片一起变清晰。
// 打开期间重新渲染的卡片也保持清晰，离开分区或隐藏私密收藏时关掉
let privateAllRevealed = false;

function setPrivateAllRevealed(on) {
    if (!on) {
        reblurPrivateCards();
        return;
    }
    privateAllRevealed = true;
    document.querySelectorAll('#private .private-card').forEach(card => card.classList.add('revealed'));
    updatePrivateRevealAllBtn();
}

function updatePrivateRevealAllBtn() {
    const btn = document.getElementById('privateRevealAllBtn');
    if (!btn) return;
    // 文字始终是「显示全部」，打开状态靠 aria-pressed 和朱砂色描边表示
    btn.setAttribute('aria-pressed', String(privateAllRevealed));
    btn.title = privateAllRevealed ? '重新模糊全部网站' : '显示全部网站';
}

// 离开私密收藏分区时恢复模糊，描述也收起；重新渲染出来的卡片本来就是模糊的
function reblurPrivateCards() {
    privateAllRevealed = false;
    updatePrivateRevealAllBtn();
    document.querySelectorAll('.private-card.revealed').forEach(card => {
        card.classList.remove('revealed');
    });
    remaskDescriptions();
}

// 点开过的隐藏描述收回占位符。切换 tab 时调用，账号信息不会一直留在屏幕上。
// 页面转到后台时不收：点开密码后常要去打开网站登录，切回来还得接着复制
function remaskDescriptions() {
    document.querySelectorAll('.card-secret.revealed').forEach(description => {
        description.classList.remove('revealed');
        description.textContent = SECRET_DESCRIPTION_MASK;
    });
}

// 分类 section 不渲染私密网站，DOM 下标要跳过它们才能对上 websites[categoryId] 里的下标
function siteIndexOfCard(card, categoryId) {
    const domIndex = Array.from(card.parentNode.children).indexOf(card);
    if (domIndex < 0 || !Array.isArray(websites[categoryId])) return -1;
    let seen = -1;
    return websites[categoryId].findIndex(site => !site.private && ++seen === domIndex);
}

// 从数据加载网站卡片
function loadWebsitesFromData() {
    exitReorderModeFor('all');

    // 验证置顶状态的一致性
    validatePinnedStatus();

    // 遍历每个分类
    Object.keys(websites).forEach(category => {
        const cardsContainer = document.getElementById(`${category}-cards`);
        if (!cardsContainer) return;

        // 清空容器
        cardsContainer.innerHTML = '';

        // 添加该分类下的所有网站卡片
        if (!websites[category] || !Array.isArray(websites[category])) {
            return;
        }

        // 按权重排序网站 - 权重越大越靠前
        const sortedWebsites = [...websites[category]].sort((a, b) => {
            // 降序排序：b的权重 - a的权重
            return (b.weight || 100) - (a.weight || 100);
        });

        // 更新排序后的数据
        websites[category] = sortedWebsites;

        // 创建卡片，私密网站只在私密收藏 tab 里出现
        appendCards(cardsContainer, sortedWebsites.filter(website => !website.private));
    });

    // 渲染访问最多、特别关注、最近添加三个视图
    renderVirtualViews();

    // 为所有卡片添加事件监听器
    document.querySelectorAll('.website-card').forEach(addCardEventListeners);
}

// 验证置顶状态的一致性
function validatePinnedStatus() {
    let dataChanged = false;

    // 检查所有分类中的网站
    Object.keys(websites).forEach(category => {
        if (!websites[category] || !Array.isArray(websites[category])) return;

        websites[category].forEach(website => {
            // 确保所有网站都有pinned属性
            if (website.pinned === undefined) {
                website.pinned = false;
                dataChanged = true;
            }
        });
    });

    // 如果数据有变化，保存到localStorage
    if (dataChanged && window.saveNavData) {
        window.saveNavData();
    }
}

// 渲染分类列表
function renderCategoryList() {
    const categoriesList = document.querySelector('.categories-list');
    if (!categoriesList) return;

    // 清空列表
    categoriesList.innerHTML = '';

    // 按顺序排序分类
    const sortedCategories = [...window.categories].sort((a, b) => a.order - b.order);

    // 添加所有分类
    sortedCategories.forEach(category => {
        const categoryHTML = getCategoryItemTemplate(category);
        categoriesList.insertAdjacentHTML('beforeend', categoryHTML);
    });

    // 默认高亮第一个分类。不调 showCategory：它会切到「全部网站」tab 并滚动
    const firstCategory = sortedCategories[0];
    if (firstCategory) {
        const firstCategoryItem = document.querySelector(`.category-item[data-category="${firstCategory.id}"]`);
        if (firstCategoryItem) {
            firstCategoryItem.classList.add('active');
        }
    }

    // 渲染分类section
    renderCategorySections(sortedCategories);
}

// 渲染分类section
function renderCategorySections(categories) {
    const contentArea = document.getElementById('tab-all');
    if (!contentArea) return;

    // 清空内容区域
    contentArea.innerHTML = '';

    // 添加所有分类section
    categories.forEach((category) => {
        const sectionHTML = `
            <section class="category-section" id="${category.id}">
                <h2 class="section-title">
                    <i class="${category.icon}"></i>
                    ${category.name}
                </h2>
                <div class="cards-grid" id="${category.id}-cards">
                    <!-- 卡片将由JavaScript动态加载 -->
                </div>
            </section>
        `;
        contentArea.insertAdjacentHTML('beforeend', sectionHTML);
    });
}

// 创建分类内容区域
function createCategoryContentSection(categoryId) {
    // 查找对应的分类数据
    const category = window.categories.find(cat => cat.id === categoryId);
    if (!category) return;

    const contentArea = document.getElementById('tab-all');
    if (!contentArea) return;

    // 创建新的section
    const sectionHTML = `
        <section class="category-section" id="${category.id}">
            <h2 class="section-title">
                <i class="${category.icon}"></i>
                ${category.name}
            </h2>
            <div class="cards-grid" id="${category.id}-cards">
                <!-- 卡片将由JavaScript动态加载 -->
            </div>
        </section>
    `;
    contentArea.insertAdjacentHTML('beforeend', sectionHTML);

    // 初始化该分类的网站数组
    if (!websites[category.id]) {
        websites[category.id] = [];
    }

    return document.getElementById(category.id);
}

// 更新分类section
function updateCategorySections(updatedCategories) {
    const contentArea = document.getElementById('tab-all');
    if (!contentArea) return;

    // 获取当前所有section的ID
    const currentSections = Array.from(contentArea.querySelectorAll('.category-section'))
        .map(section => section.id);

    // 获取更新后的分类ID
    const updatedIds = updatedCategories.map(category => category.id);

    // 删除不再存在的section
    currentSections.forEach(id => {
        if (!updatedIds.includes(id)) {
            const sectionToRemove = document.getElementById(id);
            if (sectionToRemove) {
                sectionToRemove.remove();
            }
        }
    });

    // 添加新的section
    updatedCategories.forEach(category => {
        const existingSection = document.getElementById(category.id);

        if (!existingSection) {
            // 创建新section
            createCategoryContentSection(category.id);
        } else {
            // 更新现有section的标题和图标
            const titleElement = existingSection.querySelector('.section-title');
            if (titleElement) {
                titleElement.innerHTML = `<i class="${category.icon}"></i> ${category.name}`;
            }
        }
    });

    // 重新排序section
    const sortedCategories = [...updatedCategories].sort((a, b) => a.order - b.order);

    sortedCategories.forEach(category => {
        const section = document.getElementById(category.id);
        if (section) {
            contentArea.appendChild(section);
        }
    });

    // 重新加载卡片数据
    loadWebsitesFromData();
}

// 添加网站功能
function openAddWebsiteModal() {
    document.getElementById('websiteForm').reset();
    syncPrivateCheckbox();
    document.getElementById('modalTitle').textContent = '添加网站';
    currentEditingCard = null;

    // 清空图片数据
    const iconInput = document.getElementById('websiteIcon');
    if (iconInput) {
        iconInput.value = '';
        iconInput.dataset.imageData = ''; // 清空图片数据
    }

    // 确保分类下拉菜单是最新的
    updateCategoryDropdown();

    // 默认选中"未分类"选项
    const categorySelect = document.getElementById('websiteCategory');
    if (categorySelect) {
        // 查找未分类选项
        for (let i = 0; i < categorySelect.options.length; i++) {
            if (categorySelect.options[i].value === 'uncategorized') {
                categorySelect.selectedIndex = i;
                categorySelect.options[i].setAttribute('selected', 'selected');
                break;
            }
        }
    }

    // 重置上传区域
    resetIconUpload();

    // 确保AI识别按钮初始状态为禁用
    const aiDetectBtn = document.getElementById('aiDetectBtn');
    if (aiDetectBtn) {
        aiDetectBtn.disabled = true;
    }

    openModal('websiteModal');
}

// 只认单个 http(s) 网址，不认裸域名
function parseHttpUrl(text) {
    const value = (text || '').trim();
    if (!value || value.length > 2048 || /\s/.test(value)) return null;
    if (!/^https?:\/\//i.test(value)) return null;
    try {
        new URL(value);
        return value;
    } catch (e) {
        return null;
    }
}

// 私密收藏也算已收录，查重规则同 visitUrlKey()
function isUrlCollected(url) {
    const key = visitUrlKey(url);
    if (!key) return false;
    return Object.values(websites).some(list =>
        Array.isArray(list) && list.some(site => site.url && visitUrlKey(site.url) === key));
}

// 打开添加网站、填好网址并自动填写
function openAddWebsiteWithUrl(url, message) {
    openAddWebsiteModal();
    const urlInput = document.getElementById('websiteUrl');
    urlInput.value = url;
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    if (message) showNotification(message, 'info');

    const aiDetectBtn = document.getElementById('aiDetectBtn');
    if (aiDetectBtn && !aiDetectBtn.disabled) aiDetectBtn.click();
}

// ?add=<网址>：iOS 快捷指令从分享菜单打开的入口。读完立刻从地址栏去掉，刷新和后退不会再弹
function handleAddUrlParam() {
    const params = new URLSearchParams(location.search);
    if (!params.has('add')) return;

    const raw = params.get('add');
    params.delete('add');
    const query = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);

    const url = parseHttpUrl(raw);
    if (!url) {
        showNotification('链接里的网址无效', 'error');
        return;
    }
    if (isUrlCollected(url)) {
        showNotification('这个网址已经收录过了', 'info');
        return;
    }
    openAddWebsiteWithUrl(url);
}

// 删除网站功能 - 显示确认对话框
let websiteToDelete = null;

function deleteWebsite(card) {
    const websiteName = card.querySelector('.card-title').textContent;
    document.getElementById('deleteWebsiteName').textContent = `「${websiteName}」删除后无法恢复。`;
    websiteToDelete = card;
    openModal('deleteConfirmModal');
}

// 确认删除网站
function confirmDeleteWebsite() {
    if (websiteToDelete) {
        // 获取网站信息
        const title = websiteToDelete.querySelector('.card-title').textContent;
        const url = websiteToDelete.querySelector('.card-url').textContent;

        // 获取分类ID
        const categorySection = websiteToDelete.closest('.category-section');
        const categoryId = categorySection.id;

        // 如果是从虚拟分类（置顶或最近添加）删除，需要找到原始分类
        if (isVirtualSection(categoryId)) {
            const originalCategory = websiteToDelete.dataset.originalCategory;
            if (originalCategory) {
                // 在原分类中查找并删除网站
                const originalCategoryWebsites = websites[originalCategory];
                if (originalCategoryWebsites) {
                    const siteIndex = originalCategoryWebsites.findIndex(site =>
                        site.title === title && site.url === url);

                    if (siteIndex >= 0) {
                        // 获取网站信息，用于处理另一个虚拟分类
                        const siteInfo = originalCategoryWebsites[siteIndex];

                        // 删除网站
                        originalCategoryWebsites.splice(siteIndex, 1);

                        // 更新原分类UI（如果当前可见）
                        refreshCategoryUI(originalCategory);
                    }
                }
            }
        } else {
            // 从数据对象中删除
            const cardIndex = siteIndexOfCard(websiteToDelete, categoryId);

            if (websites[categoryId] && websites[categoryId][cardIndex]) {
                // 获取网站信息，用于在置顶分类中查找
                const siteInfo = websites[categoryId][cardIndex];
                websites[categoryId].splice(cardIndex, 1);

                // 从置顶分类UI中删除对应网站（如果存在）
                removeSiteFromPinnedUI(siteInfo.title, siteInfo.url);

                // 从最近添加分类UI中删除对应网站（如果存在）
                removeFromRecentUI(siteInfo.title, siteInfo.url);
            }
        }

        // 保存数据到localStorage
        if (window.saveNavData) {
            window.saveNavData();
        }

        // 添加删除动画
        websiteToDelete.style.animation = 'fadeOut 0.3s ease-out';

        // 延迟移除，让动画有时间播放
        setTimeout(() => {
            websiteToDelete.remove();
            websiteToDelete = null;

            // 重新渲染几个视图：要补上排在后面的网站，空状态也要更新
            renderVirtualViews();
        }, 300);
    }
    closeModal('deleteConfirmModal');
}

// 从置顶分类UI中删除网站
function removeSiteFromPinnedUI(title, url) {
    const pinnedContainer = document.getElementById('pinned-cards');
    if (!pinnedContainer) return;

    // 查找匹配的网站卡片
    const cards = pinnedContainer.querySelectorAll('.website-card');
    cards.forEach(card => {
        const cardTitle = card.querySelector('.card-title').textContent;
        const cardUrl = card.querySelector('.card-url').textContent;

        if (cardTitle === title && cardUrl === url) {
            // 添加删除动画
            card.style.animation = 'fadeOut 0.3s ease-out';

            // 延迟移除，让动画有时间播放
            setTimeout(() => {
                card.remove();
            }, 300);
        }
    });
}

// 从最近添加分类UI中删除网站
function removeFromRecentUI(title, url) {
    const recentContainer = document.getElementById('recent-cards');
    if (!recentContainer) return;

    // 查找匹配的网站卡片
    const cards = recentContainer.querySelectorAll('.website-card');
    cards.forEach(card => {
        const cardTitle = card.querySelector('.card-title').textContent;
        const cardUrl = card.querySelector('.card-url').textContent;

        if (cardTitle === title && cardUrl === url) {
            // 添加删除动画
            card.style.animation = 'fadeOut 0.3s ease-out';

            // 延迟移除，让动画有时间播放
            setTimeout(() => {
                card.remove();
            }, 300);
        }
    });
}

// 刷新分类UI
function refreshCategoryUI(categoryId) {
    const cardsContainer = document.getElementById(`${categoryId}-cards`);
    if (!cardsContainer) return;

    // 当前分类的网站数据
    const categoryWebsites = websites[categoryId];
    if (!categoryWebsites || !Array.isArray(categoryWebsites)) return;

    exitReorderModeFor('all');

    // 清空容器
    cardsContainer.innerHTML = '';

    // 按权重排序
    const sortedWebsites = [...categoryWebsites].sort((a, b) =>
        (b.weight || 100) - (a.weight || 100));

    // 更新排序后的数据
    websites[categoryId] = sortedWebsites;

    // 创建卡片，私密网站只在私密收藏 tab 里出现
    appendCards(cardsContainer, sortedWebsites.filter(website => !website.private));

    // 为所有卡片添加事件监听器
    cardsContainer.querySelectorAll('.website-card').forEach(addCardEventListeners);
}

// 编辑网站功能
function editWebsite(card) {
    const title = card.querySelector('.card-title').textContent;
    const url = card.querySelector('.card-url').textContent;
    const isPrivate = card.classList.contains('private-card');
    const isDescHidden = card.classList.contains('desc-hidden-card');
    // 描述被遮住的卡片 DOM 里只有占位符，真实描述在渲染时存进了 secretDescriptions
    const description = card.querySelector('.card-secret')
        ? (secretDescriptions.get(card) || '')
        : card.querySelector('.card-description').textContent.trimStart();

    // 检查是否有图片
    const imgElement = card.querySelector('.card-icon img');
    let imageData = '';

    // 获取置顶状态
    const isPinned = card.classList.contains('pinned');

    // 填充表单
    document.getElementById('websiteName').value = title;
    document.getElementById('websiteUrl').value = url;
    document.getElementById('websiteDescription').value = description;
    document.getElementById('websiteIcon').value = '';
    document.getElementById('websitePinned').checked = isPinned;
    document.getElementById('websitePrivate').checked = isPrivate;
    document.getElementById('websiteHideDescription').checked = isDescHidden;
    syncPrivateCheckbox();

    // 获取卡片的分类
    let categoryId;
    const categorySection = card.closest('.category-section');

    if (isVirtualSection(categorySection.id)) {
        // 如果是从虚拟分类（置顶或最近添加）编辑，使用存储在卡片上的原始分类
        categoryId = card.dataset.originalCategory;

        // 如果没有获取到原始分类，尝试通过标题和URL在所有分类中查找
        if (!categoryId) {
            const cardTitle = card.querySelector('.card-title').textContent;
            const cardUrl = card.querySelector('.card-url').textContent;

            // 在所有非虚拟分类中查找匹配的网站
            Object.keys(websites).forEach(catId => {
                if (!categoryId) {
                    const foundSite = websites[catId].find(site =>
                        site.title === cardTitle && site.url === cardUrl);
                    if (foundSite) {
                        categoryId = catId;

                        // 将原始分类ID保存到卡片上，以便将来使用
                        card.dataset.originalCategory = categoryId;

                        // 如果找到的网站有图片数据，设置到表单
                        if (foundSite.imageData) {
                            imageData = foundSite.imageData;
                            document.getElementById('websiteIcon').dataset.imageData = imageData;
                        }
                    }
                }
            });

            // 如果仍然没有找到，使用默认分类
            if (!categoryId) {
                categoryId = 'uncategorized';

                // 将默认分类ID保存到卡片上
                card.dataset.originalCategory = categoryId;
            }
        } else {
            // 已经有原始分类，现在查找该分类中的网站以获取图片数据
            const foundSite = websites[categoryId].find(site =>
                site.title === title && site.url === url);
            if (foundSite && foundSite.imageData) {
                imageData = foundSite.imageData;
                document.getElementById('websiteIcon').dataset.imageData = imageData;
            }
        }
    } else {
        categoryId = categorySection.id;

        // 查找网站数据，获取可能存在的图片数据
        const cardIndex = siteIndexOfCard(card, categoryId);
        if (websites[categoryId] && websites[categoryId][cardIndex]) {
            const siteData = websites[categoryId][cardIndex];
            if (siteData.imageData) {
                imageData = siteData.imageData;
                document.getElementById('websiteIcon').dataset.imageData = imageData;
            }
        }
    }

    // 如果在DOM中直接找到图片元素，也可以获取图片数据
    if (!imageData && imgElement && imgElement.src) {
        imageData = imgElement.src;
        document.getElementById('websiteIcon').dataset.imageData = imageData;
    }

    // 设置分类下拉菜单的值
    const categorySelect = document.getElementById('websiteCategory');
    if (categoryId && categorySelect) {
        // 检查该分类是否存在于下拉菜单中
        const categoryOption = Array.from(categorySelect.options).find(option => option.value === categoryId);

        if (categoryOption) {
            categorySelect.value = categoryId;
        } else {
            // 选择第一个非空选项
            if (categorySelect.options.length > 1) {
                categorySelect.selectedIndex = 1;
            }
        }
    }

    // 有图片显示图片，没有显示首字图标预览
    if (imageData) {
        renderUploadedIconPreview(imageData);
    } else {
        resetIconUpload();
    }

    // 更新模态框标题和按钮
    document.getElementById('modalTitle').textContent = '编辑网站';

    // 标记当前编辑的卡片
    currentEditingCard = card;
    card.classList.add('editing');

    openModal('websiteModal');

    // 手动更新AI识别按钮状态，因为URL已经填充
    const aiDetectBtn = document.getElementById('aiDetectBtn');
    if (aiDetectBtn) {
        const urlInput = document.getElementById('websiteUrl');
        const url = urlInput.value.trim();
        const isValidUrl = url.length > 0 && (url.startsWith('http://') || url.startsWith('https://'));
        aiDetectBtn.disabled = !isValidUrl;
    }
}

// 提交表单
function submitWebsiteForm() {
    const name = document.getElementById('websiteName').value;
    const url = document.getElementById('websiteUrl').value;
    let description = document.getElementById('websiteDescription').value;
    description = description.trimStart();
    const category = document.getElementById('websiteCategory').value;
    const iconUrl = document.getElementById('websiteIcon').value;
    const isPrivate = document.getElementById('websitePrivate').checked;
    // 私密网站的描述本来就遮住，隐藏描述只对非私密网站有意义
    const isHideDescription = !isPrivate && document.getElementById('websiteHideDescription').checked;
    // 私密网站不进特别关注
    const isPinned = !isPrivate && document.getElementById('websitePinned').checked;
    // 获取图片数据（如果有）
    const imageData = document.getElementById('websiteIcon').dataset.imageData || '';

    if (!name || !url || !category) {
        alert('请填写所有必填字段');
        return;
    }

    // 保存原始卡片的引用，以确保我们可以清除其编辑状态
    const originalCard = currentEditingCard;

    // 计算该分类中的最大权重
    const getMaxWeight = (categoryId) => {
        if (!websites[categoryId] || websites[categoryId].length === 0) return 100;
        return Math.max(...websites[categoryId].map(site => site.weight || 100)) + 10;
    };

    // 获取所有分类中的最大权重，确保置顶网站权重最高
    const getGlobalMaxWeight = () => {
        let maxWeight = 100;

        Object.keys(websites).forEach(cat => {
            if (websites[cat] && websites[cat].length > 0) {
                const catMaxWeight = Math.max(...websites[cat].map(site => site.weight || 100));
                maxWeight = Math.max(maxWeight, catMaxWeight);
            }
        });

        return maxWeight + 10; // 比全局最大权重高10
    };

    // 根据是否置顶设置权重
    let newWeight;
    if (isPinned) {
        // 置顶网站获取全局最大权重
        newWeight = getGlobalMaxWeight();
    } else {
        // 非置顶网站获取所在分类的最大权重
        newWeight = getMaxWeight(category);
    }

    // 记录分类是否变更，「全部网站」下据此滚动到新分类
    let categoryChanged = false;
    // 记录置顶状态是否变更
    let pinnedChanged = false;
    // 记录权重是否变更
    let weightChanged = false;
    // 记录私密状态是否变更
    let privateChanged = false;
    let hideDescriptionInvolved = false;
    // 当前时间戳，用于记录添加/编辑时间
    const currentTime = Date.now();

    if (currentEditingCard) {
        // 编辑现有卡片
        let oldCategoryId;
        let oldTitle, oldUrl; // 记录旧标题和URL，用于在置顶分类中查找
        let oldPinned = false; // 记录旧置顶状态
        let oldWeight = 0; // 记录旧权重
        const categorySection = currentEditingCard.closest('.category-section');

        if (isVirtualSection(categorySection.id)) {
            // 如果是从虚拟分类编辑，使用存储在卡片上的原始分类
            oldCategoryId = currentEditingCard.dataset.originalCategory;
            oldTitle = currentEditingCard.querySelector('.card-title').textContent;
            oldUrl = currentEditingCard.querySelector('.card-url').textContent;
        } else {
            oldCategoryId = categorySection.id;
        }
        oldPinned = currentEditingCard.classList.contains('pinned');

        // 检查置顶状态是否变更
        pinnedChanged = oldPinned !== isPinned;
        privateChanged = currentEditingCard.classList.contains('private-card') !== isPrivate;
        // 涉及隐藏描述时不能走 updateWebsiteCard 原地改卡片（它会把描述明文写进 DOM），一律整体重渲染
        hideDescriptionInvolved = isHideDescription || currentEditingCard.classList.contains('desc-hidden-card');

        // 确保编辑的旧分类存在
        if (!oldCategoryId || !websites[oldCategoryId]) {
            console.error('无法找到原始分类:', oldCategoryId);
            closeModal('websiteModal');
            return;
        }

        // 在原始分类中找到卡片索引
        let cardIndex = -1;

        // 如果是编辑虚拟分类中的卡片，需要在原始分类中查找匹配的网站
        if (isVirtualSection(categorySection.id)) {
            cardIndex = websites[oldCategoryId].findIndex(site =>
                site.title === oldTitle && site.url === oldUrl);
        } else {
            cardIndex = siteIndexOfCard(currentEditingCard, oldCategoryId);
        }

        // 获取旧权重
        if (cardIndex >= 0 && websites[oldCategoryId][cardIndex]) {
            oldWeight = websites[oldCategoryId][cardIndex].weight || 100;
            // 检查权重是否变更
            weightChanged = isPinned ? (newWeight !== oldWeight) : false;
        }

        // 确保移除编辑状态
        if (currentEditingCard.classList.contains('editing')) {
            currentEditingCard.classList.remove('editing');
        }

        // 检查分类是否有变化
        if (oldCategoryId !== category && cardIndex >= 0) {
            categoryChanged = true;

            // 从旧分类中移除
            const websiteData = websites[oldCategoryId].splice(cardIndex, 1)[0];

            // 移动到新分类
            if (!websites[category]) {
                websites[category] = [];
            }

            // 使用新的数据更新网站信息
            websites[category].push({
                title: name,
                url: url,
                description: description,
                icon: iconUrl || 'fas fa-globe',
                imageData: imageData, // 保存图片数据
                weight: newWeight, // 设置新权重
                pinned: isPinned, // 添加置顶属性
                private: isPrivate,
                hideDescription: isHideDescription,
                addedTime: websiteData.addedTime || currentTime, // 保留原添加时间或使用当前时间
                editedTime: currentTime, // 记录编辑时间
                ...carryOrderFields(websiteData, isPinned, isPrivate, currentTime)
            });

            // 如果当前正在编辑非虚拟分类中的卡片，先隐藏旧卡片，准备移除
            if (!isVirtualSection(categorySection.id)) {
                currentEditingCard.style.display = 'none';

                // 设置延迟移除旧卡片
                setTimeout(() => {
                    if (currentEditingCard && currentEditingCard.parentNode) {
                        currentEditingCard.remove();
                    }
                }, 0);
            }

            // 对新分类和旧分类进行排序并刷新UI
            sortAndRefreshCategory(oldCategoryId);
            sortAndRefreshCategory(category);

            // 不需要再次创建卡片，因为sortAndRefreshCategory已经刷新了UI
            // createWebsiteCard(name, url, description, category, iconUrl, isPinned);

            console.log('网站已移动到新分类:', {
                from: oldCategoryId,
                to: category,
                website: name,
                newWeight: newWeight,
                pinned: isPinned
            });
        } else if (cardIndex >= 0) {
            // 分类没有变化，只更新卡片内容
            // 计算新权重
            // 只有新设为特别关注才顶到分类最前；原来就是关注的保持位置，免得每次编辑都打乱拖好的顺序
            const oldSite = websites[oldCategoryId][cardIndex];
            const newSiteWeight = isPinned && !oldSite.pinned ? newWeight : (oldSite.weight || 100);
            // 检查权重是否变更
            weightChanged = newSiteWeight !== oldWeight;

            websites[oldCategoryId][cardIndex] = {
                title: name,
                url: url,
                description: description,
                icon: iconUrl || 'fas fa-globe',
                imageData: imageData, // 保存图片数据
                weight: newSiteWeight, // 如果置顶，更新权重
                pinned: isPinned, // 更新置顶状态
                private: isPrivate,
                hideDescription: isHideDescription,
                addedTime: oldSite.addedTime || currentTime, // 保留原添加时间或使用当前时间
                editedTime: currentTime, // 记录编辑时间
                ...carryOrderFields(oldSite, isPinned, isPrivate, currentTime)
            };

            // 如果权重、置顶、私密状态变更或涉及隐藏描述，需要重新排序并刷新UI
            if (weightChanged || pinnedChanged || privateChanged || hideDescriptionInvolved) {
                sortAndRefreshCategory(oldCategoryId);
            } else {
                // 如果当前编辑的不是虚拟分类中的卡片，更新卡片UI
                if (!isVirtualSection(categorySection.id)) {
                    updateWebsiteCard(currentEditingCard, name, url, description, iconUrl, isPinned);
                } else {
                    // 如果是在虚拟分类中编辑，需要更新原始分类的UI
                    refreshCategoryUI(oldCategoryId);
                }
            }

            // 如果标题或URL有变化，且是从虚拟分类编辑的，需要删除旧卡片
            if (isVirtualSection(categorySection.id) && (oldTitle !== name || oldUrl !== url)) {
                // 添加删除动画
                currentEditingCard.style.animation = 'fadeOut 0.3s ease-out';

                // 延迟移除，让动画有时间播放
                setTimeout(() => {
                    if (currentEditingCard && currentEditingCard.parentNode) {
                        currentEditingCard.remove();
                    }
                }, 300);
            }
        } else {
            console.error('无法在分类中找到卡片:', oldCategoryId, cardIndex);
        }

        // 清除全局编辑卡片引用
        currentEditingCard = null;
    } else {
        // 创建新卡片
        categoryChanged = true; // 新网站当作分类变更处理
        pinnedChanged = isPinned; // 如果新网站有置顶，记录为置顶变更

        // 更新数据对象
        if (!websites[category]) {
            websites[category] = [];
        }

        websites[category].push({
            title: name,
            url: url,
            description: description,
            icon: iconUrl || 'fas fa-globe',
            imageData: imageData, // 保存图片数据
            weight: newWeight, // 设置新权重
            pinned: isPinned, // 添加置顶属性
            private: isPrivate,
            hideDescription: isHideDescription,
            addedTime: currentTime, // 记录添加时间
            editedTime: currentTime, // 记录编辑时间（与添加时间相同）
            ...carryOrderFields(null, isPinned, isPrivate, currentTime)
        });

        // 对分类进行排序并刷新UI
        sortAndRefreshCategory(category);

        // 不需要再次创建卡片，因为sortAndRefreshCategory已经刷新了UI
        // createWebsiteCard(name, url, description, category, iconUrl, isPinned);

        console.log('创建了新网站:', {
            category: category,
            website: name,
            weight: newWeight,
            pinned: isPinned,
            addedTime: new Date(currentTime).toLocaleString()
        });
    }

    // 更新虚拟视图
    renderVirtualViews();

    // 保存数据到localStorage
    if (window.saveNavData) {
        window.saveNavData();
    }

    // 最后确保没有卡片还处于编辑状态
    document.querySelectorAll('.website-card.editing').forEach(card => {
        card.classList.remove('editing');
    });

    closeModal('websiteModal');

    // 保存后留在当前分区，不跳到别的 tab；只在「全部网站」下分类变了时滚到新分类。
    // 延迟一点等 DOM 更新完，再高亮当前分区里刚保存的卡片（不在当前分区里就不高亮）
    const activeTab = document.documentElement.getAttribute('data-tab') || 'all';
    setTimeout(() => {
        let section;
        if (activeTab === 'all') {
            // 私密网站不在「全部网站」里显示，没有卡片可跟过去
            if (categoryChanged && !isPrivate) showCategory(category);
            section = document.getElementById(category);
        } else {
            section = document.getElementById(activeTab);
        }
        highlightSavedCard(section, name, url);
    }, 100);
}

// 给刚保存的卡片加一下闪烁高亮
function highlightSavedCard(section, name, url) {
    if (!section) return;
    section.querySelectorAll('.cards-grid .website-card').forEach(card => {
        const cardTitle = card.querySelector('.card-title').textContent;
        const cardUrl = card.querySelector('.card-url').textContent;
        if (cardTitle === name && cardUrl === url) {
            card.classList.add('simple-highlight');
            setTimeout(() => {
                card.classList.remove('simple-highlight');
            }, 1000);
        }
    });
}

// 对分类进行排序并刷新UI
function sortAndRefreshCategory(categoryId) {
    if (!websites[categoryId] || !Array.isArray(websites[categoryId])) return;

    // 按权重排序
    websites[categoryId].sort((a, b) => (b.weight || 100) - (a.weight || 100));

    // 刷新分类UI
    refreshCategoryUI(categoryId);
}

// 置顶 / 最近添加 / 访问最多 这几个视图里的卡片不属于某个分类 section，
// 编辑、删除时要靠卡片上的 data-original-category 找回原分类
const VIRTUAL_SECTION_IDS = ['frequent', 'recent', 'pinned', 'private', 'search'];

function isVirtualSection(id) {
    return VIRTUAL_SECTION_IDS.includes(id);
}

// 「访问最多」tab 展示的网站数量，与最近添加同理取 60
const FREQUENT_LIMIT = 60;

// 渲染访问最多视图：只列有访问记录的网站，按次数 + 近期加权排序
function renderFrequentCategory() {
    if (typeof getVisitScore !== 'function') return;
    const frequentWebsites = collectAllWebsites()
        .map(website => ({ ...website, visitScore: getVisitScore(website.url) }))
        .filter(website => website.visitScore > 0)
        .sort((a, b) => b.visitScore - a.visitScore)
        .slice(0, FREQUENT_LIMIT);

    // 亲手拖过的固定在拖到的位置，其余按得分浮动
    const ordered = applyFrequentPins(frequentWebsites);
    renderVirtualView('frequent', ordered);

    // 标出固定的卡片，整理模式下用强调色描边区分
    const pins = getFrequentPins();
    document.querySelectorAll('#frequent-cards .website-card').forEach((card, index) => {
        card.classList.toggle('frequent-fixed', visitUrlKey(ordered[index].url) in pins);
    });
}

function renderVirtualViews() {
    renderFrequentCategory();
    renderPinnedCategory();
    renderRecentCategory();
    renderPrivateCategory();
    renderSearchResults();
}

// 「最近添加」tab 展示的网站数量。60 是 1～5 的最小公倍数，
// 每行 3/4/5 张（普通、压缩、手机宫格）时最后一行都是满的
const RECENT_LIMIT = 60;

// 收集所有分类下的网站，带上原始分类，供各个视图使用。
// 私密网站默认排除，只有私密收藏视图传 { onlyPrivate: true } 取它们
function collectAllWebsites({ onlyPrivate = false } = {}) {
    const allWebsites = [];
    Object.keys(websites).forEach(category => {
        if (!Array.isArray(websites[category])) return;
        websites[category].forEach(website => {
            if (!!website.private !== onlyPrivate) return;
            allWebsites.push({ ...website, originalCategory: category });
        });
    });
    return allWebsites;
}

// 把网站列表渲染进置顶 / 最近添加视图，列表为空时显示空状态提示
function renderVirtualView(sectionId, sites) {
    const container = document.getElementById(`${sectionId}-cards`);
    if (!container) return;

    exitReorderModeFor(sectionId);

    container.innerHTML = '';

    // 卡片记下原始分类，编辑、删除、置顶时靠它找回数据
    appendCards(container, sites).forEach((card, index) => {
        card.dataset.originalCategory = sites[index].originalCategory;
        addCardEventListeners(card);
    });

    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.toggle('is-empty', sites.length === 0);
    }
}

// 特别关注的排序键：拖拽排序写 pinnedOrder，没拖过的回退到 weight。数值越大越靠前
function pinnedSortKey(site) {
    return site.pinnedOrder ?? site.weight ?? 100;
}

// 新设为特别关注的排最前
function nextPinnedOrder() {
    return Math.max(90, ...collectAllWebsites().filter(site => site.pinned).map(pinnedSortKey)) + 10;
}

// 表单保存会重建网站对象，两个排序键要带过去：新设为关注 / 私密的排到最前，原来就是的保持位置
function carryOrderFields(oldSite, isPinned, isPrivate, now) {
    const fields = {};
    if (isPinned) {
        fields.pinnedOrder = oldSite && oldSite.pinned ? oldSite.pinnedOrder : nextPinnedOrder();
    }
    if (isPrivate) {
        fields.privateOrder = oldSite && oldSite.private ? oldSite.privateOrder : now;
    }
    return fields;
}

// 渲染置顶视图
function renderPinnedCategory() {
    const pinnedWebsites = collectAllWebsites()
        .filter(website => website.pinned === true)
        .sort((a, b) => pinnedSortKey(b) - pinnedSortKey(a));

    renderVirtualView('pinned', pinnedWebsites);
}

// 私密收藏默认锁定，点「显示」后本次会话内一直显示（sessionStorage，关标签页即失效）
function isPrivateRevealed() {
    try {
        return sessionStorage.getItem('privateRevealed') === '1';
    } catch (e) {
        return false;
    }
}

function setPrivateRevealed(revealed) {
    try {
        if (revealed) {
            sessionStorage.setItem('privateRevealed', '1');
        } else {
            sessionStorage.removeItem('privateRevealed');
        }
    } catch (e) {
        // 隐私模式下写不进去，只影响刷新后是否要重新点显示
    }
    // 锁上时「显示全部」一起关掉，下次解锁回到默认的模糊状态
    if (!revealed) reblurPrivateCards();
    renderPrivateCategory();
}

// 渲染私密收藏视图：锁定时不渲染任何卡片 DOM，搜索、悬浮提示、开发者工具都拿不到内容
function renderPrivateCategory() {
    const section = document.getElementById('private');
    if (!section) return;
    const revealed = isPrivateRevealed();
    section.classList.toggle('is-locked', !revealed);

    const privateWebsites = revealed
        ? collectAllWebsites({ onlyPrivate: true }).sort(compareByPrivateOrderDesc)
        : [];
    renderVirtualView('private', privateWebsites);
    if (!revealed) section.classList.remove('is-empty');
    if (privateAllRevealed) setPrivateAllRevealed(true);
}

// 私密收藏的顺序：拖拽排序写 privateOrder，移入私密时写当前时间戳所以排最前；
// 没有这个键的（没拖过的旧数据、扩展新加的）回退到修改 / 添加时间里较晚的，再没有就排最后、按权重
function compareByPrivateOrderDesc(a, b) {
    const ka = a.privateOrder ?? Math.max(a.editedTime || 0, a.addedTime || 0);
    const kb = b.privateOrder ?? Math.max(b.editedTime || 0, b.addedTime || 0);
    if (ka && kb) return kb - ka;
    if (ka) return -1;
    if (kb) return 1;
    return (b.weight || 100) - (a.weight || 100);
}

// 按添加时间倒序（不考虑 editedTime），没有添加时间的旧数据排在后面、按权重排。最近添加和搜索结果共用
function compareByAddedTimeDesc(a, b) {
    if (a.addedTime && b.addedTime) return b.addedTime - a.addedTime;
    if (a.addedTime) return -1;
    if (b.addedTime) return 1;
    return (b.weight || 100) - (a.weight || 100);
}

// 渲染最近添加视图
function renderRecentCategory() {
    const recentWebsites = collectAllWebsites()
        .sort(compareByAddedTimeDesc)
        .slice(0, RECENT_LIMIT);

    renderVirtualView('recent', recentWebsites);
}

// 渲染搜索结果：全部网站（不含私密）里匹配标题、网址、描述的，不分分类，按添加时间从新到旧平铺。
// 数据变化时跟着 renderVirtualViews() 重渲染，搜索中编辑、删除后结果立即更新
function renderSearchResults() {
    const container = document.getElementById('search-cards');
    if (!container) return;
    clearSearchSelection();
    const searchTerm = (document.querySelector('.search-box')?.value || '').toLowerCase().trim();
    if (!searchTerm) {
        container.innerHTML = '';
        return;
    }

    const includes = value => String(value || '').toLowerCase().includes(searchTerm);
    const results = collectAllWebsites()
        .filter(site => includes(site.title) || includes(site.url) || includes(site.description))
        .sort(compareByAddedTimeDesc);
    renderVirtualView('search', results);

    // 隐藏描述的卡片只在描述里匹配到时，占位符上提示一下，否则看不出这张卡为什么出现
    container.querySelectorAll('.website-card').forEach((card, index) => {
        const site = results[index];
        card.querySelector('.card-secret')?.classList.toggle('desc-match',
            includes(site.description) && !includes(site.title) && !includes(site.url));
    });

    highlightSearchResults(container, searchTerm);
}

// 创建新网站卡片
function createWebsiteCard(name, url, description, category, iconUrl, isPinned) {
    const categorySection = document.getElementById(category);
    const cardsGrid = categorySection.querySelector('.cards-grid');

    // 获取最大权重值，确保显示在前面
    const getMaxWeight = () => {
        if (!websites[category] || websites[category].length === 0) return 100;
        return Math.max(...websites[category].map(site => site.weight || 100)) + 10;
    };

    const weight = getMaxWeight();
    const pinnedClass = isPinned ? 'pinned' : '';

    const cardHTML = `
        <div class="website-card ${pinnedClass}" style="animation: fadeIn 0.5s ease-out" data-weight="${weight}">
            <button class="card-pin-btn" title="取消特别关注" aria-label="取消特别关注"><i class="fas fa-star"></i></button>
            <div class="card-header">
                <div class="card-icon">
                    ${letterIconHTML(name, url)}
                </div>
                <div>
                    <div class="card-title">${name}</div>
                    <div class="card-url">${url}</div>
                </div>
            </div>
            <div class="card-description">${description.trimStart()}</div>
            <div class="card-footer">
                <button class="card-menu-btn" aria-label="菜单">
                    <i class="fas fa-minus"></i>
                </button>
            </div>
        </div>
    `;

    // 插入到网格的开头而不是末尾，确保新卡片显示在最前面
    cardsGrid.insertAdjacentHTML('afterbegin', cardHTML);

    // 为新卡片添加事件监听器
    const newCard = cardsGrid.firstElementChild;
    addCardEventListeners(newCard);
}

// 更新网站卡片
function updateWebsiteCard(card, name, url, description, iconUrl, isPinned) {
    card.querySelector('.card-title').textContent = name;
    card.querySelector('.card-url').textContent = url;
    card.querySelector('.card-description').textContent = description.trimStart();

    // 获取图片数据
    const imageData = document.getElementById('websiteIcon').dataset.imageData || '';

    // 更新图标：有图片用图片，没有就用首字图标
    const cardIcon = card.querySelector('.card-icon');
    cardIcon.innerHTML = imageData
        ? `<img src="${escapeHtml(imageData)}" alt="${escapeHtml(name)}">`
        : letterIconHTML(name, url);
    cardIcon.classList.toggle('with-img', !!imageData);

    // 更新置顶状态
    if (isPinned) {
        card.classList.add('pinned');
    } else {
        card.classList.remove('pinned');
    }

    // 移除编辑状态
    card.classList.remove('editing');

    // 添加更新动画
    card.style.animation = 'pulse 0.5s ease-out';
    setTimeout(() => {
        card.style.animation = '';
    }, 500);

    // 更新数据对象
    const categoryId = card.closest('.category-section').id;
    const cardIndex = siteIndexOfCard(card, categoryId);

    // 检查索引是否有效
    if (websites[categoryId] && cardIndex >= 0 && cardIndex < websites[categoryId].length) {
        // 保留原有权重
        const currentWeight = websites[categoryId][cardIndex].weight || 100;
        const currentTime = Date.now();

        websites[categoryId][cardIndex] = {
            title: name,
            url: url,
            description: description,
            icon: iconUrl || 'fas fa-globe',
            imageData: imageData, // 保存图片数据
            weight: currentWeight, // 保留原有权重
            pinned: isPinned, // 更新置顶状态
            private: false, // 分类 section 里只有非私密网站
            hideDescription: false, // 隐藏描述的网站不走这里，见 submitWebsiteForm 的 hideDescriptionInvolved
            addedTime: websites[categoryId][cardIndex].addedTime || currentTime, // 保留原添加时间，如果没有则使用当前时间
            editedTime: currentTime, // 记录编辑时间
            ...carryOrderFields(websites[categoryId][cardIndex], isPinned, false, currentTime)
        };

        // 保存数据到localStorage
        if (window.saveNavData) {
            window.saveNavData();
        }
    } else {
        console.warn('无法更新数据对象，索引无效:', {
            categoryId,
            cardIndex,
            cardsInCategory: websites[categoryId] ? websites[categoryId].length : 0
        });
    }
}

// 右键菜单功能
let contextMenu = null;

// 复制网站网址到剪贴板
function copyWebsiteUrl(card) {
    // 获取网站URL
    const url = card.querySelector('.card-url').textContent;

    // 使用现代剪贴板API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
            .then(() => {
                if (typeof showNotification === 'function') {
                    showNotification('网址已复制到剪贴板', 'success');
                }
            })
            .catch(err => {
                console.error('复制失败:', err);
                // 降级到传统方法
                fallbackCopyText(url);
            });
    } else {
        // 浏览器不支持Clipboard API，使用传统方法
        fallbackCopyText(url);
    }
}

// 传统复制方法（兼容旧浏览器）。label 用在提示里，如「网址」「描述」
function fallbackCopyText(text, label = '网址') {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            if (typeof showNotification === 'function') {
                showNotification(`${label}已复制到剪贴板`, 'success');
            }
        } else {
            if (typeof showNotification === 'function') {
                showNotification('复制失败，请手动复制', 'error');
            }
        }
    } catch (err) {
        console.error('复制失败:', err);
        if (typeof showNotification === 'function') {
            showNotification('复制失败，请手动复制', 'error');
        }
    }

    document.body.removeChild(textArea);
}

function createContextMenu() {
    if (contextMenu) return contextMenu;

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.position = 'fixed'; // 固定使用fixed定位
    contextMenu.innerHTML = `
        <div class="context-menu-item" id="copy-url-btn">
            <i class="fas fa-copy"></i>
            <span>复制网址</span>
        </div>
        <div class="context-menu-item" id="view-description-btn">
            <i class="fas fa-file-lines"></i>
            <span>查看描述</span>
        </div>
        <div class="context-menu-item" id="edit-website-btn">
            <i class="fas fa-edit"></i>
            <span>编辑网站</span>
        </div>
        <div class="context-menu-item" id="toggle-pin-btn">
            <i class="fas fa-star"></i>
            <span id="pin-action-text">特别关注</span>
        </div>
        <div class="context-menu-item" id="toggle-private-btn">
            <i class="fas fa-lock"></i>
            <span id="private-action-text">设为私密</span>
        </div>
        <div class="context-menu-item" id="toggle-hide-desc-btn">
            <i class="fas fa-eye-slash"></i>
            <span id="hide-desc-action-text">隐藏描述</span>
        </div>
        <div class="context-menu-item" id="reorder-btn">
            <i class="fas fa-up-down-left-right"></i>
            <span>调整顺序</span>
        </div>
        <div class="context-menu-item" id="remove-frequent-btn">
            <i class="fas fa-eye-slash"></i>
            <span>从访问最多中移除</span>
        </div>
        <div class="context-menu-item danger" id="delete-website-btn">
            <i class="fas fa-trash"></i>
            <span>删除网站</span>
        </div>
    `;

    document.body.appendChild(contextMenu);

    // 使用addEventListener绑定事件
    const copyUrlBtn = contextMenu.querySelector('#copy-url-btn');
    const editBtn = contextMenu.querySelector('#edit-website-btn');
    const togglePinBtn = contextMenu.querySelector('#toggle-pin-btn');
    const deleteBtn = contextMenu.querySelector('#delete-website-btn');

    copyUrlBtn.addEventListener('click', function () {
        if (contextMenuTarget) {
            copyWebsiteUrl(contextMenuTarget);
            hideContextMenu();
        }
    });

    editBtn.addEventListener('click', function () {
        if (contextMenuTarget) {
            editWebsite(contextMenuTarget);
            hideContextMenu();
        }
    });

    togglePinBtn.addEventListener('click', function () {
        if (contextMenuTarget) {
            togglePinStatus(contextMenuTarget);
            hideContextMenu();
        }
    });

    deleteBtn.addEventListener('click', function () {
        if (contextMenuTarget) {
            deleteWebsite(contextMenuTarget);
            hideContextMenu();
        }
    });

    contextMenu.querySelector('#toggle-private-btn').addEventListener('click', function () {
        if (contextMenuTarget) {
            togglePrivateStatus(contextMenuTarget);
            hideContextMenu();
        }
    });

    contextMenu.querySelector('#toggle-hide-desc-btn').addEventListener('click', function () {
        if (contextMenuTarget) {
            toggleHideDescription(contextMenuTarget);
            hideContextMenu();
        }
    });

    contextMenu.querySelector('#view-description-btn').addEventListener('click', function () {
        if (contextMenuTarget) {
            openDescriptionModal(contextMenuTarget);
            hideContextMenu();
        }
    });

    contextMenu.querySelector('#reorder-btn').addEventListener('click', function () {
        hideContextMenu();
        enterReorderMode();
    });

    contextMenu.querySelector('#remove-frequent-btn').addEventListener('click', function () {
        if (contextMenuTarget) {
            removeVisitStats(contextMenuTarget.querySelector('.card-url').textContent);
            renderFrequentCategory();
            hideContextMenu();
        }
    });

    return contextMenu;
}

// 切换网站置顶状态
function togglePinStatus(card) {
    // 获取网站信息
    const title = card.querySelector('.card-title').textContent;
    const url = card.querySelector('.card-url').textContent;
    const description = card.querySelector('.card-description').textContent.trimStart();

    // 获取当前置顶状态
    const isPinned = card.classList.contains('pinned');
    const newPinStatus = !isPinned; // 切换状态

    // 获取分类ID
    let categoryId;
    const categorySection = card.closest('.category-section');

    if (isVirtualSection(categorySection.id)) {
        // 如果是从置顶分类或最近添加分类，使用存储在卡片上的原始分类
        categoryId = card.dataset.originalCategory;
        if (!categoryId) {
            console.error('无法获取原始分类ID:', title, url);
            return;
        }
    } else {
        categoryId = categorySection.id;
    }

    // 确保分类存在
    if (!websites[categoryId]) {
        console.error('无法找到分类:', categoryId);
        return;
    }

    // 在分类中查找网站
    let websiteIndex = -1;

    // 如果是从置顶分类或最近添加分类，需要在原始分类中查找匹配的网站
    if (isVirtualSection(categorySection.id)) {
        websiteIndex = websites[categoryId].findIndex(site =>
            site.title === title && site.url === url);
    } else {
        websiteIndex = siteIndexOfCard(card, categoryId);

        // 验证索引
        if (websiteIndex < 0 || websiteIndex >= websites[categoryId].length) {
            // 尝试通过标题和URL查找
            websiteIndex = websites[categoryId].findIndex(site =>
                site.title === title && site.url === url);
        }
    }

    if (websiteIndex < 0) {
        console.error('无法在分类中找到网站:', title, url);
        return;
    }

    // 获取当前权重
    const currentWeight = websites[categoryId][websiteIndex].weight || 100;

    // 计算新权重
    let newWeight = currentWeight;
    if (newPinStatus) {
        // 如果是置顶，设置全局最高权重
        newWeight = getGlobalMaxWeight();
    }

    // 获取现有图片数据以确保保留
    const imageData = websites[categoryId][websiteIndex].imageData || '';

    // 更新网站数据
    if (newPinStatus) websites[categoryId][websiteIndex].pinnedOrder = nextPinnedOrder();
    websites[categoryId][websiteIndex].pinned = newPinStatus;
    websites[categoryId][websiteIndex].weight = newWeight;

    // 确保图片数据被保留
    if (imageData) {
        websites[categoryId][websiteIndex].imageData = imageData;
    }

    // 更新UI
    if (isVirtualSection(categorySection.id)) {
        // 如果是在置顶分类或最近添加分类操作，我们需要在当前分类中移除它
        card.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            if (card.parentNode) {
                card.remove();
            }
        }, 300);
    } else {
        // 更新卡片UI
        if (newPinStatus) {
            card.classList.add('pinned');
        } else {
            card.classList.remove('pinned');
        }
    }

    // 对分类进行排序并刷新UI
    sortAndRefreshCategory(categoryId);

    // 更新各个视图（其它视图里的卡片也显示收藏状态）
    renderVirtualViews();

    // 保存数据
    if (window.saveNavData) {
        window.saveNavData();
    }

    // 如果是设置置顶，滚动到置顶分类
    if (newPinStatus) {
        setTimeout(() => {
            switchTab('pinned');

            // 在置顶分类中找到并高亮卡片
            const pinnedSection = document.getElementById('pinned');
            if (pinnedSection) {
                const pinnedCards = pinnedSection.querySelectorAll('.cards-grid .website-card');
                pinnedCards.forEach(pinnedCard => {
                    const cardTitle = pinnedCard.querySelector('.card-title').textContent;
                    const cardUrl = pinnedCard.querySelector('.card-url').textContent;

                    if (cardTitle === title && cardUrl === url) {
                        // 添加临时高亮效果
                        pinnedCard.classList.add('simple-highlight');
                        // 1秒后移除高亮
                        setTimeout(() => {
                            pinnedCard.classList.remove('simple-highlight');
                        }, 1000);
                    }
                });
            }
        }, 100);
    }
}

// 切换私密状态：数据改完整体重渲染，卡片会从各视图消失或回到原分类
function togglePrivateStatus(card) {
    const title = card.querySelector('.card-title').textContent;
    const url = card.querySelector('.card-url').textContent;
    const section = card.closest('.category-section');
    const categoryId = isVirtualSection(section.id) ? card.dataset.originalCategory : section.id;
    if (!categoryId || !websites[categoryId]) return;

    const index = isVirtualSection(section.id)
        ? websites[categoryId].findIndex(site => site.title === title && site.url === url)
        : siteIndexOfCard(card, categoryId);
    const site = websites[categoryId][index];
    if (!site) return;

    site.private = !site.private;
    site.editedTime = Date.now();
    if (site.private) {
        site.pinned = false;
        // 刚移进来的排最前（见 compareByPrivateOrderDesc）
        site.privateOrder = site.editedTime;
    }
    // 移出私密收藏时描述继续遮住，免得账号信息突然明文露出来；想公开再点「显示描述」
    if (!site.private) site.hideDescription = true;

    refreshCategoryUI(categoryId);
    renderVirtualViews();
    if (window.saveNavData) {
        window.saveNavData();
    }

    if (typeof showNotification === 'function') {
        showNotification(site.private ? '已移入私密收藏' : '已移出私密收藏', 'success');
    }
}

// 「查看描述」弹窗：手机宫格不显示描述，账号信息靠它查看和复制
function openDescriptionModal(card) {
    const title = card.querySelector('.card-title').textContent;
    const description = secretDescriptions.has(card)
        ? secretDescriptions.get(card)
        : card.querySelector('.card-description').textContent;
    document.getElementById('descriptionModalTitle').textContent = title;
    const view = document.getElementById('descriptionView');
    view.textContent = description || '（无描述）';
    view.classList.toggle('is-empty', !description);
    document.getElementById('descriptionCopyBtn').disabled = !description;
    openModal('descriptionModal');
}

function copyDescriptionText() {
    const text = document.getElementById('descriptionView').textContent;
    if (!text || document.getElementById('descriptionView').classList.contains('is-empty')) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showNotification?.('描述已复制到剪贴板', 'success'))
            .catch(() => fallbackCopyText(text, '描述'));
    } else {
        fallbackCopyText(text, '描述');
    }
}

// 切换隐藏描述：和切换私密一样，改数据后整体重渲染
function toggleHideDescription(card) {
    const title = card.querySelector('.card-title').textContent;
    const url = card.querySelector('.card-url').textContent;
    const section = card.closest('.category-section');
    const categoryId = isVirtualSection(section.id) ? card.dataset.originalCategory : section.id;
    if (!categoryId || !websites[categoryId]) return;

    const index = isVirtualSection(section.id)
        ? websites[categoryId].findIndex(site => site.title === title && site.url === url)
        : siteIndexOfCard(card, categoryId);
    const site = websites[categoryId][index];
    if (!site || site.private) return;

    site.hideDescription = !site.hideDescription;

    refreshCategoryUI(categoryId);
    renderVirtualViews();
    if (window.saveNavData) {
        window.saveNavData();
    }

    if (typeof showNotification === 'function') {
        showNotification(site.hideDescription ? '描述已隐藏' : '描述已公开显示', 'success');
    }
}

// 编辑弹窗里勾了私密就禁用「特别关注」和「隐藏描述」（私密网站的描述本来就遮住）
function syncPrivateCheckbox() {
    const privateBox = document.getElementById('websitePrivate');
    if (!privateBox) return;
    ['websitePinned', 'websiteHideDescription'].forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        box.disabled = privateBox.checked;
        if (privateBox.checked) box.checked = false;
        box.closest('.option-chip')?.classList.toggle('disabled', privateBox.checked);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('websitePrivate')?.addEventListener('change', syncPrivateCheckbox);
    document.getElementById('descriptionCopyBtn')?.addEventListener('click', copyDescriptionText);
    document.getElementById('privateRevealBtn')?.addEventListener('click', () => setPrivateRevealed(true));
    document.getElementById('privateHideBtn')?.addEventListener('click', () => setPrivateRevealed(false));
    document.getElementById('privateRevealAllBtn')?.addEventListener('click', () => setPrivateAllRevealed(!privateAllRevealed));
});

// 获取所有分类中的最大权重，确保置顶网站权重最高
function getGlobalMaxWeight() {
    let maxWeight = 100;

    Object.keys(websites).forEach(cat => {
        if (websites[cat] && websites[cat].length > 0) {
            const catMaxWeight = Math.max(...websites[cat].map(site => site.weight || 100));
            maxWeight = Math.max(maxWeight, catMaxWeight);
        }
    });

    return maxWeight + 10; // 比全局最大权重高10
}

let contextMenuTarget = null;

function showContextMenu(e, card) {
    e.preventDefault();
    e.stopPropagation();

    // 创建或获取菜单
    const menu = createContextMenu();
    contextMenuTarget = card;

    // 根据卡片当前状态更新置顶/取消置顶菜单项
    const isPinned = card.classList.contains('pinned');
    const pinActionText = menu.querySelector('#pin-action-text');
    pinActionText.textContent = isPinned ? '取消特别关注' : '特别关注';

    // 私密网站不进特别关注，隐藏这一项
    const isPrivate = card.classList.contains('private-card');
    menu.querySelector('#toggle-pin-btn').style.display = isPrivate ? 'none' : '';
    menu.querySelector('#private-action-text').textContent = isPrivate ? '取消私密' : '设为私密';

    // 隐藏描述的网站可以单独查看描述；隐藏描述的开关只对非私密网站有意义
    menu.querySelector('#view-description-btn').style.display = card.querySelector('.card-secret') ? '' : 'none';
    menu.querySelector('#toggle-hide-desc-btn').style.display = isPrivate ? 'none' : '';
    menu.querySelector('#hide-desc-action-text').textContent =
        card.classList.contains('desc-hidden-card') ? '显示描述' : '隐藏描述';

    // 「从访问最多中移除」只在访问最多视图里出现
    const sectionId = card.closest('.category-section')?.id;
    menu.querySelector('#remove-frequent-btn').style.display = sectionId === 'frequent' ? '' : 'none';

    // 「调整顺序」只在能手动排序的分区出现；搜索时分类 section 里是筛选后的结果，也不给排
    const canReorder = canReorderSection(sectionId) && !document.body.classList.contains('searching');
    menu.querySelector('#reorder-btn').style.display = canReorder ? '' : 'none';

    // 隐藏其他可能显示的菜单
    hideContextMenu();

    // 首先，确保菜单位于文档正文中
    if (!document.body.contains(menu)) {
        document.body.appendChild(menu);
    }

    // 确保菜单可见性重置（以防之前的隐藏操作影响）
    menu.style.display = 'block';
    menu.style.visibility = 'visible';
    menu.style.opacity = '0'; // 暂时设为不可见，以便测量尺寸
    menu.classList.add('active');

    // 测量菜单尺寸
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    // 用于调试的输出
    // console.log('菜单尺寸:', {
    //     width: menuWidth,
    //     height: menuHeight,
    //     viewportWidth: window.innerWidth,
    //     viewportHeight: window.innerHeight
    // });

    // 计算最佳位置
    let left = e.clientX;
    let top = e.clientY;

    // 检查右边界
    if (left + menuWidth > window.innerWidth) {
        left = left - menuWidth;
    }

    // 检查下边界
    if (top + menuHeight > window.innerHeight) {
        top = top - menuHeight;
    }

    // 确保不超出左边界和上边界
    left = Math.max(0, left);
    top = Math.max(0, top);

    // 应用位置
    menu.style.position = 'fixed'; // 使用fixed相对于视口定位
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.opacity = '1'; // 恢复可见性

    // console.log('菜单最终位置:', {left, top});
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.classList.remove('active');
        contextMenu.style.display = 'none';
        contextMenu.style.visibility = 'hidden';
        contextMenu.style.opacity = '0';
    }
}

// 搜索高亮功能。文字一律转义后再拼 HTML：标题可能来自扩展抓的网页标题，不可信；
// 关键词也要转义成正则字面量，否则输入 ( 之类会报错
function highlightSearchResults(container, searchTerm) {
    const pattern = searchTerm
        ? new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
        : null;

    // split 带捕获组时，奇数位是匹配到的关键词
    const mark = text => pattern
        ? text.split(pattern)
            .map((part, index) => index % 2 ? `<span class="highlight">${escapeHtml(part)}</span>` : escapeHtml(part))
            .join('')
        : escapeHtml(text);

    container.querySelectorAll('.website-card').forEach(card => {
        const title = card.querySelector('.card-title');
        title.innerHTML = mark(title.textContent);

        // 网址的协议始终包在 .card-url-protocol 里隐藏（同 cardUrlHTML），只高亮后面的部分
        const url = card.querySelector('.card-url');
        const match = url.textContent.match(/^(https?:\/\/)(.*)$/i);
        url.innerHTML = match
            ? `<span class="card-url-protocol">${escapeHtml(match[1])}</span>${mark(match[2])}`
            : mark(url.textContent);

        // 被遮住的描述不高亮，占位符和点开的明文都原样保留
        const description = card.querySelector('.card-description');
        if (!description.classList.contains('card-secret')) {
            description.innerHTML = mark(description.textContent);
        }
    });
}

// 为卡片添加事件监听器
function addCardEventListeners(card) {
    // 先移除可能存在的事件监听器，防止重复绑定
    card.removeEventListener('contextmenu', handleContextMenu);
    card.removeEventListener('click', handleCardClick);

    // 右键菜单
    card.addEventListener('contextmenu', handleContextMenu);

    // 左键点击（访问网站）
    card.addEventListener('click', handleCardClick);

    // 中键点击
    card.removeEventListener('auxclick', handleCardAuxClick);
    card.addEventListener('auxclick', handleCardAuxClick);

    // 右上角图钉：点击取消置顶（只有置顶卡片显示）
    const pinBtn = card.querySelector('.card-pin-btn');
    if (pinBtn) {
        pinBtn.removeEventListener('click', handlePinBtnClick);
        pinBtn.addEventListener('click', handlePinBtnClick);
    }

    // 触屏长按打开菜单（iOS 不会为长按触发 contextmenu）
    if (!card.dataset.longPressBound) {
        card.dataset.longPressBound = '1';
        bindCardLongPress(card);
    }

    // 菜单按钮点击（移动设备）
    const menuBtn = card.querySelector('.card-menu-btn');
    if (menuBtn) {
        menuBtn.removeEventListener('click', handleMenuBtnClick);
        menuBtn.addEventListener('click', handleMenuBtnClick);
    }
}

// 长按 450ms 弹出卡片菜单；手指移动或提前松开则取消。
// 菜单弹出后吞掉随之而来的 click，免得松手时顺带打开网站
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP = 10;
// 松手后多久内的 click 算长按带出来的（iOS 一般在 touchend 后 300ms 内补发）
const GHOST_CLICK_WINDOW_MS = 400;

// 长按弹出菜单后，拦下松手时 iOS 补发的那一次 click。
// 菜单弹出时全屏遮罩已经盖在手指下面，这次 click 落在遮罩（body）上而不是卡片上，
// 放在卡片上的拦截拦不住，会冒泡到 document 上「点空白处关菜单」，菜单一闪就没了。
// 主屏幕 Web App 模式会补发这次 click，Safari 标签页里长按交给系统处理、不补发，所以只在前者出现。
// 所以挂在 window 捕获阶段，不管落在哪都吞掉；松手后一小段时间或下次触摸时撤掉
let ghostClickGuard = null;

function armGhostClickGuard() {
    disarmGhostClickGuard();
    const swallow = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        disarmGhostClickGuard();
    };
    window.addEventListener('click', swallow, true);
    // 下一次触摸（比如点菜单项）开始时就撤掉，真实的点击不会被误吞
    window.addEventListener('touchstart', disarmGhostClickGuard, { capture: true, passive: true, once: true });
    ghostClickGuard = { swallow, timer: null };
}

function releaseGhostClickGuardSoon() {
    if (!ghostClickGuard) return;
    clearTimeout(ghostClickGuard.timer);
    ghostClickGuard.timer = setTimeout(disarmGhostClickGuard, GHOST_CLICK_WINDOW_MS);
}

function disarmGhostClickGuard() {
    if (!ghostClickGuard) return;
    window.removeEventListener('click', ghostClickGuard.swallow, true);
    window.removeEventListener('touchstart', disarmGhostClickGuard, true);
    clearTimeout(ghostClickGuard.timer);
    ghostClickGuard = null;
}

function bindCardLongPress(card) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    let fired = false;

    const cancel = () => {
        clearTimeout(timer);
        timer = null;
    };

    card.addEventListener('touchstart', (e) => {
        // 新的一次触摸开始，上一次长按留下的拦截不再需要
        disarmGhostClickGuard();
        if (e.touches.length !== 1 || isReordering()) return cancel();
        fired = false;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        cancel();
        timer = setTimeout(() => {
            timer = null;
            fired = true;
            armGhostClickGuard();
            if (navigator.vibrate) navigator.vibrate(8);
            const rect = card.getBoundingClientRect();
            showContextMenu(new PointerEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: Math.min(startX, rect.right),
                clientY: startY
            }), card);
        }, LONG_PRESS_MS);
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
        if (!timer) return;
        const touch = e.touches[0];
        if (Math.abs(touch.clientX - startX) > LONG_PRESS_SLOP || Math.abs(touch.clientY - startY) > LONG_PRESS_SLOP) {
            cancel();
        }
    }, { passive: true });

    // 触摸事件始终派发给起点元素（卡片），即使手指此刻在遮罩上
    card.addEventListener('touchend', (e) => {
        cancel();
        if (fired) {
            e.preventDefault();
            releaseGhostClickGuardSoon();
        }
    });
    card.addEventListener('touchcancel', () => {
        cancel();
        if (fired) releaseGhostClickGuardSoon();
    });

    // 安卓长按会自己触发 contextmenu，已经由上面打开过了
    card.addEventListener('contextmenu', (e) => {
        if (fired) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);
}

// 处理卡片图钉点击
function handlePinBtnClick(e) {
    e.stopPropagation();
    if (isReordering()) return;
    togglePinStatus(this.closest('.website-card'));
}

// 处理卡片右键菜单事件
function handleContextMenu(e) {
    // 整理模式下不弹菜单，也不让浏览器弹自带的
    if (isReordering()) {
        e.preventDefault();
        return;
    }
    showContextMenu(e, this);
}

// 处理菜单按钮点击事件（移动设备）
function handleMenuBtnClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const card = this.closest('.website-card');

    // 检查菜单是否已显示
    if (contextMenu && contextMenu.classList.contains('active') && contextMenuTarget === card) {
        // 菜单已显示，则隐藏
        hideContextMenu();
    } else {
        // 菜单未显示，则显示
        // 将点击坐标转换为合适的菜单位置
        const rect = this.getBoundingClientRect();
        const syntheticEvent = new PointerEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.right - 10,
            clientY: rect.bottom + 5
        });
        showContextMenu(syntheticEvent, card);
    }
}

// 处理卡片点击事件
function handleCardClick(e) {
    // 整理模式下点击、中键都不打开网站
    if (isReordering()) return;

    // 如果点击了菜单按钮或context菜单，不执行卡片点击
    if (e.target.closest('.context-menu') || e.target.closest('.card-menu-btn') || e.target.closest('.card-pin-btn')) return;

    // 点隐藏描述卡片的描述是显示/收起描述，不打开网站
    if (e.target.closest('.card-secret')) {
        if (e.button === 0) toggleSecretDescription(this);
        return;
    }

    // 如果按住Ctrl键点击，则编辑网站
    if (e.ctrlKey) {
        editWebsite(this);
        return;

    }

    // 模糊着的私密卡片点了不打开（中键也一样），悬停、单击都不会让它变清晰，免得误触；
    // 只有工具栏「显示全部」之后才能点开
    if (this.classList.contains('private-card') && !this.classList.contains('revealed')) {
        if (typeof showNotification === 'function') showNotification('先点「显示全部」再打开', 'info');
        return;
    }

    const url = this.querySelector('.card-url').textContent;
    // 检查URL是否已包含协议
    const fullUrl = url.includes('://') ? url : `http://${url}`;
    // 私密网站不记访问次数，免得本机 IndexedDB 里留下明文网址
    if (typeof recordVisit === 'function' && !this.classList.contains('private-card')) recordVisit(fullUrl);
    window.open(fullUrl, '_blank');
}

// 中键点击卡片：卡片不是链接，浏览器不会自己打开，这里按新标签页打开并计一次访问
function handleCardAuxClick(e) {
    if (e.button !== 1) return;
    if (e.target.closest('.card-menu-btn') || e.target.closest('.card-pin-btn')) return;
    e.preventDefault();
    handleCardClick.call(this, e);
}

// 文件上传功能
// 弹窗里的图标行：左边色块（#iconUploadArea）点击上传，整行可以拖入图片；右边一行说明随状态变化
function setupFileUpload() {
    const iconTile = document.getElementById('iconUploadArea');
    const iconRow = document.getElementById('iconRow');
    const fileInput = document.getElementById('iconFile');

    // 自动填写用 .value 赋值不会触发 input，那条路径在 fillFormWithAIData 里自己刷新
    document.getElementById('websiteName').addEventListener('input', refreshLetterIconPreview);
    document.getElementById('websiteUrl').addEventListener('input', refreshLetterIconPreview);

    // 「改用首字图标」按钮是渲染出来的，用事件委托
    iconRow.addEventListener('click', (e) => {
        if (e.target.closest('.delete-image-btn')) deleteUploadedImage();
    });

    iconTile.addEventListener('click', () => {
        if (iconTile.dataset.state !== 'uploading') fileInput.click();
    });

    iconRow.addEventListener('dragover', (e) => {
        e.preventDefault();
        iconRow.classList.add('dragover');
    });

    iconRow.addEventListener('dragleave', () => {
        iconRow.classList.remove('dragover');
    });

    iconRow.addEventListener('drop', (e) => {
        e.preventDefault();
        iconRow.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
        // 解决重复选择同一文件不触发change事件的问题
        e.target.value = null;
    });
}

// 图标行的三种状态：letter（首字图标）、uploading、image（已有图片）
function setIconRowState(state, tileHTML, hintHTML) {
    const tile = document.getElementById('iconUploadArea');
    tile.dataset.state = state;
    tile.innerHTML = tileHTML;
    document.getElementById('iconHint').innerHTML = hintHTML;
}

// 渲染「已有图片」状态
function renderUploadedIconPreview(imageSrc) {
    setIconRowState('image',
        `<img src="${escapeHtml(imageSrc)}" alt="网站图标">`,
        '已上传图床 · 点击图标更换 · <button type="button" class="icon-link delete-image-btn">改用首字图标</button>');
}

// 渲染「上传中」状态
function renderIconUploadingState() {
    setIconRowState('uploading', '<i class="fas fa-spinner fa-spin"></i>', '正在上传图标…');
}

// 把表单的图标设置为一张图片。imageSrc 是图床 URL（降级时才是 base64）
function applyUploadedIcon(imageSrc) {
    document.getElementById('websiteIcon').dataset.imageData = imageSrc;
    renderUploadedIconPreview(imageSrc);
}

async function handleFileUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('请上传图片文件');
        return;
    }

    renderIconUploadingState();

    try {
        // 压缩成 WebP 后上传图床，imageData 只存 URL。
        // 图床不可用时 uploadIconFile 内部会降级成 base64 并给出提示。
        const { url } = await uploadIconFile(file);
        applyUploadedIcon(url);
    } catch (error) {
        console.error('图标上传失败:', error);
        showNotification('图标上传失败: ' + error.message, 'error');
        resetIconUpload();
    }
}

// 删除已上传的图片
function deleteUploadedImage() {
    document.getElementById('websiteIcon').dataset.imageData = '';
    resetIconUpload();
}

// 没有图片时显示首字图标，保存后卡片上就是这个样子
function resetIconUpload() {
    setIconRowState('letter', '', '点击或拖入图片替换图标');
    refreshLetterIconPreview();
}

// 标题、网址输入时同步刷新首字预览。都没填时显示上传图标
function refreshLetterIconPreview() {
    const tile = document.getElementById('iconUploadArea');
    if (tile.dataset.state !== 'letter') return;
    const title = document.getElementById('websiteName').value;
    const url = document.getElementById('websiteUrl').value;
    tile.innerHTML = title.trim() || url.trim()
        ? letterIconHTML(title, url)
        : '<i class="fas fa-image"></i>';
}

// 页面初始化
document.addEventListener('DOMContentLoaded', async function () {
    // 等待数据加载完成
    if (window.dataLoaded) {
        await window.dataLoaded;
    }
    // 读取localStorage主题
    const savedTheme = localStorage.getItem('theme');
    const html = document.documentElement;
    if (savedTheme === 'dark' || savedTheme === 'light') {
        html.setAttribute('data-theme', savedTheme);
    }
    // 没手动选过时跟随系统（首屏已由 index.html 内联脚本设好），系统切换时同步
    syncThemeControls();
    if (!savedTheme && window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (localStorage.getItem('theme')) return;
            html.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            syncThemeControls();
        });
    }

    // 初始化分类列表模式
    loadCategoriesMode();

    // 更新分类下拉菜单
    updateCategoryDropdown();

    // 加载数据并创建卡片
    loadWebsitesFromData();

    // 访问统计从 IndexedDB 异步读取，读完再渲染一次访问最多
    if (window.visitStatsLoaded) {
        window.visitStatsLoaded.then(renderFrequentCategory);
    }

    // 设置文件上传
    setupFileUpload();

    // 初始化AI识别功能
    setupAIDetection();

    // 点击其他地方隐藏右键菜单
    document.addEventListener('click', hideContextMenu);

    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // 获取所有活动的模态框
            const activeModals = document.querySelectorAll('.modal-overlay.active');

            activeModals.forEach(modal => {
                const modalId = modal.id;
                if (modal.hasAttribute('data-required')) return;

                // 根据模态框ID判断使用哪个关闭函数
                if (modalId === 'deleteCategoryModal') {
                    // 使用分类编辑相关的关闭函数
                    if (typeof closeCategoryModal === 'function') {
                        closeCategoryModal(modalId);
                    }
                } else {
                    // 使用网站编辑相关的关闭函数
                    closeModal(modalId);
                }
            });

            // 隐藏右键菜单和目录
            hideContextMenu();
            closeCategorySheet();
        }

        // 按 / 聚焦搜索框（正在输入时不拦截）
        if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const target = e.target;
            const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
            const searchBox = document.querySelector('.search-box');
            if (!typing && searchBox && !document.querySelector('.modal-overlay.active')) {
                e.preventDefault();
                openSearchBar();
                searchBox.select();
            }
        }
    });

    // 渲染移动端分类菜单（按钮在搜索栏右侧）
    renderCategorySheet();

    // 当数据变更时（新增/删除/导入等），同步更新移动端目录
    document.addEventListener('dataChanged', renderCategorySheet);

    // 添加滚动监听，更新当前分类状态
    setupScrollSpy();

    // 添加滚动监听，控制浮动按钮位置
    setupFloatingButtonPosition();

    // 数据和「自动填写」都就绪后再处理 ?add=
    handleAddUrlParam();
});

// 滚动监听功能
function setupScrollSpy() {

    // 防抖函数，避免频繁触发
    function debounce(func, wait) {
        let timeout;
        return function () {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // 获取所有分类区域的位置信息
    function getCategorySections() {
        const sections = document.querySelectorAll('#tab-all .category-section');
        const sectionPositions = [];

        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            const offsetTop = rect.top + window.scrollY;
            sectionPositions.push({
                id: section.id,
                offsetTop: offsetTop,
                height: rect.height
            });
        });

        return sectionPositions;
    }

    // 更新当前分类的高亮状态
    const updateActiveCategory = debounce(function () {
        // 侧边栏只在「全部网站」tab 下显示
        if (document.documentElement.getAttribute('data-tab') !== 'all') return;

        // 扣掉吸顶的头部和 tab 栏，再留一点余量提前激活
        const header = document.querySelector('.header');
        const viewTabs = document.querySelector('.view-tabs');
        const stickyHeight = (header ? header.offsetHeight : 0) + (viewTabs ? viewTabs.offsetHeight : 0);
        const scrollPosition = window.scrollY + stickyHeight + 20;
        const sectionPositions = getCategorySections();

        // 找到当前滚动位置对应的分类
        let currentCategoryId = null;
        for (let i = 0; i < sectionPositions.length; i++) {
            const section = sectionPositions[i];
            const nextSection = sectionPositions[i + 1];

            // 如果处于当前区域或者是最后一个区域
            if (
                (scrollPosition >= section.offsetTop &&
                    (!nextSection || scrollPosition < nextSection.offsetTop)) ||
                (i === sectionPositions.length - 1 && scrollPosition >= section.offsetTop)
            ) {
                currentCategoryId = section.id;
                break;
            }
        }

        // 如果找到匹配的分类，更新侧边栏状态
        if (currentCategoryId) {
            const categoryItems = document.querySelectorAll('.category-item');
            categoryItems.forEach(item => item.classList.remove('active'));

            const activeItem = document.querySelector(`.category-item[data-category="${currentCategoryId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }

            // 打印调试信息
            // console.log('当前分类:', currentCategoryId);
        }
    }, 50);

    // 添加滚动事件监听
    window.addEventListener('scroll', updateActiveCategory);

    // 初始调用一次，设置初始状态
    updateActiveCategory();
}

// 小屏的分类目录：「全部」tab 已激活时再点一次，从底部弹出
function renderCategorySheet() {
    let sheet = document.getElementById('categorySheet');
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'categorySheet';
        sheet.className = 'category-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-label', '目录');
        sheet.innerHTML = '<div class="category-sheet-title">目录</div><div class="category-sheet-list"></div>';
        document.body.appendChild(sheet);

        // 点遮罩（弹层以外的地方）关闭
        document.addEventListener('click', (e) => {
            if (sheet.classList.contains('active') && !sheet.contains(e.target)) {
                closeCategorySheet();
            }
        });
    }

    const list = sheet.querySelector('.category-sheet-list');
    list.innerHTML = '';
    if (!Array.isArray(window.categories)) return;

    [...window.categories].sort((a, b) => a.order - b.order).forEach(cat => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'mobile-category-item';
        item.dataset.category = cat.id;
        const name = document.createElement('span');
        name.textContent = cat.name;
        item.appendChild(name);
        item.onclick = () => {
            closeCategorySheet();
            showCategory(cat.id);
        };
        list.appendChild(item);
    });
}

function openCategorySheet() {
    const sheet = document.getElementById('categorySheet');
    if (!sheet) return;
    sheet.classList.add('active');
    // 当前正在看的分类（侧边栏的滚动监听在小屏也照常更新）高亮并滚到可见处
    const current = document.querySelector('.category-item.active')?.dataset.category;
    sheet.querySelectorAll('.mobile-category-item').forEach(item => {
        item.classList.toggle('active', item.dataset.category === current);
    });
    sheet.querySelector('.mobile-category-item.active')?.scrollIntoView({ block: 'nearest' });
}

function closeCategorySheet() {
    document.getElementById('categorySheet')?.classList.remove('active');
}

// 更新分类下拉菜单
function updateCategoryDropdown() {
    const categorySelect = document.getElementById('websiteCategory');
    if (!categorySelect) return;

    // 保存当前选中的值
    const selectedValue = categorySelect.value;

    // 清空除了第一个选项外的所有选项
    while (categorySelect.options.length > 1) {
        categorySelect.remove(1);
    }

    // 添加所有分类，排除"置顶"分类和"最近添加"分类
    window.categories.forEach(category => {
        // 跳过置顶分类和最近添加分类
        if (category.id === 'pinned' || category.id === 'recent') return;

        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
    });

    // 恢复选中值，如果之前选的是置顶分类或最近添加分类，则默认选择第一个可用分类
    if (selectedValue && selectedValue !== 'pinned' && selectedValue !== 'recent') {
        categorySelect.value = selectedValue;
    } else if (selectedValue === 'pinned' || selectedValue === 'recent') {
        // 如果之前选的是置顶分类或最近添加分类，则选择第一个可用分类
        if (categorySelect.options.length > 1) {
            categorySelect.selectedIndex = 1;
        }
    }
}

// 更新搜索功能
function clearSearchSelection() {
    document.querySelectorAll('#search-cards .keyboard-selected').forEach(card => {
        card.classList.remove('keyboard-selected');
    });
}

const searchBox = document.querySelector('.search-box');
let searchComposing = false;
searchBox.addEventListener('compositionstart', () => { searchComposing = true; });
searchBox.addEventListener('compositionend', () => { searchComposing = false; });
searchBox.addEventListener('input', function () {
    // 搜索始终针对全部网站：有关键词时临时显示搜索结果面板，清空后回到原 tab
    const searching = searchBox.value.trim() !== '';
    const wasSearching = document.body.classList.contains('searching');
    document.body.classList.toggle('searching', searching);
    if (wasSearching !== searching) {
        window.scrollTo({ top: 0 });
    }
    renderSearchResults();
});

// 小屏搜索栏默认收起，点头部放大镜展开；桌面端搜索栏常驻，这里的 class 不影响它
const searchToggle = document.getElementById('searchToggle');

function openSearchBar() {
    document.documentElement.classList.add('search-open');
    searchToggle.setAttribute('aria-expanded', 'true');
    searchBox.focus();
}

function closeSearchBar() {
    document.documentElement.classList.remove('search-open');
    searchToggle.setAttribute('aria-expanded', 'false');
    if (searchBox.value) {
        searchBox.value = '';
        searchBox.dispatchEvent(new Event('input'));
    }
    searchBox.blur();
}

// 按下时阻止默认行为，避免搜索框先失焦触发自动收起、紧接着的 click 又把它打开
searchToggle.addEventListener('mousedown', e => e.preventDefault());
searchToggle.addEventListener('click', () => {
    if (document.documentElement.classList.contains('search-open')) {
        closeSearchBar();
    } else {
        openSearchBar();
    }
});

// 没输入内容就离开搜索框时自动收起；有关键词时保留，方便滚动浏览结果
searchBox.addEventListener('blur', () => {
    clearSearchSelection();
    if (!searchBox.value) closeSearchBar();
});

searchBox.addEventListener('keydown', e => {
    // keyCode 229 兼容输入法确认时 isComposing 已提前变为 false 的浏览器。
    if (searchComposing || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
        closeSearchBar();
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (!document.body.classList.contains('searching') ||
        document.querySelector('.modal-overlay.active, .context-menu.active')) return;
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;

    const cards = [...document.querySelectorAll('#search-cards .website-card')];
    if (!cards.length) return;
    const index = cards.findIndex(card => card.classList.contains('keyboard-selected'));
    if (e.key === 'Enter') {
        if (index < 0) return;
        e.preventDefault();
        // 复用鼠标打开逻辑，包括新标签页打开与访问统计；长按 Enter 不重复打开。
        if (!e.repeat) cards[index].click();
        return;
    }

    e.preventDefault();
    const next = index < 0
        ? (e.key === 'ArrowDown' ? 0 : cards.length - 1)
        : Math.max(0, Math.min(cards.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)));
    clearSearchSelection();
    cards[next].classList.add('keyboard-selected');
    cards[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
});


// 控制浮动按钮位置
function setupFloatingButtonPosition() {
    const floatingBtn = document.querySelector('.floating-btn');
    const footer = document.querySelector('.footer');

    if (!floatingBtn || !footer) return;

    // 检测footer是否可见
    function checkFooterVisibility() {
        const footerRect = footer.getBoundingClientRect();
        const windowHeight = window.innerHeight;

        // 如果footer进入视口
        if (footerRect.top < windowHeight) {
            floatingBtn.classList.add('footer-visible');
        } else {
            floatingBtn.classList.remove('footer-visible');
        }
    }

    // 初始检查
    checkFooterVisibility();

    // 添加滚动监听
    window.addEventListener('scroll', checkFooterVisibility);

    // 添加窗口大小变化监听
    window.addEventListener('resize', checkFooterVisibility);
}

// AI网站识别功能
// 每个分类取几个已收录站点当样例。
// 样例太少会覆盖不到分类内部的子簇（比如 AIGC 里既有对话类产品也有 AI 仓库），
// 模型就会按泛泛的主题去判，实测 5 个不够。
const AI_SAMPLES_PER_CATEGORY = 12;

// 从某个分类里挑几个最有代表性的站点，只取标题和域名
// 不发完整 URL 和描述：既是控制 prompt 体积，也是少外发一点信息
function collectCategorySamples(categoryId) {
    const sites = (window.websites && window.websites[categoryId]) || [];

    return [...sites]
        // 按权重倒序，权重高的是用户最常用的，最能代表这个分类
        .sort((a, b) => (b.weight || 100) - (a.weight || 100))
        .slice(0, AI_SAMPLES_PER_CATEGORY)
        .map(site => {
            let host = '';
            try {
                host = new URL(site.url).host;
            } catch (e) {
                // URL 存坏了就只用标题
            }
            const title = (site.title || '').trim();
            if (!title && !host) return '';
            return host ? `${title} (${host})` : title;
        })
        .filter(Boolean);
}

function setupAIDetection() {
    const urlInput = document.getElementById('websiteUrl');
    const aiDetectBtn = document.getElementById('aiDetectBtn');

    // 监听URL输入变化，启用/禁用AI识别按钮
    urlInput.addEventListener('input', function () {
        const url = this.value.trim();
        const isValidUrl = url.length > 0 && (url.startsWith('http://') || url.startsWith('https://'));
        aiDetectBtn.disabled = !isValidUrl;
    });

    // 初始检查URL输入框是否已有值（用于编辑模式）
    if (urlInput && aiDetectBtn) {
        const url = urlInput.value.trim();
        const isValidUrl = url.length > 0 && (url.startsWith('http://') || url.startsWith('https://'));
        aiDetectBtn.disabled = !isValidUrl;
    }

    // AI识别按钮点击事件
    aiDetectBtn.addEventListener('click', async function () {
        const url = urlInput.value.trim();
        if (!url) return;

        // 名称、描述、分类、图片都填好了就没什么可补的，不白跑一次抓取和 AI
        if (!Object.values(getAIFillNeeds()).some(Boolean)) {
            showNotification('名称、描述、分类和图片都已填写，AI 识别只会补全空着的项', 'info');
            return;
        }

        // 显示加载状态
        aiDetectBtn.disabled = true;
        aiDetectBtn.classList.add('loading');
        aiDetectBtn.innerHTML = '<span class="ai-loading"></span> 识别中...';

        try {
            // 获取所有可用分类，并带上每个分类下已收录的站点作为样例。
            // 「稍后阅读」「工作相关」这类个人分类，光看网页内容判断不出来，
            // 样例是模型唯一能参考的依据。
            const categorySelect = document.getElementById('websiteCategory');
            const categories = [];
            for (let i = 0; i < categorySelect.options.length; i++) {
                if (categorySelect.options[i].value &&
                    categorySelect.options[i].value !== 'pinned' &&
                    categorySelect.options[i].value !== 'recent' &&
                    categorySelect.options[i].value !== 'uncategorized'
                ) {
                    const categoryId = categorySelect.options[i].value;
                    categories.push({
                        id: categoryId,
                        name: categorySelect.options[i].textContent,
                        samples: collectCategorySamples(categoryId)
                    });
                }
            }
            console.log('网站分类:', categories);

            // 发送AJAX请求到后端API
            const response = await fetch('/api/analyze-website', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url,
                    categories // 发送所有可用分类
                })
            });

            if (!response.ok) {
                // 服务端会在 error 字段里写明原因（抓取被拦截、限流等），拿不到再用通用提示
                const errorData = await response.json().catch(() => null);
                // 抓取被目标站拦截（如 Cloudflare 质询）时不算失败，按同域名历史预填能填的字段
                if (errorData?.fetchFailed) {
                    fillFormFromDomainHistory(url, errorData.error);
                    return;
                }
                throw new Error(errorData?.error || `网站分析请求失败（HTTP ${response.status}）`);
            }

            const data = await response.json();
            console.log('AI识别结果:', data);

            // 填充表单
            fillFormWithAIData(data);
        } catch (error) {
            console.error('AI识别错误:', error);
            alert('网站识别失败: ' + error.message);
        } finally {
            // 恢复按钮状态
            aiDetectBtn.disabled = false;
            aiDetectBtn.classList.remove('loading');
            aiDetectBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> 自动填写';
        }
    });
}

function siteHostKey(value) {
    try {
        return new URL(value).host.toLowerCase().replace(/^www\./, '');
    } catch (e) {
        return '';
    }
}

// AI 识别只补用户没填的项：名称、描述是空的，分类是「未分类」或没选，还没有图片。
// 在拿到结果时再判断一次，识别期间用户手动填的也不覆盖
function getAIFillNeeds() {
    const categoryValue = document.getElementById('websiteCategory').value;
    return {
        title: !document.getElementById('websiteName').value.trim(),
        description: !document.getElementById('websiteDescription').value.trim(),
        category: !categoryValue || categoryValue === 'uncategorized',
        icon: !document.getElementById('websiteIcon').dataset.imageData
    };
}

// 抓不到网页时的兜底：用已收录的同域名网址预填分类和图标，标题和描述留给用户填。
// 分类规则与服务端 categoryByDomain() 一致（同 host 最多的分类），改一边要同步另一边
function fillFormFromDomainHistory(url, reason) {
    const host = siteHostKey(url);
    const categorySelect = document.getElementById('websiteCategory');

    let bestIndex = -1;
    let bestSites = [];
    for (let i = 0; i < categorySelect.options.length; i++) {
        const categoryId = categorySelect.options[i].value;
        if (!categoryId || ['pinned', 'recent', 'uncategorized'].includes(categoryId)) continue;

        const sites = ((window.websites && window.websites[categoryId]) || [])
            .filter(site => host && siteHostKey(site.url) === host);
        if (sites.length > bestSites.length) {
            bestIndex = i;
            bestSites = sites;
        }
    }

    const needs = getAIFillNeeds();
    const filled = [];
    if (bestIndex >= 0 && needs.category) {
        categorySelect.selectedIndex = bestIndex;
        categorySelect.options[bestIndex].setAttribute('selected', 'selected');
        filled.push('分类');
    }

    // 图标取同分类里第一个有自定义图片的，没有就留给首字图标
    if (bestIndex >= 0 && needs.icon) {
        const withImage = bestSites.find(site => site.imageData);
        if (withImage) {
            applyUploadedIcon(withImage.imageData);
            filled.push('图标');
        }
    }

    if (filled.length === 0) {
        showNotification(`${reason}，请手动填写`, 'info');
        return;
    }
    showNotification(`${reason}，已按已收录的 ${host} 网址预填${filled.join('和')}`, 'info');
}

// 根据AI识别结果填充表单
function fillFormWithAIData(data) {
    // 用户已经填了的不覆盖
    const needs = getAIFillNeeds();

    // 填充网站名称
    if (data.title && needs.title) {
        document.getElementById('websiteName').value = data.title;
        refreshLetterIconPreview();
    }

    // 填充描述
    if (data.description && needs.description) {
        document.getElementById('websiteDescription').value = data.description;
    }

    // 选择合适的分类
    // 服务端保证返回的要么是候选列表里的合法分类 id，要么是空串，
    // 所以这里只需要一次精确匹配，不用再做模糊兜底
    const categorySelect = document.getElementById('websiteCategory');
    if (!needs.category) {
        // 用户已经选了分类，不动
    } else if (data.category) {
        const matched = Array.from(categorySelect.options)
            .findIndex(option => option.value === data.category);

        if (matched >= 0) {
            categorySelect.selectedIndex = matched;
            categorySelect.options[matched].setAttribute('selected', 'selected');
        } else {
            console.warn('服务端返回的分类不在下拉列表中:', data.category);
        }
    } else {
        // 模型拿不准时不自作主张：保持分类框不动，让用户自己选。
        // 错分比不分更烦，而且静默错分用户未必会发现。
        showNotification('AI 没能判断分类，请手动选择', 'info');
    }

    // 设置图标：已经有图片（手动上传或原来就有）就不重新抓取上传。
    // 只认图片 URL，抓不到或转存失败时用首字图标兜底
    if (data.icon && needs.icon) {
        if (data.icon.startsWith('http')) {
            // 由 Worker 直接抓取并转存到图床，图片不经过浏览器，imageData 只存 URL
            renderIconUploadingState();
            uploadIconFromUrl(data.icon)
                .then(url => {
                    applyUploadedIcon(url);
                })
                .catch(error => {
                    console.error('无法转存网站图标:', error);
                    document.getElementById('websiteIcon').dataset.imageData = '';
                    resetIconUpload();
                });
        }
    }
}
