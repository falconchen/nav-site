// 图标选择器模块

// 常用的Font Awesome图标集合
// 图标集合。名字不是凭印象写的，是从 CDN 上 Font Awesome 6.4.0 的
// all.min.css / brands.min.css 里抽出真实存在的图标名再按主题筛的，
// 避免写到 Pro 专有或改过名的图标（那样只会渲染成空白）。
window.iconSets = {
    regular: [
        'fas fa-globe', 'fas fa-home', 'fas fa-user', 'fas fa-users', 'fas fa-star',
        'fas fa-heart', 'fas fa-bookmark', 'fas fa-book', 'fas fa-book-open', 'fas fa-folder',
        'fas fa-folder-open', 'fas fa-file', 'fas fa-file-lines', 'fas fa-file-pdf', 'fas fa-file-code',
        'fas fa-image', 'fas fa-images', 'fas fa-video', 'fas fa-music', 'fas fa-headphones',
        'fas fa-podcast', 'fas fa-search', 'fas fa-bell', 'fas fa-calendar', 'fas fa-calendar-days',
        'fas fa-clock', 'fas fa-hourglass', 'fas fa-compass', 'fas fa-gear', 'fas fa-sliders',
        'fas fa-envelope', 'fas fa-inbox', 'fas fa-paper-plane', 'fas fa-link', 'fas fa-paperclip',
        'fas fa-map', 'fas fa-map-location-dot', 'fas fa-location-dot', 'fas fa-phone', 'fas fa-comment',
        'fas fa-comments', 'fas fa-message', 'fas fa-quote-left', 'fas fa-shopping-cart', 'fas fa-shopping-bag',
        'fas fa-shopping-basket', 'fas fa-store', 'fas fa-tag', 'fas fa-tags', 'fas fa-ticket',
        'fas fa-receipt', 'fas fa-trophy', 'fas fa-medal', 'fas fa-award', 'fas fa-crown',
        'fas fa-gift', 'fas fa-fire', 'fas fa-bolt', 'fas fa-lightbulb', 'fas fa-rocket',
        'fas fa-seedling', 'fas fa-camera', 'fas fa-newspaper', 'fas fa-rss', 'fas fa-wifi',
        'fas fa-hashtag', 'fas fa-percent', 'fas fa-coins', 'fas fa-credit-card', 'fas fa-money-bill',
        'fas fa-wallet', 'fas fa-piggy-bank', 'fas fa-chart-line', 'fas fa-chart-bar', 'fas fa-chart-pie',
        'fas fa-chart-area', 'fas fa-chart-simple', 'fas fa-truck', 'fas fa-box', 'fas fa-boxes-stacked',
        'fas fa-dolly', 'fas fa-warehouse', 'fas fa-plane', 'fas fa-train', 'fas fa-car',
        'fas fa-bicycle', 'fas fa-ship', 'fas fa-utensils', 'fas fa-mug-hot', 'fas fa-burger',
        'fas fa-pizza-slice', 'fas fa-cake-candles', 'fas fa-wine-glass', 'fas fa-heart-pulse', 'fas fa-hospital',
        'fas fa-pills', 'fas fa-stethoscope', 'fas fa-dumbbell', 'fas fa-spa', 'fas fa-leaf',
        'fas fa-tree', 'fas fa-graduation-cap', 'fas fa-school', 'fas fa-pen', 'fas fa-pencil',
        'fas fa-highlighter', 'fas fa-eraser', 'fas fa-ruler', 'fas fa-palette', 'fas fa-sun',
        'fas fa-moon', 'fas fa-cloud', 'fas fa-cloud-sun', 'fas fa-umbrella', 'fas fa-snowflake',
        'fas fa-mountain', 'fas fa-water', 'fas fa-thumbs-up', 'fas fa-thumbs-down', 'fas fa-face-smile',
        'fas fa-eye', 'fas fa-eye-slash', 'fas fa-flag', 'fas fa-bullhorn', 'fas fa-list',
        'fas fa-list-check', 'fas fa-table', 'fas fa-filter', 'fas fa-sort', 'fas fa-arrow-up-right-from-square',
        'fas fa-circle-info', 'fas fa-circle-question', 'fas fa-circle-check', 'fas fa-circle-xmark', 'fas fa-triangle-exclamation',
        'fas fa-plus', 'fas fa-minus', 'fas fa-check', 'fas fa-xmark', 'fas fa-rotate',
        'fas fa-arrows-rotate', 'fas fa-download', 'fas fa-upload', 'fas fa-share-nodes', 'fas fa-language',
        'fas fa-clipboard', 'fas fa-building', 'fas fa-city', 'fas fa-id-badge', 'fas fa-briefcase'
    ],
    solid: [
        'fas fa-tools', 'fas fa-wrench', 'fas fa-hammer', 'fas fa-toolbox', 'fas fa-gears',
        'fas fa-microchip', 'fas fa-memory', 'fas fa-laptop', 'fas fa-laptop-code', 'fas fa-desktop',
        'fas fa-tablet', 'fas fa-mobile-screen', 'fas fa-display', 'fas fa-keyboard', 'fas fa-mouse',
        'fas fa-server', 'fas fa-database', 'fas fa-hard-drive', 'fas fa-network-wired', 'fas fa-sitemap',
        'fas fa-diagram-project', 'fas fa-code', 'fas fa-terminal', 'fas fa-bug', 'fas fa-code-branch',
        'fas fa-code-commit', 'fas fa-code-merge', 'fas fa-code-pull-request', 'fas fa-cloud-arrow-up', 'fas fa-cloud-arrow-down',
        'fas fa-cloud-bolt', 'fas fa-lock', 'fas fa-lock-open', 'fas fa-unlock', 'fas fa-key',
        'fas fa-shield', 'fas fa-shield-halved', 'fas fa-fingerprint', 'fas fa-user-shield', 'fas fa-user-lock',
        'fas fa-id-card', 'fas fa-address-card', 'fas fa-passport', 'fas fa-certificate', 'fas fa-stamp',
        'fas fa-signature', 'fas fa-robot', 'fas fa-brain', 'fas fa-microscope', 'fas fa-flask',
        'fas fa-atom', 'fas fa-infinity', 'fas fa-wand-magic-sparkles', 'fas fa-copy', 'fas fa-paste',
        'fas fa-scissors', 'fas fa-floppy-disk', 'fas fa-folder-tree', 'fas fa-file-arrow-up', 'fas fa-file-arrow-down',
        'fas fa-file-import', 'fas fa-file-export', 'fas fa-file-zipper', 'fas fa-print', 'fas fa-qrcode',
        'fas fa-barcode', 'fas fa-play', 'fas fa-pause', 'fas fa-stop', 'fas fa-forward',
        'fas fa-backward', 'fas fa-volume-high', 'fas fa-volume-xmark', 'fas fa-film', 'fas fa-photo-video',
        'fas fa-clapperboard', 'fas fa-camera-retro', 'fas fa-microphone', 'fas fa-microphone-slash', 'fas fa-gamepad',
        'fas fa-dice', 'fas fa-puzzle-piece', 'fas fa-chess', 'fas fa-tv', 'fas fa-radio',
        'fas fa-paint-brush', 'fas fa-pen-nib', 'fas fa-brush', 'fas fa-droplet', 'fas fa-crop',
        'fas fa-swatchbook', 'fas fa-layer-group', 'fas fa-vector-square', 'fas fa-object-group', 'fas fa-shapes',
        'fas fa-wand-magic', 'fas fa-bars', 'fas fa-ellipsis', 'fas fa-gauge', 'fas fa-gauge-high',
        'fas fa-tachograph-digital', 'fas fa-toggle-on', 'fas fa-toggle-off', 'fas fa-power-off', 'fas fa-plug',
        'fas fa-battery-full', 'fas fa-satellite-dish', 'fas fa-tower-broadcast', 'fas fa-signal', 'fas fa-user-plus',
        'fas fa-user-minus', 'fas fa-user-check', 'fas fa-user-gear', 'fas fa-user-group', 'fas fa-people-group',
        'fas fa-right-to-bracket', 'fas fa-right-from-bracket', 'fas fa-arrows-left-right', 'fas fa-arrows-up-down'
    ],
    brands: [
        'fab fa-github', 'fab fa-gitlab', 'fab fa-bitbucket', 'fab fa-git-alt', 'fab fa-npm',
        'fab fa-node-js', 'fab fa-yarn', 'fab fa-docker', 'fab fa-python', 'fab fa-js',
        'fab fa-java', 'fab fa-php', 'fab fa-swift', 'fab fa-rust', 'fab fa-golang',
        'fab fa-html5', 'fab fa-css3-alt', 'fab fa-react', 'fab fa-vuejs', 'fab fa-angular',
        'fab fa-node', 'fab fa-bootstrap', 'fab fa-sass', 'fab fa-less', 'fab fa-figma',
        'fab fa-sketch', 'fab fa-dribbble', 'fab fa-behance', 'fab fa-codepen', 'fab fa-aws',
        'fab fa-google', 'fab fa-microsoft', 'fab fa-apple', 'fab fa-windows', 'fab fa-linux',
        'fab fa-ubuntu', 'fab fa-redhat', 'fab fa-centos', 'fab fa-fedora', 'fab fa-android',
        'fab fa-chrome', 'fab fa-firefox', 'fab fa-safari', 'fab fa-edge', 'fab fa-opera',
        'fab fa-facebook', 'fab fa-twitter', 'fab fa-instagram', 'fab fa-linkedin', 'fab fa-youtube',
        'fab fa-tiktok', 'fab fa-pinterest', 'fab fa-snapchat', 'fab fa-reddit', 'fab fa-discord',
        'fab fa-telegram', 'fab fa-whatsapp', 'fab fa-skype', 'fab fa-slack', 'fab fa-weixin',
        'fab fa-weibo', 'fab fa-qq', 'fab fa-mastodon', 'fab fa-twitch', 'fab fa-steam',
        'fab fa-playstation', 'fab fa-xbox', 'fab fa-spotify', 'fab fa-soundcloud', 'fab fa-vimeo',
        'fab fa-medium', 'fab fa-wordpress', 'fab fa-blogger', 'fab fa-tumblr', 'fab fa-stack-overflow',
        'fab fa-quora', 'fab fa-dropbox', 'fab fa-google-drive', 'fab fa-amazon', 'fab fa-ebay',
        'fab fa-shopify', 'fab fa-alipay', 'fab fa-paypal', 'fab fa-stripe', 'fab fa-cc-visa',
        'fab fa-cc-mastercard', 'fab fa-bitcoin', 'fab fa-jira', 'fab fa-trello', 'fab fa-confluence',
        'fab fa-jenkins', 'fab fa-atlassian', 'fab fa-markdown', 'fab fa-font-awesome', 'fab fa-cloudflare',
        'fab fa-digital-ocean', 'fab fa-app-store', 'fab fa-google-play'
    ]
};

window.currentIconCategory = 'regular';
let isCompactMode = false;
let iconSelectorDocumentListenerAttached = false;

// 统一的事件处理函数，用于打开/关闭图标选择器
function _handleIconSelectorToggle(e) {
    const iconSelectorDropdown = document.getElementById('iconSelectorDropdown');
    const iconSearch = document.getElementById('iconSearch');
    e.preventDefault();
    toggleIconDropdown(iconSelectorDropdown, iconSearch);
}

// 初始化图标选择器
function initIconSelector() {
    const iconSelectorBtn = document.getElementById('iconSelectorBtn');
    const iconSelectorDropdown = document.getElementById('iconSelectorDropdown');
    const iconGrid = document.getElementById('iconGrid');
    const iconSearch = document.getElementById('iconSearch');
    const iconCategoryTabs = document.getElementById('iconCategoryTabs');
    const iconInput = document.getElementById('websiteIcon');
    const iconPreview = document.getElementById('iconPreview');

    if (!iconSelectorBtn || !iconSelectorDropdown) return;

    // 检查是否在模态框内并设置紧凑模式
    isCompactMode = !!document.getElementById('websiteModal');

    // 给选择器容器添加紧凑模式类
    if (isCompactMode) {
        const container = document.querySelector('.icon-selector-container');
        if (container) {
            // container.classList.add('compact-mode');
        }
    }

    // 加载初始图标集
    renderIconGrid(window.iconSets.regular);

    // 移除旧的事件监听器以防止重复绑定
    iconSelectorBtn.removeEventListener('click', _handleIconSelectorToggle);
    if (iconInput) {
        iconInput.removeEventListener('click', _handleIconSelectorToggle);
    }

    // 切换下拉菜单显示/隐藏
    iconSelectorBtn.addEventListener('click', _handleIconSelectorToggle);

    // 点击输入框也打开下拉菜单
    if (iconInput) {
        iconInput.addEventListener('click', _handleIconSelectorToggle);
    }

    // 点击图标外部关闭下拉菜单
    if (!iconSelectorDocumentListenerAttached) {
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.icon-selector-container') && iconSelectorDropdown.classList.contains('active')) {
                iconSelectorDropdown.classList.remove('active');
            }
        });
        iconSelectorDocumentListenerAttached = true;
    }

    // 切换图标类别
    if (iconCategoryTabs) {
        iconCategoryTabs.addEventListener('click', function(e) {
            const tab = e.target.closest('.icon-category-tab');
            if (!tab) return;

            // 移除所有选项卡的活动状态
            const tabs = iconCategoryTabs.querySelectorAll('.icon-category-tab');
            tabs.forEach(t => t.classList.remove('active'));

            // 设置当前选项卡为活动状态
            tab.classList.add('active');

            // 获取选项卡的数据类别
            const category = tab.dataset.category;
            window.currentIconCategory = category;

            // 渲染对应类别的图标
            renderIconGrid(window.iconSets[category] || []);

            // 清空搜索框
            iconSearch.value = '';
        });
    }

    // 图标搜索功能
    if (iconSearch) {
        iconSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();

            // 如果没有搜索词，显示当前类别的所有图标
            if (!searchTerm) {
                renderIconGrid(window.iconSets[window.currentIconCategory] || []);
                return;
            }

            // 搜索所有类别的图标
            const results = [];

            // 首先搜索当前类别
            const currentIcons = window.iconSets[window.currentIconCategory] || [];
            currentIcons.forEach(icon => {
                if (icon.toLowerCase().includes(searchTerm) && !results.includes(icon)) {
                    results.push(icon);
                }
            });

            // 如果当前类别没有足够的结果，搜索其他类别
            if (results.length < 5) {
                Object.keys(window.iconSets).forEach(category => {
                    if (category === window.currentIconCategory) return;

                    window.iconSets[category].forEach(icon => {
                        if (icon.toLowerCase().includes(searchTerm) && !results.includes(icon)) {
                            results.push(icon);
                        }
                    });
                });
            }

            // 渲染搜索结果
            renderIconGrid(results);
        });
    }

    // 图标选择事件委托
    if (iconGrid) {
        iconGrid.addEventListener('click', function(e) {
            const iconItem = e.target.closest('.icon-item');
            if (!iconItem) return;

            const iconClass = iconItem.dataset.icon;

            // 更新输入框和预览
            iconInput.value = iconClass;
            iconPreview.className = iconClass;

            // 关闭下拉菜单
            iconSelectorDropdown.classList.remove('active');

            // 触发change事件，便于其他脚本可能需要监听
            const event = new Event('change', { bubbles: true });
            iconInput.dispatchEvent(event);
        });
    }

    // 初始化时根据当前值设置预览
    if (iconInput && iconInput.value) {
        iconPreview.className = iconInput.value;
    }
}

// 切换图标下拉菜单的显示/隐藏
function toggleIconDropdown(iconSelectorDropdown, iconSearch) {
    iconSelectorDropdown.classList.toggle('active');

    // 检查下拉菜单是否会超出视窗底部
    if (iconSelectorDropdown.classList.contains('active')) {
        // 获取下拉菜单在视窗中的位置
        const dropdownRect = iconSelectorDropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // 如果下拉菜单底部超出视窗底部
        if (dropdownRect.bottom > viewportHeight) {
            // 计算需要向上移动的距离
            const moveUpDistance = Math.min(
                dropdownRect.bottom - viewportHeight + 10, // 加10px的缓冲
                dropdownRect.height - 50 // 不要将下拉菜单完全移出视图顶部
            );

            // 应用样式调整
            if (moveUpDistance > 0) {
                iconSelectorDropdown.style.top = 'auto';
                iconSelectorDropdown.style.bottom = '100%';
                iconSelectorDropdown.style.marginTop = '0';
                iconSelectorDropdown.style.marginBottom = '0.25rem';
            }
        } else {
            // 重置样式
            iconSelectorDropdown.style.top = '100%';
            iconSelectorDropdown.style.bottom = 'auto';
            iconSelectorDropdown.style.marginTop = '0.25rem';
            iconSelectorDropdown.style.marginBottom = '0';
        }

        // 如果显示了下拉菜单，聚焦搜索框
        setTimeout(() => {
            iconSearch.focus();
        }, 100);
    }
}

// 渲染图标网格
function renderIconGrid(icons) {
    const iconGrid = document.getElementById('iconGrid');
    if (!iconGrid) return;

    // 平铺输出，不再手动切行：每行放几个交给 .icon-grid 的
    // grid-template-columns: repeat(auto-fill, ...) 按实际宽度决定。
    // 以前写死 13 个一行，和容器真正放得下的个数对不上，每行会再折一次，
    // 行尾就剩一个图标独占一行。
    let html = icons.map(icon => `
        <div class="icon-item" data-icon="${icon}" title="${icon}">
            <i class="${icon}"></i>
        </div>
    `).join('');

    if (icons.length === 0) {
        html = '<div style="text-align: center; padding: 0.5rem; color: var(--text-muted);">没有找到匹配的图标</div>';
    }

    iconGrid.innerHTML = html;

    // 高亮当前选中的图标
    const selectedIcon = document.getElementById('websiteIcon').value;
    if (selectedIcon) {
        const selectedItem = iconGrid.querySelector(`.icon-item[data-icon="${selectedIcon}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
    }
}

// 编辑网站时更新图标预览
function updateIconPreview(iconClass) {
    const iconPreview = document.getElementById('iconPreview');
    if (iconPreview && iconClass) {
        iconPreview.className = iconClass;
    }
}

// 暴露初始化函数，供其他文件使用
window.initIconSelector = initIconSelector;
window.updateIconPreview = updateIconPreview;
