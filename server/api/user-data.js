/**
 * 用户数据同步API - 保存和加载用户的网站数据到Redis
 */

import { Hono } from 'hono';
import { requireSession } from '../lib/session-auth.js';
import { RedisError, redisDel, redisGet, redisKeys, redisSet } from '../lib/redis.js';

const app = new Hono();

// 压缩数据工具函数
async function compressData(data) {
    try {
        const jsonString = JSON.stringify(data);
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(jsonString);

        const compressionStream = new CompressionStream('gzip');
        const writer = compressionStream.writable.getWriter();
        writer.write(uint8Array);
        writer.close();

        const reader = compressionStream.readable.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const compressed = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            compressed.set(chunk, offset);
            offset += chunk.length;
        }

        // 转换为 base64
        let binary = '';
        for (let i = 0; i < compressed.length; i++) {
            binary += String.fromCharCode(compressed[i]);
        }

        return btoa(binary);
    } catch (error) {
        console.error('Compression error:', error);
        throw error;
    }
}

// 解压缩数据工具函数
async function decompressData(base64String) {
    try {
        const binary = atob(base64String);
        const compressed = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            compressed[i] = binary.charCodeAt(i);
        }

        const decompressionStream = new DecompressionStream('gzip');
        const writer = decompressionStream.writable.getWriter();
        writer.write(compressed);
        writer.close();

        const reader = decompressionStream.readable.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const decompressed = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            decompressed.set(chunk, offset);
            offset += chunk.length;
        }

        const decoder = new TextDecoder();
        const jsonString = decoder.decode(decompressed);

        return JSON.parse(jsonString);
    } catch (error) {
        console.error('Decompression error:', error);
        throw error;
    }
}

// 解析用户代理字符串
export function parseUserAgent(userAgent) {
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
    } else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
        parser.os = 'iOS';
    }else if (userAgent.includes('Mac')) {
        parser.os = 'macOS';
    } else if (userAgent.includes('Linux')) {
        parser.os = 'Linux';
    } else if (userAgent.includes('Android')) {
        parser.os = 'Android';
    }

    return parser;
}

const authMiddleware = requireSession;

// 保存用户数据
app.post('/user-data/save', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const requestData = await c.req.json();

        // 验证数据格式
        if (!requestData || typeof requestData !== 'object') {
            return c.json({ error: 'Invalid data format' }, 400);
        }

        // 解压缩数据
        let userData;
        if (requestData.compressed) {
            console.log('📦 Decompressing received data...');
            userData = await decompressData(requestData.compressed);
        } else {
            // 向后兼容：如果没有压缩标记，直接使用原数据
            userData = requestData;
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

        if (success) {
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

        // 从Redis加载数据（已解压缩）
        const userData = await loadDataFromRedis(c, user.userId);

        if (userData) {
            // 压缩数据后返回给前端
            const compressed = await compressData(userData);
            return c.json({
                success: true,
                data: compressed,
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

        // 返回前对IP做部分掩码
        const maskedVersions = Array.isArray(versions) ? versions.map(v => ({
            ...v,
            userIP: v && v.userIP ? maskIP(v.userIP) : v && v.userIP,
        })) : [];

        return c.json({
            success: true,
            versions: maskedVersions
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
            // 压缩数据后返回给前端
            const compressed = await compressData(restoredData);
            return c.json({
                success: true,
                data: compressed,
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
export async function saveDataToRedis(c, userId, data) {
    try {
        const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
        const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

        if (!redisUrl || !redisToken) {
            console.log('Redis credentials not configured');
            return false;
        }

        // 压缩数据后再保存到 Redis
        const compressed = await compressData(data);
        const dataToStore = {
            compressed: compressed,
            version: data.version,
            lastUpdated: data.lastUpdated
        };

        const response = await fetch(`${redisUrl}/set/userdata:${userId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(dataToStore),
        });

        if (response.ok) {
            console.log('📦 Data compressed and saved to Redis');
        }

        return response.ok;
    } catch (error) {
        console.error('Error saving data to Redis:', error);
        return false;
    }
}

// 辅助函数：从Redis加载数据
export async function loadDataFromRedis(c, userId) {
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
        if (!data.result) {
            return null;
        }

        const storedData = JSON.parse(data.result);

        // 如果数据是压缩的，解压缩
        if (storedData.compressed) {
            console.log('📦 Decompressing data from Redis...');
            const decompressed = await decompressData(storedData.compressed);
            return decompressed;
        }

        // 向后兼容：如果没有压缩标记，直接返回
        return storedData;
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

/**
 * 记一个历史版本：写版本数据、更新版本列表、清掉不再保留的旧版本
 *
 * 版本列表是「读 → 改 → 写回」。读失败时必须放弃，不能当成「没有历史」继续：
 * 那样会用只含新版本的列表覆盖原列表，原来的版本数据全部变成没人记得的孤儿，
 * 界面上的历史版本也只剩一条（线上出过，留下了 4 个孤儿）。
 *
 * 旧版本按实际存在的 key 清理，不是只删这一次从列表里挤出去的那一个：
 * 以前某次删除失败、请求中断、两次保存互相覆盖列表留下的孤儿，下次保存时一起收走。
 *
 * @returns {Promise<boolean>} 版本有没有记上。主数据由调用方先存好，这里失败不影响它
 */
export async function saveVersionToRedis(c, userId, data, description) {
    try {
        const listKey = `userdata_versions:${userId}`;
        const keyPrefix = `userdata_version:${userId}:`;
        const version = data.version || Date.now();
        const maxVersions = parseInt(c.env.MAX_USER_VERSIONS || '5', 10);

        // 先读列表：读不到就什么都不写，不留下列表里没有的版本数据
        const stored = await redisGet(c.env, listKey);
        if (stored !== null && !Array.isArray(stored)) {
            throw new RedisError(`Redis value of ${listKey} is not a list`);
        }

        await redisSet(c.env, `${keyPrefix}${version}`, { compressed: await compressData(data) });

        const versionInfo = {
            version: version,
            lastUpdated: data.lastUpdated,
            description: description || (data.restoredFrom ? `从版本 ${data.restoredFrom} 恢复` : '数据更新'),
            deviceInfo: data.deviceInfo || null, // 添加设备信息
            userIP: data.userIP || null, // 添加用户IP
            userCountry: data.userCountry || null // 添加用户国家
        };

        // 同一个版本号重传时（上传失败后重试）只留一条：两条指向同一份数据，裁掉其中一条会把另一条的数据也删了
        const versions = [versionInfo, ...(stored || []).filter((item) => item && item.version !== version)]
            .slice(0, maxVersions);

        // 清理是尽力而为，失败留到下次保存再清，不影响这次记版本
        let existing = null;
        try {
            existing = await listVersionNumbers(c.env, keyPrefix);
        } catch (error) {
            console.error('列出历史版本失败，这次不清理:', error);
        }

        await redisSet(c.env, listKey, versions);

        if (existing) {
            const keep = new Set(versions.map((item) => String(item.version)));
            // 只删比保留的最老版本还旧的：另一个请求刚写下、还没来得及进列表的版本比它新，不能误删
            const oldestKept = Math.min(...versions.map((item) => Number(item.version)));
            for (const number of existing) {
                if (keep.has(number) || !(Number(number) < oldestKept)) continue;
                try {
                    await redisDel(c.env, `${keyPrefix}${number}`);
                    console.log(`🗑️ Deleted old version: ${number}`);
                } catch (error) {
                    console.error(`删除旧版本 ${number} 失败，下次保存再清:`, error);
                }
            }
        }

        return true;
    } catch (error) {
        console.error('Error saving version to Redis:', error);
        return false;
    }
}

// 某个用户实际存着的版本号（字符串）。userId 拼进了 glob，里面有特殊字符时不查（返回 null，这次不清理），免得匹配到别人的 key
async function listVersionNumbers(env, keyPrefix) {
    if (!/^[\w:-]+$/.test(keyPrefix)) return null;
    const keys = await redisKeys(env, `${keyPrefix}*`);
    return new Set(keys.filter((key) => key.startsWith(keyPrefix)).map((key) => key.slice(keyPrefix.length)));
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

// 工具：IP掩码（IPv4 与 IPv6）
function maskIP(ip) {
    try {
        if (!ip || typeof ip !== 'string') return ip;
        // 处理多IP（如 X-Forwarded-For），取第一个
        const first = ip.split(',')[0].trim();
        if (first.includes(':')) {
            // IPv6：以冒号分段，保留前2段与最后1段，中间用*替代
            const parts = first.split(':');
            if (parts.length <= 3) return first; // 已经很短
            return [parts[0], parts[1], '****', '****', '****', '****', '', parts[parts.length - 1]].filter(Boolean).join(':');
        } else if (first.includes('.')) {
            // IPv4：a.b.c.d -> a.*.*.d
            const seg = first.split('.');
            if (seg.length !== 4) return first;
            return `${seg[0]}.*.*.${seg[3]}`;
        }
        return first;
    } catch {
        return ip;
    }
}

// 辅助函数：获取指定版本的数据
async function getVersionDataFromRedis(c, userId, version) {
    try {
        const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
        const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

        if (!redisUrl || !redisUrl) {
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
        if (!data.result) {
            return null;
        }

        const storedData = JSON.parse(data.result);

        // 如果数据是压缩的，解压缩
        if (storedData.compressed) {
            console.log('📦 Decompressing version data from Redis...');
            return await decompressData(storedData.compressed);
        }

        // 向后兼容
        return storedData;
    } catch (error) {
        console.error('Error getting version data from Redis:', error);
        return null;
    }
}

export default app;
