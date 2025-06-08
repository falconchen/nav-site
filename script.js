// 主题切换功能
function toggleTheme() {
    const html = document.documentElement;
    const themeIcon = document.getElementById('theme-icon');
    
    if (html.getAttribute('data-theme') === 'light') {
        html.setAttribute('data-theme', 'dark');
        themeIcon.className = 'fas fa-sun';
        localStorage.setItem('theme', 'dark');
    } else {
        html.setAttribute('data-theme', 'light');
        themeIcon.className = 'fas fa-moon';
        localStorage.setItem('theme', 'light');
    }
}

// 分类切换功能
function showCategory(categoryId) {
    if (isEditingCategories) return; // 编辑模式下不允许切换分类
    
    // 获取目标分类区域
    const targetSection = document.getElementById(categoryId);
    if (targetSection) {
        // 平滑滚动到目标位置
        targetSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
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

// 模态框管理
let currentEditingCard = null;

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    console.log(`开始关闭模态框: ${modalId}`);
    
    // 检查当前编辑状态
    console.log('关闭前的编辑状态:', {
        currentEditingCard: currentEditingCard ? '存在' : '不存在',
        editingCards: document.querySelectorAll('.website-card.editing').length,
        modalId: modalId
    });
    
    // 记录所有具有editing类的卡片
    const editingCards = document.querySelectorAll('.website-card.editing');
    if (editingCards.length > 0) {
        console.log(`发现 ${editingCards.length} 个带有editing类的卡片:`, 
            Array.from(editingCards).map(card => {
                const title = card.querySelector('.card-title')?.textContent || '无标题';
                const category = card.closest('.category-section')?.id || '未知分类';
                return { title, category };
            })
        );
    }
    
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    // 清理前再次检查
    console.log('清理前再次检查:', {
        editingCards: document.querySelectorAll('.website-card.editing').length
    });
    
    // 重置当前编辑卡片引用
    if (currentEditingCard) {
        console.log('重置currentEditingCard');
        currentEditingCard = null;
    }
    
    // 清除编辑状态
    document.querySelectorAll('.website-card.editing').forEach((card, index) => {
        console.log(`尝试清除第 ${index + 1} 个卡片的editing类`);
        try {
            // 检查卡片在DOM中是否有效
            if (card.isConnected) {
                card.classList.remove('editing');
                console.log(`成功移除editing类`);
            } else {
                console.log(`卡片不在DOM中，无法移除类`);
            }
        } catch (error) {
            console.error(`移除editing类时出错:`, error);
        }
    });
    
    // 最终检查是否还有卡片带有editing类
    const remainingEditingCards = document.querySelectorAll('.website-card.editing');
    console.log('清理后检查:', {
        remainingEditingCards: remainingEditingCards.length,
        清理成功: remainingEditingCards.length === 0
    });
    
    if (remainingEditingCards.length > 0) {
        console.warn('警告: 仍有卡片带有editing类!', 
            Array.from(remainingEditingCards).map(card => {
                return {
                    title: card.querySelector('.card-title')?.textContent || '无标题',
                    category: card.closest('.category-section')?.id || '未知分类',
                    classList: card.className,
                    inDOM: card.isConnected
                };
            })
        );
        
        // 强制再次尝试清理
        remainingEditingCards.forEach(card => {
            // 使用替代方法尝试移除类
            try {
                card.className = card.className.replace('editing', '').trim();
                console.log('使用替代方法清理成功');
            } catch (error) {
                console.error('替代清理方法失败:', error);
            }
        });
    }
    
    console.log(`模态框 ${modalId} 关闭完成`);
}

// 根据数据创建卡片HTML
function createCardHTML(website) {
    // 确保权重数据存在
    const weight = website.weight || 100;
    
    return `
        <div class="website-card" data-weight="${weight}">
            <div class="card-header">
                <div class="card-icon">
                    <i class="${website.icon || 'fas fa-globe'}"></i>
                </div>
                <div>
                    <div class="card-title">${website.title}</div>
                    <div class="card-url">${website.url}</div>
                </div>
            </div>
            <div class="card-description">${website.description}</div>
        </div>
    `;
}

// 从数据加载网站卡片
function loadWebsitesFromData() {
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
        
        // 创建卡片
        sortedWebsites.forEach(website => {
            cardsContainer.insertAdjacentHTML('beforeend', createCardHTML(website));
        });
    });
    
    // 为所有卡片添加事件监听器
    document.querySelectorAll('.website-card').forEach(addCardEventListeners);
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
    
    // 默认选中第一个分类
    const firstCategory = sortedCategories[0];
    if (firstCategory) {
        const firstCategoryItem = document.querySelector(`.category-item[data-category="${firstCategory.id}"]`);
        if (firstCategoryItem) {
            firstCategoryItem.classList.add('active');
        }
        
        // 显示第一个分类的内容
        showCategory(firstCategory.id);
    }
    
    // 渲染分类section
    renderCategorySections(sortedCategories);
}

// 渲染分类section
function renderCategorySections(categories) {
    const contentArea = document.querySelector('.content-area');
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
    
    const contentArea = document.querySelector('.content-area');
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
    const contentArea = document.querySelector('.content-area');
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
    document.getElementById('modalTitle').textContent = '添加网站';
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-plus"></i> 添加网站';
    currentEditingCard = null;
    
    // 确保分类下拉菜单是最新的
    updateCategoryDropdown();
    
    openModal('websiteModal');
}

// 删除网站功能 - 显示确认对话框
let websiteToDelete = null;

function deleteWebsite(card) {
    const websiteName = card.querySelector('.card-title').textContent;
    document.getElementById('deleteWebsiteName').textContent = `网站"${websiteName}"将被永久删除`;
    websiteToDelete = card;
    openModal('deleteConfirmModal');
}

// 确认删除网站
function confirmDeleteWebsite() {
    if (websiteToDelete) {
        // 从数据对象中删除
        const categoryId = websiteToDelete.closest('.category-section').id;
        const cardIndex = Array.from(websiteToDelete.parentNode.children).indexOf(websiteToDelete);
        
        if (websites[categoryId] && websites[categoryId][cardIndex]) {
            websites[categoryId].splice(cardIndex, 1);
            
            // 保存数据到localStorage
            if (window.saveNavData) {
                window.saveNavData();
            }
        }
        
        websiteToDelete.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            websiteToDelete.remove();
            websiteToDelete = null;
        }, 300);
    }
    closeModal('deleteConfirmModal');
}

// 编辑网站功能
function editWebsite(card) {
    const title = card.querySelector('.card-title').textContent;
    const url = card.querySelector('.card-url').textContent;
    const description = card.querySelector('.card-description').textContent.trimStart();
    const iconElement = card.querySelector('.card-icon i');
    const iconClass = iconElement.className;
    
    // 填充表单
    document.getElementById('websiteName').value = title;
    document.getElementById('websiteUrl').value = url;
    document.getElementById('websiteDescription').value = description;
    document.getElementById('websiteIcon').value = iconClass;
    
    // 更新分类下拉菜单
    updateCategoryDropdown();
    
    // 设置分类
    const categorySection = card.closest('.category-section');
    const categoryId = categorySection.id;
    document.getElementById('websiteCategory').value = categoryId;
    
    // 重置文件上传区域
    const uploadArea = document.getElementById('iconUploadArea');
    uploadArea.innerHTML = `
        <i class="fas fa-cloud-upload-alt upload-icon"></i>
        <div class="upload-text">点击上传图标或拖拽文件到此处<br>支持 JPG, PNG, SVG 格式</div>
    `;
    
    // 更新模态框标题和按钮
    document.getElementById('modalTitle').textContent = '编辑网站';
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-save"></i> 保存更改';
    
    // 标记当前编辑的卡片
    currentEditingCard = card;
    card.classList.add('editing');
    
    openModal('websiteModal');
}

// 提交表单
function submitWebsiteForm() {
    const name = document.getElementById('websiteName').value;
    const url = document.getElementById('websiteUrl').value;
    let description = document.getElementById('websiteDescription').value;
    description = description.trimStart();
    const category = document.getElementById('websiteCategory').value;
    const iconUrl = document.getElementById('websiteIcon').value;
    
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
    
    // 为新网站或变更分类的网站设置最高权重（当前最大权重+10）
    const newWeight = getMaxWeight(category);
    
    // 记录分类是否变更，以便决定是否需要滚动到新分类
    let categoryChanged = false;
    
    if (currentEditingCard) {
        // 编辑现有卡片
        const oldCategoryId = currentEditingCard.closest('.category-section').id;
        const cardIndex = Array.from(currentEditingCard.parentNode.children).indexOf(currentEditingCard);
        
        // 确保移除编辑状态
        if (currentEditingCard.classList.contains('editing')) {
            currentEditingCard.classList.remove('editing');
        }
        
        // 检查分类是否有变化
        if (oldCategoryId !== category && websites[oldCategoryId] && websites[oldCategoryId][cardIndex]) {
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
                weight: newWeight // 设置最高权重
            });
            
            // 先隐藏旧卡片，准备移除
            currentEditingCard.style.display = 'none';
            
            // 创建新卡片
            createWebsiteCard(name, url, description, category, iconUrl);
            
            // 设置延迟移除旧卡片
            setTimeout(() => {
                if (currentEditingCard && currentEditingCard.parentNode) {
                    currentEditingCard.remove();
                }
                // 清除全局编辑卡片引用
                currentEditingCard = null;
            }, 0);
            
            console.log('网站已移动到新分类:', {
                from: oldCategoryId,
                to: category,
                website: name,
                newWeight: newWeight
            });
        } else {
            // 分类没有变化，只更新卡片内容和权重
            // 保留原有权重，不改变显示顺序
            updateWebsiteCard(currentEditingCard, name, url, description, iconUrl);
            
            // 确保清除编辑状态
            currentEditingCard = null;
        }
    } else {
        // 创建新卡片
        categoryChanged = true; // 新网站当作分类变更处理
        createWebsiteCard(name, url, description, category, iconUrl);
        
        // 更新数据对象
        if (!websites[category]) {
            websites[category] = [];
        }
        
        websites[category].push({
            title: name,
            url: url,
            description: description,
            icon: iconUrl || 'fas fa-globe',
            weight: newWeight // 设置最高权重
        });
        
        console.log('创建了新网站:', {
            category: category,
            website: name,
            weight: newWeight
        });
    }
    
    // 保存数据到localStorage
    if (window.saveNavData) {
        window.saveNavData();
    }
    
    // 最后确保没有卡片还处于编辑状态
    document.querySelectorAll('.website-card.editing').forEach(card => {
        card.classList.remove('editing');
    });
    
    closeModal('websiteModal');
    
    // 延迟一点时间后滚动到目标分类，确保DOM更新完成
    setTimeout(() => {
        // 如果是新网站或分类变更，则滚动到对应的分类区域
        if (categoryChanged) {
            showCategory(category);
            
            // 找到新添加的卡片并添加闪烁效果
            const categorySection = document.getElementById(category);
            if (categorySection) {
                const firstCard = categorySection.querySelector('.cards-grid .website-card:first-child');
                if (firstCard) {
                    // 添加临时高亮效果
                    firstCard.classList.add('highlight-card');
                    // 5秒后移除高亮
                    setTimeout(() => {
                        firstCard.classList.remove('highlight-card');
                    }, 5000);
                }
            }
        }
    }, 100);
}

// 更新网站卡片
function updateWebsiteCard(card, name, url, description, iconUrl) {
    card.querySelector('.card-title').textContent = name;
    card.querySelector('.card-url').textContent = url;
    card.querySelector('.card-description').textContent = description.trimStart();
    
    if (iconUrl) {
        const iconElement = card.querySelector('.card-icon i');
        iconElement.className = iconUrl.startsWith('fa') ? iconUrl : 'fas fa-globe';
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
    const cardIndex = Array.from(card.parentNode.children).indexOf(card);
    
    // 检查索引是否有效
    if (websites[categoryId] && cardIndex >= 0 && cardIndex < websites[categoryId].length) {
        // 保留原有权重
        const currentWeight = websites[categoryId][cardIndex].weight || 100;
        
        websites[categoryId][cardIndex] = {
            title: name,
            url: url,
            description: description,
            icon: iconUrl || 'fas fa-globe',
            weight: currentWeight // 保留原有权重
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

// 创建新网站卡片
function createWebsiteCard(name, url, description, category, iconUrl) {
    const categorySection = document.getElementById(category);
    const cardsGrid = categorySection.querySelector('.cards-grid');
    
    // 获取最大权重值，确保显示在前面
    const getMaxWeight = () => {
        if (!websites[category] || websites[category].length === 0) return 100;
        return Math.max(...websites[category].map(site => site.weight || 100)) + 10;
    };
    
    const weight = getMaxWeight();
    
    const cardHTML = `
        <div class="website-card" style="animation: fadeIn 0.5s ease-out" data-weight="${weight}">
            <div class="card-header">
                <div class="card-icon">
                    <i class="${iconUrl || 'fas fa-globe'}"></i>
                </div>
                <div>
                    <div class="card-title">${name}</div>
                    <div class="card-url">${url}</div>
                </div>
            </div>
            <div class="card-description">${description.trimStart()}</div>
        </div>
    `;
    
    // 插入到网格的开头而不是末尾，确保新卡片显示在最前面
    cardsGrid.insertAdjacentHTML('afterbegin', cardHTML);
    
    // 为新卡片添加事件监听器
    const newCard = cardsGrid.firstElementChild;
    addCardEventListeners(newCard);
}

// 右键菜单功能
let contextMenu = null;

function createContextMenu() {
    if (contextMenu) return contextMenu;
    
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.position = 'fixed'; // 固定使用fixed定位
    contextMenu.innerHTML = `
        <div class="context-menu-item" id="edit-website-btn">
            <i class="fas fa-edit"></i>
            <span>编辑网站</span>
        </div>
        <div class="context-menu-item danger" id="delete-website-btn">
            <i class="fas fa-trash"></i>
            <span>删除网站</span>
        </div>
    `;
    
    document.body.appendChild(contextMenu);
    
    // 使用addEventListener绑定事件
    const editBtn = contextMenu.querySelector('#edit-website-btn');
    const deleteBtn = contextMenu.querySelector('#delete-website-btn');
    
    editBtn.addEventListener('click', function() {
        console.log('点击了编辑按钮');
        if (contextMenuTarget) {
            editWebsite(contextMenuTarget);
            hideContextMenu();
        }
    });
    
    deleteBtn.addEventListener('click', function() {
        console.log('点击了删除按钮');
        if (contextMenuTarget) {
            deleteWebsite(contextMenuTarget);
            hideContextMenu();
        }
    });
    
    return contextMenu;
}

let contextMenuTarget = null;

function showContextMenu(e, card) {
    e.preventDefault();
    e.stopPropagation();
    
    // 调试日志
    console.log('右键菜单事件触发 - 坐标信息:', {
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        cardTitle: card.querySelector('.card-title')?.textContent
    });
    
    // 创建或获取菜单
    const menu = createContextMenu();
    contextMenuTarget = card;
    
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
    console.log('菜单尺寸:', {
        width: menuWidth,
        height: menuHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
    });
    
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
    
    console.log('菜单最终位置:', {left, top});
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.classList.remove('active');
        contextMenu.style.display = 'none';
        contextMenu.style.visibility = 'hidden';
        contextMenu.style.opacity = '0';
    }
}

// 搜索高亮功能
function highlightSearchResults(searchTerm) {
    const cards = document.querySelectorAll('.website-card');
    
    cards.forEach(card => {
        const title = card.querySelector('.card-title');
        const description = card.querySelector('.card-description');
        
        // 清除之前的高亮
        title.innerHTML = title.textContent;
        description.innerHTML = description.textContent;
        
        if (searchTerm) {
            // 添加高亮
            const titleText = title.textContent;
            const descText = description.textContent;
            
            const highlightedTitle = titleText.replace(
                new RegExp(`(${searchTerm})`, 'gi'),
                '<span class="highlight">$1</span>'
            );
            const highlightedDesc = descText.replace(
                new RegExp(`(${searchTerm})`, 'gi'),
                '<span class="highlight">$1</span>'
            );
            
            title.innerHTML = highlightedTitle;
            description.innerHTML = highlightedDesc;
        }
    });
}

// 为卡片添加事件监听器
function addCardEventListeners(card) {
    // 右键菜单
    card.addEventListener('contextmenu', function(e) {
        console.log('右键菜单触发:', {
            card: this.querySelector('.card-title')?.textContent,
            eventType: e.type,
            target: e.target.tagName,
            container: this.closest('.category-section')?.id
        });
        showContextMenu(e, this);
    });
    
    // 左键点击（访问网站）
    card.addEventListener('click', function(e) {
        if (e.target.closest('.context-menu')) return;
        
        // 如果按住Ctrl键点击，则编辑网站
        if (e.ctrlKey) {
            editWebsite(this);
            return;
        }
        
        const url = this.querySelector('.card-url').textContent;
        // 检查URL是否已包含协议
        const fullUrl = url.includes('://') ? url : `http://${url}`;
        window.open(fullUrl, '_blank');
    });
}

// 文件上传功能
function setupFileUpload() {
    const uploadArea = document.getElementById('iconUploadArea');
    const fileInput = document.getElementById('iconFile');
    const iconUrlInput = document.getElementById('websiteIcon');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

function handleFileUpload(file) {
    if (file.type.startsWith('image/')) {
        // 在实际应用中，这里会上传文件到服务器
        // 现在我们只是模拟设置一个图标类名
        const iconClasses = [
            'fas fa-star', 'fas fa-heart', 'fas fa-bookmark',
            'fas fa-thumbs-up', 'fas fa-fire', 'fas fa-gem'
        ];
        const randomIcon = iconClasses[Math.floor(Math.random() * iconClasses.length)];
        document.getElementById('websiteIcon').value = randomIcon;
        
        // 更新上传区域显示
        const uploadArea = document.getElementById('iconUploadArea');
        uploadArea.innerHTML = `
            <i class="fas fa-check-circle upload-icon" style="color: var(--secondary-color);"></i>
            <div class="upload-text">图标已上传: ${file.name}</div>
        `;
    } else {
        alert('请上传图片文件');
    }
}

// 页面初始化
document.addEventListener('DOMContentLoaded', function() {
    // 读取localStorage主题
    const savedTheme = localStorage.getItem('theme');
    const html = document.documentElement;
    const themeIcon = document.getElementById('theme-icon');
    if (savedTheme === 'dark') {
        html.setAttribute('data-theme', 'dark');
        if(themeIcon) themeIcon.className = 'fas fa-sun';
    } else if (savedTheme === 'light') {
        html.setAttribute('data-theme', 'light');
        if(themeIcon) themeIcon.className = 'fas fa-moon';
    }
    
    // 更新分类下拉菜单
    updateCategoryDropdown();
    
    // 加载数据并创建卡片
    loadWebsitesFromData();
    
    // 设置文件上传
    setupFileUpload();
    
    // 点击其他地方隐藏右键菜单
    document.addEventListener('click', hideContextMenu);
    
    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // 获取所有活动的模态框
            const activeModals = document.querySelectorAll('.modal-overlay.active');
            
            activeModals.forEach(modal => {
                const modalId = modal.id;
                console.log('ESC键关闭模态框:', modalId);
                
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
            
            // 隐藏右键菜单
            hideContextMenu();
        }
    });
    
    // 添加滚动监听，更新当前分类状态
    setupScrollSpy();
});

// 滚动监听功能
function setupScrollSpy() {
    // 确保所有分类section都存在
    if (document.querySelectorAll('.category-section').length === 0) return;
    
    // 防抖函数，避免频繁触发
    function debounce(func, wait) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
    
    // 获取所有分类区域的位置信息
    function getCategorySections() {
        const sections = document.querySelectorAll('.category-section');
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
    const updateActiveCategory = debounce(function() {
        const scrollPosition = window.scrollY + 100; // 添加偏移量以提前激活
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
            console.log('当前分类:', currentCategoryId);
        }
    }, 50);
    
    // 添加滚动事件监听
    window.addEventListener('scroll', updateActiveCategory);
    
    // 初始调用一次，设置初始状态
    updateActiveCategory();
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
    
    // 添加所有分类
    window.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
    });
    
    // 恢复选中值
    if (selectedValue) {
        categorySelect.value = selectedValue;
    }
}

// 更新搜索功能
const searchBox = document.querySelector('.search-box');
searchBox.addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.website-card');
    
    cards.forEach(card => {
        const title = card.querySelector('.card-title').textContent.toLowerCase();
        const description = card.querySelector('.card-description').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || description.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = searchTerm === '' ? 'block' : 'none';
        }
    });
    
    // 添加搜索高亮
    highlightSearchResults(searchTerm);
});