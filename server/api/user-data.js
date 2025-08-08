/**
 * 用户数据同步API - 保存和加载用户的网站数据到Redis
 */

import { Hono } from 'hono';
import { verify } from 'hono/jwt';
import { broadcastToUser } from './events.js';

const app = new Hono();

// 中间件：验证用户身份
// 解析用户代理字符串
function parseUserAgent(userAgent) {
	const parser = {
		device: 'Unknown Device',
		browser: 'Unknown Browser',
		os: 'Unknown OS'
	};

	// 简单的用户代理解析
	if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
		parser.device = 'Mobile Device';
	} else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
		parser.device = 'Tablet';
	} else {
		parser.device = 'Desktop';
	}

	if (userAgent.includes('Chrome')) {
		parser.browser = 'Chrome';
	} else if (userAgent.includes('Firefox')) {
		parser.browser = 'Firefox';
	} else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
		parser.browser = 'Safari';
	} else if (userAgent.includes('Edge')) {
		parser.browser = 'Edge';
	}

	if (userAgent.includes('Windows')) {
		parser.os = 'Windows';
	} else if (userAgent.includes('Mac')) {
		parser.os = 'macOS';
	} else if (userAgent.includes('Linux')) {
		parser.os = 'Linux';
	} else if (userAgent.includes('Android')) {
		parser.os = 'Android';
	} else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
		parser.os = 'iOS';
	}

	return parser;
}

const authMiddleware = async (c, next) => {
	const authHeader = c.req.header('Authorization');

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return c.json({ error: 'Missing or invalid authorization header' }, 401);
	}

	const token = authHeader.split(' ')[1];

	try {
		const payload = await verify(token, c.env.JWT_SECRET);

		// 检查token是否在KV中存在（支持多端登录）
		if (c.env.USER_SESSIONS) {
			if (!payload.sessionId) {
				console.log('❌ No sessionId in token payload - token may be from old system');
				return c.json({
					error: 'Token format outdated',
					message: 'Please logout and login again to get a new token',
					needReauth: true
				}, 401);
			}

			const sessionKey = `user_session_${payload.userId}_${payload.sessionId}`;
			const storedSessionData = await c.env.USER_SESSIONS.get(sessionKey);

			if (storedSessionData) {
				try {
					const sessionInfo = JSON.parse(storedSessionData);

					if (sessionInfo.token !== token) {
						console.log('❌ Token mismatch for session');
						return c.json({ error: 'Token not found or invalid' }, 401);
					}

					// 更新最后使用时间
					sessionInfo.lastUsed = new Date().toISOString();
					await c.env.USER_SESSIONS.put(sessionKey, JSON.stringify(sessionInfo), {
						expirationTtl: payload.exp - Math.floor(Date.now() / 1000) // 保持原有过期时间
					});

				} catch (parseError) {
					console.log('❌ Failed to parse session data:', parseError);
					return c.json({ error: 'Token not found or invalid' }, 401);
				}
			} else {
				console.log('❌ Session not found in KV');
				return c.json({ error: 'Token not found or invalid' }, 401);
			}
		} else {
			console.log('⚠️ KV namespace not available, skipping server-side token validation');
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

		// 获取用户的 User-Agent 并解析设备信息
		const userAgent = c.req.header('User-Agent') || 'Unknown User-Agent';
		const deviceInfo = parseUserAgent(userAgent);

		// 获取用户的 IP 地址和国家信息
		const userIP = c.req.header('CF-Connecting-IP') ||
			c.req.header('X-Forwarded-For') ||
			c.req.header('X-Real-IP') ||
			'未知IP';



		const userCountry = c.req.header('CF-IPCountry') || '未知国家';

		// 添加元数据
		const dataToSave = {
			...userData,
			userId: user.userId,
			lastUpdated: new Date().toISOString(),
			version: userData.version || 1,
			deviceInfo: deviceInfo, // 在服务端添加设备信息
			userIP: userIP, // 添加用户IP
			userCountry: userCountry // 添加用户国家
		};

		// 保存当前数据到Redis主键
		const success = await saveDataToRedis(c, user.userId, dataToSave);

		// 保存版本历史到Redis
		const versionSaved = await saveVersionToRedis(c, user.userId, dataToSave);

		// 在 server/api/user-data.js 的保存数据成功部分
		if (success) {
			// 将更新通知存储到KV，而不是直接广播
			c.executionCtx.waitUntil(
				(async () => {
					try {
						const notificationKey = `user_update_${user.userId}_${Date.now()}`;
						const notification = {
							type: 'data_updated',
							data: {
								timestamp: dataToSave.lastUpdated,
								version: dataToSave.version,
								message: 'Data updated from another device'
							},
							createdAt: Date.now()
						};

						// 存储通知，5分钟过期
						await c.env.USER_SESSIONS.put(
							notificationKey,
							JSON.stringify(notification),
							{ expirationTtl: 300 }
						);

						console.log(`📢 Update notification stored for user ${user.userId}`);
					} catch (error) {
						console.error('❌ Failed to store update notification:', error);
					}
				})()
			);

			return c.json({
				success: true,
				message: 'Data saved successfully',
				lastUpdated: dataToSave.lastUpdated,
				version: dataToSave.version
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

// 获取历史版本列表
app.get('/user-data/versions', authMiddleware, async (c) => {
	try {
		const user = c.get('user');

		// 从Redis获取版本历史
		const versions = await getVersionsFromRedis(c, user.userId);

		return c.json({
			success: true,
			versions: versions
		});
	} catch (error) {
		console.error('Error getting data versions:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
});

// 从历史版本恢复数据
app.post('/user-data/restore', authMiddleware, async (c) => {
	try {
		const user = c.get('user');
		const { version } = await c.req.json();

		if (!version) {
			return c.json({ error: 'Version parameter is required' }, 400);
		}

		// 从Redis获取指定版本的数据
		const versionData = await getVersionDataFromRedis(c, user.userId, version);

		if (!versionData) {
			return c.json({ error: 'Version not found' }, 404);
		}

		// 创建新版本（恢复操作也算作一个新版本）
		const restoredData = {
			...versionData,
			userId: user.userId,
			lastUpdated: new Date().toISOString(),
			version: Date.now(), // 使用时间戳作为新版本号
			restoredFrom: version
		};

		// 保存恢复的数据为当前数据
		const success = await saveDataToRedis(c, user.userId, restoredData);

		// 同时保存为新的版本历史
		if (success) {
			await saveVersionToRedis(c, user.userId, restoredData);
		}

		if (success) {
			return c.json({
				success: true,
				data: restoredData,
				message: 'Data restored successfully'
			});
		} else {
			return c.json({ error: 'Failed to restore data' }, 500);
		}
	} catch (error) {
		console.error('Error restoring data version:', error);
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
// 辅助函数：从Redis删除数据
async function deleteDataFromRedis(c, userId) {
	try {
		const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
		const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

		if (!redisUrl || !redisToken) {
			console.error('Redis credentials not found in environment');
			return false;
		}

		const response = await fetch(`${redisUrl}/del/userdata:${userId}`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${redisToken}`,
			}
		});

		if (!response.ok) {
			console.error('Redis delete failed:', response.status, response.statusText);
			return false;
		}

		const result = await response.json();
		// result.result will be 1 if key was deleted, 0 if key didn't exist
		return result.result > 0;
	} catch (error) {
		console.error('Error deleting data from Redis:', error);
		return false;
	}
}

// 辅助函数：保存版本历史到Redis
async function saveVersionToRedis(c, userId, data) {
	try {
		const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
		const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

		if (!redisUrl || !redisToken) {
			console.log('Redis credentials not configured');
			return false;
		}

		const versionKey = `userdata_versions:${userId}`;
		const version = data.version || Date.now();

		// 保存单个版本数据
		const versionDataKey = `userdata_version:${userId}:${version}`;
		const versionDataResponse = await fetch(`${redisUrl}/set/${versionDataKey}`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${redisToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(data),
		});

		if (!versionDataResponse.ok) {
			console.error('Failed to save version data');
			return false;
		}

		// 设置版本数据过期时间（30天）
		await fetch(`${redisUrl}/expire/${versionDataKey}`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${redisToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(30 * 24 * 60 * 60), // 30天
		});

		// 更新版本列表
		const versionInfo = {
			version: version,
			lastUpdated: data.lastUpdated,
			description: data.restoredFrom ? `从版本 ${data.restoredFrom} 恢复` : '数据更新',
			deviceInfo: data.deviceInfo || null, // 添加设备信息
			userIP: data.userIP || null, // 添加用户IP
			userCountry: data.userCountry || null // 添加用户国家
		};

		// 获取现有版本列表
		const existingVersionsResponse = await fetch(`${redisUrl}/get/${versionKey}`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${redisToken}`,
			},
		});

		let versions = [];
		if (existingVersionsResponse.ok) {
			const existingData = await existingVersionsResponse.json();
			if (existingData.result) {
				versions = JSON.parse(existingData.result);
			}
		}

		// 添加新版本到列表开头
		versions.unshift(versionInfo);

		// 只保留最近5个版本
		versions = versions.slice(0, 5);

		// 保存更新后的版本列表
		const versionsResponse = await fetch(`${redisUrl}/set/${versionKey}`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${redisToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(versions),
		});

		return versionsResponse.ok;
	} catch (error) {
		console.error('Error saving version to Redis:', error);
		return false;
	}
}

// 辅助函数：获取版本列表
async function getVersionsFromRedis(c, userId) {
	try {
		const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
		const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

		if (!redisUrl || !redisToken) {
			return [];
		}

		const versionKey = `userdata_versions:${userId}`;
		const response = await fetch(`${redisUrl}/get/${versionKey}`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${redisToken}`,
			},
		});

		if (!response.ok) {
			return [];
		}

		const data = await response.json();
		return data.result ? JSON.parse(data.result) : [];
	} catch (error) {
		console.error('Error getting versions from Redis:', error);
		return [];
	}
}

// 辅助函数：获取指定版本的数据
async function getVersionDataFromRedis(c, userId, version) {
	try {
		const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
		const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

		if (!redisUrl || !redisToken) {
			return null;
		}

		const versionDataKey = `userdata_version:${userId}:${version}`;
		const response = await fetch(`${redisUrl}/get/${versionDataKey}`, {
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
		console.error('Error getting version data from Redis:', error);
		return null;
	}
}

export default app;
