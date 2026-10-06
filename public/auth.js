/**
 * 用户认证功能
 */

// 全局用户状态
let currentUser = null;
let authToken = null;
let authRetryTimer = null;
let authRetryPending = false;
let logoutInProgress = false;

// 初始化认证状态
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    window.addEventListener('online', checkAuthStatus);

    // 监听来自认证窗口的消息
    window.addEventListener('message', handleAuthMessage);

    // 点击其他地方关闭用户菜单
    document.addEventListener('click', function(e) {
        const userMenu = document.getElementById('userMenu');
        const userInfo = document.getElementById('userInfo');

        if (userMenu && !userInfo.contains(e.target)) {
            userMenu.classList.remove('show');
        }

        const loginEntry = document.getElementById('loginEntry');
        if (loginEntry && !loginEntry.contains(e.target)) {
            document.getElementById('loginMenu').classList.remove('show');
        }
    });
});

// 检查认证状态
function scheduleAuthRetry() {
    showLoginButton();
    if (!authRetryPending && typeof showNotification === 'function') {
        showNotification('暂时无法验证登录状态，网络恢复后会自动重试', 'info');
    }
    authRetryPending = true;
    clearTimeout(authRetryTimer);
    authRetryTimer = setTimeout(checkAuthStatus, 15000);
}

async function checkAuthStatus() {
    const token = localStorage.getItem('authToken');

    if (!token) {
        clearTimeout(authRetryTimer);
        authRetryPending = false;
        showLoginButton();
        return;
    }

    try {
        const { response, data } = await fetchJSONWithRetry('/api/auth/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // 校验期间用户可能已退出或登录了另一个账号。
        if (localStorage.getItem('authToken') !== token) return;

        if (response.ok) {
            if (localStorage.getItem('authToken') !== token) return;
            console.log('🔍 Auth verify response:', data);

            if (data.valid) {
                clearTimeout(authRetryTimer);
                authRetryPending = false;
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

                // 访问统计走单独的同步通道
                if (typeof startVisitSync === 'function') {
                    startVisitSync();
                }
            } else if (data.valid === false) {
                console.log('❌ Token validation failed');
                clearTimeout(authRetryTimer);
                authRetryPending = false;
                localStorage.removeItem('authToken');
                localStorage.removeItem('authUser');
                showLoginButton();
            } else {
                scheduleAuthRetry();
            }
        } else if (response.status === 401) {
            console.error('❌ Auth verify request failed:', response.status, response.statusText);
            clearTimeout(authRetryTimer);
            authRetryPending = false;
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
            showLoginButton();
        } else {
            console.error('❌ Auth verify temporarily unavailable:', response.status, response.statusText);
            scheduleAuthRetry();
        }
    } catch (error) {
        console.error('Error verifying auth:', error);
        if (localStorage.getItem('authToken') === token) scheduleAuthRetry();
    }
}

// 显示登录按钮
function showLoginButton() {
    document.documentElement.removeAttribute('data-auth');
    document.getElementById('loginBtn').style.display = 'flex';
    document.getElementById('loginBtnGoogle').style.display = 'flex';
    document.getElementById('loginEntry').hidden = false;
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
    console.log('📧 User email:', userData.email);

    document.documentElement.setAttribute('data-auth', 'in');
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('loginBtnGoogle').style.display = 'none';
    document.getElementById('loginEntry').hidden = true;
    document.getElementById('loginMenu').classList.remove('show');
    document.getElementById('userInfo').style.display = 'flex';

    // 设置头像，如果没有则使用默认头像
    const avatarUrl = userData.avatar_url || userData.avatar || `https://github.com/identicons/${userData.login || 'default'}.png`;
    console.log('🖼️ Setting avatar URL:', avatarUrl);
    const avatar = document.getElementById('userAvatar');
    // 用户在 Google / GitHub 换了头像后，旧地址过一阵会失效，失效时换成默认头像，不显示破图
    avatar.onerror = () => {
        avatar.onerror = null;
        avatar.src = 'img/seal.svg';
    };
    // 首屏已经用缓存显示了同一张头像时不重设，免得再闪一下
    if (avatar.getAttribute('src') !== avatarUrl) avatar.src = avatarUrl;

    // 设置用户名
    const displayName = userData.name || userData.login || 'Unknown User';
    console.log('👤 Setting display name:', displayName);
    document.getElementById('userName').textContent = displayName;

    // 缓存名字和头像：下次打开时 index.html 的内联脚本在校验返回前先显示它们，页眉不闪登录按钮
    try {
        localStorage.setItem('authUser', JSON.stringify({ name: displayName, avatar: avatarUrl }));
    } catch (e) {}

}

// 登录函数 - GitHub
function login(provider = 'github') {
    if (logoutInProgress) return;
    const authUrl = provider === 'google' ? '/api/auth/google' : '/api/auth/github';
    
    const popup = window.open(
        authUrl,
        `${provider}-auth`,
        'width=600,height=700,scrollbars=yes,resizable=yes'
    );

    if (!popup) {
        alert('请允许弹出窗口以完成登录');
        return;
    }

    const checkClosed = setInterval(() => {
        if (popup.closed) {
            clearInterval(checkClosed);
        }
    }, 1000);
}

// 处理认证消息
function handleAuthMessage(event) {
    if (event.origin !== window.location.origin || logoutInProgress) {
        return;
    }

    if (event.data.type === 'AUTH_SUCCESS') {
        clearTimeout(authRetryTimer);
        authRetryPending = false;
        authToken = event.data.token;
        currentUser = event.data.user;

        // 保存token到localStorage
        localStorage.setItem('authToken', authToken);
        // 新登录照旧以云端为准，别把上一个账号（或登录前）没传上去的改动传到这个账号
        if (typeof clearPendingCloudSave === 'function') clearPendingCloudSave();

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

        if (typeof startVisitSync === 'function') {
            startVisitSync();
        }

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

// 小屏未登录时的登录菜单（GitHub / Google / 深浅色）
function toggleLoginMenu() {
    document.getElementById('loginMenu').classList.toggle('show');
}

// 只有用户主动退出才弹窗；同步发现登录过期时仍直接退出并保留数据。
function showLogoutConfirm() {
    if (!authToken || logoutInProgress) return;
    document.getElementById('logoutClearLocalData').checked = true;
    document.getElementById('userMenu').classList.remove('show');
    openModal('logoutConfirmModal');
    document.getElementById('logoutCancelBtn').focus();
}

async function confirmLogout() {
    const clearLocalData = document.getElementById('logoutClearLocalData').checked;
    closeModal('logoutConfirmModal');
    await logout({ clearLocalData });
}

async function clearLocalUserData() {
    await dbStorage.clear();
    const keys = [
        'navSiteCategories', 'navSiteWebsites', 'navSiteVisits', 'dataVersion',
        'pendingCloudSave', 'loggedOutChanges', 'visitsPending', 'visitsSyncedUser',
        'frequentPins', 'frequentPinsUpdatedAt'
    ];
    // 只清本站的数据，保留主题、强调色、分区顺序及工具偏好。
    for (const key of Object.keys(localStorage)) {
        if (keys.includes(key) || key.startsWith('navSiteStorageFallback:') || key.startsWith('noteDraft:')) {
            localStorage.removeItem(key);
        }
    }
    sessionStorage.removeItem('privateRevealed');
}

// 登出函数；内部的登录过期处理默认保留本地数据。
async function logout({ clearLocalData = false } = {}) {
    if (!authToken || logoutInProgress) return;
    logoutInProgress = true;
    const token = authToken;

    clearTimeout(authRetryTimer);
    authRetryPending = false;
    clearTimeout(window.saveTimeout);
    window.saveTimeout = null;

    // 停止同步检测
    if (typeof stopSyncDetection === 'function') {
        stopSyncDetection();
    }
    if (typeof stopVisitSync === 'function') {
        stopVisitSync();
    }

    // 先结束本机登录，防止在途的同步响应继续写回当前账号的数据。
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    if (typeof clearPendingCloudSave === 'function') clearPendingCloudSave();
    showLoginButton();
    document.getElementById('userMenu').classList.remove('show');

    if (clearLocalData) {
        window.isClearingLocalData = true;
        dbStorage.writesPaused = true;
        if (typeof visitStatsSaveTimer !== 'undefined') clearTimeout(visitStatsSaveTimer);
    }

    try {
        // 调用登出API
        await fetchJSONWithRetry('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    } catch (error) {
        console.error('Error during logout:', error);
    }

    if (clearLocalData) {
        try {
            await clearLocalUserData();
            // 刷新同时丢弃内存中的收藏、统计和已渲染的私密内容。
            window.location.reload();
            return;
        } catch (error) {
            console.error('Error clearing local data:', error);
            window.isClearingLocalData = false;
            dbStorage.writesPaused = false;
            logoutInProgress = false;
            showNotification('已退出登录，但本地数据清除失败，请在浏览器设置中清除此站点的数据', 'error');
            return;
        }
    }

    logoutInProgress = false;
    if (typeof showNotification === 'function') {
        showNotification('已退出登录', 'info');
    }
}
