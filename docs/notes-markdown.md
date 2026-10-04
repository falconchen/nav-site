# 记事本 Markdown 渲染

## 背景与修复

Marked 遵循 CommonMark 的强调分隔符规则。中文标点前后不使用空格时，例如 `**Google-Extended 自己不抓任何东西。**它只是一张许可纸条`，结束星号可能不被识别，正文显示原始星号。带空格的 `**中文。** 下一句` 本来就可以解析。

使用 [marked-cjk-friendly](https://github.com/tats-u/markdown-cjk-friendly/tree/main/packages/marked-cjk-friendly) 扩展处理中文强调边界，保留 Marked 18.0.14。扩展注册到页面共用的 Marked 实例，因此详情页、编辑预览和公开页都使用相同规则。输入和存储的 Markdown 无需改写，代码块、行内代码和转义星号保留原文。

## 生成与维护

`marked` 和 `marked-cjk-friendly` 是锁定版本的开发依赖。`scripts/build-markdown-vendor.js` 保留 Marked 官方 UMD，使用现有 esbuild 打包扩展，生成 `public/vendor/marked.min.js`；两个依赖的 MIT 许可证随产物保留。产物提交到 Git，直接打开静态页面也不需要在线下载解析库。

```sh
npm ci
npm run build:markdown
npm run test:frontend
npm run build
git diff --check
```

`npm run build` 自动执行 Markdown 产物生成，再复制到 `dist/vendor`。调整依赖版本时更新锁文件、重新生成产物，并运行回归测试；不要直接修改生成文件。

## 验证与注意事项

`test/note-render.node.cjs` 使用实际 vendor 文件验证用户提供的完整原文、中文相邻标点、嵌套强调、链接、代码、转义字符、英文强调、GFM 表格和任务列表，并检查浏览器全局入口。

浏览器验证应覆盖详情页、编辑预览和 `/n/<公开 id>` 公开页，确认粗体变为 `<strong>`。同时用实际 `note-render.js` / DOMPurify 检查恶意 HTML、危险 URL 和输入框过滤。纯文本模式不应套用 Markdown 规则。

HTML 仍统一走 `NoteRender.renderNoteContent()` 的 DOMPurify 清洗。中文扩展只调整解析规则，不能代替安全过滤；不要直接把未过滤的 Marked 输出写入页面。
