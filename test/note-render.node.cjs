const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { marked } = require('../public/vendor/marked.min.js');
const parse = text => marked.parse(text, { gfm: true, breaks: true });

test('中文句号后直接接正文仍能结束列表粗体', () => {
    const html = parse(`他可能是这样想的："常规爬虫是管搜索的，AI 训练是另一拨爬虫，我挡掉搜索那拨、只放 AI 那拨进来就行。" 这个理解对 OpenAI/Perplexity 大致成立（它们确实有训练和检索两拨爬虫），但**对 Google 不成立**：

1. **Google-Extended 自己不抓任何东西。**它只是一张"许可纸条"，贴在 Googlebot 已经抓回去的内容上。如果 Googlebot 被 robots.txt 挡了，内容根本没进 Google 的门，纸条上写 Allow 也毫无意义——没有原材料可以标记。
2. **引用和训练都依赖同一次抓取。** Googlebot 抓回去 → 进索引 → AI Overviews 和 Gemini grounding 从索引里引用；同时 Google-Extended 的 Allow 决定这批内容能不能再进训练管线。源头是同一个。
3. **所以"想被用于 AI 训练"这个目标，恰恰要求把门开得更大**，而不是关上：robots.txt 里 Googlebot 必须放行，Google-Extended 也必须是 Allow（或至少不写 Disallow）。`);
    assert.match(html, /<li><strong>Google-Extended 自己不抓任何东西。<\/strong>它/);
    assert.match(html, /<li><strong>引用和训练都依赖同一次抓取。<\/strong> Googlebot/);
    assert.doesNotMatch(html, /\*\*/);
    assert.equal((html.match(/<strong>/g) || []).length, 4);
    assert.equal((html.match(/<li>/g) || []).length, 3);
});

test('保留用户提供的独立粗体和带空格的列表写法', () => {
    assert.match(parse('**Google-Extended 自己不抓任何东西。**'), /<strong>Google-Extended 自己不抓任何东西。<\/strong>/);
    assert.match(parse('2. **引用和训练都依赖同一次抓取。** Googlebot 抓回去'), /<ol start="2">\s*<li><strong>引用和训练都依赖同一次抓取。<\/strong>/);
});

test('中文相邻的引号、嵌套强调和链接保留 Markdown 语义', () => {
    assert.match(parse('中文**「重点」**接着写'), /中文<strong>「重点」<\/strong>接着写/);
    assert.match(parse('**重点含*斜体*。**下一句'), /<strong>重点含<em>斜体<\/em>。<\/strong>下一句/);
    assert.match(parse('**[链接](https://example.com)。**下一句'), /<strong><a href="https:\/\/example.com">链接<\/a>。<\/strong>下一句/);
});

test('行内代码、围栏代码、缩进代码和转义星号保留原文', () => {
    assert.match(parse('`**中文。**下一句`'), /<code>\*\*中文。\*\*下一句<\/code>/);
    assert.match(parse('```markdown\n**中文。**下一句\n```'), /<code class="language-markdown">\*\*中文。\*\*下一句/);
    assert.match(parse('    **中文。**下一句'), /<code>\*\*中文。\*\*下一句/);
    assert.match(parse('\\*\\*中文。\\*\\*下一句'), /\*\*中文。\*\*下一句/);
    assert.doesNotMatch(parse('** 未闭合。** 以及 **未闭合'), /<strong>/);
});

test('英文强调、GFM 表格和任务列表继续工作', () => {
    assert.match(parse('**bold** and *italic*'), /<strong>bold<\/strong> and <em>italic<\/em>/);
    assert.match(parse('| 标题 |\n| --- |\n| **内容。**下一句 |'), /<td><strong>内容。<\/strong>下一句<\/td>/);
    assert.match(parse('- [x] **完成。**下一项'), /type="checkbox"/);
});

test('浏览器全局入口具有同样的中文解析行为', () => {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/vendor/marked.min.js'), 'utf8'), context);
    assert.match(context.marked.parse('**中文。**下一句'), /<strong>中文。<\/strong>下一句/);
});
