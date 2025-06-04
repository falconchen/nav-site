// 网站数据
const categories = [
  {
    id: "social",
    name: "社交媒体",
    icon: "fab fa-twitter",
    order: 0
  },
  {
    id: "tools",
    name: "实用工具",
    icon: "fas fa-tools",
    order: 1
  },
  {
    id: "design",
    name: "设计资源",
    icon: "fas fa-palette",
    order: 2
  },
  {
    id: "dev",
    name: "开发技术",
    icon: "fas fa-code",
    order: 3
  },
  {
    id: "news",
    name: "新闻资讯",
    icon: "fas fa-newspaper",
    order: 4
  },
  {
    id: "entertainment",
    name: "娱乐休闲",
    icon: "fas fa-gamepad",
    order: 5
  }
];

const websites = {
  social: [
    {
      title: "微博",
      url: "weibo.com",
      icon: "fab fa-weibo",
      description: "中国最大的社交媒体平台，实时分享生活动态，关注热点话题和明星动态。"
    },
    {
      title: "Twitter",
      url: "twitter.com",
      icon: "fab fa-twitter",
      description: "全球知名的微博客和社交网络服务平台，实时获取全球资讯和观点。"
    },
    {
      title: "Instagram",
      url: "instagram.com",
      icon: "fab fa-instagram",
      description: "以图片和视频为主的社交平台，分享生活美好瞬间，发现创意灵感。"
    },
    {
      title: "LinkedIn",
      url: "linkedin.com",
      icon: "fab fa-linkedin",
      description: "全球最大的职业社交网络，建立专业人脉，寻找职业机会。"
    }
  ],
  tools: [
    {
      title: "Google",
      url: "google.com",
      icon: "fab fa-google",
      description: "全球最大的搜索引擎，快速找到您需要的任何信息和资源。"
    },
    {
      title: "Google 翻译",
      url: "translate.google.com",
      icon: "fas fa-translate",
      description: "支持100多种语言的在线翻译工具，文本、图片、语音翻译一应俱全。"
    },
    {
      title: "百度网盘",
      url: "pan.baidu.com",
      icon: "fas fa-cloud",
      description: "个人云存储服务，安全存储和分享您的文件，随时随地访问。"
    },
    {
      title: "计算器",
      url: "calculator.net",
      icon: "fas fa-calculator",
      description: "在线科学计算器，支持基础运算、科学计算、单位转换等功能。"
    }
  ],
  design: [
    {
      title: "Figma",
      url: "figma.com",
      icon: "fab fa-figma",
      description: "协作式界面设计工具，实时协作，原型设计，设计系统管理。"
    },
    {
      title: "Unsplash",
      url: "unsplash.com",
      icon: "fas fa-images",
      description: "高质量免费图片素材库，数百万张精美照片供您免费下载使用。"
    },
    {
      title: "Adobe Color",
      url: "color.adobe.com",
      icon: "fas fa-paint-brush",
      description: "专业的配色工具，创建、探索和分享完美的色彩搭配方案。"
    },
    {
      title: "Google Fonts",
      url: "fonts.google.com",
      icon: "fas fa-font",
      description: "免费的网络字体库，提供数百种优质字体供网站和应用使用。"
    }
  ],
  dev: [
    {
      title: "GitHub",
      url: "github.com",
      icon: "fab fa-github",
      description: "全球最大的代码托管平台，版本控制、协作开发、开源项目分享。"
    },
    {
      title: "Stack Overflow",
      url: "stackoverflow.com",
      icon: "fab fa-stack-overflow",
      description: "程序员问答社区，解决编程问题，分享技术知识和经验。"
    },
    {
      title: "NPM",
      url: "npmjs.com",
      icon: "fab fa-npm",
      description: "Node.js包管理器，发现和安装JavaScript包，管理项目依赖。"
    },
    {
      title: "MDN Web Docs",
      url: "developer.mozilla.org",
      icon: "fas fa-book",
      description: "权威的Web开发文档，HTML、CSS、JavaScript等技术的详细参考。"
    }
  ],
  news: [
    {
      title: "BBC News",
      url: "bbc.com/news",
      icon: "fas fa-globe",
      description: "英国广播公司新闻网，提供全球最新新闻、分析和深度报道。"
    },
    {
      title: "人民网",
      url: "people.com.cn",
      icon: "fas fa-newspaper",
      description: "中国权威新闻网站，提供国内外重要新闻、政策解读和时事评论。"
    },
    {
      title: "财经网",
      url: "caijing.com.cn",
      icon: "fas fa-chart-line",
      description: "专业财经资讯平台，股市行情、经济分析、投资理财信息。"
    },
    {
      title: "36氪",
      url: "36kr.com",
      icon: "fas fa-laptop",
      description: "科技创业媒体，关注互联网、创业公司、投资和新技术趋势。"
    }
  ],
  entertainment: [
    {
      title: "YouTube",
      url: "youtube.com",
      icon: "fab fa-youtube",
      description: "全球最大的视频分享平台，观看和分享各类视频内容。"
    },
    {
      title: "哔哩哔哩",
      url: "bilibili.com",
      icon: "fas fa-tv",
      description: "中国年轻人聚集的文化社区，动画、游戏、音乐、生活等内容。"
    },
    {
      title: "网易云音乐",
      url: "music.163.com",
      icon: "fas fa-music",
      description: "专业音乐平台，海量正版音乐，个性化推荐，音乐社交。"
    },
    {
      title: "Steam",
      url: "store.steampowered.com",
      icon: "fas fa-gamepad",
      description: "全球最大的PC游戏平台，购买、下载和游玩数千款游戏。"
    }
  ]
};

// 为了兼容现有代码，保留websitesData变量
let websitesData = websites;

// 初始化全局分类数据
window.categoryData = categories; 