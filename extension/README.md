# 皮皮2047 收藏助手（Chrome / Firefox 扩展）

把当前网页收藏到导航站，AI 自动补全名称、分类和描述。调用的是导航站的 REST API v1，接口说明见 [../doc/REST_API.md](../doc/REST_API.md)。

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
`options_page` 改成 `options_ui`，并加上扩展 id 和最低版本 140（ESR）。版本号直接沿用 Chrome 的。

- **临时加载**：Firefox 打开 `about:debugging#/runtime/this-firefox` →「临时载入附加组件」，选 `extension-firefox/manifest.json`。重启浏览器后失效
- **长期安装**：正式版 Firefox 只装签过名的扩展。用 AMO 签名、不上架（unlisted），只给自己装：
  1. 用 Firefox 账号登录 <https://addons.mozilla.org/developers/addon/api/key/> 生成 API 密钥（JWT issuer 和 secret）
  2. 把密钥放进环境变量 `WEB_EXT_API_KEY`、`WEB_EXT_API_SECRET`，然后 `npm run sign:firefox`（先构建再签名，一般几分钟）
  3. 签好的 `.xpi` 在 `web-ext-artifacts/`（已 gitignore），拖进 Firefox 安装；更新时拖新的覆盖，设置保留

  AMO 要求每次签名的版本号比上次高，改扩展时照常升 `extension/manifest.json` 的版本号就行。
  这样装的扩展不会自动更新，要自动更新得在 manifest 加 `update_url` 并自己托管 `updates.json`
- **校验**：`npx web-ext lint --source-dir extension-firefox`。唯一的警告是 Firefox for Android 不支持 140 的
  `data_collection_permissions`，这个扩展不面向 Android（Android 不能接管新标签页），可以忽略

和 Chrome 版的区别：

- 代码里调扩展 API 统一用 `lib/ext.js` 导出的 `ext`（Firefox 下是 `browser`，Chrome 下是 `chrome`），不要直接写 `chrome.*`
- 新标签页没有开关、永远跳导航站：Firefox 不让扩展跳到自带的 `about:newtab`，但它自己的设置里（`about:preferences#home`）
  本来就能选新标签页和首页用谁。设置页按浏览器显示不同的说明（`.only-chrome` / `.only-firefox`）

## 用法

| 方式 | 行为 |
| --- | --- |
| 点工具栏图标，或 `Alt+Shift+S` | 调 `/websites/analyze` 预填名称、分类、描述；AI 没把握时提示确认分类；确认后保存。已收藏的页面显示所在分类，可以移除 |
| 网页空白处右键 →「一键收藏到皮皮2047」 | 直接保存。网页右上角显示进度和结果（存进了哪个分类），工具栏图标同时挂角标 |
| 链接上右键 →「一键收藏此链接到皮皮2047」 | 同上。链接页面没打开，拿不到页面内容，全靠服务端抓取 |
| 新开标签页 | 跳到导航站地址。设置页可以关掉，关掉后跳回 Chrome 自带的新标签页 `chrome://new-tab-page` |
| 主页按钮 / 首页 | 固定为 `https://pipi2047.eu.org`。主页按钮默认不显示，要在 Chrome 外观设置里打开 |

装上或更新扩展后，Chrome 会弹窗问是否保留扩展改掉的新标签页和首页，选「保留」才生效。

## 实现

| 文件 | 内容 |
| --- | --- |
| `manifest.json` | Manifest V3 |
| `lib/ext.js` | 扩展 API 入口，抹平 Chrome / Firefox 的命名空间差异 |
| `lib/api.js` | API 客户端、设置读写、错误文案 |
| `lib/page.js` | 从当前标签页取 hints（标题、meta 描述、正文前 3000 字） |
| `popup.*` | 工具栏弹窗 |
| `options.*` | 设置页 |
| `background.js` | 右键菜单一键收藏 |
| `newtab.*` | 新标签页，按设置跳到导航站或 Chrome 自带的新标签页 |
| `lib/toast.js` | 一键收藏的页内提示，注入到网页里显示 |

- **权限**：`activeTab` + `scripting` 用于点图标或右键时读取当前页内容，`storage` 存设置，`contextMenus` 用于右键收藏。`notifications` 只在网页不让注入提示（`chrome://`、应用商店）时兜底——macOS 上 Chrome 的系统通知常被关掉，不能只靠它。
  服务端开了 CORS，扩展不需要主机权限就能带 `Authorization` 头调 API
- **新标签页**：`chrome_url_overrides` 只能指向扩展自己的页面，所以由 `newtab.html` 读设置后 `location.replace` 跳走。
  不用 iframe 嵌入：嵌在扩展页里的导航站是第三方上下文，localStorage 被分区，读不到本地数据和登录状态。
  跳转后焦点在网页上，不在地址栏
- **首页**：`chrome_settings_overrides.homepage` 只接受写死的 http/https 地址，不能指向扩展页面、不能按设置变，
  所以写死默认地址，和 `lib/api.js` 的 `DEFAULT_SERVER_URL` 保持一致。这个字段只在 Windows 和 macOS 上生效
- **令牌**：存在 `chrome.storage.local`，不走 `storage.sync`，不会同步到其它设备
- **页面内容**：浏览器看到的是已登录、已过反爬的页面，作为 `hints` 发给服务端。服务端自己抓不到网页时靠它兜底，
  实测还能缩短识别耗时（npm 页面 7.1 秒 → 3.5 秒）
- **超时**：识别和保存 30 秒（服务端最坏约 16 秒），其它请求 15 秒
- `chrome://`、应用商店等页面不允许注入脚本，只用标签页标题

## 打包

```bash
cd extension && zip -r ../nav-site-extension.zip . -x README.md
```
