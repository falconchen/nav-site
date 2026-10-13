# 皮皮2047 收藏助手（Chrome / Firefox 扩展）

把当前网页收藏到导航站，AI 自动补全名称、分类和描述。调用的是导航站的 REST API v1，接口说明见 [../docs/REST_API.md](../docs/REST_API.md)。

## 安装

1. Chrome 打开 `chrome://extensions`，右上角打开「开发者模式」
2. 点「加载已解压的扩展程序」，选择这个 `extension/` 目录
3. 首次安装会自动打开设置页：
   - **导航站地址**：默认 `https://pipi2047.eu.org`；本地开发填 `127.0.0.1:8787`（本机地址自动补 `http://`，其它补 `https://`）
   - **个人令牌**：导航站网页端登录后，右上角用户菜单 →「个人令牌」生成
   - 点「保存」时会先调 `/api/v1/me` 验证，验证通过才保存

改了代码后在 `chrome://extensions` 里点扩展卡片上的刷新按钮即可。

## Firefox

Firefox 版和 Chrome 版共用这个目录的代码，只有 manifest 不同，由构建脚本生成，不要另外改一份：

```bash
npm run build:firefox   # 在 nav-site/ 下执行，生成 extension-firefox/（已 gitignore）
```

脚本把 Chrome 的 manifest 改成 Firefox 能用的：后台从 service worker 改成事件页（`background.scripts`）、
`options_page` 改成 `options_ui`，并加上扩展 id、最低版本 140（ESR）和自动更新地址 `update_url`。版本号直接沿用 Chrome 的。

- **临时加载**：Firefox 打开 `about:debugging#/runtime/this-firefox` →「临时载入附加组件」，选 `extension-firefox/manifest.json`。重启浏览器后失效
- **长期安装**：正式版 Firefox 只装签过名的扩展。用 AMO 签名、不上架（unlisted），只给自己装：
  1. 用 Firefox 账号登录 <https://addons.mozilla.org/developers/addon/api/key/> 生成 API 密钥（JWT issuer 和 secret）
  2. 把密钥放进环境变量 `WEB_EXT_API_KEY`、`WEB_EXT_API_SECRET`，然后 `npm run sign:firefox`（先构建再签名，一般几分钟）
  3. 签好的 `.xpi` 在 `web-ext-artifacts/`（已 gitignore）
  4. `npm run release:firefox` 发布到 GitHub Releases：`.xpi` 放进 `firefox-v<版本>`，
     再把固定 Release `firefox-updates` 里的 `updates.json` 覆盖成指向这个版本（需要已登录的 `gh`）

  AMO 要求每次签名的版本号比上次高，改扩展时照常升 `extension/manifest.json` 的版本号就行。
- **自动更新**：manifest 的 `update_url` 指向 `firefox-updates` 里的 `updates.json`，Firefox 大约每天检查一次，
  也可以在 `about:addons` 齿轮菜单里「检查更新」。首次安装从 Releases 页面下载 `firefox-v*` 里的 `.xpi` 拖进 Firefox。
  1.7.0 之前的版本没有 `update_url`，要手动装一次 1.7.0 或更新的版本。
  `update_url` 签进了扩展，改地址会让已安装的扩展再也收不到更新
- **校验**：`npx web-ext lint --self-hosted --source-dir extension-firefox`。不加 `--self-hosted` 会按上架 AMO 的规则把 `update_url` 报成错误。唯一的警告是 Firefox for Android 不支持 140 的
  `data_collection_permissions`，这个扩展不面向 Android（Android 不能接管新标签页），可以忽略

和 Chrome 版的区别：

- 代码里调扩展 API 统一用 `lib/ext.js` 导出的 `ext`（Firefox 下是 `browser`，Chrome 下是 `chrome`），不要直接写 `chrome.*`
- 新标签页没有开关、永远显示导航站：Firefox 不让扩展跳到自带的 `about:newtab`，但它自己的设置里（`about:preferences#home`）
  本来就能选新标签页和首页用谁。设置页按浏览器显示不同的说明（`.only-chrome` / `.only-firefox`）

## 用法

| 方式 | 行为 |
| --- | --- |
| 点工具栏图标，或 `Alt+Shift+S` | 调 `/websites/analyze` 预填名称、分类、描述；AI 没把握时提示确认分类；同时把网站图标压成 WebP 转存到图床（预览随即换成图床地址）；确认后保存。可勾选「特别关注」「私密收藏」「隐藏描述」（勾了私密就不能再勾另外两项）。已收藏的页面显示所在分类，并把收藏时间刷新成现在（回到「最近添加」最前面），可以移除；私密收藏和隐藏描述的网站不显示描述 |
| 网页空白处右键 →「收藏到皮皮2047」 | 打开和点工具栏图标一样的收藏弹窗，确认后保存。不再有不经确认的「一键收藏」：名称、分类、描述全凭 AI，存错了用户没机会改 |
| 链接上右键 →「收藏此链接到皮皮2047」 | 同一个弹窗，收藏的是那个链接（弹窗顶部显示链接地址）。链接页面没打开，拿不到页面内容，全靠服务端抓取 |
| 新开标签页 | 嵌入显示导航站（地址栏保持为空）。设置页可以关掉，关掉后跳回 Chrome 自带的新标签页 `chrome://new-tab-page` |
| 主页按钮 / 首页 | 固定为 `https://pipi2047.eu.org`。主页按钮默认不显示，要在 Chrome 外观设置里打开 |

装上或更新扩展后，Chrome 会弹窗问是否保留扩展改掉的新标签页和首页，选「保留」才生效。

## 实现

| 文件 | 内容 |
| --- | --- |
| `manifest.json` | Manifest V3 |
| `lib/ext.js` | 扩展 API 入口，抹平 Chrome / Firefox 的命名空间差异 |
| `lib/api.js` | API 客户端、设置读写、错误文案 |
| `lib/page.js` | 从当前标签页取 hints（标题、meta 描述、去掉导航后的正文前 3000 字、页面声明的图标、关键词、站点名、主标题） |
| `popup.*` | 工具栏弹窗 |
| `options.*` | 设置页 |
| `background.js` | 右键菜单：调 `action.openPopup()` 打开收藏弹窗；「收藏此链接」把链接记在内存里，弹窗打开后发 `take-link-target` 消息来取（5 秒内有效） |
| `newtab.*` | 新标签页，按设置嵌入导航站或跳到 Chrome 自带的新标签页 |
| `lib/toast.js` | 页内提示，注入到网页里显示。现在只在右键菜单打不开弹窗时用（Chrome 127 之前不让普通扩展调 `openPopup()`） |

- **权限**：`activeTab` + `scripting` 用于点图标或右键时读取当前页内容，`storage` 存设置，`contextMenus` 用于右键收藏。`notifications` 只在网页不让注入提示（`chrome://`、应用商店）时兜底——macOS 上 Chrome 的系统通知常被关掉，不能只靠它。
  服务端开了 CORS，扩展不需要主机权限就能带 `Authorization` 头调 API。
  `host_permissions` 里的导航站默认地址只给新标签页嵌入用；自定义地址在设置页保存时按 `optional_host_permissions` 申请
- **新标签页**：`chrome_url_overrides` 只能指向扩展自己的页面，所以由 `newtab.html` 读设置后决定显示什么。
  用全屏 iframe 嵌入导航站，地址栏保持为空、焦点在地址栏，和自带新标签页一样（跳转过去的话地址栏会被导航站网址占住）。
  嵌在扩展页里的网站默认是第三方上下文、localStorage 被分区，读不到本地数据和登录状态；
  扩展有该站点的主机权限时 iframe 用顶层分区（Chrome 文档写明，Firefox 140 实测同样），所以没有权限时不能嵌入。
  没有权限的情况：自定义地址被拒、在浏览器里撤销了权限，以及 **Firefox 版从 2.6.0 之前升上来的**——
  Firefox 更新扩展时不会授予新增的主机权限（[Bugzilla 1893232](https://bugzilla.mozilla.org/show_bug.cgi?id=1893232)），也不提示。
  这时新标签页先显示一个授权提示（`#grant`）：点「允许并显示」当场申请权限并嵌入（申请权限必须由点击触发，不能在打开页面时自动申请）；
  选「以后直接打开」才记到 `storage.local` 的 `newTabEmbedDeclined`，之后 `location.replace` 跳转、地址栏会显示网址。
  以后在设置页保存或在浏览器里给了权限，这个记号会清掉。以前是没有权限就悄悄跳转，升级上来的 Firefox 用户会一直看到地址栏里留着网址
- **首页**：`chrome_settings_overrides.homepage` 只接受写死的 http/https 地址，不能指向扩展页面、不能按设置变，
  所以写死默认地址，和 `lib/api.js` 的 `DEFAULT_SERVER_URL` 保持一致。这个字段只在 Windows 和 macOS 上生效
- **令牌**：存在 `chrome.storage.local`，不走 `storage.sync`，不会同步到其它设备
- **页面内容**：浏览器看到的是已登录、已过反爬、渲染完的页面，作为 `hints` 发给服务端。正文够 200 字时服务端不再自己抓网页，
  直接拿它跑 AI 分类和写描述，所以正文照服务端的规则取：跳过 `nav` / `header` / `footer` / `aside` 和看不见的元素，
  去掉后不足 200 字就退回整页文字。正文不够时（页面还没渲染完、不让注入脚本）服务端照旧自己抓
- **超时**：识别和保存 30 秒（服务端最坏约 16 秒），其它请求 15 秒
- `chrome://`、应用商店等页面不允许注入脚本，只用标签页标题

## 打包

```bash
cd extension && zip -r ../nav-site-extension.zip . -x README.md
```
