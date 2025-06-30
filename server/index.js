/**
 * 欢迎使用 Cloudflare Workers! 这是你的第一个 worker.
 *
 * - 在终端运行 `npm run dev` 启动开发服务器
 * - 在浏览器打开 http://localhost:8787/ 查看你的 worker
 * - 运行 `npm run deploy` 发布你的 worker
 *
 * 了解更多：https://developers.cloudflare.com/workers/
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// 创建 Hono 应用
const app = new Hono();

// 启用CORS
app.use('*', cors());

// 处理根路径请求
app.get('/', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});


// 返回问候消息
app.get('/message', (c) => {
	return c.text('你好，世界！');
});

// 返回随机 UUID
app.get('/random', (c) => {
	return c.text(crypto.randomUUID());
});

// 网站分析API
app.post('/api/analyze-website', async (c) => {
  try {
    // 获取请求体中的URL和分类列表
    const { url, categories } = await c.req.json();

    if (!url) {
      return c.json({ error: '缺少URL参数' }, 400);
    }

    console.log('分析网站:', url);
    console.log('可用分类:', categories?.map(cat => cat.name).join(', ') || '无分类信息');

    // 抓取网页内容
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
				'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
				'Referer': 'https://www.google.com/search?q=' + encodeURIComponent(url)
      }
    });

    if (!response.ok) {
      return c.json({ error: '无法获取网页内容' }, 500);
    }

    // 获取跳转后的最终URL
    const finalUrl = response.url;

    const html = await response.text();

    // 提取网页标题
    let title = '';
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    // 提取网页描述
    let description = '';
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    if (descMatch && descMatch[1]) {
      description = descMatch[1].trim();
    }

    // 提取网页图标
    let icon = '';

    // 1. 优先从meta itemprop="image"提取
    const metaImageMatch = html.match(/<meta[^>]*content=["']?([^"'\s>]+)["']?[^>]*itemprop=["']?image["']?[^>]*>/i) ||
                           html.match(/<meta[^>]*itemprop=["']?image["']?[^>]*content=["']?([^"'\s>]+)["']?[^>]*>/i);

		// 2. 从alt="logo"的img标签提取
    const logoImgMatch = html.match(/<img[^>]*src=["']?([^"'\s>]+)["']?[^>]*alt=["']?logo["']?[^>]*>/i) ||
		html.match(/<img[^>]*alt=["']?logo["']?[^>]*src=["']?([^"'\s>]+)["']?[^>]*>/i);

    // 3. 尝试从apple-touch-icon提取
    const appleTouchIconMatch = html.match(/<link\s+[^>]*?rel=["']?apple-touch-icon["']?[^>]*?href=["']?([^"'\s>]+)["']?[^>]*?>/i) ||
                               html.match(/<link\s+[^>]*?href=["']?([^"'\s>]+)["']?[^>]*?rel=["']?apple-touch-icon["']?[^>]*?>/i);
    // 4. 尝试从link标签提取favicon
    const faviconMatch = html.match(/<link\s+[^>]*?rel=["']?(?:icon|shortcut icon)["']?[^>]*?href=["']?([^"'\s>]+)["']?[^>]*?>/i) ||
                         html.match(/<link\s+[^>]*?href=["']?([^"'\s>]+)["']?[^>]*?rel=["']?(?:icon|shortcut icon)["']?[^>]*?>/i);



    // 5. 获取第一个img标签的src（排除引号或反引号包裹的script字符串中的<img）
    const firstImgMatch = html.match(/(?:^|[^"'`])<img[^>]*src=["']?([^"'\s>]+)["']?[^>]*>/i);


    // 处理找到的图标URL
    if (metaImageMatch && metaImageMatch[1]) {
      // 处理meta itemprop="image"
      processIconUrl(metaImageMatch[1]);
    } else if (logoImgMatch && logoImgMatch[1]) {
      // 处理 img alt="logo"
      processIconUrl(logoImgMatch[1]);
    } else if (appleTouchIconMatch && appleTouchIconMatch[1]) {
      // 处理apple-touch-icon (优先于 favicon)
      processIconUrl(appleTouchIconMatch[1]);
    } else if (faviconMatch && faviconMatch[1]) {
      // 处理favicon
      processIconUrl(faviconMatch[1]);
    }  else if (firstImgMatch && firstImgMatch[1]) {
      // 处理第一个 img
      processIconUrl(firstImgMatch[1]);
    } else {
      // 如果没有找到图标，尝试检测默认favicon.ico是否存在
      const urlObj = new URL(finalUrl);
      const faviconUrl = `${urlObj.origin}/favicon.ico`;
      try {
        const headResp = await fetch(faviconUrl, { method: 'HEAD' });
        // 仅当请求成功且返回的是图片类型才使用
        if (headResp.ok) {
          const ct = headResp.headers.get('content-type') || '';
          if (ct.startsWith('image')) {
            icon = faviconUrl;
          }
        }
      } catch (_) {
        // 忽略错误，保持icon为空
      }
    }

    // 处理图标URL的函数
    function processIconUrl(iconUrl) {
      if (iconUrl.startsWith('//')) {
        // 处理协议相对URL（以//开头）
        const urlObj = new URL(finalUrl);
        icon = `${urlObj.protocol}${iconUrl}`;
      } else if (iconUrl.startsWith('/')) {
        // 处理根相对路径
        const urlObj = new URL(finalUrl);
        icon = `${urlObj.origin}${iconUrl}`;
      } else if (!iconUrl.startsWith('http')) {
        // 处理相对路径
        const urlObj = new URL(finalUrl);
        icon = `${urlObj.origin}/${iconUrl}`;
      } else {
        // 完整URL
        icon = iconUrl;
      }
    }

    // 提取meta关键词
    let keywords = '';
    const kwMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["'](.*?)["']/i);
    if (kwMatch && kwMatch[1]) {
      keywords = kwMatch[1].trim();
    }

    // 提取纯文本内容（用于AI分析）
    let plainContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000);

    // 使用Cloudflare AI分析网页内容
    // 注意：如果环境中没有配置AI，可以使用简单的规则判断分类
    let category = '';

    try {
      if (c.env.AI) {
        // 构建分类选项列表
        let categoryOptions = '';
        if (categories && categories.length > 0) {
          // 使用用户提供的分类
          categoryOptions = categories.map(cat => `${cat.name} (${cat.id})`).join('、');
        } else {
          // 使用默认分类
          categoryOptions = '社交媒体、实用工具、设计资源、开发技术、新闻资讯、娱乐休闲';
        }

        // 使用AI分析内容
        const input = `根据这个网页内容，确定最合适的分类（${categoryOptions}）:

        标题: ${title}
        描述: ${description}
        内容摘要: ${plainContent}

        请只返回一个最匹配的分类名称，不要包含任何解释。如果是自定义分类，请使用括号中的ID。`;
				console.log('AI输入:', input);

        const aiResponse = await c.env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
          messages: [
            { role: 'system', content: '你是一个网站分类助手。根据提供的网站内容，确定最适合的分类。只返回分类名称或ID，不要解释。' },
            { role: 'user', content: input }
          ]
        });

        // 提取AI返回的分类
        category = aiResponse.response.trim();
				console.log('AI返回的分类:', category);

        // 尝试匹配分类ID
        if (categories && categories.length > 0) {
          // 首先尝试直接匹配分类ID
          const exactIdMatch = categories.find(cat => cat.id.toLowerCase() === category.toLowerCase());
          if (exactIdMatch) {
            category = exactIdMatch.id;
          } else {
            // 尝试在分类名称中查找匹配项
            for (const cat of categories) {
              if (category.toLowerCase().includes(cat.name.toLowerCase()) ||
                  category.toLowerCase().includes(cat.id.toLowerCase())) {
                category = cat.id;
                break;
              }
            }

            // 如果仍然没有找到匹配，使用简单规则进行判断
            if (!categories.some(cat => cat.id === category)) {
              category = getCategoryByKeywords(title, description, html, categories);
            }
          }
        } else {
          // 如果没有提供分类，尝试映射到默认分类
          const categoryMapping = {
            '社交媒体': 'social',
            '实用工具': 'tools',
            '设计资源': 'design',
            '开发技术': 'dev',
            '新闻资讯': 'news',
            '娱乐休闲': 'entertainment'
          };

          // 遍历映射关系查找匹配
          let matched = false;
          for (const [key, value] of Object.entries(categoryMapping)) {
            if (category.includes(key)) {
              category = value;
              matched = true;
              break;
            }
          }

          // 如果没有匹配到预定义分类，默认为"未分类"
          if (!matched) {
            category = 'uncategorized';
          }
        }

        /* 使用 AI 生成简洁中文描述 */
        try {
          const descPrompt = `请根据以下网页信息，用简体中文生成不超过两句话的简洁描述，直接给出描述内容，不要包含"简洁描述"或类似前缀，也不要添加任何解释:\n标题: ${title}\n关键词: ${keywords}\n已有描述: ${description}\n正文内容: ${plainContent}`;

          console.log('AI描述输入:', descPrompt.substring(0, 500) + (descPrompt.length > 500 ? '...[截断]' : ''));

          const aiDescResp = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
            messages: [
              { role: 'system', content: '你是一个网页描述生成器。用于收藏网页时使用，请根据用户提供信息生成极简、连贯的中文总结，不超过两句，每句尽量简短。不要包含任何前缀或解释，如Here is the simplified summary: ' },
              { role: 'user', content: descPrompt }
            ]
          });

          let aiDesc = aiDescResp.response.trim();
          // 取前两句话，按中文句号、问号、感叹号或换行分割
          const parts = aiDesc.replace(/\n+/g, ' ').split(/[。！？.!?]$/).filter(p => p.trim());
          aiDesc = parts.slice(0, 2).join('。');
          if (!/[。！？.!?]$/.test(aiDesc)) {
            aiDesc += '。';
          }
          // 控制整体长度（可选）
          aiDesc = aiDesc.substring(0, 120);
          console.log('AI描述输出:', aiDesc);
          if (aiDesc) {
            description = aiDesc;
          }
        } catch (descErr) {
          console.error('AI 生成描述错误:', descErr);
        }
      } else {
        // 如果没有AI环境，使用简单规则判断分类
        category = getCategoryByKeywords(title, description, html, categories);
      }
    } catch (aiError) {
      console.error('AI分析错误:', aiError);
      // 发生错误时使用简单规则判断分类
      category = getCategoryByKeywords(title, description, html, categories);
    }

    // 如果仍未获得描述（当无AI或AI失败），生成简短描述
    if (!description) {
      // 提取网页中的第一段文本作为描述
      const paragraphMatch = html.match(/<p[^>]*>(.*?)<\/p>/is);
      if (paragraphMatch && paragraphMatch[1]) {
        let text = paragraphMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        description = text.substring(0, 100) + (text.length > 100 ? '...' : '');
      } else {
        description = title; // 没有找到合适的描述，使用标题
      }
    }

    // 返回分析结果
    return c.json({
      title,
      description,
      icon,
      category,
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



// 图片代理API - 解决跨域问题
app.get('/api/proxy-image', async (c) => {
  try {
    // 获取图片URL参数
    const imageUrl = c.req.query('url');

    if (!imageUrl) {
      return c.json({ error: '缺少图片URL参数' }, 400);
    }

    console.log('代理获取图片:', imageUrl);
		//获取图片的协议和域名，在referer中添加
		const imageUrlObj = new URL(imageUrl);

		const referer = imageUrlObj.protocol+'//' + imageUrlObj.host;
		console.log('referer:', referer);
    // 请求图片
    const response = await fetch(imageUrl, {
      headers: {
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
				'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
				'Referer': referer
      }
    });

    if (!response.ok) {
      return c.json({ error: '无法获取图片' }, 500);
    }


    // 获取图片内容类型
    const contentType = response.headers.get('content-type') || 'image/png';

    // 获取图片数据
    const imageData = await response.arrayBuffer();

    // 构造新的响应
    const newResponse = new Response(imageData, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      }
    });

    return newResponse;
  } catch (error) {
    console.error('代理图片错误:', error);
    return c.json({ error: '代理图片失败: ' + error.message }, 500);
  }
});

// 添加：处理所有静态资源请求
app.get('/*', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});

// 404 处理
app.notFound((c) => {
	return c.text('页面未找到', 404);
});

// 导出默认处理函数
export default {
	fetch: app.fetch,
};
