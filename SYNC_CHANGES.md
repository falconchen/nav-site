# 数据同步系统重构说明

## 概述

根据用户需求，已将复杂的数据合并系统简化为直接覆盖模式，并添加了版本管理功能。

## 主要更改

### 1. 移除复杂合并逻辑

#### 服务端更改 (`server/api/user-data.js`)
- **移除接口**: 删除了 `/user-data/merge` 接口
- **移除函数**:
  - `mergeUserData()` - 用户数据合并函数
  - `mergeCategoriesArray()` - 分类数组合并函数
  - `mergeWebsitesArray()` - 网站数组合并函数

#### 客户端更改 (`public/sync.js`)
- **简化同步**: `syncUserData()` 现在直接上传到云端覆盖
- **简化加载**: `loadUserData()` 现在直接从云端覆盖本地
- **移除版本比较**: 不再进行复杂的版本比较逻辑

### 2. 添加版本管理系统

#### 服务端新功能
- **新接口 `/user-data/versions`**: 获取历史版本列表（最近5个）
- **新接口 `/user-data/restore`**: 从指定版本恢复数据
- **新函数**:
  - `saveVersionToRedis()` - 保存版本历史到Redis
  - `getVersionsFromRedis()` - 获取版本列表
  - `getVersionDataFromRedis()` - 获取指定版本数据

#### Redis数据结构
```
userdata:{userId}                    # 当前数据
userdata_versions:{userId}           # 版本列表
userdata_version:{userId}:{version}  # 具体版本数据（30天过期）
```

#### 版本信息格式
```javascript
{
  version: 1647834567890,           // 时间戳作为版本号
  lastUpdated: "2023-03-21T10:30:00Z",
  description: "数据更新"            // 版本描述
}
```

### 3. 用户界面更新

#### 按钮文本更改
- **用户菜单**: "同步数据" → "上传到云端" (图标: cloud-upload-alt)
- **底部链接**: "使用云端数据覆盖" → "选择历史版本" (图标: history)

#### 新版本选择界面
- 模态框显示最近5个历史版本
- 显示版本时间和描述
- 点击即可恢复到指定版本

### 4. 版本号系统改进

#### 从递增整数改为时间戳
- **旧系统**: `version: parseInt(localStorage.getItem('dataVersion') || '0') + 1`
- **新系统**: `version: Date.now()`

#### 优势
- 避免版本冲突
- 天然排序
- 更精确的时间信息

## 工作流程

### 数据上传（覆盖云端）
1. 用户点击"上传到云端"
2. 生成时间戳版本号
3. 直接覆盖云端当前数据
4. 同时保存为历史版本
5. 只保留最近5个版本

### 数据下载（覆盖本地）
1. 用户点击"选择历史版本"
2. 获取版本列表显示模态框
3. 用户选择要恢复的版本
4. 直接覆盖本地数据
5. 恢复操作也会创建新版本

### 自动保存
- 数据变化2秒后自动保存到云端
- 页面关闭前也会保存数据
- 每次保存都会创建版本历史

## API接口文档

### GET /api/user-data/versions
获取用户的历史版本列表

**响应**:
```javascript
{
  "success": true,
  "versions": [
    {
      "version": 1647834567890,
      "lastUpdated": "2023-03-21T10:30:00Z",
      "description": "数据更新"
    }
  ]
}
```

### POST /api/user-data/restore
从指定版本恢复数据

**请求**:
```javascript
{
  "version": 1647834567890
}
```

**响应**:
```javascript
{
  "success": true,
  "data": { /* 恢复的数据 */ },
  "message": "Data restored successfully"
}
```

## 迁移说明

现有用户的数据不会受到影响：
- 当前数据保持不变
- 首次使用新版本时，会自动创建第一个版本历史
- 旧的版本号会被转换为时间戳格式

## 注意事项

1. **数据安全**: 版本历史会在30天后自动过期
2. **存储限制**: 只保留最近5个版本
3. **网络要求**: 版本恢复需要网络连接
4. **覆盖警告**: 用户操作前应该了解数据会被完全覆盖
