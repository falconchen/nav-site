// 分类编辑相关功能

// 全局变量，标记是否处于编辑模式
let isEditingCategories = false;

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
    
    categoryItems.forEach((item, index) => {
        const id = item.dataset.category;
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
    
    // 更新全局分类数据
    window.categoryData = updatedCategories;
    
    // 更新数据对象中的分类
    updateDataCategories(updatedCategories);
    
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
    
    // 渲染普通模式下的分类
    renderCategoriesInNormalMode();
    
    // 如果当前显示的分类被删除，则显示第一个分类
    const activeCategory = document.querySelector('.category-section.active');
    if (activeCategory && !document.getElementById(activeCategory.id + '-category')) {
        const firstCategory = document.querySelector('.category-item');
        if (firstCategory) {
            const firstCategoryId = firstCategory.dataset.category;
            showCategory(firstCategoryId);
        }
    }
}

// 渲染编辑模式下的分类
function renderCategoriesInEditMode() {
    const categoriesContainer = document.querySelector('.categories-list');
    if (!categoriesContainer) return;
    
    let html = '';
    window.categoryData.forEach(category => {
        html += getCategoryEditItemTemplate(category);
    });
    
    categoriesContainer.innerHTML = html;
    
    // 添加删除按钮事件
    document.querySelectorAll('.category-delete-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const categoryItem = this.closest('.category-item');
            categoryItem.classList.add('deleting');
            setTimeout(() => {
                categoryItem.remove();
            }, 300);
        });
    });
}

// 渲染普通模式下的分类
function renderCategoriesInNormalMode() {
    const categoriesContainer = document.querySelector('.categories-list');
    if (!categoriesContainer) return;
    
    let html = '';
    window.categoryData.forEach(category => {
        html += getCategoryItemTemplate(category);
    });
    
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
        order: window.categoryData.length
    };
    
    // 添加到DOM
    const newCategoryHTML = getCategoryEditItemTemplate(newCategory);
    categoriesContainer.insertAdjacentHTML('beforeend', newCategoryHTML);
    
    // 添加删除按钮事件
    const deleteBtn = categoriesContainer.lastElementChild.querySelector('.category-delete-btn');
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const categoryItem = this.closest('.category-item');
        categoryItem.classList.add('deleting');
        setTimeout(() => {
            categoryItem.remove();
        }, 300);
    });
    
    // 添加到分类数据
    window.categoryData.push(newCategory);
    
    // 创建对应的内容区域
    createCategoryContentSection(newId);
    
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
        if (!updatedCategoryIds.includes(id)) {
            delete websites[id];
        }
    });
    
    // 添加新分类
    updatedCategories.forEach(category => {
        if (!websites[category.id]) {
            websites[category.id] = [];
        }
    });
    
    // 确保websitesData引用也是最新的
    websitesData = websites;
    
    // 更新DOM中的分类区域
    updateCategorySections(updatedCategories);
}

// 更新DOM中的分类区域
function updateCategorySections(categories) {
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;
    
    // 保存当前活动分类的ID
    const activeSection = document.querySelector('.category-section.active');
    const activeCategoryId = activeSection ? activeSection.id : null;
    
    // 清空内容区域
    contentArea.innerHTML = '';
    
    // 重新创建所有分类区域
    categories.forEach(category => {
        const sectionHTML = `
            <section class="category-section${category.id === activeCategoryId ? ' active' : ''}" id="${category.id}">
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
    
    // 重新加载卡片数据
    loadWebsitesFromData();
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
}

// 页面加载完成后不需要做额外初始化，因为data.js已经初始化了分类数据
