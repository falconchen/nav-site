/**
 * SSE (Server-Sent Events) API
 * 实现实时数据更新推送
 */

import { Hono } from 'hono';

const app = new Hono();

// 存储活跃的SSE连接
const activeConnections = new Map();

// SSE事件流端点
app.get('/events', async (c) => {
    // 验证认证token
    const token = c.req.query('token');
    if (!token) {
        return c.text('未授权访问', 401);
    }

    // 验证token有效性
    const user = await verifyAuthToken(token, c.env);
    if (!user) {
        return c.text('无效的认证token', 401);
    }

    console.log(`📡 SSE connection request from user: ${user.id}`);

    // 创建SSE响应流
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // 设置SSE响应头
    const response = new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        }
    });

    // 生成连接ID
    const connectionId = crypto.randomUUID();

    // 存储连接信息
    activeConnections.set(connectionId, {
        userId: user.id,
        writer: writer,
        encoder: encoder,
        connectedAt: Date.now()
    });

    console.log(`✅ SSE connection established: ${connectionId} for user ${user.id}`);

    // 启动SSE连接管理
    manageSSEConnection(connectionId, writer, encoder, user, c.env).catch(error => {
        console.error('❌ SSE connection error:', error);
        cleanupConnection(connectionId);
    });

    return response;
});

// SSE连接管理
async function manageSSEConnection(connectionId, writer, encoder, user, env) {
    try {
        // 发送初始连接确认
        await sendSSEMessage(writer, encoder, {
            type: 'connected',
            data: {
                userId: user.id,
                connectionId: connectionId,
                timestamp: Date.now()
            }
        });

        // 修改 server/api/events.js 的心跳逻辑
        const heartbeatInterval = setInterval(async () => {
            try {
                // 检查是否有新的更新通知
                const notifications = await checkUserNotifications(env, user.id, connectionId);

                // 发送所有未读通知
                for (const notification of notifications) {
                    await sendSSEMessage(writer, encoder, notification);
                }

                // 发送心跳
                await sendSSEMessage(writer, encoder, {
                    type: 'heartbeat',
                    data: { timestamp: Date.now() }
                });

            } catch (error) {
                console.error('❌ SSE heartbeat failed:', error);
                cleanupConnection(connectionId);
            }
        }, 10000); // 10秒检查一次

        // 设置连接超时（15分钟）
        const connectionTimeout = setTimeout(() => {
            console.log(`⏰ SSE connection timeout: ${connectionId}`);
            cleanupConnection(connectionId);
        }, 15 * 60 * 1000);

        // 清理函数
        const cleanup = () => {
            clearInterval(heartbeatInterval);
            clearTimeout(connectionTimeout);
            cleanupConnection(connectionId);
        };

        // 监听连接关闭
        writer.closed.then(() => {
            console.log(`🔌 SSE connection closed: ${connectionId}`);
            cleanup();
        }).catch(() => {
            cleanup();
        });

    } catch (error) {
        console.error('❌ SSE management error:', error);
        cleanupConnection(connectionId);
    }
}

// 发送SSE消息
async function sendSSEMessage(writer, encoder, message) {
    const sseData = `data: ${JSON.stringify(message)}\n\n`;
    await writer.write(encoder.encode(sseData));
}

// 清理连接
function cleanupConnection(connectionId) {
    const connection = activeConnections.get(connectionId);
    if (connection) {
        try {
            connection.writer.close();
        } catch (error) {
            // 忽略关闭错误
        }
        activeConnections.delete(connectionId);
        console.log(`🧹 Cleaned up SSE connection: ${connectionId}`);
    }
}

// 在 server/api/events.js 中移除或简化 broadcastToUser 函数
export async function broadcastToUser(userId, message) {
    // 这个函数现在不再需要，因为我们使用KV队列
    console.log(`📡 Using KV notification queue for user ${userId}`);
    // 可以保留这个函数用于日志记录，但不执行实际的广播
}

// 验证认证token（复用user-data.js的逻辑）
async function verifyAuthToken(token, env) {
    try {
        const { verify } = await import('hono/jwt');

        if (!token || typeof token !== 'string') {
            return null;
        }

        const payload = await verify(token, env.JWT_SECRET);

        // 检查token是否在KV中存在（支持多端登录）
        if (env.USER_SESSIONS) {
            if (!payload.sessionId) {
                console.log('❌ No sessionId in token payload for SSE');
                return null;
            }

            const sessionKey = `user_session_${payload.userId}_${payload.sessionId}`;
            const storedSessionData = await env.USER_SESSIONS.get(sessionKey);

            if (storedSessionData) {
                try {
                    const sessionInfo = JSON.parse(storedSessionData);
                    if (sessionInfo.token !== token) {
                        console.log('❌ Token mismatch for SSE session');
                        return null;
                    }
                } catch (parseError) {
                    console.log('❌ Failed to parse session data for SSE:', parseError);
                    return null;
                }
            } else {
                console.log('❌ SSE session not found in KV');
                return null;
            }
        }

        return {
            id: payload.userId,
            userId: payload.userId,
            sessionId: payload.sessionId,
            token: token
        };
    } catch (error) {
        console.error('SSE token verification error:', error);
        return null;
    }
}

// 检查用户通知的函数
async function checkUserNotifications(env, userId, connectionId) {
    try {
        // 列出该用户的所有更新通知
        const listResult = await env.USER_SESSIONS.list({
            prefix: `user_update_${userId}_`
        });

        const notifications = [];

        for (const key of listResult.keys) {
            try {
                const notificationData = await env.USER_SESSIONS.get(key.name);
                if (notificationData) {
                    const notification = JSON.parse(notificationData);

                    // 检查这个通知是否已经被这个连接处理过
                    const processedKey = `processed_${connectionId}_${key.name}`;
                    const alreadyProcessed = await env.USER_SESSIONS.get(processedKey);

                    if (!alreadyProcessed) {
                        notifications.push(notification);

                        // 标记为已处理，避免重复发送
                        await env.USER_SESSIONS.put(
                            processedKey,
                            'true',
                            { expirationTtl: 300 }
                        );
                    }
                }
            } catch (parseError) {
                console.error('Failed to parse notification:', parseError);
            }
        }

        return notifications;

    } catch (error) {
        console.error('Failed to check notifications:', error);
        return [];
    }
}

// SSE连接状态端点
app.get('/events/status', async (c) => {
    const connectionCount = activeConnections.size;
    const userConnections = {};

    activeConnections.forEach((connection, connectionId) => {
        if (!userConnections[connection.userId]) {
            userConnections[connection.userId] = 0;
        }
        userConnections[connection.userId]++;
    });

    return c.json({
        totalConnections: connectionCount,
        userConnections: userConnections,
        timestamp: Date.now()
    });
});

export default app;
