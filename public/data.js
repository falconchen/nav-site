// 网站数据
let categories = [];
let websites = {};

// 初始化全局变量，防止 script.js 在数据加载完成前访问出现 undefined
window.categories = categories;
window.websites = websites;
window.dataLoaded = null; // 将在 loadData 开始时被赋值为 Promise

// 默认网站数据
const defaultCategories = [
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
// 从存储加载数据或使用默认数据
async function loadData() {
  if (window.dataLoaded) return window.dataLoaded;

  window.dataLoaded = (async () => {
    try {
      console.log('📂 Starting loadData from storage...');
      // 尝试从 IndexedDB 加载
      let savedCategories = await dbStorage.getItem('navSiteCategories');
      let savedWebsites = await dbStorage.getItem('navSiteWebsites');

      // 迁移逻辑：如果 IndexedDB 没数据但 localStorage 有，则迁移
      if (!savedCategories || !savedWebsites) {
        console.log('🔍 Checking for data in localStorage to migrate...');
        const lsCategories = localStorage.getItem('navSiteCategories');
        const lsWebsites = localStorage.getItem('navSiteWebsites');

        if (lsCategories && lsWebsites) {
          console.log('🚚 Migrating data from localStorage to IndexedDB...');
          try {
            savedCategories = JSON.parse(lsCategories);
            savedWebsites = JSON.parse(lsWebsites);

            // 存入 IndexedDB
            await dbStorage.setItem('navSiteCategories', savedCategories);
            await dbStorage.setItem('navSiteWebsites', savedWebsites);
          } catch (e) {
            console.error('Migration JSON parse error:', e);
          }
        }
      }

      if (savedCategories && savedWebsites) {
        categories = typeof savedCategories === 'string' ? JSON.parse(savedCategories) : savedCategories;
        websites = typeof savedWebsites === 'string' ? JSON.parse(savedWebsites) : savedWebsites;
      } else {
        // 如果没有存储的数据，使用默认数据
        console.log('ℹ️ No stored data found, using defaults');
        categories = [...defaultCategories];
        websites = JSON.parse(JSON.stringify(defaultWebsites)); // 深拷贝
      }

      // 同步到全局变量
      window.websites = websites;
      window.categories = categories;

      // 确保固定分类存在，并剥掉旧数据里的虚拟分类
      ensureFixedCategories();

      console.log('✅ loadData completed');

      // 渲染分类列表
      if (typeof renderCategoryList === 'function') {
        renderCategoryList();
      }

      return { categories, websites };
    } catch (error) {
      console.error('❌ 加载数据出错:', error);
      categories = [...defaultCategories];
      websites = JSON.parse(JSON.stringify(defaultWebsites));
      window.websites = websites;
      window.categories = categories;
      ensureFixedCategories();

      if (typeof renderCategoryList === 'function') {
        renderCategoryList();
      }
      return { categories, websites };
    }
  })();

  return window.dataLoaded;
}

// 旧版本把「置顶」「最近添加」当成分类存在数据里，现在它们是由 website.pinned /
// website.addedTime 派生出来的视图，不再是分类
const LEGACY_VIRTUAL_CATEGORY_IDS = ['pinned', 'recent'];

// 规范化分类数据：剥掉旧数据里的虚拟分类，确保「未分类」存在且排在最后。
// 本地加载、导入、云端下载都要经过这里。原地修改数组，因为 categories 这个
// 全局绑定被其它脚本直接引用
function ensureFixedCategories() {
  // 检查分类对象是否已经初始化
  if (!window.categories || !Array.isArray(window.categories)) {
    console.error('分类数据未正确初始化');
    return;
  }

  for (let i = window.categories.length - 1; i >= 0; i--) {
    if (LEGACY_VIRTUAL_CATEGORY_IDS.includes(window.categories[i].id)) {
      window.categories.splice(i, 1);
    }
  }
  if (window.websites) {
    LEGACY_VIRTUAL_CATEGORY_IDS.forEach(id => delete window.websites[id]);
  }

  let uncategorizedCategory = window.categories.find(cat => cat.id === 'uncategorized');
  if (!uncategorizedCategory) {
    uncategorizedCategory = {
      id: "uncategorized",
      name: "未分类",
      icon: "fas fa-folder",
      fixed: true
    };
    window.categories.push(uncategorizedCategory);
  }
  uncategorizedCategory.order = 1000; // 使用很大的数字确保始终排在最后
  uncategorizedCategory.fixed = true;

  window.categories.sort((a, b) => a.order - b.order);

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

// 保存数据到存储（优先使用 IndexedDB）
async function saveNavData() {
  try {
    let categoriesFromGlobal = null;
    if (window.categories) {
      categoriesFromGlobal = window.categories;
    }

    if (categoriesFromGlobal) {
      categories = categoriesFromGlobal;
    }

    // 同步websites变量
    if (window.websites) {
      websites = window.websites;
    }

    // 保存到 IndexedDB
    await dbStorage.setItem('navSiteCategories', categories);
    await dbStorage.setItem('navSiteWebsites', websites);

    // 同时尝试保存到 localStorage 作为备份（仅当数据较小时）
    try {
      const catStr = JSON.stringify(categories);
      const webStr = JSON.stringify(websites);
      // 如果数据总量 < 4MB，尝试同步到 localStorage
      if (catStr.length + webStr.length < 4 * 1024 * 1024) {
        localStorage.setItem('navSiteCategories', catStr);
        localStorage.setItem('navSiteWebsites', webStr);
      }
    } catch (e) {
      // 如果 localStorage 满了，不报错，因为 IndexedDB 已经保存成功了
      console.warn('Backup to localStorage failed (probably full), but data is safe in IndexedDB');
    }

    // 只在非云端更新时触发数据变化事件
    if (!window.isUpdatingFromCloud) {
      const dataChangedEvent = new CustomEvent('dataChanged', {
        detail: { categories, websites }
      });
      document.dispatchEvent(dataChangedEvent);
    }
  } catch (error) {
    console.error('保存数据出错:', error);
  }
}

// 兼容函数 - 为auth.js提供
function saveCategoriesToStorage() {
  saveNavData();
}

function saveWebsitesToStorage() {
  saveNavData();
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

      reader.onload = function (event) {
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

      reader.onerror = function () {
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

  // 创建历史版本选择按钮
  const cloudOverrideBtn = document.createElement('a');
  cloudOverrideBtn.href = '#';
  cloudOverrideBtn.className = 'footer-link cloud-override-btn';
  cloudOverrideBtn.innerHTML = '<i class="fas fa-history"></i> 历史版本';
  cloudOverrideBtn.style.display = 'none'; // 默认隐藏，只有登录后才显示

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
  footerLinks.appendChild(cloudOverrideBtn);
  footerLinks.appendChild(exportBtn);
  footerLinks.appendChild(importBtn);

  // 添加事件监听
  cloudOverrideBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof loadUserDataFromCloud === 'function') {
      loadUserDataFromCloud();
    }
  });

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
document.addEventListener('DOMContentLoaded', async function () {
  await loadData();

  // 创建导入导出UI
  createImportExportUI();
});

// 显示/隐藏云端覆盖按钮
function toggleCloudOverrideButton(show) {
  const cloudOverrideBtn = document.querySelector('.cloud-override-btn');
  if (cloudOverrideBtn) {
    cloudOverrideBtn.style.display = show ? 'inline-flex' : 'none';
  }
}

// 导出保存函数以供其他脚本使用
window.saveNavData = saveNavData;
window.exportData = exportData;
window.importData = importData;
window.toggleCloudOverrideButton = toggleCloudOverrideButton;

// 全局分类数据变量（已经在loadData中设置）
// window.categoryData = categories;
