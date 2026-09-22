import { Hono } from 'hono';
import * as htmlparser2 from 'htmlparser2';
import { isRateLimited } from '../lib/rate-limit.js';

const app = new Hono();

// 分类和描述用同一个模型。70B 支持 JSON 模式（response_format），
// 分类要的是稳定的结构化输出，不是文采，所以 temperature 给 0。
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// 每次识别要跑两轮大模型，接口又不鉴权，限流兜底
const ANALYZE_RATE_LIMIT_PER_MINUTE = 10;

// 分类只需要判断「这是个什么站」，不需要全文；描述是摘要任务，需要更多正文
const CONTENT_CHARS_FOR_CATEGORY = 800;
const CONTENT_CHARS_FOR_DESCRIPTION = 3000;

// 这些标签里的文本两份都不要
const HARD_SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'template']);

// 导航类结构区域：正文里最先出现的往往就是这些，对判断网站是什么毫无帮助
const CHROME_TAGS = new Set(['nav', 'header', 'footer', 'aside']);

// 过滤后正文短于这个长度就认为过滤过头了，退回未过滤的版本
const MIN_MAIN_CONTENT_CHARS = 200;

/**
 * 取 og:* 之类带 property 的 meta 内容，两种属性顺序都试
 */
function extractMetaProperty(html, property) {
    const value =
        html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
        html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'));
    return value && value[1] ? value[1].replace(/\s+/g, ' ').trim() : '';
}

/**
 * 取第一个 h1 的纯文本。比正文开头那堆菜单名有信息量得多。
 */
function extractHeading(html) {
    const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!match) return '';
    return match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

// 每个分类最多放几个已收录站点当样例，以及单条样例的长度上限。
// 5 个太少：实测 AIGC 有 50 个站点，按权重取前 5 全是对话类产品，
// 覆盖不到里面一大簇 AI 相关的 GitHub 仓库，导致那些站点被判去「开发技术」。
const MAX_SAMPLES_PER_CATEGORY = 12;
const MAX_SAMPLE_CHARS = 60;

/**
 * 把前端传来的分类列表整理成编号候选
 *
 * 关键点：给模型看的是分类**名称**和已收录站点，不是 id。
 * 用户会改分类名而 id 不变（比如「社交媒体」改成 AIGC 但 id 还是 social），
 * 让模型输出 id 会被这种错位带偏；改成输出编号后，id 只在服务端做下标映射。
 *
 * @param {Array} categories 前端传的 [{id, name, samples?}]
 * @returns {{list: Array, prompt: string}}
 */
function buildCategoryCandidates(categories) {
    const list = categories
        .filter(cat => cat && cat.id && cat.name)
        .map(cat => ({
            id: String(cat.id),
            name: String(cat.name).slice(0, 40),
            // 前端传什么都做一次防御性裁剪，避免撑爆 prompt
            samples: Array.isArray(cat.samples)
                ? cat.samples
                    .filter(sample => typeof sample === 'string' && sample.trim())
                    .slice(0, MAX_SAMPLES_PER_CATEGORY)
                    .map(sample => sample.trim().slice(0, MAX_SAMPLE_CHARS))
                : []
        }));

    const prompt = list.map((cat, index) => {
        const line = `${index + 1}. ${cat.name}`;
        // 样例是「稍后阅读」「工作相关」这类个人分类唯一的判断依据：
        // 这些分类光看网页内容判断不出来，只能看用户已经怎么分的
        return cat.samples.length
            ? `${line}\n   已收录：${cat.samples.join('、')}`
            : line;
    }).join('\n');

    return { list, prompt };
}

/**
 * 解析模型返回的分类结果
 *
 * @param {*} raw AI.run 的返回
 * @param {Array} list buildCategoryCandidates 产出的候选列表
 * @returns {{category: string, confidence: string}} category 为空串表示没判断出来
 */
function parseCategoryResponse(raw, list) {
    const text = typeof raw === 'string' ? raw : (raw && raw.response);
    if (!text) {
        return { category: '', confidence: 'low' };
    }

    let index = null;
    let confidence = 'low';

    try {
        const parsed = typeof text === 'object' ? text : JSON.parse(text);
        index = parsed.category_index;
        confidence = parsed.confidence || 'low';
    } catch {
        // JSON 模式偶尔会失手（比如裹在 ``` 里），退一步从文本里抠第一个数字
        const match = String(text).match(/\d+/);
        if (match) {
            index = parseInt(match[0], 10);
            confidence = 'medium';
        }
    }

    // 低置信度不自作主张，宁可留空让用户自己选——错分比不分更烦
    if (confidence === 'low') {
        return { category: '', confidence: 'low' };
    }

    const position = Number(index);
    if (!Number.isInteger(position) || position < 1 || position > list.length) {
        return { category: '', confidence: 'low' };
    }

    return { category: list[position - 1].id, confidence };
}

// 网站分析API
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

		const urlObj = new URL(url);

    // 抓取网页内容
    const response = await fetch(url, {
      headers: {
        'User-Agent': c.env.USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
				'Accept-Language': c.env.ACCEPT_LANGUAGE || 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',

				'Referer': 'https://www.google.com/search?q=' + encodeURIComponent(urlObj.host),

      }
    });

    if (!response.ok) {
      return c.json({ error: '无法获取网页内容' }, 500);
    }

    // 获取跳转后的最终URL。没有跳转信息时退回请求的 URL，
    // 否则下面拼相对图标地址的 new URL() 会抛
    const finalUrl = response.url || url;

    const html = await response.text();

    // 提取网页标题
    let title = '';
    const titleMatch = html.match(/<title>(.*?)<\/title>/is);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/\s+/g, ' ').trim();
    }

    // 提取网页描述
    let description = '';
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/is);
    if (descMatch && descMatch[1]) {
      description = descMatch[1].replace(/\s+/g, ' ').trim();
    }
    // 不少站点只写 og:description 不写 meta description
    if (!description) {
      description = extractMetaProperty(html, 'og:description');
    }

    // 这两个字段信息密度远高于正文开头那堆菜单名
    const siteName = extractMetaProperty(html, 'og:site_name');
    const heading = extractHeading(html);

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
    //
    // 同时收两份：mainContent 跳过导航/页头页脚这些结构性区域，allContent 只跳
    // script/style。因为取的是正文「前 N 字」，而现代网站 body 里最先出现的文本
    // 几乎必然是导航栏和菜单名——实测 github.com 的前 800 字全是
    // "Skip to content Navigation Menu Sign in Platform..." 这种，喂给模型纯属噪声。
    let mainContent = '';
    let allContent = '';
    let hardSkipDepth = 0;   // script/style 等，两份都不要
    let chromeSkipDepth = 0; // 导航类区域，只有 mainContent 不要

    const parser = new htmlparser2.Parser({
        onopentagname(name) {
            if (HARD_SKIP_TAGS.has(name)) hardSkipDepth++;
            else if (CHROME_TAGS.has(name)) chromeSkipDepth++;
        },
        ontext(text) {
            if (hardSkipDepth > 0) return;
            allContent += text + ' ';
            if (chromeSkipDepth === 0) mainContent += text + ' ';
        },
        onclosetag(name) {
            // 用计数而不是布尔量，嵌套时才不会提前解除跳过
            if (HARD_SKIP_TAGS.has(name) && hardSkipDepth > 0) hardSkipDepth--;
            else if (CHROME_TAGS.has(name) && chromeSkipDepth > 0) chromeSkipDepth--;
        }
    }, { decodeEntities: true });
    parser.write(html);
    parser.end();

    const cleanedMain = mainContent.replace(/\s+/g, ' ').trim();
    const cleanedAll = allContent.replace(/\s+/g, ' ').trim();

    // 有些站点整页都塞在 header/aside 里，过滤后就没东西了，这时退回未过滤版本
    const plainContent = cleanedMain.length >= MIN_MAIN_CONTENT_CHARS ? cleanedMain : cleanedAll;
    console.log(`正文提取: 过滤后 ${cleanedMain.length} 字 / 未过滤 ${cleanedAll.length} 字，采用${cleanedMain.length >= MIN_MAIN_CONTENT_CHARS ? '过滤后' : '未过滤'}`);

    // 两个任务要的正文长度不一样：分类塞太多正文会被导航栏、页脚、广告
    // 这些噪声把「选一个分类」的指令冲淡，描述则确实需要更多上下文
    const contentForCategory = plainContent.substring(0, CONTENT_CHARS_FOR_CATEGORY);
    const contentForDescription = plainContent.substring(0, CONTENT_CHARS_FOR_DESCRIPTION);

    // 使用Cloudflare AI分析网页内容
    // 注意：如果环境中没有配置AI，可以使用简单的规则判断分类
    let category = '';
    let categoryConfidence = 'low';

    try {
      if (c.env.AI) {
        // 候选分类用编号列出，模型返回编号，服务端按下标映射回 id。
        // 不让模型输出 id：用户改了分类名但 id 不变（「社交媒体」改成 AIGC、
        // id 仍是 social），输出 id 会被这种错位带偏；编号制还顺带消灭了
        // 原来那套「模型输出里包含分类名就算命中」的子串匹配。
        const { list: candidates, prompt: candidatePrompt } = buildCategoryCandidates(categories || []);

        if (candidates.length === 0) {
          // 没有可选分类就没什么好判断的
          category = '';
          categoryConfidence = 'low';
        } else {
          // 空字段不进 prompt，省 token 也少一点干扰
          const siteInfo = [
            ['域名', urlObj.host],
            ['站点名', siteName],
            ['标题', title],
            ['主标题', heading],
            ['描述', description],
            ['关键词', keywords],
            ['正文摘要', contentForCategory]
          ].filter(([, value]) => value && String(value).trim())
           .map(([label, value]) => `${label}：${value}`)
           .join('\n');

          const input = `请判断这个网站应该归到哪个分类。

候选分类：
${candidatePrompt}

待分类网站：
${siteInfo}

判断规则：
1. 优先对照各分类下「已收录」的站点。分类名可能是个人化的（比如「稍后阅读」
   「工作相关」），光看网站内容判断不出来，只能看用户实际把什么样的站点放进去了。
2. 一个站点同时符合多个分类时，选已收录样例里最相似的那个，而不是主题上最宽泛的那个。
   比如一个讲 AI 工具的 GitHub 仓库，如果某个分类的样例里已经有很多 AI 相关仓库，
   就该归到那个分类，而不是笼统归到「开发技术」。
3. 确实对不上任何分类的样例风格，confidence 返回 low，不要硬猜。

返回该分类的编号。`;

          console.log('AI分类输入:', input.substring(0, 800));

          const aiResponse = await c.env.AI.run(AI_MODEL, {
            messages: [
              { role: 'system', content: '你是网站分类助手。从候选分类中选出最匹配的一个，返回它的编号。只有在确实匹配时才给出 high 或 medium 置信度；拿不准就返回 low，不要硬猜。' },
              { role: 'user', content: input }
            ],
            temperature: 0,
            response_format: {
              type: 'json_schema',
              json_schema: {
                type: 'object',
                properties: {
                  category_index: { type: 'integer' },
                  confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
                },
                required: ['category_index', 'confidence']
              }
            }
          });

          const parsed = parseCategoryResponse(aiResponse, candidates);
          category = parsed.category;
          categoryConfidence = parsed.confidence;
          console.log('AI返回的分类:', category || '(未判断)', categoryConfidence);
        }


        /* 使用 AI 生成简洁中文描述 */
        try {
          const descPrompt = `请根据以下网页信息，用简体中文生成不超过两句话的简洁总结，直接给出描述内容，不要包含"简洁总结"或类似前缀，也不要添加任何解释:\n标题: ${title}\n关键词: ${keywords}\n描述: ${description}\n正文内容: ${contentForDescription}`;

          console.log('AI描述输入:', descPrompt.substring(0, 500) + (descPrompt.length > 500 ? '...[截断]' : ''));

          const aiDescResp = await c.env.AI.run(AI_MODEL, {
            messages: [
              { role: 'system', content: '你是一个网页描述生成器。用于收藏网页时使用，请根据用户提供信息生成极简、连贯的中文总结，不超过两句，每句尽量简短。不要包含任何前缀或解释，如Here is the simplified summary: ' },
              { role: 'user', content: descPrompt }
            ],
            temperature: 0.3
          });

          let aiDesc = (aiDescResp && aiDescResp.response || '').trim();
          // 取前两句。原来的正则带 $ 锚点，只能匹配整串末尾的一个标点，
          // 所以永远只切出 1 段，"取前两句"是失效的；改成按句末标点切分并保留标点。
          const parts = aiDesc
            .replace(/\n+/g, ' ')
            .split(/(?<=[。！？.!?])/)
            .map(p => p.trim())
            .filter(Boolean);
          aiDesc = parts.slice(0, 2).join('');
          if (aiDesc && !/[。！？.!?]$/.test(aiDesc)) {
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
        categoryConfidence = 'fallback';
      }
    } catch (aiError) {
      console.error('AI分析错误:', aiError);
      // 发生错误时使用简单规则判断分类
      category = getCategoryByKeywords(title, description, html, categories);
      categoryConfidence = 'fallback';
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
