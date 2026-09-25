import { Hono } from 'hono';
import { isRateLimited } from '../lib/rate-limit.js';
import {
    classifyCategory,
    extractPageInfo,
    fetchPage,
    probeFavicon,
    summarizeDescription
} from '../lib/website-analyzer.js';

const app = new Hono();

// 每次识别要跑两轮大模型，接口又不鉴权，限流兜底
const ANALYZE_RATE_LIMIT_PER_MINUTE = 10;

// 抓取失败的原因直接展示给用户，方便判断是目标站拦截还是网址有问题
function describeFetchFailure({ failure, status }) {
  switch (failure) {
    case 'timeout': return '目标网站响应超时';
    case 'blocked': return `目标网站拒绝了服务器的访问（HTTP ${status}），请手动填写`;
    case 'http_error': return `目标网站返回错误（HTTP ${status}）`;
    case 'not_html': return '该网址不是网页';
    default: return '无法连接目标网站';
  }
}

// 网站分析API（网页端「AI识别」按钮）
// 抓取、解析、AI 的实现在 server/lib/website-analyzer.js，和 /api/v1 共用
app.post('/analyze-website', async (c) => {
  try {
    // 获取请求体中的URL和分类列表
    const { url, categories } = await c.req.json();

    if (!url) {
      return c.json({ error: '缺少URL参数' }, 400);
    }

    // 接口不鉴权，每次识别又要跑两轮大模型，限流兜底
    if (await isRateLimited(c, { scope: 'analyze', limit: ANALYZE_RATE_LIMIT_PER_MINUTE })) {
      return c.json({ error: '识别过于频繁，请稍后再试' }, 429);
    }

    console.log('分析网站:', url);
    console.log('可用分类:', categories?.map(cat => cat.name).join(', ') || '无分类信息');

    const page = await fetchPage(url, c.env);
    if (!page.ok) {
      return c.json({ error: describeFetchFailure(page) }, 502);
    }

    const info = extractPageInfo(page.html, page.finalUrl);
    const { title } = info;
    let { description } = info;
    const icon = info.icon || await probeFavicon(page.finalUrl);

    // 注意：如果环境中没有配置AI，使用简单的规则判断分类
    let category = '';
    let categoryConfidence = 'low';

    try {
      if (c.env.AI) {
        ({ category, confidence: categoryConfidence } = await classifyCategory(c.env, info, categories));

        /* 使用 AI 生成简洁中文描述 */
        try {
          const aiDesc = await summarizeDescription(c.env, info);
          if (aiDesc) {
            description = aiDesc;
          }
        } catch (descErr) {
          console.error('AI 生成描述错误:', descErr);
        }
      } else {
        category = getCategoryByKeywords(title, description, page.html, categories);
        categoryConfidence = 'fallback';
      }
    } catch (aiError) {
      console.error('AI分析错误:', aiError);
      // 发生错误时使用简单规则判断分类
      category = getCategoryByKeywords(title, description, page.html, categories);
      categoryConfidence = 'fallback';
    }

    // 如果仍未获得描述（当无AI或AI失败），用第一段正文，再不行用标题
    if (!description) {
      description = info.firstParagraph || title;
    }

    return c.json({
      title,
      description,
      icon,
      // 空串表示模型没判断出来，前端保持分类框不动并提示用户手选
      category,
      categoryConfidence,
      url
    });
  } catch (error) {
    console.error('网站分析错误:', error);
    return c.json({ error: '网站分析失败: ' + error.message }, 500);
  }
});

// 使用简单规则判断分类
function getCategoryByKeywords(title, description, html, categories) {
  const contentLower = (title + ' ' + description).toLowerCase();

  // 如果提供了自定义分类，尝试匹配这些分类
  if (categories && categories.length > 0) {
    // 基于关键词得分系统
    const categoryScores = {};

    // 初始化所有分类得分为0
    categories.forEach(cat => {
      categoryScores[cat.id] = 0;
    });

    // 为每个分类评分
    categories.forEach(cat => {
      // 使用分类名称作为关键词
      const catNameWords = cat.name.toLowerCase().split(/\s+/);
      catNameWords.forEach(word => {
        if (word.length > 2 && contentLower.includes(word)) {
          categoryScores[cat.id] += 10; // 分类名称中的词在内容中出现，加高分
        }
      });

      // 使用分类ID作为关键词
      if (contentLower.includes(cat.id.toLowerCase())) {
        categoryScores[cat.id] += 5;
      }
    });

    // 使用一些通用关键词来辅助分类
    const keywordCategories = {
      'social': ['社交', '微博', 'twitter', 'facebook', 'instagram', 'linkedin', '社区', '粉丝', '关注'],
      'tools': ['工具', '计算器', '转换器', '搜索', '查询', '地图', '天气', '翻译', '云盘'],
      'design': ['设计', '创意', '图片', '素材', '模板', '颜色', '字体', 'figma', 'sketch', 'photoshop'],
      'dev': ['编程', '开发', '代码', 'github', '程序', 'javascript', 'python', 'java', '框架'],
      'news': ['新闻', '资讯', '头条', '时事', '报道', '财经', '政治', '国际'],
      'entertainment': ['游戏', '娱乐', '视频', '影视', '音乐', '电影', '电视剧', '动漫']
    };

    // 根据关键词添加分数
    Object.entries(keywordCategories).forEach(([catId, keywords]) => {
      // 只有当这个分类ID在提供的分类列表中存在时才评分
      if (categories.some(cat => cat.id === catId)) {
        keywords.forEach(keyword => {
          if (contentLower.includes(keyword)) {
            categoryScores[catId] = (categoryScores[catId] || 0) + 3;
          }
        });
      }
    });

    // 找出得分最高的分类
    let maxScore = -1;
    let bestCategory = 'uncategorized';

    Object.entries(categoryScores).forEach(([catId, score]) => {
      if (score > maxScore) {
        maxScore = score;
        bestCategory = catId;
      }
    });

    // 如果所有分类得分都是0，返回"未分类"
    return maxScore > 0 ? bestCategory : 'uncategorized';
  }

  // 如果没有提供分类，使用默认逻辑
  if (/社交|微博|twitter|facebook|instagram|linkedin|社区|粉丝|关注|朋友圈/i.test(contentLower)) {
    return 'social';
  }

  if (/工具|计算器|转换器|搜索|查询|地图|天气|翻译|云盘|存储/i.test(contentLower)) {
    return 'tools';
  }

  if (/设计|创意|图片|素材|模板|颜色|字体|figma|sketch|photoshop|illustrator/i.test(contentLower)) {
    return 'design';
  }

  if (/编程|开发|代码|github|程序|javascript|python|java|框架|api|sdk|文档|开源/i.test(contentLower)) {
    return 'dev';
  }

  if (/新闻|资讯|头条|时事|报道|财经|政治|国际|国内|热点|事件/i.test(contentLower)) {
    return 'news';
  }

  if (/游戏|娱乐|视频|影视|音乐|电影|电视剧|动漫|综艺|直播|节目|明星/i.test(contentLower)) {
    return 'entertainment';
  }

  // 默认为未分类
  return 'uncategorized';
}

export default app;
