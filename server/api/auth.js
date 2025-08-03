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

        // 生成JWT token
        const jwtPayload = {
            userId: user.id,
            login: user.login,
            name: user.name,
            email: user.email,
            avatar_url: user.avatar_url,
            exp: Math.floor(Date.now() / 1000) + jwtExpirationSeconds,
        };

        console.log('🔐 Generating JWT with payload:', {
            userId: jwtPayload.userId,
            login: jwtPayload.login,
            name: jwtPayload.name,
            email: jwtPayload.email,
            avatar_url: jwtPayload.avatar_url,
            exp: new Date(jwtPayload.exp * 1000).toISOString()
        });
        console.log('🔐 JWT Secret available for signing:', c.env.JWT_SECRET ? 'Yes' : 'No');

        const token = await sign(jwtPayload, c.env.JWT_SECRET);
        console.log('🎫 Generated JWT token:', token.substring(0, 30) + '...');

        // 将token存储到KV中（如果可用）
        if (c.env.USER_SESSIONS) {
            console.log('🗃️ Storing token in KV with key:', `user_session_${user.id}`);
            await c.env.USER_SESSIONS.put(`user_session_${user.id}`, token, {
                expirationTtl: jwtExpirationSeconds // 与JWT过期时间保持一致
            });
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

        // 检查token是否在KV中存在（如果KV可用）
        if (c.env.USER_SESSIONS) {
            console.log('🗃️ Checking token in KV with key:', `user_session_${payload.userId}`);
            const storedToken = await c.env.USER_SESSIONS.get(`user_session_${payload.userId}`);
            console.log('🗃️ Stored token found:', storedToken ? 'Yes' : 'No');

            if (storedToken) {
                console.log('🔍 Token comparison:', {
                    provided: token.substring(0, 30) + '...',
                    stored: storedToken.substring(0, 30) + '...',
                    match: storedToken === token
                });
            }

            if (!storedToken || storedToken !== token) {
                console.log('❌ Token not found in KV or mismatch');
                return c.json({ error: 'Token not found or invalid' }, 401);
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

// 登出端点
app.post('/auth/logout', async (c) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = await verify(token, c.env.JWT_SECRET);

        // 从KV中删除token（如果KV可用）
        if (c.env.USER_SESSIONS) {
            await c.env.USER_SESSIONS.delete(`user_session_${payload.userId}`);
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
