/**
 * 用户认证和数据同步功能
 */

// 全局用户状态
let currentUser = null;
let authToken = null;

// 初始化认证状态
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();

    // 监听来自认证窗口的消息
    window.addEventListener('message', handleAuthMessage);

    // 点击其他地方关闭用户菜单
    document.addEventListener('click', function(e) {
        const userMenu = document.getElementById('userMenu');
        const userInfo = document.getElementById('userInfo');

        if (userMenu && !userInfo.contains(e.target)) {
            userMenu.classList.remove('show');
        }
    });
});

// 检查认证状态
async function checkAuthStatus() {
    const token = localStorage.getItem('authToken');

    if (!token) {
        showLoginButton();
        return;
    }

    try {
        const response = await fetch('/api/auth/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

                if (response.ok) {
            const data = await response.json();
            console.log('🔍 Auth verify response:', data);

            if (data.valid) {
                authToken = token;
                currentUser = data.user;
                console.log('✅ User authenticated, user data:', data.user);
                showUserInfo(data.user);

                // 自动从云端加载数据（首次登录时覆盖本地数据）
                await loadUserData(false);
            } else {
                console.log('❌ Token validation failed');
                localStorage.removeItem('authToken');
                showLoginButton();
            }
        } else {
            console.error('❌ Auth verify request failed:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('❌ Error response:', errorText);
            localStorage.removeItem('authToken');
            showLoginButton();
        }
    } catch (error) {
        console.error('Error verifying auth:', error);
        localStorage.removeItem('authToken');
        showLoginButton();
    }
}

// 显示登录按钮
function showLoginButton() {
    document.getElementById('loginBtn').style.display = 'flex';
    document.getElementById('userInfo').style.display = 'none';
}

// 显示用户信息
function showUserInfo(user) {
    console.log('👤 Showing user info (raw):', user);

    // 处理可能的数据格式问题
    let userData = user;

    // 如果user是数组，取第一个元素
    if (Array.isArray(user)) {
        console.log('⚠️ User data is array, extracting first element');
        userData = user[0];
    }

    // 如果userData是字符串，尝试解析为JSON
    if (typeof userData === 'string') {
        console.log('⚠️ User data is string, parsing JSON');
        try {
            userData = JSON.parse(userData);
        } catch (e) {
            console.error('❌ Failed to parse user data JSON:', e);
            userData = user; // 回退到原始数据
        }
    }

    console.log('👤 Processed user data:', userData);

    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('userInfo').style.display = 'flex';

    // 设置头像，如果没有则使用默认头像
    const avatarUrl = userData.avatar_url || userData.avatar || `https://github.com/identicons/${userData.login || 'default'}.png`;
    console.log('🖼️ Setting avatar URL:', avatarUrl);
    document.getElementById('userAvatar').src = avatarUrl;

    // 设置用户名
    const displayName = userData.name || userData.login || 'Unknown User';
    console.log('👤 Setting display name:', displayName);
    document.getElementById('userName').textContent = displayName;
}

// 登录函数
function login() {
    const popup = window.open(
        '/api/auth/github',
        'github-auth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
    );

    // 检查弹窗是否被阻止
    if (!popup) {
        alert('请允许弹出窗口以完成登录');
        return;
    }

    // 监听弹窗关闭
    const checkClosed = setInterval(() => {
        if (popup.closed) {
            clearInterval(checkClosed);
        }
    }, 1000);
}

// 处理认证消息
function handleAuthMessage(event) {
    if (event.origin !== window.location.origin) {
        return;
    }

    if (event.data.type === 'AUTH_SUCCESS') {
        authToken = event.data.token;
        currentUser = event.data.user;

        // 保存token到localStorage
        localStorage.setItem('authToken', authToken);

        // 显示用户信息
        showUserInfo(currentUser);

        // 显示成功消息
        showNotification('登录成功！', 'success');

        // 自动同步数据
        setTimeout(() => {
            loadUserData();
        }, 1000);

    } else if (event.data.type === 'AUTH_ERROR') {
        console.error('Auth error:', event.data.error);
        showNotification('登录失败: ' + event.data.error, 'error');
    }
}

// 切换用户菜单
function toggleUserMenu() {
    const userMenu = document.getElementById('userMenu');
    userMenu.classList.toggle('show');
}

// 登出函数
async function logout() {
    if (!authToken) return;

    try {
        // 调用登出API
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
    } catch (error) {
        console.error('Error during logout:', error);
    }

    // 清除本地状态
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');

    // 显示登录按钮
    showLoginButton();

    // 关闭用户菜单
    document.getElementById('userMenu').classList.remove('show');

    showNotification('已退出登录', 'info');
}

// 同步用户数据
async function syncUserData() {
    if (!authToken) {
        showNotification('请先登录', 'error');
        return;
    }

    showNotification('正在同步数据...', 'info');

    try {
        // 获取本地数据
        const localData = {
            categories: categories || [],
            websites: websites || [],
            settings: {
                theme: localStorage.getItem('theme'),
                categoriesCompactMode: localStorage.getItem('categoriesCompactMode')
            },
            version: parseInt(localStorage.getItem('dataVersion') || '0'),
            lastUpdated: new Date().toISOString()
        };

        // 调用合并API
        const response = await fetch('/api/user-data/merge', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(localData)
        });

        if (response.ok) {
            const data = await response.json();

            // 更新本地数据
            if (data.data) {
                updateLocalData(data.data);
            }

            showNotification('数据同步成功！', 'success');
        } else {
            let errorInfo;
            try {
                errorInfo = await response.json();
            } catch {
                errorInfo = { error: await response.text() };
            }

            // 处理需要重新认证的情况
            if (errorInfo.needReauth) {
                console.log('🔄 Token outdated, need to re-authenticate');
                showNotification('登录状态已过期，请重新登录', 'error');
                setTimeout(() => {
                    logout();
                }, 2000);
                return;
            }

            throw new Error('同步失败');
        }
    } catch (error) {
        console.error('Error syncing data:', error);
        showNotification('数据同步失败', 'error');
    }

    // 关闭用户菜单
    document.getElementById('userMenu').classList.remove('show');
}

// 加载用户数据
async function loadUserData(forceLoad = false) {
    if (!authToken) return;

    console.log('📥 Loading user data from server, forceLoad:', forceLoad);

    try {
        const response = await fetch('/api/user-data/load', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('📥 Server data received:', data);

            if (data.data && data.lastUpdated) {
                const localVersion = parseInt(localStorage.getItem('dataVersion') || '0');
                const cloudVersion = data.data.version || 0;

                console.log('📊 Version comparison:', {
                    local: localVersion,
                    cloud: cloudVersion,
                    forceLoad: forceLoad
                });

                // 强制加载或云端数据更新时覆盖本地数据
                if (forceLoad || cloudVersion > localVersion || localVersion === 0) {
                    if (!forceLoad && cloudVersion > localVersion && localVersion > 0) {
                        // 只有在非强制加载且本地有数据时才询问
                        const sync = confirm('发现云端有更新的数据，是否同步到本地？');
                        if (!sync) {
                            console.log('❌ User declined to sync cloud data');
                            return;
                        }
                    }

                    console.log('✅ Updating local data with server data');
                    updateLocalData(data.data);

                    if (forceLoad) {
                        showNotification('数据已从云端加载', 'success');
                    } else {
                        showNotification('数据已从云端同步', 'success');
                    }
                } else {
                    console.log('📊 Local data is up to date or newer');
                }
            } else if (!data.data || !data.lastUpdated) {
                console.log('📊 No server data found, keeping local data');
            }
        } else {
            let errorInfo;
            try {
                errorInfo = await response.json();
            } catch {
                errorInfo = { error: await response.text() };
            }

            console.error('❌ Failed to load user data:', response.status, response.statusText, errorInfo);

            // 处理需要重新认证的情况
            if (errorInfo.needReauth) {
                console.log('🔄 Token outdated, need to re-authenticate');
                showNotification('登录状态已过期，请重新登录', 'error');
                setTimeout(() => {
                    logout();
                }, 2000);
            }
        }
    } catch (error) {
        console.error('❌ Error loading user data:', error);
    }
}

// 保存用户数据到云端
async function saveUserData() {
    if (!authToken) {
        console.log('🔐 No authToken available, skipping cloud save');
        return;
    }

    console.log('💾 Starting saveUserData...');
    console.log('🔑 Using authToken:', authToken.substring(0, 20) + '...');

    try {
        const localData = {
            categories: categories || [],
            websites: websites || [],
            settings: {
                theme: localStorage.getItem('theme'),
                categoriesCompactMode: localStorage.getItem('categoriesCompactMode')
            },
            version: parseInt(localStorage.getItem('dataVersion') || '0') + 1,
            lastUpdated: new Date().toISOString()
        };

        console.log('📊 Local data to save:', {
            categoriesCount: localData.categories.length,
            websitesCount: localData.websites.length,
            version: localData.version
        });

        const response = await fetch('/api/user-data/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(localData)
        });

        console.log('🌐 Response status:', response.status, response.statusText);
        console.log('🌐 Response headers:', Object.fromEntries(response.headers.entries()));

        if (response.ok) {
            const responseData = await response.json();
            console.log('✅ Save response:', responseData);
            localStorage.setItem('dataVersion', localData.version.toString());
            console.log('✅ Data saved to cloud successfully');
        } else {
            let errorInfo;
            try {
                errorInfo = await response.json();
            } catch {
                errorInfo = { error: await response.text() };
            }

            console.error('❌ Save failed:', {
                status: response.status,
                statusText: response.statusText,
                body: errorInfo
            });

            // 处理需要重新认证的情况
            if (errorInfo.needReauth) {
                console.log('🔄 Token outdated, need to re-authenticate');
                showNotification('登录状态已过期，请重新登录', 'error');
                // 清除旧token并提示重新登录
                setTimeout(() => {
                    logout();
                }, 2000);
            }
        }
    } catch (error) {
        console.error('❌ Error saving user data:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack
        });
    }
}

// 更新本地数据
function updateLocalData(cloudData) {
    console.log('🔄 Updating local data with cloud data:', cloudData);

    // 更新分类数据
    if (cloudData.categories) {
        console.log('📂 Updating categories:', cloudData.categories.length, 'items');
        categories = cloudData.categories;
        window.categories = categories; // 确保全局变量同步
        saveCategoriesToStorage();
        localStorage.setItem('navSiteCategories', JSON.stringify(categories));
    }

    // 更新网站数据
    if (cloudData.websites) {
        console.log('🌐 Updating websites:', Object.keys(cloudData.websites).length, 'categories');
        websites = cloudData.websites;
        window.websites = websites; // 确保全局变量同步
        saveWebsitesToStorage();
        localStorage.setItem('navSiteWebsites', JSON.stringify(websites));
    }

    // 更新设置
    if (cloudData.settings) {
        console.log('⚙️ Updating settings:', cloudData.settings);

        if (cloudData.settings.theme) {
            localStorage.setItem('theme', cloudData.settings.theme);
            document.documentElement.setAttribute('data-theme', cloudData.settings.theme);
        }

        if (cloudData.settings.categoriesCompactMode !== undefined) {
            localStorage.setItem('categoriesCompactMode', cloudData.settings.categoriesCompactMode);
            const sidebarMode = cloudData.settings.categoriesCompactMode === 'true' ? 'compact' : 'normal';
            document.documentElement.setAttribute('data-sidebar', sidebarMode);
        }
    }

    // 更新版本号
    if (cloudData.version) {
        console.log('🔢 Updating version to:', cloudData.version);
        localStorage.setItem('dataVersion', cloudData.version.toString());
    }

    // 重新渲染页面
    console.log('🔄 Starting page re-render after data update');

    // 更新分类列表
    if (typeof renderCategoryList === 'function') {
        renderCategoryList();
        console.log('✅ Category list rendered');
    }

    // 更新分类下拉菜单
    if (typeof updateCategoryDropdown === 'function') {
        updateCategoryDropdown();
        console.log('✅ Category dropdown updated');
    }

    // 重新加载网站数据和渲染
    if (typeof loadWebsitesFromData === 'function') {
        loadWebsitesFromData();
        console.log('✅ Websites data loaded and rendered');
    } else if (typeof renderCategorySections === 'function') {
        renderCategorySections(categories);
        console.log('✅ Category sections rendered');
    }

    console.log('🔄 Page re-render completed');
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // 样式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'var(--secondary-color)' :
                    type === 'error' ? '#ef4444' : 'var(--primary-color)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: var(--shadow-large);
        z-index: 1001;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;

    document.body.appendChild(notification);

    // 显示动画
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    // 自动移除
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 监听数据变化，自动保存到云端
document.addEventListener('dataChanged', function() {
    if (authToken) {
        // 延迟保存，避免频繁请求
        clearTimeout(window.saveTimeout);
        window.saveTimeout = setTimeout(saveUserData, 2000);
    }
});

// 页面关闭前保存数据
window.addEventListener('beforeunload', function() {
    if (authToken) {
        // 使用sendBeacon进行可靠的数据发送
        const localData = {
            categories: categories || [],
            websites: websites || [],
            settings: {
                theme: localStorage.getItem('theme'),
                categoriesCompactMode: localStorage.getItem('categoriesCompactMode')
            },
            version: parseInt(localStorage.getItem('dataVersion') || '0') + 1,
            lastUpdated: new Date().toISOString()
        };

        navigator.sendBeacon('/api/user-data/save', JSON.stringify({
            headers: { 'Authorization': `Bearer ${authToken}` },
            data: localData
        }));
    }
});

// 从云端强制加载数据
async function loadUserDataFromCloud() {
    if (!authToken) {
        showNotification('请先登录', 'error');
        return;
    }

    const confirmLoad = confirm('这将使用云端数据覆盖本地数据，确定要继续吗？');
    if (!confirmLoad) {
        return;
    }

    showNotification('正在从云端加载数据...', 'info');

    try {
        await loadUserData(true); // 强制加载
    } catch (error) {
        console.error('Error loading data from cloud:', error);
        showNotification('从云端加载数据失败', 'error');
    }

    // 关闭用户菜单
    document.getElementById('userMenu').classList.remove('show');
}

// 查看活动session
async function viewActiveSessions() {
    if (!authToken) {
        showNotification('请先登录', 'error');
        return;
    }

    try {
        const response = await fetch('/api/auth/sessions', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            showSessionsModal(data.sessions);
        } else {
            let errorInfo;
            try {
                errorInfo = await response.json();
            } catch {
                errorInfo = { error: await response.text() };
            }

            // 处理需要重新认证的情况
            if (errorInfo.needReauth) {
                console.log('🔄 Token outdated, need to re-authenticate');
                showNotification('登录状态已过期，请重新登录', 'error');
                setTimeout(() => {
                    logout();
                }, 2000);
                return;
            }

            throw new Error('获取session列表失败');
        }
    } catch (error) {
        console.error('Error fetching sessions:', error);
        showNotification('获取登录设备列表失败', 'error');
    }

    // 关闭用户菜单
    document.getElementById('userMenu').classList.remove('show');
}

// 显示session管理模态框
function showSessionsModal(sessions) {
    // 移除已存在的模态框
    const existingModal = document.getElementById('sessionsModal');
    if (existingModal) {
        existingModal.remove();
    }

    // 创建模态框
    const modal = document.createElement('div');
    modal.id = 'sessionsModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1002;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: var(--surface-color);
        padding: 2rem;
        border-radius: 0.5rem;
        box-shadow: var(--shadow-large);
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
    `;

    let sessionListHTML = `
        <h3 style="margin: 0 0 1rem 0; color: var(--text-primary);">活动设备</h3>
    `;

    if (sessions.length === 0) {
        sessionListHTML += `<p style="color: var(--text-secondary);">没有找到活动session</p>`;
    } else {
        sessions.forEach(session => {
            const deviceInfo = parseUserAgent(session.userAgent);
            const isCurrentDevice = session.isCurrent;

            sessionListHTML += `
                <div style="
                    border: 1px solid var(--border-color);
                    border-radius: 0.25rem;
                    padding: 1rem;
                    margin-bottom: 1rem;
                    ${isCurrentDevice ? 'border-color: var(--secondary-color); background: rgba(var(--secondary-color-rgb), 0.1);' : ''}
                ">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">
                                ${deviceInfo.device} ${isCurrentDevice ? '(当前设备)' : ''}
                            </h4>
                            <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                                ${deviceInfo.browser} on ${deviceInfo.os}
                            </p>
                            <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.75rem;">
                                登录时间: ${new Date(session.createdAt).toLocaleString('zh-CN')}
                            </p>
                            <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.75rem;">
                                最后活动: ${new Date(session.lastUsed).toLocaleString('zh-CN')}
                            </p>
                        </div>
                        ${!isCurrentDevice ? `
                            <button onclick="logoutSession('${session.sessionId}')" style="
                                background: #ef4444;
                                color: white;
                                border: none;
                                padding: 0.5rem 1rem;
                                border-radius: 0.25rem;
                                cursor: pointer;
                                font-size: 0.875rem;
                            ">
                                注销
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
    }

    sessionListHTML += `
        <div style="text-align: right; margin-top: 2rem;">
            <button onclick="closeSessionsModal()" style="
                background: var(--primary-color);
                color: white;
                border: none;
                padding: 0.75rem 1.5rem;
                border-radius: 0.25rem;
                cursor: pointer;
            ">
                关闭
            </button>
        </div>
    `;

    modalContent.innerHTML = sessionListHTML;
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // 点击背景关闭模态框
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeSessionsModal();
        }
    });
}

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

// 注销指定session
async function logoutSession(sessionId) {
    if (!authToken) {
        return;
    }

    try {
        const response = await fetch(`/api/auth/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            showNotification('设备已注销', 'success');
            // 重新获取session列表
            viewActiveSessions();
        } else {
            let errorInfo;
            try {
                errorInfo = await response.json();
            } catch {
                errorInfo = { error: await response.text() };
            }

            // 处理需要重新认证的情况
            if (errorInfo.needReauth) {
                console.log('🔄 Token outdated, need to re-authenticate');
                showNotification('登录状态已过期，请重新登录', 'error');
                setTimeout(() => {
                    logout();
                }, 2000);
                return;
            }

            throw new Error('注销设备失败');
        }
    } catch (error) {
        console.error('Error logging out session:', error);
        showNotification('注销设备失败', 'error');
    }
}

// 关闭session管理模态框
function closeSessionsModal() {
    const modal = document.getElementById('sessionsModal');
    if (modal) {
        modal.remove();
    }
}
