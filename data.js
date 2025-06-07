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
    } else {
      console.log('使用默认数据');
      // 如果localStorage中没有数据，使用默认数据
      categories = [...defaultCategories];
      websites = JSON.parse(JSON.stringify(defaultWebsites)); // 深拷贝
    }
    
    
    window.websites = websites;
    
    // 初始化全局分类数据
    window.categoryData = categories;
    window.categories = categories; // 添加别名
    
    
    // 渲染分类列表
    renderCategoryList();
  } catch (error) {
    console.error('加载数据出错:', error);
    // 发生错误时使用默认数据
    categories = [...defaultCategories];
    websites = JSON.parse(JSON.stringify(defaultWebsites)); // 深拷贝
    
    window.websites = websites;
    window.categoryData = categories;
    window.categories = categories; // 添加别名
    
    // 渲染分类列表
    renderCategoryList();
  }
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
    // 同步window.categoryData或window.categories到本地变量
    if (window.categoryData) {
      categories = window.categoryData;
    } else if (window.categories) {
      categories = window.categories;
    }
    
    // 同步websites变量
    if (window.websites) {
      websites = window.websites;
    }
    
    localStorage.setItem('navSiteCategories', JSON.stringify(categories));
    localStorage.setItem('navSiteWebsites', JSON.stringify(websites));
    console.log('数据已保存到localStorage');
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