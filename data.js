// 网站数据
let categories = [];
let websites = {};

// 从localStorage加载数据或使用默认数据
function loadData() {
  try {
    // 尝试从localStorage加载分类数据
    const savedCategories = localStorage.getItem('navSiteCategories');
    const savedWebsites = localStorage.getItem('navSiteWebsites');
    
    if (savedCategories && savedWebsites) {
      console.log('从localStorage加载数据');
      categories = JSON.parse(savedCategories);
      websites = JSON.parse(savedWebsites);
      
      // 确保置顶分类存在且位于第一位
      ensurePinnedCategory();
    } else {
      console.log('使用默认数据');
      // 如果localStorage中没有数据，使用默认数据
      categories = [...defaultCategories];
      websites = JSON.parse(JSON.stringify(defaultWebsites)); // 深拷贝
    }
    
    // 清空置顶分类中的数据（置顶只是一个虚拟分类）
    if (websites['pinned']) {
      websites['pinned'] = [];
    }
    
    window.websites = websites;
    
    // 初始化全局分类数据
    window.categories = categories; // 添加别名
    
    // 渲染分类列表
    renderCategoryList();
  } catch (error) {
    console.error('加载数据出错:', error);
    // 发生错误时使用默认数据
    categories = [...defaultCategories];
    websites = JSON.parse(JSON.stringify(defaultWebsites)); // 深拷贝
    
    // 确保置顶分类存在且位于第一位
    ensurePinnedCategory();
    
    window.websites = websites;    
    window.categories = categories; // 添加别名
    
    // 渲染分类列表
    renderCategoryList();
  }
}

// 确保置顶分类存在且位于第一位
function ensurePinnedCategory() {
  // 查找置顶分类
  const pinnedIndex = categories.findIndex(cat => cat.id === 'pinned');
  
  if (pinnedIndex < 0) {
    // 如果不存在，则添加置顶分类
    categories.unshift({
      id: "pinned",
      name: "置顶",
      icon: "fas fa-thumbtack",
      order: 0,
      fixed: true
    });
    
    // 更新其他分类的order
    categories.forEach((cat, index) => {
      if (cat.id !== 'pinned') {
        cat.order = index;
      }
    });
  } else if (pinnedIndex > 0) {
    // 如果存在但不在第一位，移动到第一位
    const pinnedCategory = categories.splice(pinnedIndex, 1)[0];
    pinnedCategory.order = 0;
    categories.unshift(pinnedCategory);
    
    // 更新其他分类的order
    categories.forEach((cat, index) => {
      if (cat.id !== 'pinned') {
        cat.order = index;
      }
    });
  }
  
  // 确保置顶分类是固定的
  const pinnedCategory = categories.find(cat => cat.id === 'pinned');
  if (pinnedCategory) {
    pinnedCategory.fixed = true;
  }
  
  // 确保置顶分类数据是空的
  websites['pinned'] = [];
}

// 渲染侧边栏分类列表
function renderCategoryList() {
  const categoriesContainer = document.querySelector('.categories-list');
  if (!categoriesContainer) return;
  
  let html = '';
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  
  // 查找当前活动的分类
  const activeSection = document.querySelector('.category-section.active');
  const activeCategoryId = activeSection ? activeSection.id : 'social';
  
  sortedCategories.forEach(category => {
    html += `
      <div class="category-item${category.id === activeCategoryId ? ' active' : ''}" data-category="${category.id}" onclick="showCategory('${category.id}')">
        <i class="${category.icon}"></i>
        <span>${category.name}</span>
      </div>
    `;
  });
  
  categoriesContainer.innerHTML = html;
}

// 保存数据到localStorage
function saveNavData() {
  try {
    let categoriesFromGlobal = null;
    if (window.categories) {
      categoriesFromGlobal = window.categories;
    }
    
    if (categoriesFromGlobal) {
      categories = categoriesFromGlobal;
    } else {
      console.warn('没有找到全局分类数据!');
    }
    
    // 同步websites变量
    if (window.websites) {
      websites = window.websites;
    }
    
    localStorage.setItem('navSiteCategories', JSON.stringify(categories));
    localStorage.setItem('navSiteWebsites', JSON.stringify(websites));
  } catch (error) {
    console.error('保存数据出错:', error);
  }
}

// 页面加载时自动加载数据
document.addEventListener('DOMContentLoaded', function() {
  loadData();
});

// 导出保存函数以供其他脚本使用
window.saveNavData = saveNavData;

// 全局分类数据变量（已经在loadData中设置）
// window.categoryData = categories; 