/**
 * 数据同步功能
 */

// 多端同步检测机制变量
let syncCheckInterval = null;
let lastSyncCheck = 0;
const SYNC_CHECK_INTERVAL = 60000; // 60秒检查一次
const MIN_CHECK_INTERVAL = 10000; // 最小检查间隔10秒

// 全局变量控制是否进行定时同步检测，默认为true
let enableTimerSync = true;

// SSE同步相关变量
let sseSync = null;
let hybridSyncManager = null;
const SSE_RECONNECT_DELAY = 1000; // SSE重连延迟基数（毫秒）
const SSE_MAX_RECONNECT_ATTEMPTS = 5; // SSE最大重连次数
const SSE_FALLBACK_POLLING_INTERVAL = 300000; // SSE失败后的轮询间隔（5分钟）

// 初始化保存状态标志
window.isSavingToCloud = false;

// 同步用户数据（直接覆盖到云端）
async function syncUserData() {
    if (!authToken) {
        showNotification('请先登录', 'error');
        return;
    }

    showNotification('正在上传数据到云端...', 'info');

    try {
        // 获取本地数据
        const localData = {
            categories: categories || [],
            websites: websites || [],
            settings: {
                theme: localStorage.getItem('theme'),
                categoriesCompactMode: localStorage.getItem('categoriesCompactMode')
            },
            version: Date.now(), // 使用时间戳作为版本号
            lastUpdated: new Date().toISOString()
        };

        // 直接保存到云端（覆盖）
        const response = await fetch('/api/user-data/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(localData)
        });

        if (response.ok) {
            const data = await response.json();

            // 更新本地版本号
            localStorage.setItem('dataVersion', localData.version.toString());

            showNotification('数据已上传到云端！', 'success');
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

            throw new Error('上传失败');
        }
    } catch (error) {
        console.error('Error syncing data:', error);
        showNotification('数据上传失败', 'error');
    }

    // 关闭用户菜单
    document.getElementById('userMenu').classList.remove('show');
}

// 加载用户数据（直接覆盖本地）
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
                console.log('✅ Updating local data with server data');
                updateLocalData(data.data);

                if (forceLoad) {
                    showNotification('数据已从云端覆盖本地', 'success');
                } else {
                    showNotification('数据已从云端加载', 'success');
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

// 打印网站数量
function getWebsiteCounts(websites) {
	let total = 0;
	const counts = Object.entries(websites).map(([category, sites]) => {
	  const count = Array.isArray(sites) ? sites.length : 0;
	  total += count;
	  return `${category}:${count}`;
	});
	counts.push(`total:${total}`);
	return counts.join(',');
  }


// 保存用户数据到云端
async function saveUserData() {
    if (!authToken) {
        console.log('🔐 No authToken available, skipping cloud save');
        return;
    }

    console.log('💾 Starting saveUserData...');
    console.log('🔑 Using authToken:', authToken.substring(0, 20) + '...');

    // 设置正在保存的标志，防止版本检查干扰
    window.isSavingToCloud = true;
    console.log('🏁 Setting isSavingToCloud = true, preventing version checks during save');

    try {
        const localData = {
            categories: categories || [],
            websites: websites || [],
            settings: {
                theme: localStorage.getItem('theme'),
                categoriesCompactMode: localStorage.getItem('categoriesCompactMode')
            },
            version: Date.now(), // 使用时间戳作为版本号
            lastUpdated: new Date().toISOString()
        };

        console.log('📊 Local data to save:', {
            categoriesCount: localData.categories.length,
            websitesCount: getWebsiteCounts(localData.websites),
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
            console.log('✅ Data saved to cloud successfully, updated local version to:', localData.version);
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
    } finally {
        // 清除正在保存的标志
        window.isSavingToCloud = false;
        console.log('🏁 Setting isSavingToCloud = false, version checks now allowed');
    }
}

// 更新本地数据
function updateLocalData(cloudData) {
    console.log('🔄 Updating local data with cloud data:', cloudData);

    // 设置标志，防止在更新过程中触发自动保存
    window.isUpdatingFromCloud = true;

    // 更新分类数据
    if (cloudData.categories) {
        console.log('📂 Updating categories:', cloudData.categories.length, 'items');
        categories = cloudData.categories;
        window.categories = categories; // 确保全局变量同步
        // 直接保存到localStorage，不触发dataChanged事件
        localStorage.setItem('navSiteCategories', JSON.stringify(categories));
    }

    // 更新网站数据
    if (cloudData.websites) {
        console.log('🌐 Updating websites:', Object.keys(cloudData.websites).length, 'categories');
        websites = cloudData.websites;
        window.websites = websites; // 确保全局变量同步
        // 直接保存到localStorage，不触发dataChanged事件
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

    // 清除标志，允许后续的正常保存
    window.isUpdatingFromCloud = false;
}

// 从云端强制加载数据
async function loadUserDataFromCloud() {
    if (!authToken) {
        showNotification('请先登录', 'error');
        return;
    }

    showVersionSelectionModal();
}

// 显示版本选择模态框
async function showVersionSelectionModal() {
    try {
        // 获取版本列表
        const response = await fetch('/api/user-data/versions', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('获取版本列表失败');
        }

        const data = await response.json();
        const versions = data.versions || [];

        if (versions.length === 0) {
            showNotification('没有找到历史版本', 'info');
            return;
        }

        // 移除已存在的模态框
        const existingModal = document.querySelector('.version-selection-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'version-selection-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 1001;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 0.5rem;
            max-width: 500px;
            width: 90%;
            max-height: 70vh;
            overflow-y: auto;
            box-shadow: var(--shadow-large);
            transform: scale(0.9);
            transition: transform 0.3s ease;
        `;

        let versionsHtml = '';
        versions.forEach((version, index) => {
            const date = new Date(version.lastUpdated);
            const formattedDate = date.toLocaleString('zh-CN');

            // 格式化设备信息
            let deviceInfoHtml = '';
            if (version.deviceInfo || version.userIP || version.userCountry) {
                const device = version.deviceInfo?.device || 'Unknown Device';
                const browser = version.deviceInfo?.browser || 'Unknown Browser';
                const os = version.deviceInfo?.os || 'Unknown OS';
                const userIP = version.userIP || '未知IP';
                const userCountry = version.userCountry || '未知国家';

                deviceInfoHtml = `
                    <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.25rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                                <i class="fas fa-${device === 'Mobile Device' ? 'mobile-alt' : device === 'Tablet' ? 'tablet-alt' : 'desktop'}" style="font-size: 0.75rem;"></i>
                                ${device}
                            </span>
                            <span style="color: #d1d5db;">|</span>
                            <span>${browser}</span>
                            <span style="color: #d1d5db;">|</span>
                            <span>${os}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                                <i class="fas fa-map-marker-alt" style="font-size: 0.75rem;"></i>
                                ${userIP}
                            </span>
                            <span style="color: #d1d5db;">|</span>
                            <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                                <i class="fas fa-flag" style="font-size: 0.75rem;"></i>
                                ${userCountry}
                            </span>
                        </div>
                    </div>
                `;
            }

            versionsHtml += `
                <div class="version-item" style="
                    padding: 1rem;
                    border-bottom: 1px solid #e5e7eb;
                    cursor: pointer;
                    transition: background-color 0.2s;
                " onclick="restoreFromVersion('${version.version}')" onmouseover="this.style.backgroundColor='#f3f4f6'" onmouseout="this.style.backgroundColor='transparent'">
                    <div style="font-weight: 500; margin-bottom: 0.25rem;">
                        版本 ${version.version}
                    </div>
                    <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.25rem;">
                        ${formattedDate}
                    </div>
                    <div style="font-size: 0.875rem; color: #374151;">
                        ${version.description}
                    </div>
                    ${deviceInfoHtml}
                </div>
            `;
        });

        modalContent.innerHTML = `
            <div style="padding: 1.5rem; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: #111827;">
                    选择要恢复的版本
                </h3>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.875rem; color: #6b7280;">
                    选择一个历史版本来覆盖当前数据
                </p>
            </div>
            <div style="max-height: 300px; overflow-y: auto;">
                ${versionsHtml}
            </div>
            <div style="padding: 1rem 1.5rem; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 0.5rem;">
                <button onclick="dismissVersionSelectionModal()" style="
                    background: #f3f4f6;
                    color: #374151;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 0.25rem;
                    cursor: pointer;
                    font-size: 0.875rem;
                ">
                    取消
                </button>
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 显示动画
        setTimeout(() => {
            modal.style.opacity = '1';
            modalContent.style.transform = 'scale(1)';
        }, 100);

    } catch (error) {
        console.error('Error showing version selection:', error);
        showNotification('获取版本列表失败', 'error');
    }
}

// 从指定版本恢复数据
async function restoreFromVersion(version) {
    try {
        showNotification('正在恢复数据...', 'info');

        const response = await fetch('/api/user-data/restore', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ version })
        });

        if (response.ok) {
            const data = await response.json();

            // 更新本地数据
            if (data.data) {
                updateLocalData(data.data);
            }

            dismissVersionSelectionModal();
            showNotification('数据恢复成功！', 'success');
        } else {
            throw new Error('恢复失败');
        }
    } catch (error) {
        console.error('Error restoring version:', error);
        showNotification('数据恢复失败', 'error');
    }
}

// 关闭版本选择模态框
function dismissVersionSelectionModal() {
    const modal = document.querySelector('.version-selection-modal');
    if (modal) {
        modal.style.opacity = '0';
        modal.querySelector('div').style.transform = 'scale(0.9)';
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }
}

// 启动同步检测（使用混合SSE+轮询策略）
function startSyncDetection() {
    if (!authToken) return;

    console.log('🔄 Starting hybrid sync detection...');

    // 停止现有的同步
    stopSyncDetection();

    // 创建并启动混合同步管理器
    hybridSyncManager = new HybridSyncManager();
    hybridSyncManager.start();

    console.log('✅ Hybrid sync detection started successfully');
}

// 停止同步检测
function stopSyncDetection() {
    console.log('⏹️ Stopping sync detection...');

    // 停止混合同步管理器
    if (hybridSyncManager) {
        hybridSyncManager.stop();
        hybridSyncManager = null;
    }

    // 兼容性：清理旧的轮询定时器（如果存在）
    if (syncCheckInterval) {
        clearInterval(syncCheckInterval);
        syncCheckInterval = null;
    }

    // 兼容性：移除旧的事件监听器（如果存在）
    window.removeEventListener('focus', handleWindowFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    console.log('✅ Sync detection stopped');
}

// 检查云端更新
async function checkForCloudUpdates() {
    if (!authToken || !enableTimerSync) return;

    // 如果正在保存到云端，跳过版本检查避免冲突
    if (window.isSavingToCloud) {
        console.log('🔍 Skipping sync check - currently saving to cloud (isSavingToCloud = true)');
        return;
    }

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
                lastUpdated: data.lastUpdated,
                isSavingToCloud: window.isSavingToCloud
            });

            if (data.hasData && cloudVersion > localVersion) {
                console.log('🆕 New cloud data detected!');
                showSyncUpdateNotification(cloudVersion, localVersion);
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
                立即更新
            </button>
            <button onclick="dismissSyncNotificationAndDisableTimer()" style="
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

// 立即更新（从云端加载数据覆盖本地）
async function syncNow() {
    dismissSyncNotification();
    await loadUserData(true); // 直接从云端加载覆盖本地
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

// 关闭同步通知并禁用定时同步
function dismissSyncNotificationAndDisableTimer() {
    enableTimerSync = false;
    console.log('🔕 Timer sync disabled by user');
    dismissSyncNotification();
}

// 处理窗口获得焦点
function handleWindowFocus() {
    console.log('👁️ Window focused, checking for updates...');
    checkForCloudUpdates();
}

// 处理页面可见性变化
function handleVisibilityChange() {
    if (!document.hidden) {
        console.log('👁️ Page became visible, checking for updates...');
        setTimeout(() => checkForCloudUpdates(), 1000); // 延迟1秒避免频繁触发
    }
}



// 监听数据变化，自动保存到云端
document.addEventListener('dataChanged', function() {
    if (authToken) {
        console.log('📝 Data changed event triggered, scheduling save in 2 seconds...');
        console.log('🔍 Current isSavingToCloud status:', window.isSavingToCloud);
        // 延迟保存，避免频繁请求
        clearTimeout(window.saveTimeout);
        window.saveTimeout = setTimeout(saveUserData, 2000);
    } else {
        console.log('📝 Data changed event triggered, but no auth token available');
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
            version: Date.now(), // 使用时间戳作为版本号
            lastUpdated: new Date().toISOString()
        };

        navigator.sendBeacon('/api/user-data/save', JSON.stringify({
            headers: { 'Authorization': `Bearer ${authToken}` },
            data: localData
        }));
    }
});

/**
 * SSE同步类
 * 处理Server-Sent Events连接和消息
 */
class SSESync {
    constructor() {
        this.eventSource = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = SSE_MAX_RECONNECT_ATTEMPTS;
        this.reconnectDelay = SSE_RECONNECT_DELAY;
        this.isConnected = false;
        this.isConnecting = false;
        this.connectionId = null;
        this.lastHeartbeat = 0;
    }

    // 开始SSE连接
    start() {
        if (!authToken) {
            console.log('🔐 No auth token for SSE connection');
            return false;
        }

        if (this.isConnecting || this.isConnected) {
            console.log('📡 SSE already connecting or connected');
            return true;
        }

        console.log('🚀 Starting SSE connection...');
        this.connect();
        return true;
    }

    // 建立SSE连接
    connect() {
        if (this.isConnecting) return;

        this.isConnecting = true;

        try {
            const url = `/api/events?token=${encodeURIComponent(authToken)}`;
            this.eventSource = new EventSource(url);

            this.eventSource.onopen = () => {
                console.log('✅ SSE connected successfully');
                this.isConnected = true;
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.lastHeartbeat = Date.now();
            };

            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('❌ SSE message parse error:', error);
                }
            };

            this.eventSource.onerror = (error) => {
                console.error('❌ SSE connection error:', error);
                this.isConnected = false;
                this.isConnecting = false;

                if (this.eventSource) {
                    this.eventSource.close();
                    this.eventSource = null;
                }

                this.attemptReconnect();
            };

        } catch (error) {
            console.error('❌ Failed to create SSE connection:', error);
            this.isConnecting = false;
            return false;
        }
    }

    // 处理SSE消息
    handleMessage(message) {
        console.log('📨 SSE message received:', message.type);

        switch (message.type) {
            case 'connected':
                this.connectionId = message.data.connectionId;
                console.log(`🔗 SSE session established with ID: ${this.connectionId}`);
                showNotification('实时同步已连接', 'success');
                break;

            case 'data_updated':
                console.log('📢 Data update notification received via SSE');
                this.handleDataUpdate(message.data);
                break;

            case 'heartbeat':
                this.lastHeartbeat = Date.now();
                console.log('💓 SSE heartbeat received');
                break;

            default:
                console.log('📨 Unknown SSE message type:', message.type);
        }
    }

    // 处理数据更新通知
    async handleDataUpdate(updateInfo) {
        console.log('🔄 Processing SSE data update notification...');

        // 避免在保存过程中处理更新
        if (window.isSavingToCloud) {
            console.log('⏭️ Skipping update handling - currently saving to cloud');
            return;
        }

        try {
            showNotification('检测到云端数据更新，正在同步...', 'info');

            // 重新加载用户数据
            await loadUserData();

            showNotification('数据同步完成', 'success');
        } catch (error) {
            console.error('❌ Failed to handle SSE data update:', error);
            showNotification('数据同步失败', 'error');
        }
    }

    // 尝试重新连接
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('❌ SSE max reconnect attempts reached, giving up');
            showNotification('实时同步连接失败，已切换到定期检查模式', 'warning');

            // 通知混合同步管理器SSE失败
            if (hybridSyncManager) {
                hybridSyncManager.onSSEFailed();
            }
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`🔄 Attempting SSE reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    // 停止SSE连接
    stop() {
        console.log('⏹️ Stopping SSE connection...');

        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        console.log('✅ SSE connection stopped');
    }

    // 检查连接状态
    isActive() {
        return this.isConnected && this.eventSource && this.eventSource.readyState === EventSource.OPEN;
    }

    // 检查心跳超时
    isHeartbeatTimeout() {
        if (!this.isConnected || this.lastHeartbeat === 0) return false;
        return (Date.now() - this.lastHeartbeat) > 60000; // 60秒超时
    }
}

/**
 * 混合同步管理器
 * 管理SSE和轮询之间的切换
 */
class HybridSyncManager {
    constructor() {
        this.sseSync = null;
        this.isUsingSSE = false;
        this.isUsingPolling = false;
        this.pollingInterval = null;
        this.sseSupported = this.checkSSESupport();
        this.preferSSE = true;
    }

    // 检查SSE支持
    checkSSESupport() {
        return typeof EventSource !== 'undefined';
    }

    // 启动混合同步
    start() {
        if (!authToken) {
            console.log('🔐 No auth token for sync');
            return;
        }

        console.log('🔄 Starting hybrid sync manager...');

        if (this.sseSupported && this.preferSSE) {
            console.log('📡 Attempting to use SSE for real-time sync');
            this.startSSE();
        } else {
            console.log('⏰ Using polling sync (SSE not supported or not preferred)');
            this.startPolling();
        }

        // 页面获得焦点时检查
        window.addEventListener('focus', this.handleWindowFocus.bind(this));

        // 页面可见性变化时检查
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    // 启动SSE同步
    startSSE() {
        if (this.isUsingSSE) return;

        this.sseSync = new SSESync();
        const success = this.sseSync.start();

        if (success) {
            this.isUsingSSE = true;

            // 设置备用轮询检查（较长间隔）
            this.startBackupPolling();

            console.log('✅ SSE sync started with backup polling');
        } else {
            console.log('❌ Failed to start SSE, falling back to polling');
            this.onSSEFailed();
        }
    }

    // 启动轮询同步
    startPolling() {
        if (this.isUsingPolling) return;

        console.log('⏰ Starting polling sync...');

        // 清除现有定时器
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        // 设置定期检查
        const interval = this.isUsingSSE ? SSE_FALLBACK_POLLING_INTERVAL : SYNC_CHECK_INTERVAL;
        this.pollingInterval = setInterval(() => {
            this.checkForUpdates();
        }, interval);

        this.isUsingPolling = true;
        console.log(`✅ Polling sync started (interval: ${interval / 1000}s)`);
    }

    // 启动备用轮询（SSE主要模式下的备用检查）
    startBackupPolling() {
        console.log('🔄 Starting backup polling for SSE mode...');
        this.startPolling();
    }

    // SSE失败时的处理
    onSSEFailed() {
        console.log('⚠️ SSE failed, switching to polling mode');

        this.isUsingSSE = false;

        if (this.sseSync) {
            this.sseSync.stop();
            this.sseSync = null;
        }

        // 停止现有轮询并重新开始
        this.stopPolling();
        this.startPolling();

        showNotification('实时同步不可用，已切换到定期检查模式', 'warning');
    }

    // 停止轮询
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isUsingPolling = false;
        console.log('⏹️ Polling sync stopped');
    }

    // 检查更新
    async checkForUpdates() {
        // 如果SSE正常工作，跳过轮询检查
        if (this.isUsingSSE && this.sseSync && this.sseSync.isActive() && !this.sseSync.isHeartbeatTimeout()) {
            console.log('📡 SSE active, skipping polling check');
            return;
        }

        // 如果SSE超时，重启SSE
        if (this.isUsingSSE && this.sseSync && this.sseSync.isHeartbeatTimeout()) {
            console.log('💔 SSE heartbeat timeout, restarting...');
            this.sseSync.stop();
            setTimeout(() => this.sseSync.start(), 1000);
            return;
        }

        // 执行轮询检查
        await checkForCloudUpdates();
    }

    // 处理窗口获得焦点
    handleWindowFocus() {
        console.log('👁️ Window focused, checking for updates...');
        this.checkForUpdates();
    }

    // 处理页面可见性变化
    handleVisibilityChange() {
        if (!document.hidden) {
            console.log('👁️ Page became visible, checking for updates...');
            setTimeout(() => this.checkForUpdates(), 1000);
        }
    }

    // 停止混合同步
    stop() {
        console.log('⏹️ Stopping hybrid sync manager...');

        if (this.sseSync) {
            this.sseSync.stop();
            this.sseSync = null;
        }

        this.stopPolling();

        this.isUsingSSE = false;

        window.removeEventListener('focus', this.handleWindowFocus.bind(this));
        document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

        console.log('✅ Hybrid sync manager stopped');
    }

    // 获取当前状态
    getStatus() {
        return {
            sseSupported: this.sseSupported,
            isUsingSSE: this.isUsingSSE,
            isUsingPolling: this.isUsingPolling,
            sseConnected: this.sseSync ? this.sseSync.isActive() : false,
            connectionId: this.sseSync ? this.sseSync.connectionId : null
        };
    }
}

// 添加同步状态显示函数
function getSyncStatus() {
    if (!hybridSyncManager) {
        return {
            mode: 'inactive',
            message: '同步未启动',
            details: {}
        };
    }

    const status = hybridSyncManager.getStatus();

    if (status.isUsingSSE && status.sseConnected) {
        return {
            mode: 'sse',
            message: '实时同步已连接',
            details: {
                connectionId: status.connectionId,
                backupPolling: status.isUsingPolling
            }
        };
    } else if (status.isUsingSSE && !status.sseConnected) {
        return {
            mode: 'sse_connecting',
            message: '正在连接实时同步...',
            details: {
                fallbackPolling: status.isUsingPolling
            }
        };
    } else if (status.isUsingPolling) {
        return {
            mode: 'polling',
            message: status.sseSupported ? '实时同步不可用，使用定期检查' : '设备不支持实时同步，使用定期检查',
            details: {
                sseSupported: status.sseSupported,
                interval: status.isUsingSSE ? SSE_FALLBACK_POLLING_INTERVAL : SYNC_CHECK_INTERVAL
            }
        };
    } else {
        return {
            mode: 'unknown',
            message: '同步状态未知',
            details: status
        };
    }
}

// 显示同步状态通知
function showSyncStatus() {
    const status = getSyncStatus();

    let notificationType = 'info';
    if (status.mode === 'sse') {
        notificationType = 'success';
    } else if (status.mode === 'polling') {
        notificationType = 'warning';
    }

    showNotification(status.message, notificationType);
    console.log('🔍 Current sync status:', status);
}
