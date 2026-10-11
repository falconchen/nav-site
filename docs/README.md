# 文档索引

项目文档都放在这个目录。架构和各功能的实现约定写在仓库根目录的 `CLAUDE.md`，这里是面向使用、部署和排查的说明。

## 部署与运维

- [setup.md](setup.md)：从零部署要配的 OAuth、Redis、KV、密钥，以及开发 / 生产环境的区别
- [JWT_CONFIG.md](JWT_CONFIG.md)：登录有效期、JWT 算法校验
- [cloudflare-worker-notes.md](cloudflare-worker-notes.md)：自动部署开关、静态资源绑定、Wrangler 升级记录

## 接口与客户端

- [REST_API.md](REST_API.md)：`/api/v1` 和分享草稿接口
- [REST_API_TESTING.md](REST_API_TESTING.md)：接口的测试方法和实测记录
- [IOS_SHORTCUT.md](IOS_SHORTCUT.md)：iOS 快捷指令（浮层版和 Safari 版）

## 功能说明

- [FRONTEND_LOADING.md](FRONTEND_LOADING.md)：收藏加载、超时与重试，退出登录时清除本地数据
- [notes-export.md](notes-export.md)：记事本导出
- [notes-markdown.md](notes-markdown.md)：记事本的 Markdown 渲染和 vendor 构建

## 计划与记录

- [TODO.md](TODO.md)：功能待办
- [share-overlay-plan.md](share-overlay-plan.md)：快捷指令浮层的原始方案（和最终实现有出入，以 IOS_SHORTCUT.md、REST_API.md 为准）
