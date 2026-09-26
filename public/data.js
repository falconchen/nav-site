// 网站数据
let categories = [];
let websites = {};

// 初始化全局变量，防止 script.js 在数据加载完成前访问出现 undefined
window.categories = categories;
window.websites = websites;
window.dataLoaded = null; // 将在 loadData 开始时被赋值为 Promise

// 默认网站数据（新用户首次打开时使用）
const defaultCategories = [
  {
    id: "ai",
    name: "AI 工具",
    icon: "fas fa-robot",
    order: 1
  },
  {
    id: "social",
    name: "社交媒体",
    icon: "fas fa-comments",
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
  ai: [
    {
      title: "ChatGPT",
      url: "https://chatgpt.com",
      icon: "fas fa-robot",
      description: "OpenAI 推出的 AI 助手，擅长对话、写作、编程、翻译和图片理解。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/MaE4BUgf.png",
      pinned: true
    },
    {
      title: "Claude",
      url: "https://claude.ai",
      icon: "fas fa-robot",
      description: "Anthropic 推出的 AI 助手，长文阅读、写作和编程能力出色。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/22/D2qEGqs8.png",
      pinned: true
    },
    {
      title: "Gemini",
      url: "https://gemini.google.com/app",
      icon: "fab fa-google",
      description: "Google 的 AI 助手，与搜索、Gmail、文档等 Google 服务深度打通。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/MEE6QMYn.webp",
      pinned: true
    },
    {
      title: "DeepSeek",
      url: "https://chat.deepseek.com",
      icon: "fas fa-brain",
      description: "深度求索推出的国产大模型对话助手，推理和代码能力强，免费使用。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EP29AcBs.webp",
      pinned: true
    },
    {
      title: "Kimi",
      url: "https://www.kimi.com",
      icon: "fas fa-robot",
      description: "月之暗面推出的 AI 助手，支持超长上下文，适合读长文和资料检索。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPL58r91.webp"
    },
    {
      title: "豆包",
      url: "https://www.doubao.com",
      icon: "fas fa-robot",
      description: "字节跳动推出的 AI 助手，覆盖聊天、写作、翻译和图片生成。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPC7wSMp.webp"
    },
    {
      title: "Perplexity",
      url: "https://www.perplexity.ai",
      icon: "fas fa-search",
      description: "AI 驱动的问答搜索引擎，回答时附带引用来源，方便核对。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPU0BbIh.webp"
    },
    {
      title: "Grok",
      url: "https://grok.com",
      icon: "fas fa-robot",
      description: "xAI 推出的 AI 助手，能实时获取 X 平台上的最新动态。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IDpAe4nX.webp"
    },
    {
      title: "Google AI Studio",
      url: "https://aistudio.google.com",
      icon: "fas fa-flask",
      description: "Google 面向开发者的 Gemini 模型试验场，可免费调试提示词并获取 API Key。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/ICTD42ko.webp"
    },
    {
      title: "GitHub Copilot",
      url: "https://github.com/copilot",
      icon: "fab fa-github",
      description: "GitHub 的 AI 编程助手，在网页里直接和代码仓库对话。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/MWF3dPI2.webp"
    },
    {
      title: "ModelScope 魔搭社区",
      url: "https://modelscope.cn",
      icon: "fas fa-cubes",
      description: "阿里达摩院的开源模型社区，提供模型下载、在线体验和免费推理额度。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IKbBf6n0.webp"
    },
    {
      title: "AI 编程橙皮书",
      url: "https://www.huasheng.ai/orange-books/",
      icon: "fas fa-book",
      description: "花叔编写的免费 AI 编程教程，涵盖 Claude Code、Cursor、Agent Skills 等。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/M7Y5Bx2R.webp"
    }
  ],
  social: [
    {
      title: "微博",
      url: "https://weibo.com",
      icon: "fab fa-weibo",
      description: "国内主流社交媒体平台，实时关注热点话题和明星动态。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPj2L3LX.webp"
    },
    {
      title: "X (Twitter)",
      url: "https://x.com",
      icon: "fab fa-twitter",
      description: "全球知名的社交网络平台，实时获取全球资讯和观点。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/ER75hNuS.webp"
    },
    {
      title: "知乎",
      url: "https://www.zhihu.com",
      icon: "fas fa-question-circle",
      description: "中文问答社区，各领域用户分享专业知识、经验和见解。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/M543IMiH.webp"
    },
    {
      title: "V2EX",
      url: "https://www.v2ex.com",
      icon: "fas fa-comments",
      description: "创意工作者社区，程序员聚集，讨论技术、工作和生活。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPh0VP28.webp"
    },
    {
      title: "小红书",
      url: "https://www.xiaohongshu.com",
      icon: "fas fa-book-open",
      description: "生活方式分享社区，找攻略、看测评、种草好物。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/ER9AnJZL.webp"
    },
    {
      title: "Reddit",
      url: "https://www.reddit.com",
      icon: "fab fa-reddit",
      description: "海外最大的论坛社区，几乎每个兴趣话题都有对应的板块。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPW13TMD.webp"
    },
    {
      title: "Instagram",
      url: "https://instagram.com",
      icon: "fab fa-instagram",
      description: "以图片和短视频为主的社交平台，分享生活瞬间、发现创意灵感。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/M9EAlnHW.webp"
    },
    {
      title: "LinkedIn",
      url: "https://linkedin.com",
      icon: "fab fa-linkedin",
      description: "全球最大的职业社交网络，建立专业人脉，寻找职业机会。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPN9hhGC.webp"
    }
  ],
  tools: [
    {
      title: "Google",
      url: "https://google.com",
      icon: "fab fa-google",
      description: "全球最大的搜索引擎，快速找到需要的信息和资源。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPH0j9h7.webp",
      pinned: true
    },
    {
      title: "Google 翻译",
      url: "https://translate.google.com",
      icon: "fas fa-language",
      description: "支持 100 多种语言的在线翻译，文本、文档、网页都能翻。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPeFsnbi.webp"
    },
    {
      title: "DeepL 翻译",
      url: "https://www.deepl.com/translator",
      icon: "fas fa-language",
      description: "译文自然流畅的 AI 翻译工具，适合翻译文章和正式文档。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EP77ndCr.webp"
    },
    {
      title: "百度网盘",
      url: "https://pan.baidu.com",
      icon: "fas fa-cloud",
      description: "个人云存储服务，存储和分享文件，多端随时访问。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IGp9F2DH.webp"
    },
    {
      title: "计算器",
      url: "https://calculator.net",
      icon: "fas fa-calculator",
      description: "200 多种在线计算工具，涵盖财务、健康、数学、单位换算等。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IJJEJkaI.webp"
    },
    {
      title: "IP.SB",
      url: "https://ip.sb",
      icon: "fas fa-network-wired",
      description: "查看本机 IPv4/IPv6 地址及归属地、运营商信息。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/M1N6g9Go.webp"
    },
    {
      title: "IP/DNS 泄露检测",
      url: "https://ipleak.net",
      icon: "fas fa-shield-alt",
      description: "检测 IP、DNS、WebRTC 是否泄露真实网络信息。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/MBSDUwGs.webp"
    },
    {
      title: "BrowserLeaks",
      url: "https://browserleaks.com/dns",
      icon: "fas fa-user-secret",
      description: "浏览器指纹与 DNS 泄露检测，查看网站能获取到你的哪些信息。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/MCQ5dYRU.webp"
    },
    {
      title: "播客 AI 总结",
      url: "https://www.latios.ai",
      icon: "fas fa-podcast",
      description: "用 AI 总结热门播客内容，支持中文，快速了解一期节目讲了什么。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/ILREXvNJ.webp"
    },
    {
      title: "PeaZip",
      url: "https://peazip.github.io",
      icon: "fas fa-file-archive",
      description: "免费开源的压缩解压工具，支持 ZIP、RAR、7Z、TAR 等 200 多种格式。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IDC0j8AR.webp"
    }
  ],
  design: [
    {
      title: "Figma",
      url: "https://figma.com",
      icon: "fab fa-figma",
      description: "协作式界面设计工具，支持实时协作、原型设计和设计系统管理。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IIIDreGT.webp",
      pinned: true
    },
    {
      title: "Dribbble",
      url: "https://dribbble.com",
      icon: "fab fa-dribbble",
      description: "设计师作品展示社区，寻找 UI、插画、品牌设计灵感。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPE9qdhv.webp"
    },
    {
      title: "Unsplash",
      url: "https://unsplash.com",
      icon: "fas fa-camera",
      description: "高质量免费图片库，可商用，适合各类设计项目。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/ICoFHreJ.webp"
    },
    {
      title: "Google Fonts",
      url: "https://fonts.google.com",
      icon: "fas fa-font",
      description: "免费开源字体库，可直接在网页中引用。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IM67ZaI2.webp"
    },
    {
      title: "Adobe Color",
      url: "https://color.adobe.com",
      icon: "fas fa-palette",
      description: "Adobe 的配色工具，按色彩规则生成配色方案，也能从图片提取颜色。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EP50FR1Z.webp"
    },
    {
      title: "Flat UI Colors",
      url: "https://flatuicolors.com",
      icon: "fas fa-swatchbook",
      description: "14 套扁平化配色、280 种颜色，点击即复制色值。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IDhDXgKo.webp"
    },
    {
      title: "UI UX Pro Max",
      url: "https://ui-ux-pro-max-skill.nextlevelbuilder.io",
      icon: "fas fa-magic",
      description: "给 AI 编程助手用的设计知识库，包含 UI 风格、配色、字体搭配和 UX 规范。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/MkW15W6u.webp"
    },
    {
      title: "Fabric 图标",
      url: "https://uifabricicons.azurewebsites.net",
      icon: "fas fa-icons",
      description: "微软 Office UI Fabric 图标集，可搜索和复制图标。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IDb6N1ag.webp"
    }
  ],
  dev: [
    {
      title: "GitHub",
      url: "https://github.com",
      icon: "fab fa-github",
      description: "全球最大的代码托管平台，开源项目和协作开发的聚集地。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/MWF3dPI2.webp",
      pinned: true
    },
    {
      title: "MDN Web Docs",
      url: "https://developer.mozilla.org",
      icon: "fab fa-firefox",
      description: "权威的 Web 技术文档，HTML、CSS、JavaScript 和浏览器 API 参考。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IIv0dhDU.webp",
      pinned: true
    },
    {
      title: "Stack Overflow",
      url: "https://stackoverflow.com",
      icon: "fab fa-stack-overflow",
      description: "全球最大的程序员问答社区，大部分报错都能在这里找到答案。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPa9Kf7n.webp"
    },
    {
      title: "NPM",
      url: "https://npmjs.com",
      icon: "fab fa-npm",
      description: "JavaScript 包管理平台，搜索和查看 Node.js 模块。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPREJfoY.webp"
    },
    {
      title: "Cloudflare Workers 文档",
      url: "https://developers.cloudflare.com/workers/",
      icon: "fas fa-cloud",
      description: "Cloudflare Workers 官方文档，边缘计算、KV、静态资源等配置说明。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/22/Hfq8RwjB.ico"
    },
    {
      title: "Claude Code 文档",
      url: "https://code.claude.com/docs/zh-CN/overview",
      icon: "fas fa-terminal",
      description: "Claude Code 官方中文文档，安装、配置、Skills 和常用工作流。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/M8iDS4tA.webp"
    },
    {
      title: "Smithery",
      url: "https://smithery.ai",
      icon: "fas fa-plug",
      description: "MCP 服务器目录，几分钟内把 AI Agent 连接到各种工具和服务。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/26KBqemd.webp"
    },
    {
      title: "Upstash",
      url: "https://upstash.com",
      icon: "fas fa-database",
      description: "Serverless 数据平台，按请求计费的 Redis、Kafka 和向量数据库。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/LvRFm302.webp"
    },
    {
      title: "渡渡鸟镜像同步站",
      url: "https://docker.aityp.com",
      icon: "fab fa-docker",
      description: "为国内用户同步 docker.io、gcr.io 等容器镜像，解决拉取慢的问题。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/25/K1XAXJSV.webp"
    },
    {
      title: "Nginx Proxy Manager",
      url: "https://nginxproxymanager.com",
      icon: "fas fa-server",
      description: "可视化管理 Nginx 反向代理，一键申请免费 SSL 证书。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/Mmc77vmH.webp"
    },
    {
      title: "阮一峰的网络日志",
      url: "https://www.ruanyifeng.com/blog/",
      icon: "fas fa-blog",
      description: "阮一峰的技术博客，前端、编程入门教程和每周科技周刊。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/IFV0jG2h.webp"
    },
    {
      title: "Linux 工具快速教程",
      url: "https://linuxtools-rst.readthedocs.io/zh-cn/latest/",
      icon: "fab fa-linux",
      description: "Linux 常用命令和工具的中文教程，分基础、进阶和工具参考三部分。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/MjD1083h.webp"
    }
  ],
  news: [
    {
      title: "Hacker News",
      url: "https://news.ycombinator.com",
      icon: "fab fa-hacker-news",
      description: "Y Combinator 旗下的科技新闻社区，硅谷程序员每天都在看。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/GAWCR7m0.webp"
    },
    {
      title: "少数派",
      url: "https://sspai.com",
      icon: "fas fa-pen-nib",
      description: "关注效率工具和数字生活的内容社区，软件推荐和使用技巧。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPY6NV5n.webp"
    },
    {
      title: "News Hacker｜极客洞察",
      url: "https://newshacker.me",
      icon: "fas fa-rss",
      description: "Hacker News 中文精选，AI、新产品、安全、编程等科技资讯。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/ICb66eZl.webp"
    },
    {
      title: "澎湃新闻",
      url: "https://www.thepaper.cn",
      icon: "fas fa-newspaper",
      description: "聚焦时政与思想的新闻平台，国内外要闻和深度报道。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPcAJexA.webp"
    },
    {
      title: "BBC News",
      url: "https://bbc.com/news",
      icon: "fas fa-globe",
      description: "英国广播公司新闻，提供全球新闻、分析和深度报道。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EOuBs74k.webp"
    }
  ],
  entertainment: [
    {
      title: "YouTube",
      url: "https://youtube.com",
      icon: "fab fa-youtube",
      description: "全球最大的视频平台，观看和分享各类视频内容。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/23/BluFktbs.webp",
      pinned: true
    },
    {
      title: "哔哩哔哩",
      url: "https://bilibili.com",
      icon: "fas fa-tv",
      description: "年轻人的视频社区，动画、游戏、知识、生活各类内容。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EOxCGL3E.webp",
      pinned: true
    },
    {
      title: "网易云音乐",
      url: "https://music.163.com",
      icon: "fas fa-music",
      description: "音乐平台，海量正版音乐和个性化推荐，评论区很有人情味。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPPBKHaO.webp"
    },
    {
      title: "豆瓣",
      url: "https://www.douban.com",
      icon: "fas fa-film",
      description: "书影音评分与兴趣社区，找好书、好电影前先看看豆瓣。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/26/EPA03vfo.webp"
    },
    {
      title: "Steam",
      url: "https://store.steampowered.com",
      icon: "fab fa-steam",
      description: "全球最大的 PC 游戏平台，购买、下载和游玩各类游戏。",
      imageData: "https://photo.pipi2047.eu.org/i/2026/09/19/MS6Cw1mi.webp"
    }
  ],
  uncategorized: []
};

// 新用户「访问最多」的初始次数，只在本机第一次打开时写入访问统计（见 visit-stats.js）
const defaultVisitCounts = {
  "https://chatgpt.com": 18,
  "https://claude.ai": 16,
  "https://github.com": 14,
  "https://google.com": 12,
  "https://youtube.com": 10,
  "https://bilibili.com": 9,
  "https://gemini.google.com/app": 8,
  "https://chat.deepseek.com": 7,
  "https://www.v2ex.com": 6,
  "https://developer.mozilla.org": 5,
  "https://www.zhihu.com": 4,
  "https://figma.com": 3
};

// 深拷贝默认网站并补上 addedTime：按分类轮流取，让「最近添加」各类都有，不被第一个分类占满
function createDefaultWebsites() {
  const result = JSON.parse(JSON.stringify(defaultWebsites));
  const lists = Object.values(result);
  const maxLength = Math.max(...lists.map(list => list.length));
  let time = Date.now();
  for (let i = 0; i < maxLength; i++) {
    lists.forEach(list => {
      if (list[i]) list[i].addedTime = time -= 60 * 1000;
    });
  }
  return result;
}

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
        websites = createDefaultWebsites();
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
      websites = createDefaultWebsites();
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
