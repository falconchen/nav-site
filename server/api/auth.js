/**
 * GitHub OAuth 认证API
 */

import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';

const app = new Hono();

// GitHub OAuth登录端点
app.get('/auth/github', async (c) => {
    const clientId = c.env.GITHUB_CLIENT_ID;
    const redirectUri = `${new URL(c.req.url).origin}/api/auth/github/callback`;

    console.log('GitHub OAuth redirect URI:', redirectUri);
    console.log('GitHub Client ID:', clientId ? 'Set' : 'Missing');
    console.log('GitHub Client Secret:', c.env.GITHUB_CLIENT_SECRET ? 'Set' : 'Missing');

    if (!clientId) {
        return c.text('GitHub Client ID not configured', 500);
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'user:email',
        state: crypto.randomUUID() // 防止CSRF攻击
    });

    try {
        // 将state存储到KV中，设置10分钟过期
        if (c.env.USER_SESSIONS) {
            await c.env.USER_SESSIONS.put(`github_state_${params.get('state')}`, 'valid', {
                expirationTtl: 600 // 10分钟
            });
            console.log('State stored in KV:', params.get('state'));
        } else {
            console.error('USER_SESSIONS KV namespace not available');
            return c.text('KV storage not configured', 500);
        }
    } catch (error) {
        console.error('Error storing state in KV:', error);
        return c.text('Error storing session state', 500);
    }

    const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    console.log('Redirecting to GitHub:', githubAuthUrl);

    return c.redirect(githubAuthUrl);
});

// GitHub OAuth回调端点
app.get('/auth/github/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
        return c.html(`
            <script>
                window.opener.postMessage({
                    type: 'AUTH_ERROR',
                    error: '${error}'
                }, window.location.origin);
                window.close();
            </script>
        `);
    }

    if (!code || !state) {
        return c.html(`
            <script>
                window.opener.postMessage({
                    type: 'AUTH_ERROR',
                    error: 'missing_code_or_state'
                }, window.location.origin);
                window.close();
            </script>
        `);
    }

        // 验证state参数（如果KV可用）
    if (c.env.USER_SESSIONS) {
        const storedState = await c.env.USER_SESSIONS.get(`github_state_${state}`);
        if (!storedState) {
            return c.html(`
                <script>
                    window.opener.postMessage({
                        type: 'AUTH_ERROR',
                        error: 'invalid_state'
                    }, window.location.origin);
                    window.close();
                </script>
            `);
        }

        // 删除已使用的state
        await c.env.USER_SESSIONS.delete(`github_state_${state}`);
    } else {
        console.log('KV namespace not available, skipping state validation');
    }

        try {
        // 交换access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'nav-site-app/1.0'
            },
            body: JSON.stringify({
                client_id: c.env.GITHUB_CLIENT_ID,
                client_secret: c.env.GITHUB_CLIENT_SECRET,
                code: code,
            }),
        });

        // 检查响应状态
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('GitHub token exchange failed:', {
                status: tokenResponse.status,
                statusText: tokenResponse.statusText,
                response: errorText
            });
            throw new Error(`GitHub token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
        }

        // 获取响应文本并尝试解析JSON
        const responseText = await tokenResponse.text();
        console.log('GitHub token response:', responseText);

        let tokenData;
        try {
            tokenData = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse GitHub response as JSON:', {
                responseText,
                error: parseError.message
            });
            throw new Error('Invalid response format from GitHub');
        }

        if (tokenData.error) {
            throw new Error(tokenData.error_description || tokenData.error);
        }

        const accessToken = tokenData.access_token;

                // 获取用户信息
        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'nav-site-app/1.0'
            },
        });

        // 检查用户信息响应
        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('GitHub user API failed:', {
                status: userResponse.status,
                statusText: userResponse.statusText,
                response: errorText
            });
            throw new Error(`GitHub user API failed: ${userResponse.status} ${userResponse.statusText}`);
        }

        const userResponseText = await userResponse.text();
        console.log('GitHub user response:', userResponseText);

        let userData;
        try {
            userData = JSON.parse(userResponseText);
        } catch (parseError) {
            console.error('Failed to parse GitHub user response as JSON:', {
                responseText: userResponseText,
                error: parseError.message
            });
            throw new Error('Invalid user response format from GitHub');
        }

        // 获取用户邮箱
        const emailResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'nav-site-app/1.0'
            },
        });

        let emailData = [];
        if (emailResponse.ok) {
            const emailResponseText = await emailResponse.text();
            console.log('GitHub email response:', emailResponseText);

            try {
                emailData = JSON.parse(emailResponseText);
            } catch (parseError) {
                console.error('Failed to parse GitHub email response as JSON:', {
                    responseText: emailResponseText,
                    error: parseError.message
                });
                // 继续执行，不抛出错误，因为邮箱不是必需的
            }
        } else {
            console.warn('GitHub email API failed:', {
                status: emailResponse.status,
                statusText: emailResponse.statusText
            });
        }

        const primaryEmail = emailData.find && emailData.find(email => email.primary)?.email || userData.email;

        // 创建用户对象
        const user = {
            id: userData.id,
            login: userData.login,
            name: userData.name || userData.login,
            email: primaryEmail,
            avatar_url: userData.avatar_url,
            created_at: new Date().toISOString(),
            last_login: new Date().toISOString()
        };

        // 保存用户信息到Redis
        await saveUserToRedis(c, user);

                // 获取JWT过期时间配置（默认7天）
        const jwtExpirationDays = parseInt(c.env.JWT_EXPIRATION_DAYS) || 7;
        const jwtExpirationSeconds = jwtExpirationDays * 24 * 60 * 60;

        console.log('🕒 JWT expiration configured:', {
            days: jwtExpirationDays,
            seconds: jwtExpirationSeconds,
            expiresAt: new Date((Math.floor(Date.now() / 1000) + jwtExpirationSeconds) * 1000).toISOString()
        });

        // 生成session ID用于多端登录支持
        const sessionId = crypto.randomUUID();

        // 生成JWT token，包含session ID
        const jwtPayload = {
            userId: user.id,
            sessionId: sessionId, // 新增session ID
            login: user.login,
            name: user.name,
            email: user.email,
            avatar_url: user.avatar_url,
            exp: Math.floor(Date.now() / 1000) + jwtExpirationSeconds,
        };

        console.log('🔐 Generating JWT with payload:', {
            userId: jwtPayload.userId,
            sessionId: jwtPayload.sessionId,
            login: jwtPayload.login,
            name: jwtPayload.name,
            email: jwtPayload.email,
            avatar_url: jwtPayload.avatar_url,
            exp: new Date(jwtPayload.exp * 1000).toISOString()
        });
        console.log('🔐 JWT Secret available for signing:', c.env.JWT_SECRET ? 'Yes' : 'No');

        const token = await sign(jwtPayload, c.env.JWT_SECRET);
        console.log('🎫 Generated JWT token:', token.substring(0, 30) + '...');

        // 将token存储到KV中，支持多端登录（如果可用）
        if (c.env.USER_SESSIONS) {
            const sessionKey = `user_session_${user.id}_${sessionId}`;
            console.log('🗃️ Storing token in KV with key:', sessionKey);
            await c.env.USER_SESSIONS.put(sessionKey, JSON.stringify({
                token: token,
                userAgent: c.req.header('User-Agent') || 'Unknown',
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString()
            }), {
                expirationTtl: jwtExpirationSeconds // 与JWT过期时间保持一致
            });

            // 维护session列表
            const sessionListKey = `user_sessions_list_${user.id}`;
            const existingSessionList = await c.env.USER_SESSIONS.get(sessionListKey);
            let sessionIds = [];

            if (existingSessionList) {
                try {
                    sessionIds = JSON.parse(existingSessionList);
                } catch (parseError) {
                    console.error('Failed to parse existing session list:', parseError);
                    sessionIds = [];
                }
            }

            // 添加新的session ID（如果不存在）
            if (!sessionIds.includes(sessionId)) {
                sessionIds.push(sessionId);
                await c.env.USER_SESSIONS.put(sessionListKey, JSON.stringify(sessionIds), {
                    expirationTtl: jwtExpirationSeconds + 86400 // 比token稍长一点的过期时间
                });
                console.log('✅ Session list updated with new session');
            }

            console.log('✅ Token stored in KV successfully with expiration:', jwtExpirationDays, 'days');
        } else {
            console.log('⚠️ KV namespace not available, token not stored server-side');
        }

        // 返回成功页面，将token传递给父窗口
        return c.html(`
            <script>
                window.opener.postMessage({
                    type: 'AUTH_SUCCESS',
                    token: '${token}',
                    user: ${JSON.stringify(user)}
                }, window.location.origin);
                window.close();
            </script>
        `);

    } catch (error) {
        console.error('GitHub OAuth error:', error);
        return c.html(`
            <script>
                window.opener.postMessage({
                    type: 'AUTH_ERROR',
                    error: '${error.message}'
                }, window.location.origin);
                window.close();
            </script>
        `);
    }
});

// 验证token端点
app.get('/auth/verify', async (c) => {
    console.log('🔍 Token verification request received');

    const authHeader = c.req.header('Authorization');
    console.log('🔑 Auth header:', authHeader ? `Bearer ${authHeader.split(' ')[1]?.substring(0, 20)}...` : 'Missing');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ Missing or invalid authorization header');
        return c.json({ error: 'Missing or invalid authorization header' }, 401);
    }

    const token = authHeader.split(' ')[1];
    console.log('🎫 Token to verify:', token.substring(0, 30) + '...');
    console.log('🔐 JWT Secret available:', c.env.JWT_SECRET ? 'Yes' : 'No');

    try {
        const payload = await verify(token, c.env.JWT_SECRET);
        console.log('✅ JWT verification successful, payload:', {
            userId: payload.userId,
            login: payload.login,
            name: payload.name,
            email: payload.email,
            avatar_url: payload.avatar_url,
            exp: new Date(payload.exp * 1000).toISOString()
        });

        // 检查token是否在KV中存在（支持多端登录）
        if (c.env.USER_SESSIONS) {
            if (!payload.sessionId) {
                console.log('❌ No sessionId in token payload - token may be from old system');
                return c.json({ error: 'Invalid token format' }, 401);
            }

            const sessionKey = `user_session_${payload.userId}_${payload.sessionId}`;
            console.log('🗃️ Checking token in KV with key:', sessionKey);
            const storedSessionData = await c.env.USER_SESSIONS.get(sessionKey);
            console.log('🗃️ Stored session found:', storedSessionData ? 'Yes' : 'No');

            if (storedSessionData) {
                try {
                    const sessionInfo = JSON.parse(storedSessionData);
                    console.log('🔍 Token comparison:', {
                        provided: token.substring(0, 30) + '...',
                        stored: sessionInfo.token.substring(0, 30) + '...',
                        match: sessionInfo.token === token,
                        userAgent: sessionInfo.userAgent,
                        createdAt: sessionInfo.createdAt,
                        lastUsed: sessionInfo.lastUsed
                    });

                    if (sessionInfo.token !== token) {
                        console.log('❌ Token mismatch for session');
                        return c.json({ error: 'Token mismatch' }, 401);
                    }

                    // 更新最后使用时间
                    sessionInfo.lastUsed = new Date().toISOString();
                    await c.env.USER_SESSIONS.put(sessionKey, JSON.stringify(sessionInfo), {
                        expirationTtl: payload.exp - Math.floor(Date.now() / 1000) // 保持原有过期时间
                    });

                } catch (parseError) {
                    console.log('❌ Failed to parse session data:', parseError);
                    return c.json({ error: 'Invalid session data' }, 401);
                }
            } else {
                console.log('❌ Session not found in KV');
                return c.json({ error: 'Session not found' }, 401);
            }
        } else {
            console.log('⚠️ KV namespace not available, skipping server-side token validation');
        }

        // 从Redis获取最新用户信息
        const user = await getUserFromRedis(c, payload.userId);
        console.log('👤 User data from Redis:', user ? 'Found' : 'Not found');

                const responseData = {
            valid: true,
            user: user || {
                id: payload.userId,
                login: payload.login,
                name: payload.name,
                email: payload.email,
                avatar_url: payload.avatar_url
            }
        };

        console.log('✅ Token verification successful, returning user data:', {
            id: responseData.user.id,
            login: responseData.user.login,
            name: responseData.user.name,
            avatar_url: responseData.user.avatar_url
        });
        return c.json(responseData);
    } catch (error) {
        console.error('❌ Token verification failed:', {
            error: error.message,
            stack: error.stack
        });
        return c.json({ error: 'Invalid token', details: error.message }, 401);
    }
});

// 登出端点（支持多端登录）
app.post('/auth/logout', async (c) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = await verify(token, c.env.JWT_SECRET);

        // 从KV中删除当前session的token（如果KV可用）
        if (c.env.USER_SESSIONS && payload.sessionId) {
            const sessionKey = `user_session_${payload.userId}_${payload.sessionId}`;
            console.log('🗑️ Removing session from KV:', sessionKey);
            await c.env.USER_SESSIONS.delete(sessionKey);

            // 从session列表中移除
            const sessionListKey = `user_sessions_list_${payload.userId}`;
            const sessionListData = await c.env.USER_SESSIONS.get(sessionListKey);

            if (sessionListData) {
                try {
                    const sessionIds = JSON.parse(sessionListData);
                    const updatedSessionIds = sessionIds.filter(id => id !== payload.sessionId);
                    await c.env.USER_SESSIONS.put(sessionListKey, JSON.stringify(updatedSessionIds));
                    console.log('✅ Session removed from list successfully');
                } catch (parseError) {
                    console.error('Failed to update session list:', parseError);
                }
            }

            console.log('✅ Session removed successfully');
        } else if (c.env.USER_SESSIONS) {
            console.log('⚠️ No sessionId in token payload - cannot remove specific session');
        } else {
            console.log('⚠️ KV namespace not available, cannot remove session');
        }

        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: 'Invalid token' }, 401);
    }
});

// 获取用户的所有活动session
app.get('/auth/sessions', async (c) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = await verify(token, c.env.JWT_SECRET);

        if (!c.env.USER_SESSIONS) {
            return c.json({ error: 'Session management not available' }, 503);
        }

        // 获取用户的所有session（这需要列举KV中的键，Cloudflare KV不直接支持，所以我们使用另一种方法）
        // 我们需要在用户登录时维护一个session列表
        const sessionListKey = `user_sessions_list_${payload.userId}`;
        const sessionListData = await c.env.USER_SESSIONS.get(sessionListKey);

        let sessions = [];
        if (sessionListData) {
            try {
                const sessionIds = JSON.parse(sessionListData);

                // 获取每个session的详细信息
                for (const sessionId of sessionIds) {
                    const sessionKey = `user_session_${payload.userId}_${sessionId}`;
                    const sessionData = await c.env.USER_SESSIONS.get(sessionKey);

                    if (sessionData) {
                        try {
                            const sessionInfo = JSON.parse(sessionData);
                            sessions.push({
                                sessionId: sessionId,
                                userAgent: sessionInfo.userAgent,
                                createdAt: sessionInfo.createdAt,
                                lastUsed: sessionInfo.lastUsed,
                                isCurrent: sessionId === payload.sessionId
                            });
                        } catch (parseError) {
                            console.error('Failed to parse session data:', parseError);
                        }
                    }
                }
            } catch (parseError) {
                console.error('Failed to parse session list:', parseError);
            }
        }

        return c.json({ sessions });
    } catch (error) {
        return c.json({ error: 'Invalid token' }, 401);
    }
});

// 删除指定的session（踢出其他设备）
app.delete('/auth/sessions/:sessionId', async (c) => {
    const authHeader = c.req.header('Authorization');
    const targetSessionId = c.req.param('sessionId');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = await verify(token, c.env.JWT_SECRET);

        if (!c.env.USER_SESSIONS) {
            return c.json({ error: 'Session management not available' }, 503);
        }

        // 不允许删除当前session
        if (targetSessionId === payload.sessionId) {
            return c.json({ error: 'Cannot logout current session' }, 400);
        }

        // 删除指定的session
        const sessionKey = `user_session_${payload.userId}_${targetSessionId}`;
        await c.env.USER_SESSIONS.delete(sessionKey);

        // 从session列表中移除
        const sessionListKey = `user_sessions_list_${payload.userId}`;
        const sessionListData = await c.env.USER_SESSIONS.get(sessionListKey);

        if (sessionListData) {
            try {
                const sessionIds = JSON.parse(sessionListData);
                const updatedSessionIds = sessionIds.filter(id => id !== targetSessionId);
                await c.env.USER_SESSIONS.put(sessionListKey, JSON.stringify(updatedSessionIds));
            } catch (parseError) {
                console.error('Failed to update session list:', parseError);
            }
        }

        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: 'Invalid token' }, 401);
    }
});

// 辅助函数：保存用户信息到Redis
async function saveUserToRedis(c, user) {
    try {
        const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
        const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

        if (!redisUrl || !redisToken) {
            console.log('Redis credentials not configured, skipping user save');
            return;
        }

        console.log('💾 Saving user to Redis:', user);

        // Upstash Redis REST API格式：["key", "value"]
        const response = await fetch(`${redisUrl}/set/user:${user.id}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(user),
        });

        console.log('💾 Redis save response:', response.ok ? 'Success' : 'Failed');

        if (!response.ok) {
            console.error('Failed to save user to Redis:', await response.text());
        }
    } catch (error) {
        console.error('Error saving user to Redis:', error);
    }
}

// 辅助函数：从Redis获取用户信息
async function getUserFromRedis(c, userId) {
    try {
        const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
        const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

        if (!redisUrl || !redisToken) {
            return null;
        }

        // Upstash Redis REST API格式
        const response = await fetch(`${redisUrl}/get/user:${userId}`, {
            headers: {
                'Authorization': `Bearer ${redisToken}`,
                'Content-Type': 'application/json',
            }
        });


        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        console.log('📤 Raw Redis data:', data);

        if (!data.result) {
            console.log('📤 No user data found in Redis');
            return null;
        }

        let userData;
        try {
            const parsedResult = JSON.parse(data.result);
            console.log('📤 Parsed Redis result:', parsedResult);

            // 如果结果是数组，取第一个元素
            if (Array.isArray(parsedResult)) {
                userData = typeof parsedResult[0] === 'string' ? JSON.parse(parsedResult[0]) : parsedResult[0];
            } else {
                userData = parsedResult;
            }

            console.log('📤 Final user data:', userData);
            return userData;
        } catch (parseError) {
            console.error('Error parsing user data from Redis:', parseError);
            return null;
        }
    } catch (error) {
        console.error('Error getting user from Redis:', error);
        return null;
    }
}

export default app;
