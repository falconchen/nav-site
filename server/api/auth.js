/**
 * GitHub & Google OAuth 认证API
 */

import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';

const app = new Hono();

// ============ GitHub OAuth ============

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

    const state = crypto.randomUUID();
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'user:email',
        state: state
    });

    try {
        if (c.env.USER_SESSIONS) {
            await c.env.USER_SESSIONS.put(`github_state_${state}`, 'valid', {
                expirationTtl: 600
            });
        } else {
            return c.text('KV storage not configured', 500);
        }
    } catch (error) {
        console.error('Error storing state in KV:', error);
        return c.text('Error storing session state', 500);
    }

    const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
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
                window.opener.postMessage({ type: 'AUTH_ERROR', error: '${error}' }, window.location.origin);
                window.close();
            </script>
        `);
    }

    if (!code || !state) {
        return c.html(`
            <script>
                window.opener.postMessage({ type: 'AUTH_ERROR', error: 'missing_code_or_state' }, window.location.origin);
                window.close();
            </script>
        `);
    }

    if (c.env.USER_SESSIONS) {
        const storedState = await c.env.USER_SESSIONS.get(`github_state_${state}`);
        if (!storedState) {
            return c.html(`
                <script>
                    window.opener.postMessage({ type: 'AUTH_ERROR', error: 'invalid_state' }, window.location.origin);
                    window.close();
                </script>
            `);
        }
        await c.env.USER_SESSIONS.delete(`github_state_${state}`);
    }

    try {
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

        if (!tokenResponse.ok) {
            throw new Error(`GitHub token exchange failed: ${tokenResponse.status}`);
        }

        const tokenData = JSON.parse(await tokenResponse.text());
        if (tokenData.error) {
            throw new Error(tokenData.error_description || tokenData.error);
        }

        const accessToken = tokenData.access_token;

        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'nav-site-app/1.0'
            },
        });

        const userData = JSON.parse(await userResponse.text());

        const emailResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'nav-site-app/1.0'
            },
        });

        let emailData = [];
        if (emailResponse.ok) {
            emailData = JSON.parse(await emailResponse.text());
        }

        const primaryEmail = emailData.find && emailData.find(email => email.primary)?.email || userData.email;

        const providerInfo = {
            provider: 'github',
            providerId: String(userData.id),
            email: primaryEmail,
            login: userData.login,
            name: userData.name || userData.login,
            avatar_url: userData.avatar_url
        };

        const user = await handleOAuthLogin(c, primaryEmail, providerInfo);

        return generateAuthResponse(c, user);
    } catch (error) {
        console.error('GitHub OAuth error:', error);
        return c.html(`
            <script>
                window.opener.postMessage({ type: 'AUTH_ERROR', error: '${error.message}' }, window.location.origin);
                window.close();
            </script>
        `);
    }
});

// ============ Google OAuth ============

// Google OAuth登录端点
app.get('/auth/google', async (c) => {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${new URL(c.req.url).origin}/api/auth/google/callback`;

    console.log('Google OAuth redirect URI:', redirectUri);
    console.log('Google Client ID configured:', !!clientId);
    console.log('Google Client Secret configured:', !!clientSecret);
    console.log('KV configured:', !!c.env.USER_SESSIONS);

    if (!clientId) {
        return c.text('Google Client ID not configured', 500);
    }

    const state = crypto.randomUUID();
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        state: state
    });

    try {
        if (c.env.USER_SESSIONS) {
            console.log('Storing Google state in KV:', state);
            await c.env.USER_SESSIONS.put(`google_state_${state}`, 'valid', {
                expirationTtl: 600
            });
            console.log('Google state stored successfully');
        } else {
            console.error('KV namespace not available');
            return c.text('KV storage not configured', 500);
        }
    } catch (error) {
        console.error('Error storing state in KV:', error);
        return c.text('Error storing session state: ' + error.message, 500);
    }

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return c.redirect(googleAuthUrl);
});

// Google OAuth回调端点
app.get('/auth/google/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
        return c.html(`
            <script>
                window.opener.postMessage({ type: 'AUTH_ERROR', error: '${error}' }, window.location.origin);
                window.close();
            </script>
        `);
    }

    if (!code || !state) {
        return c.html(`
            <script>
                window.opener.postMessage({ type: 'AUTH_ERROR', error: 'missing_code_or_state' }, window.location.origin);
                window.close();
            </script>
        `);
    }

    if (c.env.USER_SESSIONS) {
        const storedState = await c.env.USER_SESSIONS.get(`google_state_${state}`);
        if (!storedState) {
            return c.html(`
                <script>
                    window.opener.postMessage({ type: 'AUTH_ERROR', error: 'invalid_state' }, window.location.origin);
                    window.close();
                </script>
            `);
        }
        await c.env.USER_SESSIONS.delete(`google_state_${state}`);
    }

    try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: c.env.GOOGLE_CLIENT_ID,
                client_secret: c.env.GOOGLE_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: `${new URL(c.req.url).origin}/api/auth/google/callback`
            })
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Google token exchange failed:', errorText);
            throw new Error('Google token exchange failed');
        }

        const tokenData = JSON.parse(await tokenResponse.text());
        const accessToken = tokenData.access_token;

        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!userResponse.ok) {
            throw new Error('Failed to get Google user info');
        }

        const userData = JSON.parse(await userResponse.text());

        const providerInfo = {
            provider: 'google',
            providerId: String(userData.id),
            email: userData.email,
            login: userData.email.split('@')[0],
            name: userData.name,
            avatar_url: userData.picture
        };

        const user = await handleOAuthLogin(c, userData.email, providerInfo);

        return generateAuthResponse(c, user);
    } catch (error) {
        console.error('Google OAuth error:', error);
        return c.html(`
            <script>
                window.opener.postMessage({ type: 'AUTH_ERROR', error: '${error.message}' }, window.location.origin);
                window.close();
            </script>
        `);
    }
});

// ============ 通用函数 ============

// 处理 OAuth 登录 - 支持多 provider 关联
async function handleOAuthLogin(c, email, providerInfo) {
    console.log('🔐 OAuth Login:', providerInfo.provider, email);

    // 尝试通过邮箱查找已有用户
    const existingUser = await findUserByEmail(c, email);

    if (existingUser) {
        // 检查该 provider 是否已绑定
        const existingProvider = existingUser.providers?.find(
            p => p.provider === providerInfo.provider && p.providerId === providerInfo.providerId
        );

        if (existingProvider) {
            // 已绑定，直接更新最后登录时间
            console.log('✅ Existing user, provider already bound');
            existingUser.lastLogin = new Date().toISOString();
            await saveUserToRedis(c, existingUser);
            return existingUser;
        } else {
            // 新 provider，添加到 providers 列表
            console.log('➕ Adding new provider to existing user');
            if (!existingUser.providers) {
                existingUser.providers = [];
            }
            existingUser.providers.push({
                provider: providerInfo.provider,
                providerId: providerInfo.providerId,
                email: providerInfo.email,
                login: providerInfo.login,
                name: providerInfo.name,
                avatar_url: providerInfo.avatar_url
            });
            existingUser.lastLogin = new Date().toISOString();
            await saveUserToRedis(c, existingUser);
            return existingUser;
        }
    }

    // 新用户，创建新账户
    console.log('👤 Creating new user with provider:', providerInfo.provider);
    const newUser = {
        id: `user_${crypto.randomUUID().substring(0, 8)}`,
        primaryEmail: email,
        providers: [{
            provider: providerInfo.provider,
            providerId: providerInfo.providerId,
            email: providerInfo.email,
            login: providerInfo.login,
            name: providerInfo.name,
            avatar_url: providerInfo.avatar_url
        }],
        name: providerInfo.name,
        avatar_url: providerInfo.avatar_url,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
    };

    await saveUserToRedis(c, newUser);
    return newUser;
}

// 通过邮箱查找用户
async function findUserByEmail(c, email) {
    try {
        const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
        const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

        if (!redisUrl || !redisToken) {
            return null;
        }

        // 扫描所有 user: 开头的 key
        const keysResponse = await fetch(`${redisUrl}/keys/user:*`, {
            headers: {
                'Authorization': `Bearer ${redisToken}`
            }
        });

        if (!keysResponse.ok) {
            return null;
        }

        const keysData = await keysResponse.json();
        const keys = keysData.result || [];

        for (const key of keys) {
            if (!key.startsWith('user:')) continue;

            const userResponse = await fetch(`${redisUrl}/get/${key}`, {
                headers: {
                    'Authorization': `Bearer ${redisToken}`
                }
            });

            if (!userResponse.ok) continue;

            const userData = await userResponse.json();
            if (!userData.result) continue;

            let user;
            try {
                user = JSON.parse(userData.result);
            } catch (e) {
                continue;
            }

            // 检查新结构 (primaryEmail)
            if (user.primaryEmail && user.primaryEmail.toLowerCase() === email.toLowerCase()) {
                return user;
            }

            // 检查旧结构 (email)
            if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
                // 迁移旧用户到新结构
                console.log('🔄 Migrating old user structure:', user.id);
                return migrateOldUser(c, user);
            }

            // 检查 providers 数组
            if (user.providers) {
                const found = user.providers.find(p => 
                    p.email && p.email.toLowerCase() === email.toLowerCase()
                );
                if (found) {
                    return user;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Error finding user by email:', error);
        return null;
    }
}

// 迁移旧用户结构到新结构
async function migrateOldUser(c, oldUser) {
    console.log('🔄 Migrating old user, id type:', typeof oldUser.id, oldUser.id);
    
    const userId = String(oldUser.id);
    let providerType, providerId;

    // 尝试从 avatar_url 判断 provider 类型
    const avatarUrl = oldUser.avatar_url || '';
    if (avatarUrl.includes('github.com') || avatarUrl.includes('avatars.githubusercontent.com')) {
        providerType = 'github';
    } else if (avatarUrl.includes('googleusercontent.com')) {
        providerType = 'google';
    } else {
        // 根据 ID 格式判断
        if (userId.startsWith('github_')) {
            providerType = 'github';
        } else if (userId.startsWith('google_')) {
            providerType = 'google';
        } else {
            // 纯数字 ID，很可能是旧的 GitHub ID
            providerType = 'github';
        }
    }

    providerId = userId.replace(/^(github_|google_)/, '');

    const newUser = {
        id: userId,
        primaryEmail: oldUser.email,
        providers: [{
            provider: providerType,
            providerId: providerId,
            email: oldUser.email,
            login: oldUser.login,
            name: oldUser.name,
            avatar_url: oldUser.avatar_url
        }],
        name: oldUser.name,
        avatar_url: oldUser.avatar_url,
        createdAt: oldUser.created_at || oldUser.createdAt,
        lastLogin: oldUser.last_login || oldUser.lastLogin
    };

    await saveUserToRedis(c, newUser);
    console.log('✅ Old user migrated:', newUser.id, 'provider:', providerType);
    return newUser;
}
async function generateAuthResponse(c, user) {
    const jwtExpirationDays = parseInt(c.env.JWT_EXPIRATION_DAYS) || 7;
    const jwtExpirationSeconds = jwtExpirationDays * 24 * 60 * 60;

    const sessionId = crypto.randomUUID();

    // 从新用户结构中提取信息
    const login = user.login || (user.providers?.[0]?.login) || user.primaryEmail?.split('@')[0] || 'user';
    const name = user.name || (user.providers?.[0]?.name) || login;
    const email = user.email || user.primaryEmail || (user.providers?.[0]?.email);
    const avatar_url = user.avatar_url || (user.providers?.[0]?.avatar_url);

    // 获取当前登录的 provider 信息
    const currentProvider = user.providers?.[user.providers.length - 1];

    const jwtPayload = {
        userId: user.id,
        sessionId: sessionId,
        login: login,
        name: name,
        email: email,
        avatar_url: avatar_url,
        provider: currentProvider?.provider || 'unknown',
        providers: user.providers,
        exp: Math.floor(Date.now() / 1000) + jwtExpirationSeconds,
    };

    const token = await sign(jwtPayload, c.env.JWT_SECRET);

    if (c.env.USER_SESSIONS) {
        const sessionKey = `user_session_${user.id}_${sessionId}`;
        await c.env.USER_SESSIONS.put(sessionKey, JSON.stringify({
            token: token,
            userAgent: c.req.header('User-Agent') || 'Unknown',
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        }), {
            expirationTtl: jwtExpirationSeconds
        });

        const sessionListKey = `user_sessions_list_${user.id}`;
        const existingSessionList = await c.env.USER_SESSIONS.get(sessionListKey);
        let sessionIds = [];

        if (existingSessionList) {
            try {
                sessionIds = JSON.parse(existingSessionList);
            } catch (parseError) {
                sessionIds = [];
            }
        }

        if (!sessionIds.includes(sessionId)) {
            sessionIds.push(sessionId);
            await c.env.USER_SESSIONS.put(sessionListKey, JSON.stringify(sessionIds), {
                expirationTtl: jwtExpirationSeconds + 86400
            });
        }
    }

    // 构建返回给前端的用户数据
    const frontendUser = {
        id: user.id,
        login: login,
        name: name,
        email: email,
        avatar_url: avatar_url,
        provider: currentProvider?.provider,
        providers: user.providers,
        createdAt: user.createdAt
    };

    return c.html(`
        <script>
            window.opener.postMessage({
                type: 'AUTH_SUCCESS',
                token: '${token}',
                user: ${JSON.stringify(frontendUser)}
            }, window.location.origin);
            window.close();
        </script>
    `);
}

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

        // Upstash Redis REST API 格式
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

        // Upstash Redis REST API 格式
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
