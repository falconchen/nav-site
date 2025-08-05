/**
 * 数据同步功能
 */

// 多端同步检测机制变量
let syncCheckInterval = null;
let lastSyncCheck = Date.now();
const SYNC_CHECK_INTERVAL = 30000; // 30秒检查一次
const MIN_CHECK_INTERVAL = 10000; // 最小检查间隔10秒

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

// 启动同步检测
function startSyncDetection() {
    if (!authToken) return;

    console.log('🔄 Starting sync detection...');

    // 清除现有定时器
    if (syncCheckInterval) {
        clearInterval(syncCheckInterval);
    }

    // 设置定期检查
    syncCheckInterval = setInterval(() => checkForCloudUpdates(false), SYNC_CHECK_INTERVAL);

    // 页面获得焦点时检查
    window.addEventListener('focus', handleWindowFocus);

    // 页面可见性变化时检查
    document.addEventListener('visibilitychange', handleVisibilityChange);

    console.log('✅ Sync detection started successfully');
}

// 停止同步检测
function stopSyncDetection() {
    console.log('⏹️ Stopping sync detection...');

    if (syncCheckInterval) {
        clearInterval(syncCheckInterval);
        syncCheckInterval = null;
    }

    window.removeEventListener('focus', handleWindowFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    console.log('✅ Sync detection stopped');
}

// 检查云端更新
async function checkForCloudUpdates(showNotificationOnUpdate = true) {
    if (!authToken) return;

    // 避免频繁检查
    const now = Date.now();
    if (now - lastSyncCheck < MIN_CHECK_INTERVAL) {
        console.log('🔍 Skipping sync check - too frequent');
        return;
    }
    lastSyncCheck = now;

    console.log('🔍 Checking for cloud updates...');

    try {
        const response = await fetch('/api/user-data/status', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const localVersion = parseInt(localStorage.getItem('dataVersion') || '0');
            const cloudVersion = data.version || 0;

            console.log('📊 Version check:', {
                local: localVersion,
                cloud: cloudVersion,
                hasCloudData: data.hasData,
                lastUpdated: data.lastUpdated
            });

            if (data.hasData && cloudVersion > localVersion) {
                console.log('🆕 New cloud data detected!');

                if (showNotificationOnUpdate) {
                    showSyncUpdateNotification(cloudVersion, localVersion);
                } else {
                    // 静默同步（可选）
                    const autoSync = localStorage.getItem('autoSyncEnabled') === 'true';
                    if (autoSync) {
                        await loadUserData(false);
                        showNotification('数据已自动同步', 'info');
                    }
                }
            } else {
                console.log('📊 Local data is up to date');
            }
        } else {
            let errorInfo;
            try {
                errorInfo = await response.json();
            } catch {
                errorInfo = { error: await response.text() };
            }

            // 处理需要重新认证的情况
            if (errorInfo.needReauth) {
                console.log('🔄 Token outdated during sync check');
                stopSyncDetection();
                showNotification('登录状态已过期，请重新登录', 'error');
                setTimeout(() => {
                    logout();
                }, 2000);
            }
        }
    } catch (error) {
        console.error('❌ Error checking cloud updates:', error);
    }
}

// 显示同步更新通知
function showSyncUpdateNotification(cloudVersion, localVersion) {
    // 移除已存在的通知
    const existingNotification = document.querySelector('.sync-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = 'sync-notification';
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: var(--primary-color);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: var(--shadow-large);
        z-index: 1001;
        max-width: 350px;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        border-left: 4px solid var(--secondary-color);
    `;

    notification.innerHTML = `
        <div style="margin-bottom: 0.5rem;">
            <strong>🆕 发现云端更新</strong>
        </div>
        <div style="font-size: 0.875rem; margin-bottom: 1rem; opacity: 0.9;">
            有其他设备更新了数据 (版本 ${localVersion} → ${cloudVersion})
        </div>
        <div style="display: flex; gap: 0.5rem;">
            <button onclick="syncNow()" style="
                background: white;
                color: var(--primary-color);
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 0.25rem;
                cursor: pointer;
                font-size: 0.875rem;
                font-weight: 500;
            ">
                立即同步
            </button>
            <button onclick="dismissSyncNotification()" style="
                background: transparent;
                color: white;
                border: 1px solid rgba(255,255,255,0.3);
                padding: 0.5rem 1rem;
                border-radius: 0.25rem;
                cursor: pointer;
                font-size: 0.875rem;
            ">
                稍后
            </button>
        </div>
    `;

    document.body.appendChild(notification);

    // 显示动画
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    // 30秒后自动消失
    setTimeout(() => {
        dismissSyncNotification();
    }, 30000);
}

// 立即同步
async function syncNow() {
    dismissSyncNotification();
    await loadUserData(false);
    showNotification('数据已同步', 'success');
}

// 关闭同步通知
function dismissSyncNotification() {
    const notification = document.querySelector('.sync-notification');
    if (notification) {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
}

// 处理窗口获得焦点
function handleWindowFocus() {
    console.log('👁️ Window focused, checking for updates...');
    checkForCloudUpdates(true);
}

// 处理页面可见性变化
function handleVisibilityChange() {
    if (!document.hidden) {
        console.log('👁️ Page became visible, checking for updates...');
        setTimeout(() => checkForCloudUpdates(true), 1000); // 延迟1秒避免频繁触发
    }
}

// 切换自动同步设置
function toggleAutoSync() {
    const currentSetting = localStorage.getItem('autoSyncEnabled') === 'true';
    const newSetting = !currentSetting;

    localStorage.setItem('autoSyncEnabled', newSetting.toString());

    showNotification(newSetting ? '已开启自动同步' : '已关闭自动同步', 'info');

    // 更新显示文本
    updateAutoSyncDisplay();
    // 关闭用户菜单
    document.getElementById('userMenu').classList.remove('show');
}

// 更新自动同步设置显示
function updateAutoSyncDisplay() {
    const autoSyncEnabled = localStorage.getItem('autoSyncEnabled') === 'true';
    const autoSyncText = document.getElementById('autoSyncText');
    if (autoSyncText) {
        autoSyncText.textContent = autoSyncEnabled ? '关闭自动同步' : '开启自动同步';
    }
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
