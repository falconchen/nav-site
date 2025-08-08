# SSE 实时同步功能指南

## 功能概述

本项目现已支持基于 Server-Sent Events (SSE) 的实时数据同步，在不支持的设备上会自动回退到定时轮询模式。

## 主要特性

### 🚀 混合同步策略
- **优先使用 SSE**：支持的设备将使用实时推送
- **智能回退**：不支持或连接失败时自动切换到轮询
- **备用检查**：SSE模式下仍保持长间隔轮询作为备用

### 📡 SSE 实时同步
- **即时推送**：数据变化时立即通知所有设备
- **自动重连**：连接断开时智能重连（最多5次）
- **心跳检测**：30秒心跳确保连接活跃
- **连接管理**：15分钟自动超时，避免资源泄漏

### ⏰ 轮询备用机制
- **设备不支持 SSE**：使用60秒间隔轮询
- **SSE 连接失败**：自动切换到轮询模式
- **备用检查**：SSE模式下5分钟备用检查

## 技术实现

### 服务端 (Cloudflare Workers)

#### SSE API 端点
```javascript
// GET /api/events?token=<auth_token>
// 返回 text/event-stream 格式的数据流
```

#### 消息类型
- `connected`: 连接建立确认
- `data_updated`: 数据更新通知
- `heartbeat`: 连接心跳

#### 连接管理
- 使用 `Map` 存储活跃连接
- 按用户ID分组，支持多设备同时连接
- 自动清理断开的连接

### 客户端实现

#### SSESync 类
```javascript
// 创建SSE连接
const sseSync = new SSESync();
sseSync.start();

// 检查连接状态
if (sseSync.isActive()) {
    console.log('SSE连接正常');
}
```

#### HybridSyncManager 类
```javascript
// 启动混合同步
const manager = new HybridSyncManager();
manager.start();

// 获取当前状态
const status = manager.getStatus();
console.log('同步模式:', status.isUsingSSE ? 'SSE' : '轮询');
```

## 使用方法

### 1. 自动启动
用户登录后，同步功能会自动启动：
```javascript
// 在 auth.js 中自动调用
if (typeof startSyncDetection === 'function') {
    startSyncDetection();
}
```

### 2. 手动控制
```javascript
// 启动同步
startSyncDetection();

// 停止同步
stopSyncDetection();

// 查看状态
const status = getSyncStatus();
showSyncStatus(); // 显示状态通知
```

### 3. 调试工具
访问 `/sse-debug.html` 可以：
- 实时监控 SSE 连接状态
- 查看消息历史
- 测试手动同步
- 查看连接统计

## 兼容性

### 支持的浏览器
- ✅ Chrome/Edge (现代版本)
- ✅ Firefox (现代版本)
- ✅ Safari (现代版本)
- ❌ IE (不支持，自动回退到轮询)

### 设备兼容性
- ✅ 桌面设备：完全支持
- ✅ 移动设备：完全支持
- ✅ 旧设备：自动回退到轮询

## 配置选项

### 客户端配置
```javascript
// SSE重连设置
const SSE_RECONNECT_DELAY = 1000; // 重连延迟基数
const SSE_MAX_RECONNECT_ATTEMPTS = 5; // 最大重连次数

// 轮询间隔设置
const SYNC_CHECK_INTERVAL = 60000; // 正常轮询间隔
const SSE_FALLBACK_POLLING_INTERVAL = 300000; // SSE模式下的备用轮询
```

### 服务端配置
```javascript
// 连接超时（15分钟）
const CONNECTION_TIMEOUT = 15 * 60 * 1000;

// 心跳间隔（30秒）
const HEARTBEAT_INTERVAL = 30000;
```

## 监控和调试

### 客户端日志
所有同步活动都会输出到控制台：
```javascript
console.log('📡 SSE connected successfully');
console.log('🔄 Attempting SSE reconnect...');
console.log('⏰ Using polling sync (SSE not supported)');
```

### 服务端日志
```javascript
console.log('📡 SSE connection established: <connectionId>');
console.log('📢 Broadcasting to N connections for user');
console.log('🧹 Cleaned up SSE connection: <connectionId>');
```

### 状态检查 API
```javascript
// GET /api/events/status
{
  "totalConnections": 5,
  "userConnections": {
    "user123": 2,
    "user456": 3
  },
  "timestamp": 1640995200000
}
```

## 故障排除

### 常见问题

#### SSE 连接失败
1. 检查认证token是否有效
2. 确认服务端 `/api/events` 端点可访问
3. 查看浏览器网络面板的错误信息

#### 自动回退到轮询
- 这是正常行为，表示 SSE 不可用
- 检查 `getSyncStatus()` 了解具体原因

#### 数据同步延迟
- SSE 模式：应该是即时的
- 轮询模式：最多60秒延迟是正常的

### 调试步骤
1. 打开 `/sse-debug.html` 查看连接状态
2. 查看浏览器控制台的同步日志
3. 使用 `showSyncStatus()` 查看当前模式
4. 检查网络面板的 EventSource 连接

## 性能考虑

### 资源使用
- **SSE 模式**：较低的服务器负载，实时性最佳
- **轮询模式**：定期请求，更高的服务器负载

### 成本影响 (Cloudflare Workers)
- SSE 连接计入 Workers 请求次数
- 心跳消息每30秒一次
- 建议监控使用量避免意外费用

### 优化建议
- 合理设置心跳间隔
- 及时清理断开的连接
- 监控活跃连接数量

## 更新日志

### v1.0 (当前版本)
- ✅ 实现基础 SSE 同步功能
- ✅ 智能回退到轮询机制
- ✅ 连接管理和自动重连
- ✅ 调试工具和状态监控
- ✅ 多设备同步支持

### 计划中的改进
- 🔄 更精细的冲突处理
- 📊 同步性能分析
- 🔧 更多配置选项
- 🎯 针对性优化
