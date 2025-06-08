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
            <i class="${category.icon}"></i>
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
    
    // 先找到未分类的数据
    const uncategorizedItem = Array.from(categoryItems).find(item => item.dataset.category === 'uncategorized');
    let uncategorizedData = null;
    
    if (uncategorizedItem) {
        const nameInput = uncategorizedItem.querySelector('.category-name-input');
        const iconElement = uncategorizedItem.querySelector('i:not(.fa-times):not(.fa-grip-lines)');
        
        if (nameInput && iconElement) {
            uncategorizedData = {
                id: 'uncategorized',
                name: nameInput.value.trim() || '未分类',
                icon: iconElement.className,
                order: categoryItems.length - 1 // 总是放在最后
            };
        }
    }
    
    // 收集其他分类数据
    categoryItems.forEach((item, index) => {
        const id = item.dataset.category;
        // 跳过"未分类"，我们会在最后添加它
        if (id === 'uncategorized') return;
        
        const nameInput = item.querySelector('.category-name-input');
        const iconElement = item.querySelector('i:not(.fa-times):not(.fa-grip-lines)');
        
        if (nameInput && iconElement) {
            updatedCategories.push({
                id: id,
                name: nameInput.value.trim() || `分类 ${index + 1}`,
                icon: iconElement.className,
                order: index
            });
        }
    });
    
    // 添加"未分类"到最后
    if (uncategorizedData) {
        updatedCategories.push(uncategorizedData);
    }
    
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
    
    // 先渲染非"未分类"的分类
    sortedCategories.filter(category => category.id !== 'uncategorized').forEach(category => {
        html += getCategoryEditItemTemplate(category);
    });
    
    // 最后渲染"未分类"
    const uncategorizedCategory = sortedCategories.find(category => category.id === 'uncategorized');
    if (uncategorizedCategory) {
        html += getCategoryEditItemTemplate(uncategorizedCategory);
    }
    
    categoriesContainer.innerHTML = html;
    
    // 添加删除按钮事件
    document.querySelectorAll('.category-delete-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const categoryItem = this.closest('.category-item');
            
            // 如果是系统默认的几个主要分类，不允许删除
            const categoryId = categoryItem.dataset.category;
            const defaultCategories = [ 'uncategorized'];
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

// 页面加载完成后不需要做额外初始化，因为data.js已经初始化了分类数据
