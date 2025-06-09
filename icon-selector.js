// 图标选择器模块

// 常用的Font Awesome图标集合
const iconSets = {
    regular: [
        'fas fa-globe', 'fas fa-home', 'fas fa-user', 'fas fa-star', 'fas fa-heart',
        'fas fa-book', 'fas fa-folder', 'fas fa-file', 'fas fa-image', 'fas fa-video',
        'fas fa-music', 'fas fa-search', 'fas fa-bell', 'fas fa-calendar', 'fas fa-clock',
        'fas fa-cog', 'fas fa-envelope', 'fas fa-link', 'fas fa-map-marker-alt', 'fas fa-phone',
        'fas fa-comment', 'fas fa-shopping-cart', 'fas fa-bookmark', 'fas fa-trophy', 'fas fa-gift', 'fas fa-lightbulb', 'fas fa-camera', 'fas fa-newspaper', 'fas fa-thumbs-up', 'fas fa-thumbs-down',
        'fas fa-comments', 'fas fa-chart-line', 'fas fa-chart-bar', 'fas fa-chart-pie', 'fas fa-map',
        'fas fa-rss', 'fas fa-wifi', 'fas fa-hashtag', 'fas fa-percentage', 'fas fa-coins',
        'fas fa-credit-card', 'fas fa-truck', 'fas fa-shipping-fast', 'fas fa-dolly', 'fas fa-box',
        'fas fa-ticket-alt', 'fas fa-tag', 'fas fa-tags', 'fas fa-store', 'fas fa-shopping-bag'
    ],
    solid: [
        'fas fa-tools', 'fas fa-laptop', 'fas fa-tablet-alt', 'fas fa-mobile-alt', 'fas fa-desktop',
        'fas fa-server', 'fas fa-database', 'fas fa-code', 'fas fa-keyboard', 'fas fa-terminal',
        'fas fa-cloud', 'fas fa-cloud-upload-alt', 'fas fa-cloud-download-alt', 'fas fa-paper-plane',
        'fas fa-copy', 'fas fa-save', 'fas fa-cut', 'fas fa-paste', 'fas fa-edit',
        'fas fa-lock', 'fas fa-unlock', 'fas fa-key', 'fas fa-shield-alt', 'fas fa-check','fas fa-undo', 'fas fa-redo', 'fas fa-share', 'fas fa-reply', 'fas fa-retweet',
        'fas fa-chart-area', 'fas fa-palette', 'fas fa-paint-brush', 'fas fa-gamepad', 'fas fa-tv', 
        'fas fa-headphones', 'fas fa-microphone', 'fas fa-camera-retro', 'fas fa-film', 'fas fa-photo-video',
        'fas fa-play', 'fas fa-pause', 'fas fa-stop', 'fas fa-volume-up', 'fas fa-volume-mute',
        'fas fa-users', 'fas fa-user-plus', 'fas fa-user-minus', 'fas fa-user-check', 'fas fa-user-shield'
    ],
    brands: [
        'fab fa-facebook', 'fab fa-twitter', 'fab fa-instagram', 'fab fa-linkedin', 'fab fa-youtube',
        'fab fa-github', 'fab fa-gitlab', 'fab fa-bitbucket', 'fab fa-stack-overflow', 'fab fa-medium',
        'fab fa-wordpress', 'fab fa-joomla', 'fab fa-shopify', 'fab fa-amazon', 'fab fa-ebay',
        'fab fa-google', 'fab fa-apple', 'fab fa-microsoft', 'fab fa-android', 'fab fa-windows',
        'fab fa-wechat', 'fab fa-weibo', 'fab fa-qq', 'fab fa-alipay', 'fab fa-tiktok', 'fab fa-paypal', 'fab fa-stripe', 'fab fa-cc-visa', 'fab fa-cc-mastercard', 'fab fa-bitcoin',
        'fab fa-linux', 'fab fa-chrome', 'fab fa-firefox', 'fab fa-safari', 'fab fa-edge',
        'fab fa-discord', 'fab fa-telegram', 'fab fa-whatsapp', 'fab fa-skype', 'fab fa-slack',
        'fab fa-jira', 'fab fa-trello', 'fab fa-jenkins', 'fab fa-docker', 'fab fa-aws',
        'fab fa-playstation', 'fab fa-xbox', 'fab fa-nintendo-switch', 'fab fa-steam', 'fab fa-twitch'
    ]
};

let currentIconCategory = 'regular';
let isCompactMode = false;

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
    renderIconGrid(iconSets.regular);
    
    // 切换下拉菜单显示/隐藏
    iconSelectorBtn.addEventListener('click', function(e) {
        e.preventDefault();
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
    });
    
    // 点击图标外部关闭下拉菜单
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.icon-selector-container') && iconSelectorDropdown.classList.contains('active')) {
            iconSelectorDropdown.classList.remove('active');
        }
    });
    
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
            currentIconCategory = category;
            
            // 渲染对应类别的图标
            renderIconGrid(iconSets[category] || []);
            
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
                renderIconGrid(iconSets[currentIconCategory] || []);
                return;
            }
            
            // 搜索所有类别的图标
            const results = [];
            
            // 首先搜索当前类别
            const currentIcons = iconSets[currentIconCategory] || [];
            currentIcons.forEach(icon => {
                if (icon.toLowerCase().includes(searchTerm) && !results.includes(icon)) {
                    results.push(icon);
                }
            });
            
            // 如果当前类别没有足够的结果，搜索其他类别
            if (results.length < 5) {
                Object.keys(iconSets).forEach(category => {
                    if (category === currentIconCategory) return;
                    
                    iconSets[category].forEach(icon => {
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

// 渲染图标网格
function renderIconGrid(icons) {
    const iconGrid = document.getElementById('iconGrid');
    if (!iconGrid) return;
    
    let html = '';
    
    // 计算每行要显示的图标数量
    const iconsPerRow = isCompactMode ? 13 : 13;
    let currentRow = [];
    
    icons.forEach((icon, index) => {
        currentRow.push(icon);
        
        // 当达到每行所需图标数量时，生成HTML
        if (currentRow.length === iconsPerRow || index === icons.length - 1) {
            html += '<div class="icon-row">';
            currentRow.forEach(rowIcon => {
                html += `
                    <div class="icon-item" data-icon="${rowIcon}" title="${rowIcon}">
                        <i class="${rowIcon}"></i>
                    </div>
                `;
            });
            html += '</div>';
            currentRow = [];
        }
    });
    
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
