# 皮皮2047 收藏助手（Chrome 扩展）

把当前网页收藏到导航站，AI 自动补全名称、分类和描述。调用的是导航站的 REST API v1，接口说明见 [../doc/REST_API.md](../doc/REST_API.md)。

## 安装

1. Chrome 打开 `chrome://extensions`，右上角打开「开发者模式」
2. 点「加载已解压的扩展程序」，选择这个 `extension/` 目录
3. 首次安装会自动打开设置页：
   - **导航站地址**：默认 `https://pipi2047.eu.org`；本地开发填 `127.0.0.1:8787`（本机地址自动补 `http://`，其它补 `https://`）
   - **个人令牌**：导航站网页端登录后，右上角用户菜单 →「个人令牌」生成
   - 点「保存」时会先调 `/api/v1/me` 验证，验证通过才保存

改了代码后在 `chrome://extensions` 里点扩展卡片上的刷新按钮即可。

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
