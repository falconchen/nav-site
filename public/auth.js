/**
 * 用户认证功能
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

                // 启动同步检测
                if (typeof startSyncDetection === 'function') {
                    startSyncDetection();
                }

                // 立即进行一次同步检测
                if (typeof checkForCloudUpdates === 'function') {
                    setTimeout(() => checkForCloudUpdates(), 1000);
                }
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

    // 显示云端覆盖按钮
    if (typeof toggleCloudOverrideButton === 'function') {
        toggleCloudOverrideButton(true);
    }

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
        if (typeof showNotification === 'function') {
            showNotification('登录成功！', 'success');
        }

        // 启动同步检测
        if (typeof startSyncDetection === 'function') {
            startSyncDetection();
        }

        // 立即进行一次同步检测
        setTimeout(() => {
            if (typeof checkForCloudUpdates === 'function') {
                checkForCloudUpdates();
            }
        }, 1000);

    } else if (event.data.type === 'AUTH_ERROR') {
        console.error('Auth error:', event.data.error);
        if (typeof showNotification === 'function') {
            showNotification('登录失败: ' + event.data.error, 'error');
        }
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

    // 停止同步检测
    if (typeof stopSyncDetection === 'function') {
        stopSyncDetection();
    }

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

    // 隐藏云端覆盖按钮
    if (typeof toggleCloudOverrideButton === 'function') {
        toggleCloudOverrideButton(false);
    }

    // 关闭用户菜单
    document.getElementById('userMenu').classList.remove('show');

    if (typeof showNotification === 'function') {
        showNotification('已退出登录', 'info');
    }
}
