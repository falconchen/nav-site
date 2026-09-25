/**
 * 数据同步功能
 */

// 多端同步检测机制变量
let syncCheckInterval = null;
let lastSyncCheck = 0;
const SYNC_CHECK_INTERVAL = 900000; // 15分钟检查一次
const MIN_CHECK_INTERVAL = 10000; // 最小检查间隔10秒

// 初始化保存状态标志
window.isSavingToCloud = false;

// 同步用户数据（直接覆盖到云端）
async function syncUserData() {
    if (!authToken) {
        showNotification('请先登录', 'error');
        return;
    }

    const progress = showSaveProgress();

    try {
        progress.update(10, '正在收集数据...');

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

        progress.update(30, '正在压缩数据...');

        // 压缩数据
        const compressedData = await compressData(localData);

        progress.update(50, '正在上传到云端...');

        // 直接保存到云端（覆盖）
        const response = await fetch('/api/user-data/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ compressed: compressedData })
        });

        progress.update(80, '正在处理响应...');

        if (response.ok) {
            const data = await response.json();

            // 更新本地版本号
            localStorage.setItem('dataVersion', localData.version.toString());

            progress.update(100, '上传完成！');
            progress.complete(true, '数据已上传到云端！');
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
                progress.complete(false, '登录状态已过期');
                setTimeout(() => {
                    logout();
                }, 2000);
                return;
            }

            throw new Error('上传失败');
        }
    } catch (error) {
        console.error('Error syncing data:', error);
        progress.complete(false, '数据上传失败');
    }

    // 关闭用户菜单
    document.getElementById('userMenu').classList.remove('show');
}

// 加载用户数据（直接覆盖本地）
async function loadUserData(forceLoad = false) {
    if (!authToken) return;

    console.log('📥 Loading user data from server, forceLoad:', forceLoad);

    const progress = showHeaderProgress();
    progress.update(10);

    try {
        const response = await fetch('/api/user-data/load', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        progress.update(40);

        if (response.ok) {
            const responseData = await response.json();
            console.log('📥 Server data received (compressed)');

            if (responseData.data && responseData.lastUpdated) {
                progress.update(60);

                // 解压缩数据
                const data = await decompressData(responseData.data);
                console.log('📥 Server data decompressed:', data);

                progress.update(80);

                console.log('✅ Updating local data with server data');
                await updateLocalData(data);

                progress.complete(true);
            } else if (!responseData.data || !responseData.lastUpdated) {
                console.log('📊 No server data found, keeping local data');
                progress.complete(true);
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
                progress.complete(false);
                showNotification('登录状态已过期，请重新登录', 'error');
                setTimeout(() => {
                    logout();
                }, 2000);
            } else {
                progress.complete(false);
                showNotification('从云端下载数据失败', 'error');
            }
        }
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        progress.complete(false);
        showNotification('从云端下载数据失败', 'error');
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

    const progress = showHeaderProgress();

    try {
        progress.update(10);

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

        progress.update(30);

        // 压缩数据
        const compressedData = await compressData(localData);

        progress.update(50);

        const response = await fetch('/api/user-data/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ compressed: compressedData })
        });

        console.log('🌐 Response status:', response.status, response.statusText);
        console.log('🌐 Response headers:', Object.fromEntries(response.headers.entries()));

        progress.update(80);

        if (response.ok) {
            const responseData = await response.json();
            console.log('✅ Save response:', responseData);
            localStorage.setItem('dataVersion', localData.version.toString());
            console.log('✅ Data saved to cloud successfully, updated local version to:', localData.version);
            progress.complete(true);
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
                progress.complete(false);
                showNotification('登录状态已过期，请重新登录', 'error');
                // 清除旧token并提示重新登录
                setTimeout(() => {
                    logout();
                }, 2000);
            } else {
                progress.complete(false);
                showNotification('自动保存到云端失败', 'error');
            }
        }
    } catch (error) {
        console.error('❌ Error saving user data:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack
        });
        progress.complete(false);
        showNotification('自动保存到云端失败', 'error');
    } finally {
        // 清除正在保存的标志
        window.isSavingToCloud = false;
        console.log('🏁 Setting isSavingToCloud = false, version checks now allowed');
    }
}

// 更新本地数据
async function updateLocalData(cloudData) {
    console.log('🔄 Updating local data with cloud data:', cloudData);

    // 设置标志，防止在更新过程中触发自动保存
    window.isUpdatingFromCloud = true;

    // 更新分类数据
    if (cloudData.categories) {
        console.log('📂 Updating categories:', cloudData.categories.length, 'items');
        categories = cloudData.categories;
        window.categories = categories; // 确保全局变量同步
    }

    // 更新网站数据
    if (cloudData.websites) {
        console.log('🌐 Updating websites:', Object.keys(cloudData.websites).length, 'categories');
        websites = cloudData.websites;
        window.websites = websites; // 确保全局变量同步
    }

    if (cloudData.categories || cloudData.websites) {
        // 旧版本页面上传的数据里还带着「置顶」「最近添加」两个虚拟分类
        if (typeof ensureFixedCategories === 'function') {
            ensureFixedCategories();
        }
        await dbStorage.setItem('navSiteCategories', categories);
        await dbStorage.setItem('navSiteWebsites', websites);
    }

    // 更新设置（不覆盖本地偏好：theme 与 categoriesCompactMode 保持 localStorage）
    if (cloudData.settings) {
        console.log('⚙️ Received cloud settings (ignored for local prefs):', cloudData.settings);
        // 保留占位逻辑，未来可扩展其它非本地偏好类设置
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
    const progress = showSaveProgress();

    try {
        progress.update(10, '正在请求版本数据...');

        const response = await fetch('/api/user-data/restore', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ version })
        });

        progress.update(40, '正在接收数据...');

        if (response.ok) {
            const responseData = await response.json();

            // 更新本地数据
            if (responseData.data) {
                progress.update(60, '正在解压缩数据...');

                // 解压缩数据
                const data = await decompressData(responseData.data);

                progress.update(80, '正在恢复数据...');

                await updateLocalData(data);
            }

            progress.update(100, '恢复完成！');

            dismissVersionSelectionModal();
            progress.complete(true, '数据恢复成功！');
        } else {
            throw new Error('恢复失败');
        }
    } catch (error) {
        console.error('Error restoring version:', error);
        progress.complete(false, '数据恢复失败');
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

// 启动同步检测
function startSyncDetection() {
    if (!authToken) return;

    console.log('🔄 Starting sync detection...');

    // 清除现有定时器
    if (syncCheckInterval) {
        clearInterval(syncCheckInterval);
    }

    // 设置定期检查
    syncCheckInterval = setInterval(() => checkForCloudUpdates(), SYNC_CHECK_INTERVAL);

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
async function checkForCloudUpdates() {
    if (!authToken) return;

    // 如果正在保存或有待保存的本地改动，跳过版本检查，避免云端数据覆盖还没上传的修改
    if (window.isSavingToCloud || window.saveTimeout) {
        console.log('🔍 Skipping sync check - local changes are being saved');
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

                // 检查请求期间用户可能又改了数据，再确认一次
                if (window.isSavingToCloud || window.saveTimeout) {
                    console.log('🔍 Skipping cloud update - local changes are being saved');
                    return;
                }

                await loadUserData(true); // 直接从云端加载覆盖本地
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
document.addEventListener('dataChanged', function () {
    if (authToken) {
        console.log('📝 Data changed event triggered, scheduling save in 2 seconds...');
        console.log('🔍 Current isSavingToCloud status:', window.isSavingToCloud);
        // 延迟保存，避免频繁请求
        clearTimeout(window.saveTimeout);
        window.saveTimeout = setTimeout(() => {
            window.saveTimeout = null;
            saveUserData();
        }, 2000);
    } else {
        console.log('📝 Data changed event triggered, but no auth token available');
    }
});

// 页面关闭前保存数据
window.addEventListener('beforeunload', function () {
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
