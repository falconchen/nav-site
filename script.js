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
    console.log([categoryId,isEditingCategories]);
    if (isEditingCategories) return; // 编辑模式下不允许切换分类
    
    // 隐藏所有分类内容
    const sections = document.querySelectorAll('.category-section');
    sections.forEach(section => section.classList.remove('active'));
    
    // 显示选中的分类
    const targetSection = document.getElementById(categoryId);
    if (targetSection) {
        targetSection.classList.add('active');
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
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
    document.body.style.overflow = '';
    currentEditingCard = null;
    
    // 清除编辑状态
    document.querySelectorAll('.website-card.editing').forEach(card => {
        card.classList.remove('editing');
    });
}

// 根据数据创建卡片HTML
function createCardHTML(website) {
    return `
        <div class="website-card">
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
        
        websites[category].forEach(website => {
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
    categories.forEach((category, index) => {
        const isActive = index === 0 ? 'active' : '';
        
        const sectionHTML = `
            <section class="category-section ${isActive}" id="${category.id}">
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
    
    if (currentEditingCard) {
        // 编辑现有卡片
        updateWebsiteCard(currentEditingCard, name, url, description, iconUrl);
    } else {
        // 创建新卡片
        createWebsiteCard(name, url, description, category, iconUrl);
        
        // 更新数据对象
        if (!websites[category]) {
            websites[category] = [];
        }
        
        websites[category].push({
            title: name,
            url: url,
            description: description,
            icon: iconUrl || 'fas fa-globe'
        });
    }
    
    // 保存数据到localStorage
    if (window.saveNavData) {
        
        window.saveNavData();
    }
    
    closeModal('websiteModal');
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
    
    // 添加更新动画
    card.style.animation = 'pulse 0.5s ease-out';
    setTimeout(() => {
        card.style.animation = '';
    }, 500);
    
    // 更新数据对象
    const categoryId = card.closest('.category-section').id;
    const cardIndex = Array.from(card.parentNode.children).indexOf(card);
    
    if (websites[categoryId] && websites[categoryId][cardIndex]) {
        websites[categoryId][cardIndex] = {
            title: name,
            url: url,
            description: description,
            icon: iconUrl || 'fas fa-globe'
        };
        
        // 保存数据到localStorage
        if (window.saveNavData) {
            window.saveNavData();
        }
    }
}

// 创建新网站卡片
function createWebsiteCard(name, url, description, category, iconUrl) {
    const categorySection = document.getElementById(category);
    const cardsGrid = categorySection.querySelector('.cards-grid');
    
    const cardHTML = `
        <div class="website-card" style="animation: fadeIn 0.5s ease-out">
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
    
    cardsGrid.insertAdjacentHTML('beforeend', cardHTML);
    
    // 为新卡片添加事件监听器
    const newCard = cardsGrid.lastElementChild;
    addCardEventListeners(newCard);
}

// 右键菜单功能
let contextMenu = null;

function createContextMenu() {
    if (contextMenu) return contextMenu;
    
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="editWebsiteFromMenu()">
            <i class="fas fa-edit"></i>
            <span>编辑网站</span>
        </div>
        <div class="context-menu-item danger" onclick="deleteWebsiteFromMenu()">
            <i class="fas fa-trash"></i>
            <span>删除网站</span>
        </div>
    `;
    
    document.body.appendChild(contextMenu);
    return contextMenu;
}

let contextMenuTarget = null;

function showContextMenu(e, card) {
    e.preventDefault();
    e.stopPropagation();
    
    const menu = createContextMenu();
    contextMenuTarget = card;
    
    // 隐藏其他可能显示的菜单
    hideContextMenu();
    
    // 显示菜单
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.classList.add('active');
    
    // 确保菜单在视窗内
    setTimeout(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (e.pageX - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (e.pageY - rect.height) + 'px';
        }
    }, 0);
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.classList.remove('active');
    }
}

function editWebsiteFromMenu() {
    if (contextMenuTarget) {
        editWebsite(contextMenuTarget);
        hideContextMenu();
    }
}

function deleteWebsiteFromMenu() {
    if (contextMenuTarget) {
        deleteWebsite(contextMenuTarget);
        hideContextMenu();
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
    card.addEventListener('contextmenu', (e) => showContextMenu(e, card));
    
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
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                closeModal(modal.id);
            });
            hideContextMenu();
        }
    });
});

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