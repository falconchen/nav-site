/**
 * 用户数据同步API - 保存和加载用户的网站数据到Redis
 */

import { Hono } from 'hono';
import { verify } from 'hono/jwt';

const app = new Hono();

// 中间件：验证用户身份
const authMiddleware = async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Missing or invalid authorization header' }, 401);
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = await verify(token, c.env.JWT_SECRET);

        // 检查token是否在KV中存在（如果KV可用）
        if (c.env.USER_SESSIONS) {
            const storedToken = await c.env.USER_SESSIONS.get(`user_session_${payload.userId}`);
            if (!storedToken || storedToken !== token) {
                return c.json({ error: 'Token not found or invalid' }, 401);
            }
        } else {
            console.log('KV namespace not available, skipping server-side token validation');
        }

        // 将用户信息添加到context中
        c.set('user', payload);
        await next();
    } catch (error) {
        return c.json({ error: 'Invalid token' }, 401);
    }
};

// 保存用户数据
app.post('/user-data/save', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const userData = await c.req.json();

        // 验证数据格式
        if (!userData || typeof userData !== 'object') {
            return c.json({ error: 'Invalid data format' }, 400);
        }

        // 添加元数据
        const dataToSave = {
            ...userData,
            userId: user.userId,
            lastUpdated: new Date().toISOString(),
            version: userData.version || 1
        };

        // 保存到Redis
        const success = await saveDataToRedis(c, user.userId, dataToSave);

        if (success) {
            return c.json({
                success: true,
                message: 'Data saved successfully',
                lastUpdated: dataToSave.lastUpdated
            });
        } else {
            return c.json({ error: 'Failed to save data' }, 500);
        }
    } catch (error) {
        console.error('Error saving user data:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// 加载用户数据
app.get('/user-data/load', authMiddleware, async (c) => {
    try {
        const user = c.get('user');

        // 从Redis加载数据
        const userData = await loadDataFromRedis(c, user.userId);

        if (userData) {
            return c.json({
                success: true,
                data: userData,
                lastUpdated: userData.lastUpdated
            });
        } else {
            // 返回空数据结构
            return c.json({
                success: true,
                data: {
                    categories: [],
                    websites: [],
                    settings: {}
                },
                lastUpdated: null
            });
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// 获取数据同步状态
app.get('/user-data/status', authMiddleware, async (c) => {
    try {
        const user = c.get('user');

        // 获取数据最后更新时间
        const userData = await loadDataFromRedis(c, user.userId);

        return c.json({
            success: true,
            userId: user.userId,
            hasData: !!userData,
            lastUpdated: userData?.lastUpdated || null,
            version: userData?.version || 0
        });
    } catch (error) {
        console.error('Error getting sync status:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// 合并本地和云端数据
app.post('/user-data/merge', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const localData = await c.req.json();

        // 从Redis获取云端数据
        const cloudData = await loadDataFromRedis(c, user.userId);

        let mergedData;

        if (!cloudData) {
            // 如果云端没有数据，直接使用本地数据
            mergedData = localData;
        } else {
            // 合并逻辑：以最新数据为准，同时合并不冲突的项目
            mergedData = mergeUserData(localData, cloudData);
        }

        // 保存合并后的数据
        const dataToSave = {
            ...mergedData,
            userId: user.userId,
            lastUpdated: new Date().toISOString(),
            version: (Math.max(localData.version || 0, cloudData?.version || 0)) + 1
        };

        const success = await saveDataToRedis(c, user.userId, dataToSave);

        if (success) {
            return c.json({
                success: true,
                data: dataToSave,
                message: 'Data merged and saved successfully'
            });
        } else {
            return c.json({ error: 'Failed to save merged data' }, 500);
        }
    } catch (error) {
        console.error('Error merging user data:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// 删除用户数据
app.delete('/user-data/delete', authMiddleware, async (c) => {
    try {
        const user = c.get('user');

        const success = await deleteDataFromRedis(c, user.userId);

        if (success) {
            return c.json({
                success: true,
                message: 'User data deleted successfully'
            });
        } else {
            return c.json({ error: 'Failed to delete data' }, 500);
        }
    } catch (error) {
        console.error('Error deleting user data:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// 辅助函数：保存数据到Redis
async function saveDataToRedis(c, userId, data) {
    try {
        const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
        const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

        if (!redisUrl || !redisToken) {
            console.log('Redis credentials not configured');
            return false;
        }

        const response = await fetch(`${redisUrl}/set/userdata:${userId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.ok;
    } catch (error) {
        console.error('Error saving data to Redis:', error);
        return false;
    }
}

// 辅助函数：从Redis加载数据
async function loadDataFromRedis(c, userId) {
    try {
        const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
        const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

        if (!redisUrl || !redisToken) {
            return null;
        }

        const response = await fetch(`${redisUrl}/get/userdata:${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${redisToken}`,
            },
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.result ? JSON.parse(data.result) : null;
    } catch (error) {
        console.error('Error loading data from Redis:', error);
        return null;
    }
}

// 辅助函数：从Redis删除数据
async function deleteDataFromRedis(c, userId) {
    try {
        const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
        const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

        if (!redisUrl || !redisToken) {
            return false;
        }

        const response = await fetch(`${redisUrl}/del/userdata:${userId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([`userdata:${userId}`]),
        });

        return response.ok;
    } catch (error) {
        console.error('Error deleting data from Redis:', error);
        return false;
    }
}

// 辅助函数：合并用户数据
function mergeUserData(localData, cloudData) {
    // 简单的合并策略：以时间戳较新的为准
    const localTimestamp = new Date(localData.lastUpdated || 0).getTime();
    const cloudTimestamp = new Date(cloudData.lastUpdated || 0).getTime();

    if (localTimestamp > cloudTimestamp) {
        return localData;
    } else if (cloudTimestamp > localTimestamp) {
        return cloudData;
    } else {
        // 时间戳相同，合并数组数据
        const mergedCategories = mergeCategoriesArray(
            localData.categories || [],
            cloudData.categories || []
        );

        const mergedWebsites = mergeWebsitesArray(
            localData.websites || [],
            cloudData.websites || []
        );

        return {
            categories: mergedCategories,
            websites: mergedWebsites,
            settings: { ...cloudData.settings, ...localData.settings }
        };
    }
}

// 合并分类数组
function mergeCategoriesArray(localCategories, cloudCategories) {
    const merged = [...cloudCategories];

    for (const localCat of localCategories) {
        const existingIndex = merged.findIndex(c => c.id === localCat.id);
        if (existingIndex >= 0) {
            // 如果存在相同ID，使用本地数据（假设本地更新）
            merged[existingIndex] = localCat;
        } else {
            // 如果不存在，添加到合并结果
            merged.push(localCat);
        }
    }

    return merged;
}

// 合并网站数组
function mergeWebsitesArray(localWebsites, cloudWebsites) {
    const merged = [...cloudWebsites];

    for (const localSite of localWebsites) {
        const existingIndex = merged.findIndex(w => w.id === localSite.id);
        if (existingIndex >= 0) {
            // 如果存在相同ID，使用本地数据
            merged[existingIndex] = localSite;
        } else {
            // 如果不存在，添加到合并结果
            merged.push(localSite);
        }
    }

    return merged;
}

export default app;
