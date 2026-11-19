# Firefox 扩展 AMO 上架与发布指南

本文档记录「皮皮2047 收藏助手」Firefox 扩展在 Mozilla Add-ons (AMO) 的上架流程、审核注意事项及自动化提审命令。

---

## 一、分发渠道概念

AMO 提供两种分发渠道（Channel），区别如下：

| 渠道 | 特点 | 适用场景 | 自动更新机制 |
| :--- | :--- | :--- | :--- |
| **Unlisted (自托管)** | 不在 AMO 商店公开展示，仅调用 AMO API 签名生成 `.xpi` | 个人使用、内部测试、自托管分发 | 依赖扩展内配置的 `update_url`（GitHub Releases） |
| **Listed (公开商店)** | 在 AMO 官方商店公开展出，任何用户可搜索、安装与评分 | 正式对外公开发布 | 由 Mozilla 官方 CDN 统一接管，**严禁**携带 `update_url` |

---

## 二、关键合规与避坑注意事项

### 1. `update_url` 规则
- **公开上架（Listed）严禁包含 `update_url`**：若 `manifest.json` 的 `browser_specific_settings.gecko` 中包含 `update_url`，AMO 校验器会直接报错拒绝（`MANIFEST_UPDATE_URL`）。
- 构建脚本 `build-firefox-extension.js` 默认移除了 `update_url`，专供正式上架。

### 2. Android 最低版本兼容性
- 扩展声明了 `data_collection_permissions`（`browsingActivity`、`websiteContent`）。
- 桌面版 Firefox ESR 自 140.0 开始支持该字段，而 **Firefox for Android 直到 142.0 才引入支持**。
- 必须在 `manifest.json` 中明确声明 `gecko_android.strict_min_version: "142.0"`，否则 AMO 会产生最低版本兼容性警告：
  ```javascript
  browser_specific_settings: {
      gecko: {
          id: 'pipi2047-collector@pipi2047.eu.org',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['browsingActivity', 'websiteContent'] }
      },
      gecko_android: {
          strict_min_version: '142.0'
      }
  }
  ```

### 3. 严格递增版本号
- AMO 数据库记录所有历史提交（包含已验证/被拦截的版本）。
- **每次向 AMO 提交（无论 Unlisted 还是 Listed），都必须递增 `extension/manifest.json` 中的 `version`**。重复提交相同版本号会报 `Version X.Y.Z already exists` 冲突。

### 4. 商店商品信息填写规范
- **分类 (Categories)**：推荐选择 **书签 (Bookmarks)** 与 **标签页 (Tabs)**。
- **标签 (Tags)**：**建议全部留空**。预置标签多为特定网站或工具（如 ad blocker、vpn），留空避免误导审核员核查不相关功能。
- **开源许可协议 (License)**：Listed 必须在提交时提供开源许可（推荐 `MIT` 或 `MPL-2.0`）。

### 5. 代码安全性规范
- **严禁远程代码**：所有 JS、CSS、HTML 必须打包在本地，不得使用外部 CDN 脚本。
- **最小化权限**：仅按需申请 `activeTab`、`scripting`、`storage`、`contextMenus`、`notifications`，域名权限使用 `optional_host_permissions`。

---

## 三、方式二：命令行一键推送 Listed 审核

通过 `web-ext sign` 命令可直接将扩展提交至 AMO 公开审核队列。

### 1. 准备元数据文件 `amo-metadata.json`
Listed 通道首次或更新时需要指定许可证与基本信息，可保存在临时或固定位置：

```json
{
  "version": {
    "license": "MIT"
  },
  "categories": ["bookmarks", "tabs"],
  "summary": {
    "zh-CN": "把当前网页收藏到皮皮2047导航站，AI 自动补全标题、分类和描述；新标签页和首页打开导航站。"
  }
}
```

### 2. 执行自动化提审命令
本机 Node/npm 由 nvm 管理，执行时需注意 PATH 补齐与加载 `~/.zshrc` 中的 `WEB_EXT_API_KEY` 及 `WEB_EXT_API_SECRET`：

```bash
# 1. 确保已递增 extension/manifest.json 的版本号
# 2. 补齐 nvm 路径，加载密钥，构建产物并提交审核
NVM_BIN="$HOME/.nvm/versions/node/$(ls -1 ~/.nvm/versions/node 2>/dev/null | tail -1)/bin" \
  && [ -f ~/.zshrc ] && source ~/.zshrc; export PATH="$NVM_BIN:$PATH" \
  && node build-firefox-extension.js \
  && npx -y web-ext@10 sign \
    --channel=listed \
    --source-dir extension-firefox \
    --artifacts-dir web-ext-artifacts \
    --amo-metadata path/to/amo-metadata.json
```

---

## 四、自托管（Unlisted）签名与发布对照

若需要恢复或更新 Unlisted（自签名拖拽安装包及 GitHub 自动更新）：

1. 在 `build-firefox-extension.js` 中恢复 `update_url` 指向 GitHub Release 的 `updates.json`；
2. 运行 `npm run sign:firefox`（通道为 `--channel=unlisted`，签名完成自动下载 `.xpi`）；
3. 运行 `npm run release:firefox`（将 `.xpi` 推送至 GitHub Release 并更新 `firefox-updates` 标签）。
