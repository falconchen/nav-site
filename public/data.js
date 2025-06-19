// 网站数据
let categories = [];
let websites = {};

// 默认网站数据
const defaultCategories = [
  {
    id: "pinned",
    name: "置顶",
    icon: "fas fa-thumbtack",
    order: 0,
    fixed: true
  },
  {
    id: "recent",
    name: "最近添加",
    icon: "fas fa-clock",
    order: 1,
    fixed: true
  },
  {
    id: "social",
    name: "社交媒体",
    icon: "fab fa-twitter",
    order: 2
  },
  {
    id: "tools",
    name: "实用工具",
    icon: "fas fa-tools",
    order: 3
  },
  {
    id: "design",
    name: "设计资源",
    icon: "fas fa-palette",
    order: 4
  },
  {
    id: "dev",
    name: "开发技术",
    icon: "fas fa-code",
    order: 5
  },
  {
    id: "news",
    name: "新闻资讯",
    icon: "fas fa-newspaper",
    order: 6
  },
  {
    id: "entertainment",
    name: "娱乐休闲",
    icon: "fas fa-gamepad",
    order: 7
  },
  {
    id: "uncategorized",
    name: "未分类",
    icon: "fas fa-folder",
    order: 8,
    fixed: true
  }
];

const defaultWebsites = {
  pinned: [],
  recent: [],
  social: [
    {
      title: "微博",
      url: "https://weibo.com",
      icon: "fab fa-weibo",
      description: "中国最大的社交媒体平台，实时分享生活动态，关注热点话题和明星动态。"
    },
    {
      title: "Twitter",
      url: "https://twitter.com",
      icon: "fab fa-twitter",
      description: "全球知名的微博客和社交网络服务平台，实时获取全球资讯和观点。"
    },
    {
      title: "Instagram",
      url: "https://instagram.com",
      icon: "fab fa-instagram",
      description: "以图片和视频为主的社交平台，分享生活美好瞬间，发现创意灵感。"
    },
    {
      title: "LinkedIn",
      url: "https://linkedin.com",
      icon: "fab fa-linkedin",
      description: "全球最大的职业社交网络，建立专业人脉，寻找职业机会。"
    }
  ],
  tools: [
    {
      title: "Google",
      url: "https://google.com",
      icon: "fab fa-google",
      description: "全球最大的搜索引擎，快速找到您需要的任何信息和资源。"
    },
    {
      title: "Google 翻译",
      url: "https://translate.google.com",
      icon: "fas fa-translate",
      description: "支持100多种语言的在线翻译工具，文本、图片、语音翻译一应俱全。"
    },
    {
      title: "百度网盘",
      url: "https://pan.baidu.com",
      icon: "fas fa-cloud",
      description: "个人云存储服务，安全存储和分享您的文件，随时随地访问。"
    },
    {
      title: "计算器",
      url: "https://calculator.net",
      icon: "fas fa-calculator",
      description: "在线科学计算器，支持基础运算、科学计算、单位转换等功能。"
    }
  ],
  design: [
    {
      title: "Figma",
      url: "https://figma.com",
      icon: "fab fa-figma",
      description: "协作式界面设计工具，实时协作，原型设计，设计系统管理。"
    },
    {
      title: "Unsplash",
      url: "https://unsplash.com",
      icon: "fas fa-images",
      description: "高质量免费图片素材库，数百万张精美照片供您免费下载使用。"
    },
    {
      title: "Adobe Color",
      url: "https://color.adobe.com",
      icon: "fas fa-paint-brush",
      description: "专业的配色工具，创建、探索和分享完美的色彩搭配方案。"
    },
    {
      title: "Google Fonts",
      url: "https://fonts.google.com",
      icon: "fas fa-font",
      description: "免费的网络字体库，提供数百种优质字体供网站和应用使用。"
    }
  ],
  dev: [
    {
      title: "GitHub",
      url: "https://github.com",
      icon: "fab fa-github",
      description: "全球最大的代码托管平台，版本控制、协作开发、开源项目分享。"
    },
    {
      title: "Stack Overflow",
      url: "https://stackoverflow.com",
      icon: "fab fa-stack-overflow",
      description: "程序员问答社区，解决编程问题，分享技术知识和经验。"
    },
    {
      title: "NPM",
      url: "https://npmjs.com",
      icon: "fab fa-npm",
      description: "Node.js包管理器，发现和安装JavaScript包，管理项目依赖。"
    },
    {
      title: "MDN Web Docs",
      url: "https://developer.mozilla.org",
      icon: "fas fa-book",
      description: "权威的Web开发文档，HTML、CSS、JavaScript等技术的详细参考。"
    }
  ],
  news: [
    {
      title: "BBC News",
      url: "https://bbc.com/news",
      icon: "fas fa-globe",
      description: "英国广播公司新闻网，提供全球最新新闻、分析和深度报道。"
    },
    {
      title: "人民网",
      url: "https://people.com.cn",
      icon: "fas fa-newspaper",
      description: "中国权威新闻网站，提供国内外重要新闻、政策解读和时事评论。"
    },
    {
      title: "财经网",
      url: "https://caijing.com.cn",
      icon: "fas fa-chart-line",
      description: "专业财经资讯平台，股市行情、经济分析、投资理财信息。"
    },
    {
      title: "36氪",
      url: "https://36kr.com",
      icon: "fas fa-laptop",
      description: "科技创业媒体，关注互联网、创业公司、投资和新技术趋势。"
    }
  ],
  entertainment: [
    {
      title: "YouTube",
      url: "https://youtube.com",
      icon: "fab fa-youtube",
      description: "全球最大的视频分享平台，观看和分享各类视频内容。"
    },
    {
      title: "哔哩哔哩",
      url: "https://bilibili.com",
      icon: "fas fa-tv",
      description: "中国年轻人聚集的文化社区，动画、游戏、音乐、生活等内容。"
    },
    {
      title: "网易云音乐",
      url: "https://music.163.com",
      icon: "fas fa-music",
      description: "专业音乐平台，海量正版音乐，个性化推荐，音乐社交。"
    },
    {
      title: "Steam",
      url: "https://store.steampowered.com",
      icon: "fas fa-gamepad",
      description: "全球最大的PC游戏平台，购买、下载和游玩数千款游戏。"
    }
  ],
  uncategorized: []
};

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
      window.websites = websites;    
      window.categories = categories; // 添加别名      
      // 确保固定分类存在且位置正确
      ensureFixedCategories();
    } else {
      console.log('使用默认数据');
      // 如果localStorage中没有数据，使用默认数据
      categories = [...defaultCategories];
      websites = JSON.parse(JSON.stringify(defaultWebsites)); // 深拷贝
    }
    
    // 清空虚拟分类中的数据
    if (websites['pinned']) {
      websites['pinned'] = [];
    }
    if (websites['recent']) {
      websites['recent'] = [];
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
    window.websites = websites;    
    window.categories = categories; // 添加别名
    // 确保固定分类存在且位置正确
    ensureFixedCategories();
    

    
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

// 确保固定分类存在且位置正确
function ensureFixedCategories() {
  // 检查分类对象是否已经初始化
  if (!window.categories || !Array.isArray(window.categories)) {
    console.error('分类数据未正确初始化');
    return;
  }
  
  // 查找置顶分类、最近添加分类以及未分类分类
  let pinnedCategory = window.categories.find(cat => cat.id === 'pinned');
  let recentCategory = window.categories.find(cat => cat.id === 'recent');
  let uncategorizedCategory = window.categories.find(cat => cat.id === 'uncategorized');

  // 如果置顶分类不存在，添加它
  if (!pinnedCategory) {
    pinnedCategory = {
      id: "pinned",
      name: "置顶",
      icon: "fas fa-thumbtack",
      order: -3, // 使用负数确保始终排在最前面
      fixed: true
    };
    window.categories.push(pinnedCategory);
  }

  // 如果最近添加分类不存在，添加它
  if (!recentCategory) {
    recentCategory = {
      id: "recent",
      name: "最近添加",
      icon: "fas fa-clock",
      order: -2, // 使用负数确保始终排在第二位
      fixed: true
    };
    window.categories.push(recentCategory);
  }
  
  // 如果未分类分类不存在，添加它
  if (!uncategorizedCategory) {
    uncategorizedCategory = {
      id: "uncategorized",
      name: "未分类",
      icon: "fas fa-folder",
      order: 1000, // 使用很大的数字确保始终排在最后
      fixed: true
    };
    window.categories.push(uncategorizedCategory);
  }

  // 确保固定分类的属性和顺序正确，无论其他分类的order值如何
  pinnedCategory.order = -3; // 使用负数确保始终排在最前面
  pinnedCategory.fixed = true;
  
  recentCategory.order = -2; // 使用负数确保始终排在第二位
  recentCategory.fixed = true;
  
  uncategorizedCategory.order = 1000; // 使用很大的数字确保始终排在最后
  uncategorizedCategory.fixed = true;

  // 自定义排序函数，优先考虑固定分类的特殊位置
  window.categories.sort((a, b) => {

    
    // 对于其他分类，按照order值排序
    return a.order - b.order;
  });
  
  // 确保网站数据对象中包含置顶、最近添加和未分类的键
  if (!window.websites.pinned) {
    window.websites.pinned = [];
  }
  
  if (!window.websites.recent) {
    window.websites.recent = [];
  }
  
  if (!window.websites.uncategorized) {
    window.websites.uncategorized = [];
  }
}

// 渲染侧边栏分类列表
function renderCategoryList() {
  const categoriesContainer = document.querySelector('.categories-list');
  if (!categoriesContainer) return;
  
  let html = '';
  
  // 使用与ensureFixedCategories相同的排序逻辑
  const sortedCategories = [...categories].sort((a, b) => {
    // 如果是固定分类，按照特殊顺序排序
    if (a.id === 'pinned') return -1; // 置顶分类始终排在最前面
    if (b.id === 'pinned') return 1;
    
    if (a.id === 'recent') return -1; // 最近添加分类排在第二位
    if (b.id === 'recent') return 1;
    
    if (a.id === 'uncategorized') return 1; // 未分类分类始终排在最后
    if (b.id === 'uncategorized') return -1;
    
    // 对于其他分类，按照order值排序
    return a.order - b.order;
  });
  
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

// 导出数据到JSON文件
function exportData() {
  try {
    // 确保使用最新的数据
    let categoriesFromGlobal = window.categories || categories;
    let websitesFromGlobal = window.websites || websites;
    
    // 创建导出对象
    const exportData = {
      categories: categoriesFromGlobal,
      websites: websitesFromGlobal,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    // 转换为JSON字符串
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // 创建Blob对象
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `导航助手数据_${new Date().toISOString().slice(0, 10)}.json`;
    
    // 触发下载
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    return true;
  } catch (error) {
    console.error('导出数据出错:', error);
    alert('导出数据失败: ' + error.message);
    return false;
  }
}

// 从JSON文件导入数据
function importData(jsonFile) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      
      reader.onload = function(event) {
        try {
          // 解析JSON
          const importedData = JSON.parse(event.target.result);
          
          // 验证数据格式
          if (!importedData.categories || !importedData.websites) {
            throw new Error('导入的数据格式不正确，缺少必要的字段');
          }
          
          // 更新全局数据
          window.categories = importedData.categories;
          window.websites = importedData.websites;
          categories = importedData.categories;
          websites = importedData.websites;
          
          // 确保固定分类存在
          ensureFixedCategories();
          
          // 保存到localStorage
          localStorage.setItem('navSiteCategories', JSON.stringify(categories));
          localStorage.setItem('navSiteWebsites', JSON.stringify(websites));
          
          // 刷新UI
          if (typeof renderCategoryList === 'function') {
            renderCategoryList();
          }
          
          if (typeof loadWebsitesFromData === 'function') {
            loadWebsitesFromData();
          }
          
          resolve(true);
        } catch (error) {
          console.error('解析导入数据出错:', error);
          reject(error);
        }
      };
      
      reader.onerror = function() {
        reject(new Error('读取文件时出错'));
      };
      
      // 开始读取文件
      reader.readAsText(jsonFile);
    } catch (error) {
      console.error('导入数据出错:', error);
      reject(error);
    }
  });
}

// 创建导入导出UI
function createImportExportUI() {
  // 检查是否已经创建
  if (document.getElementById('import-export-container')) {
    return;
  }
  
  // 查找footer链接区域
  const footerLinks = document.querySelector('.footer-links');
  if (!footerLinks) {
    console.error('找不到footer-links元素');
    return;
  }
  
  // 创建导入导出按钮组
  const exportBtn = document.createElement('a');
  exportBtn.href = '#';
  exportBtn.className = 'footer-link export-data-btn';
  exportBtn.innerHTML = '<i class="fas fa-download"></i> 导出数据';
  
  const importBtn = document.createElement('label');
  importBtn.className = 'footer-link import-data-btn';
  importBtn.innerHTML = '<i class="fas fa-upload"></i> 导入数据 <input type="file" id="import-file" accept=".json" style="display: none;">';
  importBtn.style.cursor = 'pointer';
  
  // 添加到footer链接区域
  footerLinks.appendChild(exportBtn);
  footerLinks.appendChild(importBtn);
  
  // 添加事件监听
  exportBtn.addEventListener('click', (e) => {
    e.preventDefault();
    exportData();
  });
  
  const importFile = importBtn.querySelector('#import-file');
  importFile.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      // 显示加载中
      const originalText = importBtn.innerHTML;
      importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 导入中...';
      
      // 导入数据
      await importData(file);
      
      // 导入成功
      importBtn.innerHTML = '<i class="fas fa-check"></i> 导入成功';
      setTimeout(() => {
        importBtn.innerHTML = originalText;
      }, 2000);
      
      // 刷新页面
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      alert('导入数据失败: ' + error.message);
      
      // 重置按钮
      importBtn.innerHTML = '<i class="fas fa-upload"></i> 导入数据 <input type="file" id="import-file" accept=".json" style="display: none;">';
      
      // 重新绑定事件
      document.getElementById('import-file').addEventListener('change', arguments.callee);
    }
  });
}

// 页面加载时自动加载数据
document.addEventListener('DOMContentLoaded', function() {
  loadData();
  
  // 创建导入导出UI
  createImportExportUI();
});

// 导出保存函数以供其他脚本使用
window.saveNavData = saveNavData;
window.exportData = exportData;
window.importData = importData;

// 全局分类数据变量（已经在loadData中设置）
// window.categoryData = categories; 