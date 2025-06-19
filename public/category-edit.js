// 分类编辑相关功能

// 全局变量，标记是否处于编辑模式
let isEditingCategories = false;
// 当前要删除的分类元素
let categoryToDelete = null;

// 编辑模式下的分类项模板
function getCategoryEditItemTemplate(category) {
    return `
        <div class="category-item" data-category="${category.id}" draggable="true">
            <div class="category-drag-handle">
                <i class="fas fa-grip-lines"></i>
            </div>
            <div class="category-icon-selector">
                <input type="hidden" class="category-icon-input" value="${category.icon}">
                <i class="${category.icon} category-icon"></i>
            </div>
            <input type="text" class="category-name-input" value="${category.name}">
            <button class="category-delete-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
}

// 普通模式下的分类项模板
function getCategoryItemTemplate(category) {
    return `
        <div class="category-item" data-category="${category.id}" onclick="showCategory('${category.id}')">
            <i class="${category.icon}"></i>
            <span>${category.name}</span>
        </div>
    `;
}

// 进入分类编辑模式
function enterCategoryEditMode() {
    isEditingCategories = true;
    
    // 更改标题样式
    const titleContainer = document.querySelector('.categories-title-container');
    titleContainer.classList.add('editing');
    
    // 更改侧边栏样式
    const sidebar = document.querySelector('.categories-sidebar');
    sidebar.classList.add('editing');
    
    // 更改主内容区域样式
    const mainContainer = document.querySelector('.main-container');
    mainContainer.classList.add('editing-categories');
    
    // 更改编辑按钮
    const editBtn = document.getElementById('category-edit-btn');
    editBtn.innerHTML = '<i class="fas fa-check"></i>';
    editBtn.title = '完成编辑';
    editBtn.onclick = saveCategoryChanges;
    
    // 显示添加分类按钮
    const addCategoryBtn = document.getElementById('add-category-btn');
    addCategoryBtn.style.display = 'flex';
    
    // 转换所有分类项为可编辑状态
    renderCategoriesInEditMode();
    
    // 设置拖拽排序
    setupDragAndDrop();
}

// 退出分类编辑模式并保存更改
function saveCategoryChanges() {
    isEditingCategories = false;
    
    // 收集所有分类数据
    const categoryItems = document.querySelectorAll('.category-item');
    const updatedCategories = [];
    
    // 获取现有的固定分类（置顶、最近添加、未分类）
    const fixedCategories = window.categories.filter(cat => 
        cat.fixed || cat.id === 'pinned' || cat.id === 'recent' || cat.id === 'uncategorized'
    );
    
    // 添加固定分类到更新列表
    fixedCategories.forEach(fixedCat => {
        updatedCategories.push(fixedCat);
    });
    
    // 收集当前显示的可编辑分类数据
    categoryItems.forEach((item, index) => {
        const id = item.dataset.category;
        // 跳过已经添加过的固定分类
        if (['pinned', 'recent', 'uncategorized'].includes(id)) return;
        
        const nameInput = item.querySelector('.category-name-input');
        const iconInput = item.querySelector('.category-icon-input');
        
        if (nameInput && iconInput) {
            updatedCategories.push({
                id: id,
                name: nameInput.value.trim() || `分类 ${index + 1}`,
                icon: iconInput.value || 'fas fa-folder',
                order: fixedCategories.length + index // 固定分类后面排序
            });
        }
    });
    
    // 更新全局分类数据
    window.categories = updatedCategories;
    
    // 更新数据对象中的分类
    updateDataCategories(updatedCategories);
    
    // 保存数据到localStorage
    if (typeof saveNavData === 'function') {
        try {
            // 直接调用全局的saveNavData确保找到正确函数
            window.saveNavData();
        } catch(e) {
            console.error("保存数据出错:", e);
        }
    }
    
    // 恢复标题样式
    const titleContainer = document.querySelector('.categories-title-container');
    titleContainer.classList.remove('editing');
    
    // 恢复侧边栏样式
    const sidebar = document.querySelector('.categories-sidebar');
    sidebar.classList.remove('editing');
    
    // 恢复主内容区域样式
    const mainContainer = document.querySelector('.main-container');
    mainContainer.classList.remove('editing-categories');
    
    // 恢复编辑按钮
    const editBtn = document.getElementById('category-edit-btn');
    editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    editBtn.title = '编辑分类';
    editBtn.onclick = enterCategoryEditMode;
    
    // 隐藏添加分类按钮
    const addCategoryBtn = document.getElementById('add-category-btn');
    addCategoryBtn.style.display = 'none';
    
    // 重新渲染分类列表
    if (typeof renderCategoryList === 'function') {
        renderCategoryList();
    } else {
        // 备用方案：直接渲染普通模式
        renderCategoriesInNormalMode();
    }
    
    // 更新分类下拉菜单
    if (typeof updateCategoryDropdown === 'function') {
        updateCategoryDropdown();
    }
    
    // 确保卡片数据正确加载
    setTimeout(() => {
        // 再次确保数据加载完成
        if (typeof loadWebsitesFromData === 'function') {
            loadWebsitesFromData();
        }
        
        // 如果当前显示的分类被删除，则显示第一个分类
        const activeCategory = document.querySelector('.category-section.active');
        if (!activeCategory && updatedCategories.length > 0) {
            showCategory(updatedCategories[0].id);
        }
    }, 100);
}

// 渲染编辑模式下的分类
function renderCategoriesInEditMode() {
    const categoriesContainer = document.querySelector('.categories-list');
    if (!categoriesContainer) return;
    
    let html = '';
    
    // 确保使用最新的分类数据
    const sortedCategories = [...window.categories].sort((a, b) => a.order - b.order);
    
    // 排除固定分类（置顶、最近添加、未分类），只渲染可编辑的分类
    const editableCategories = sortedCategories.filter(category => 
        !category.fixed && category.id !== 'pinned' && category.id !== 'recent' && category.id !== 'uncategorized'
    );
    
    // 渲染可编辑分类
    editableCategories.forEach(category => {
        html += getCategoryEditItemTemplate(category);
    });
    
    categoriesContainer.innerHTML = html;
    
    // 添加删除按钮事件
    document.querySelectorAll('.category-delete-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const categoryItem = this.closest('.category-item');
            
            // 如果是系统默认的几个主要分类，不允许删除
            const categoryId = categoryItem.dataset.category;
            const defaultCategories = ['pinned', 'recent', 'uncategorized'];
            if (defaultCategories.includes(categoryId)) {
                alert('系统默认分类不能删除！');
                return;
            }
            
            // 保存要删除的分类元素引用
            categoryToDelete = categoryItem;
            
            // 显示分类名称
            const nameInput = categoryItem.querySelector('.category-name-input');
            const categoryName = nameInput ? nameInput.value : '未命名分类';
            document.getElementById('deleteCategoryName').textContent = categoryName;
            
            // 打开确认对话框
            openCategoryModal('deleteCategoryModal');
        });
    });
    
    // 添加图标点击事件
    document.querySelectorAll('.category-icon').forEach(icon => {
        icon.addEventListener('click', function(e) {
            e.stopPropagation();
            const categoryItem = this.closest('.category-item');
            openCategoryIconSelector(categoryItem);
        });
    });
}

// 渲染普通模式下的分类
function renderCategoriesInNormalMode() {
    const categoriesContainer = document.querySelector('.categories-list');
    if (!categoriesContainer) return;
    
    let html = '';
    
    // 确保使用最新的分类数据
    const sortedCategories = [...window.categories].sort((a, b) => a.order - b.order);
    
    // 先渲染非"未分类"的分类
    sortedCategories.filter(category => category.id !== 'uncategorized').forEach(category => {
        html += getCategoryItemTemplate(category);
    });
    
    // 最后渲染"未分类"
    const uncategorizedCategory = sortedCategories.find(category => category.id === 'uncategorized');
    if (uncategorizedCategory) {
        html += getCategoryItemTemplate(uncategorizedCategory);
    }
    
    categoriesContainer.innerHTML = html;
    
    // 恢复当前选中的分类
    const activeSection = document.querySelector('.category-section.active');
    if (activeSection) {
        const activeCategoryId = activeSection.id;
        const activeCategoryItem = document.querySelector(`.category-item[data-category="${activeCategoryId}"]`);
        if (activeCategoryItem) {
            activeCategoryItem.classList.add('active');
        }
    }
}

// 添加新分类
function addNewCategory() {
    const categoriesContainer = document.querySelector('.categories-list');
    if (!categoriesContainer) return;
    
    // 生成唯一ID
    const newId = 'category-' + Date.now();
    
    // 创建新分类对象
    const newCategory = {
        id: newId,
        name: '新分类',
        icon: 'fas fa-folder',
        order: window.categories.length
    };
    
    // 添加到DOM
    const newCategoryHTML = getCategoryEditItemTemplate(newCategory);
    categoriesContainer.insertAdjacentHTML('beforeend', newCategoryHTML);
    
    // 添加删除按钮事件
    const deleteBtn = categoriesContainer.lastElementChild.querySelector('.category-delete-btn');
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const categoryItem = this.closest('.category-item');
        
        // 保存要删除的分类元素引用
        categoryToDelete = categoryItem;
        
        // 显示分类名称
        const nameInput = categoryItem.querySelector('.category-name-input');
        const categoryName = nameInput ? nameInput.value : '未命名分类';
        document.getElementById('deleteCategoryName').textContent = categoryName;
        
        // 打开确认对话框
        openCategoryModal('deleteCategoryModal');
    });
    
    // 添加到分类数据
    window.categories.push(newCategory);
    
    // 创建对应的内容区域
    createCategoryContentSection(newId);
    
    // 更新分类下拉菜单
    if (typeof updateCategoryDropdown === 'function') {
        updateCategoryDropdown();
    }
    
    // 保存数据到localStorage
    if (typeof saveNavData === 'function') {
        saveNavData();
    }
    
    // 聚焦到新分类的输入框
    const newInput = categoriesContainer.lastElementChild.querySelector('.category-name-input');
    if (newInput) {
        newInput.focus();
        newInput.select();
    }
}

// 创建新分类的内容区域
function createCategoryContentSection(categoryId) {
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;
    
    const sectionHTML = `
        <section class="category-section" id="${categoryId}">
            <h2 class="section-title">
                <i class="fas fa-folder"></i>
                新分类
            </h2>
            <div class="cards-grid" id="${categoryId}-cards">
                <!-- 卡片将由JavaScript动态加载 -->
            </div>
        </section>
    `;
    
    contentArea.insertAdjacentHTML('beforeend', sectionHTML);
    
    // 初始化该分类的数据数组
    if (!websites[categoryId]) {
        websites[categoryId] = [];
    }
}

// 更新数据对象中的分类
function updateDataCategories(updatedCategories) {
    // 处理分类变更
    const oldData = { ...websites };
    
    // 获取所有当前分类ID
    const currentCategoryIds = Object.keys(websites);
    
    // 获取更新后的分类ID
    const updatedCategoryIds = updatedCategories.map(category => category.id);
    
    // 删除不再存在的分类
    currentCategoryIds.forEach(id => {
        if (!updatedCategoryIds.includes(id) && id !== 'uncategorized') {
            // 将分类下的网站移至"未分类"
            if (websites[id] && websites[id].length > 0) {
                if (!websites['uncategorized']) {
                    websites['uncategorized'] = [];
                }
                websites['uncategorized'] = websites['uncategorized'].concat(websites[id]);
            }
            // 删除原分类数据
            delete websites[id];
        }
    });
    
    // 添加新分类
    updatedCategories.forEach(category => {
        if (!websites[category.id]) {
            websites[category.id] = [];
        }
    });
    
    // 确保全局引用也是最新的
    window.websites = websites;
    
    // 使用script.js中的函数更新DOM中的分类区域
    if (typeof updateCategorySections === 'function') {
        updateCategorySections(updatedCategories);
    }
}

// 设置拖拽排序功能
function setupDragAndDrop() {
    const categoriesContainer = document.querySelector('.categories-list');
    if (!categoriesContainer) return;
    
    let draggedItem = null;
    
    document.querySelectorAll('.category-item').forEach(item => {
        // 拖拽开始
        item.addEventListener('dragstart', function() {
            draggedItem = this;
            setTimeout(() => {
                this.classList.add('dragging');
            }, 0);
        });
        
        // 拖拽结束
        item.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            draggedItem = null;
            
            // 拖拽结束后更新分类顺序
            updateCategoryOrder();
            
            // 保存到localStorage
            if (typeof saveNavData === 'function') {
                saveNavData();
            }
        });
        
        // 拖拽手柄事件
        const dragHandle = item.querySelector('.category-drag-handle');
        if (dragHandle) {
            dragHandle.addEventListener('mousedown', function(e) {
                e.stopPropagation();
                item.draggable = true;
            });
            
            dragHandle.addEventListener('mouseup', function() {
                item.draggable = false;
            });
        }
    });
    
    // 拖拽区域事件
    categoriesContainer.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (!draggedItem) return;
        
        const afterElement = getDragAfterElement(categoriesContainer, e.clientY);
        if (afterElement == null) {
            categoriesContainer.appendChild(draggedItem);
        } else {
            categoriesContainer.insertBefore(draggedItem, afterElement);
        }
    });
    
    // 辅助函数：获取拖拽后的位置
    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.category-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    // 在拖拽后更新分类顺序
    function updateCategoryOrder() {
        const categoryItems = document.querySelectorAll('.category-item');
        
        // 获取当前分类的顺序
        const newOrder = {};
        categoryItems.forEach((item, index) => {
            const id = item.dataset.category;
            newOrder[id] = index;
        });
        
        // 更新全局分类数据的顺序
        window.categories.forEach(category => {
            if (newOrder.hasOwnProperty(category.id)) {
                category.order = newOrder[category.id];
            }
        });
        
        // 对分类排序
        window.categories.sort((a, b) => a.order - b.order);
    }
}

// 打开模态框
function openCategoryModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// 关闭模态框
function closeCategoryModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // 如果是分类删除对话框，清除引用
    if (modalId === 'deleteCategoryModal') {
        categoryToDelete = null;
    }
    
    // 如果是图标选择器模态框，清除引用
    if (modalId === 'categoryIconModal') {
        currentEditingCategoryItem = null;
    }
}

// 确认删除分类
function confirmDeleteCategory() {
    if (!categoryToDelete) return;
    
    // 获取要删除的分类ID
    const categoryId = categoryToDelete.dataset.category;
    
    // 将该分类下的网站转移到"未分类"分类下
    if (websites[categoryId] && websites[categoryId].length > 0) {
        // 如果未分类分类不存在，创建它
        if (!websites['uncategorized']) {
            websites['uncategorized'] = [];
        }
        
        // 将所有网站移至未分类
        websites['uncategorized'] = websites['uncategorized'].concat(websites[categoryId]);
    }
    
    // 立即从数据模型中删除该分类
    window.categories = window.categories.filter(category => category.id !== categoryId);
    
    // 从websites对象中删除对应的分类数据（已移至未分类，这里只需删除原始键）
    if (categoryId !== 'uncategorized' && websites[categoryId]) {
        delete websites[categoryId];
    }
    
    // 立即保存数据到localStorage（不等到动画结束）
    if (typeof saveNavData === 'function') {
        saveNavData();
    }
    
    // 如果不在编辑模式，重新渲染分类列表
    if (!isEditingCategories && typeof renderCategoryList === 'function') {
        renderCategoryList();
    }
    
    // 更新分类下拉菜单
    if (typeof updateCategoryDropdown === 'function') {
        updateCategoryDropdown();
    }
    
    // 添加删除动画
    categoryToDelete.classList.add('deleting');
    
    // 保存对DOM元素的引用，以防在动画完成前变量被重置
    const elementToRemove = categoryToDelete;
    
    // 重置全局变量，防止其他操作影响到它
    categoryToDelete = null;
    
    // 如果删除的分类在内容区域是当前显示的，则切换到第一个可用分类
    const currentActiveSection = document.querySelector('.category-section.active');
    if (currentActiveSection && currentActiveSection.id === categoryId) {
        // 找到第一个非被删除分类的分类
        const firstAvailableCategory = window.categories.find(cat => cat.id !== categoryId);
        if (firstAvailableCategory) {
            // 延迟切换，以便DOM有时间更新
            setTimeout(() => {
                showCategory(firstAvailableCategory.id);
            }, 10);
        }
    }
    
    // 从内容区域中移除对应的分类区块
    const categorySection = document.getElementById(categoryId);
    if (categorySection) {
        categorySection.remove();
    }
    
    // 延迟执行实际的DOM删除，给动画留时间
    setTimeout(() => {
        // 确保元素仍然存在于DOM中再尝试删除
        if (elementToRemove && elementToRemove.parentNode) {
            elementToRemove.remove();
        }
    }, 300);
    
    // 关闭对话框
    closeCategoryModal('deleteCategoryModal');
}

// 分类图标选择器模态框
let currentEditingCategoryItem = null;

// 打开分类图标选择器
function openCategoryIconSelector(categoryItem) {
    // 保存当前编辑的分类项引用
    currentEditingCategoryItem = categoryItem;
    
    // 创建并显示图标选择器模态框
    if (!document.getElementById('categoryIconModal')) {
        createCategoryIconModal();
    }
    
    // 获取当前图标
    const iconInput = categoryItem.querySelector('.category-icon-input');
    const currentIcon = iconInput ? iconInput.value : 'fas fa-folder';
    
    // 更新模态框中的预览
    const iconPreview = document.getElementById('categoryIconPreview');
    if (iconPreview) {
        iconPreview.className = currentIcon;
    }
    
    // 设置隐藏输入字段的值
    const modalIconInput = document.getElementById('categoryIconInput');
    if (modalIconInput) {
        modalIconInput.value = currentIcon;
    }
    
    // 打开模态框
    openCategoryModal('categoryIconModal');
    
    // 初始化图标选择器
    initCategoryIconSelector();
}

// 创建分类图标选择器模态框
function createCategoryIconModal() {
    const modalHTML = `
        <div class="modal-overlay" id="categoryIconModal">
            <div class="modal" style="max-width: 720px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title">选择分类图标</h3>
                    <button class="modal-close" onclick="closeCategoryModal('categoryIconModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="icon-selector-container" style="margin: 0.5rem 0;">
                    <div class="icon-selector-input-group">
                        <span class="icon-selector-preview">
                            <i id="categoryIconPreview" class="fas fa-folder"></i>
                        </span>
                        <input type="text" id="categoryIconInput" class="icon-selector-input" placeholder="选择图标..." readonly>
                        <button type="button" class="icon-selector-dropdown-btn" id="categoryIconSelectorBtn">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                    <div class="icon-selector-dropdown" id="categoryIconSelectorDropdown" style="position: static; display: block; max-height: 350px; box-shadow: none; margin-top: 0.5rem; border: 1px solid var(--border-color);">
                        <input type="text" class="icon-selector-search" id="categoryIconSearch" placeholder="搜索图标...">
                        <div class="icon-category-tabs" id="categoryIconCategoryTabs">
                            <div class="icon-category-tab active" data-category="regular">常规</div>
                            <div class="icon-category-tab" data-category="solid">实心</div>
                            <div class="icon-category-tab" data-category="brands">品牌</div>
                        </div>
                        <div class="icon-grid" id="categoryIconGrid">
                            <!-- 图标将由JavaScript动态加载 -->
                        </div>
                    </div>
                </div>
                
                <div class="form-buttons" style="margin-top: 0.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeCategoryModal('categoryIconModal')">
                        <i class="fas fa-times"></i>
                        取消
                    </button>
                    <button type="button" class="btn btn-primary" onclick="applyCategoryIcon()">
                        <i class="fas fa-check"></i>
                        确认选择
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// 初始化分类图标选择器
function initCategoryIconSelector() {
    const iconSelectorBtn = document.getElementById('categoryIconSelectorBtn');
    const iconSelectorDropdown = document.getElementById('categoryIconSelectorDropdown');
    const iconGrid = document.getElementById('categoryIconGrid');
    const iconSearch = document.getElementById('categoryIconSearch');
    const iconCategoryTabs = document.getElementById('categoryIconCategoryTabs');
    const iconInput = document.getElementById('categoryIconInput');
    const iconPreview = document.getElementById('categoryIconPreview');
    
    if (!iconSelectorBtn || !iconSelectorDropdown) return;
    
    // 加载初始图标集
    renderCategoryIconGrid(window.iconSets.regular);
    
    // 无需切换下拉菜单显示/隐藏，直接在模态框中显示
    iconSelectorBtn.addEventListener('click', function(e) {
        e.preventDefault();
        // 聚焦搜索框
        setTimeout(() => {
            iconSearch.focus();
        }, 100);
    });
    
    // 点击输入框也聚焦搜索框
    if (iconInput) {
        iconInput.addEventListener('click', function(e) {
            e.preventDefault();
            // 聚焦搜索框
            setTimeout(() => {
                iconSearch.focus();
            }, 100);
        });
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
            renderCategoryIconGrid(window.iconSets[category] || []);
            
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
                renderCategoryIconGrid(window.iconSets[window.currentIconCategory] || []);
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
            renderCategoryIconGrid(results);
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
            
            // 滚动到顶部并高亮选中的图标
            iconGrid.querySelectorAll('.icon-item').forEach(item => {
                item.classList.remove('selected');
            });
            iconItem.classList.add('selected');
        });
    }
}

// 渲染分类图标网格
function renderCategoryIconGrid(icons) {
    const iconGrid = document.getElementById('categoryIconGrid');
    if (!iconGrid) return;
    
    let html = '';
    
    // 每行显示的图标数量
    const iconsPerRow = 12;
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
    const selectedIcon = document.getElementById('categoryIconInput').value;
    if (selectedIcon) {
        const selectedItem = iconGrid.querySelector(`.icon-item[data-icon="${selectedIcon}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
            // 将选中的图标滚动到视图中
            setTimeout(() => {
                selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
    }
}

// 应用选中的图标到分类
function applyCategoryIcon() {
    if (!currentEditingCategoryItem) return;
    
    // 获取选中的图标
    const iconInput = document.getElementById('categoryIconInput');
    if (!iconInput) return;
    
    const newIcon = iconInput.value;
    
    // 更新分类项中的图标
    const categoryIconInput = currentEditingCategoryItem.querySelector('.category-icon-input');
    const categoryIconElement = currentEditingCategoryItem.querySelector('.category-icon-selector > i');
    
    if (categoryIconInput && categoryIconElement) {
        categoryIconInput.value = newIcon;
        categoryIconElement.className = newIcon;
    }
    
    // 关闭模态框
    closeCategoryModal('categoryIconModal');
    
    // 清除当前编辑的分类项引用
    currentEditingCategoryItem = null;
}

// 页面加载完成后不需要做额外初始化，因为data.js已经初始化了分类数据
