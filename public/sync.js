/**
 * 数据同步功能
 */

// 多端同步检测机制变量
let syncCheckInterval = null;
let lastSyncCheck = 0;
const SYNC_CHECK_INTERVAL = 900000; // 15分钟检查一次
const MIN_CHECK_INTERVAL = 10000; // 最小检查间隔10秒
const KEEPALIVE_BODY_LIMIT = 60 * 1024;
let cloudLoadPromise = null;
let cloudCheckPromise = null;
let cloudLoadToken = null;
let cloudCheckToken = null;

// 初始化保存状态标志
window.isSavingToCloud = false;

// 本机有改动还没传到云端时记在 localStorage，值是最近一次改动的时间戳。
// 上传失败、改完 2 秒内关掉页面都会留下它：之后联网、页面回到前台、下次打开时自动重传，
// 期间不拿云端数据覆盖本地，免得没传上去的改动被别的设备上传的版本冲掉
const PENDING_SAVE_KEY = 'pendingCloudSave';

function hasPendingCloudSave() {
    return !!localStorage.getItem(PENDING_SAVE_KEY);
}

function clearPendingCloudSave() {
    localStorage.removeItem(PENDING_SAVE_KEY);
}

// 没登录时改过数据（导入、增删网站等）记在这里。登录后云端也有数据时必须让用户选留哪份：
// 这些改动从没上传过，直接拿云端覆盖就找不回来了。选之前既不上传也不下载
const LOGGED_OUT_CHANGES_KEY = 'loggedOutChanges';

function hasLoggedOutChanges() {
    return !!localStorage.getItem(LOGGED_OUT_CHANGES_KEY);
}

function countLocalWebsites() {
    return Object.values(websites || {}).reduce((sum, sites) => sum + (Array.isArray(sites) ? sites.length : 0), 0);
}

// 登录后处理登录前的本机改动。云端没数据直接上传本机的；有数据弹窗二选一
async function resolveLoggedOutChanges() {
    if (!authToken || document.getElementById('loginDataChoiceModal').classList.contains('active')) return;

    let status;
    const token = authToken;
    const loading = showNavLoadStatus('正在检查云端收藏…', { quiet: true });
    try {
        const { response, data } = await fetchJSONWithRetry('/api/user-data/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        }, { onRetry: () => loading.update('云端暂时未响应，正在重试…') });
        if (authToken !== token) { loading.complete(); return; }
        if (!response.ok) throw new Error('云端收藏检查失败');
        status = data;
    } catch (error) {
        console.error('❌ Error checking cloud data after login:', error);
        if (authToken !== token) { loading.complete(); return; }
        loading.fail(error.name === 'TimeoutError' ? '云端响应超时，请重试。' : '云端收藏检查失败，请重试。', () => checkForCloudUpdates({ force: true }));
        return;
    }
    loading.complete();
    if (!authToken || !hasLoggedOutChanges()) return;

    const useLocal = () => {
        localStorage.removeItem(LOGGED_OUT_CHANGES_KEY);
        localStorage.setItem(PENDING_SAVE_KEY, String(Date.now()));
        saveUserData();
    };

    if (!status.hasData) {
        useLocal();
        return;
    }

    const cloudTime = status.lastUpdated ? new Date(status.lastUpdated).toLocaleString('zh-CN') : '未知时间';
    document.getElementById('loginDataChoiceText').textContent =
        `本机有 ${countLocalWebsites()} 个网站；云端数据最后更新于 ${cloudTime}。`;

    document.getElementById('loginDataUseLocalBtn').onclick = () => {
        closeModal('loginDataChoiceModal');
        useLocal();
    };
    document.getElementById('loginDataUseCloudBtn').onclick = () => {
        closeModal('loginDataChoiceModal');
        localStorage.removeItem(LOGGED_OUT_CHANGES_KEY);
        loadUserData(true);
    };
    openModal('loginDataChoiceModal');
}

// 有没传上去的改动就立刻重传，返回是否触发了上传
function flushPendingCloudSave() {
    if (!authToken || !hasPendingCloudSave()) return false;
    if (window.isSavingToCloud || window.saveTimeout) return true;
    console.log('📤 Retrying pending cloud save...');
    saveUserData();
    return true;
}

// 加载用户数据（直接覆盖本地）
async function loadUserData(forceLoad = false) {
    if (!authToken) return;
    const token = authToken;
    if (cloudLoadPromise && cloudLoadToken === token) return cloudLoadPromise;
    const pending = loadUserDataOnce(forceLoad, token);
    cloudLoadPromise = pending;
    cloudLoadToken = token;
    try { return await pending; }
    finally { if (cloudLoadPromise === pending) cloudLoadPromise = null; }
}

async function loadUserDataOnce(forceLoad, token) {
    if (window.dataLoaded) await window.dataLoaded;
    if (authToken !== token) return;
    const revision = window.navDataRevision;

    console.log('📥 Loading user data from server, forceLoad:', forceLoad);

    const status = showNavLoadStatus('正在下载云端收藏…', { quiet: true });
    const progress = showHeaderProgress();
    progress.update(10);

    try {
        const { response, data: responseData } = await fetchJSONWithRetry('/api/user-data/load', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, { onRetry: () => status.update('下载较慢或暂时失败，正在重试…') });
        if (authToken !== token) { status.complete(); progress.complete(false); return; }

        progress.update(40);

        if (response.ok) {
            console.log('📥 Server data received (compressed)');

            if (responseData.data && responseData.lastUpdated) {
                progress.update(60);

                // 解压缩数据
                status.update('正在整理收藏…');
                const data = await withTimeout(decompressData(responseData.data), 15000, '收藏处理超时');
                if (authToken !== token) { status.complete(); progress.complete(false); return; }
                // 自动下载期间新增的本机改动仍然优先；手动选云端版本沿用覆盖语义。
                if (!forceLoad && (window.navDataRevision !== revision || hasPendingCloudSave() || hasLoggedOutChanges() || window.saveTimeout || window.isSavingToCloud)) {
                    status.complete();
                    progress.complete(true);
                    return;
                }
                console.log('📥 Server data decompressed:', data);

                progress.update(80);

                console.log('✅ Updating local data with server data');
                const persisted = await updateLocalData(data);
                progress.complete(persisted);
                if (persisted) status.complete();
                else status.fail('收藏已加载，但本机保存失败，请重试。', () => loadUserData());
            } else if (!responseData.data || !responseData.lastUpdated) {
                console.log('📊 No server data found, keeping local data');
                progress.complete(true);
                if (window.navDataLoadFailed) status.fail('云端没有可恢复的收藏，请重试本机加载。', retryNavDataLoad);
                else status.complete();
            }
        } else {
            const errorInfo = responseData;

            console.error('❌ Failed to load user data:', response.status, response.statusText, errorInfo);

            // 处理需要重新认证的情况
            if (errorInfo.needReauth || response.status === 401) {
                console.log('🔄 Token outdated, need to re-authenticate');
                progress.complete(false);
                showNotification('登录状态已过期，请重新登录', 'error');
                status.fail('登录状态已过期，请重新登录。');
                setTimeout(() => {
                    logout();
                }, 2000);
            } else {
                progress.complete(false);
                showNotification('从云端下载数据失败', 'error');
                status.fail('云端收藏加载失败，请重试。', () => loadUserData(forceLoad));
            }
        }
    } catch (error) {
        if (authToken !== token) { status.complete(); progress.complete(false); return; }
        console.error('❌ Error loading user data:', error);
        progress.complete(false);
        status.fail(error.name === 'TimeoutError' ? '云端收藏加载超时，请重试。' : '云端收藏加载失败，请重试。', () => loadUserData(forceLoad));
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


// 保存用户数据到云端。keepalive 用于关页面时补传，页面卸载后请求仍会发完
async function saveUserData({ keepalive = false } = {}) {
    if (!authToken) {
        console.log('🔐 No authToken available, skipping cloud save');
        return;
    }
    if (!window.navDataReady || window.navDataLoadFailed) {
        showNavLoadStatus('').fail('本机收藏读取失败，请重试后再同步。', retryNavDataLoad);
        return;
    }

    console.log('💾 Starting saveUserData...');
    console.log('🔑 Using authToken:', authToken.substring(0, 20) + '...');

    // 设置正在保存的标志，防止版本检查干扰
    window.isSavingToCloud = true;
    const token = authToken;
    console.log('🏁 Setting isSavingToCloud = true, preventing version checks during save');

    // 上传期间又有新改动的话，这次成功也不能清掉标记
    const pendingAt = localStorage.getItem(PENDING_SAVE_KEY);

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
        if (authToken !== token) { progress.complete(false); return; }

        progress.update(50);

        const body = JSON.stringify({ compressed: compressedData });
        const response = await fetch('/api/user-data/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body,
            // keepalive 的请求体上限 64KB，超了 fetch 会直接失败，只能留给下次打开时重传
            keepalive: keepalive && body.length < KEEPALIVE_BODY_LIMIT
        });
        if (authToken !== token) { progress.complete(false); return; }

        console.log('🌐 Response status:', response.status, response.statusText);
        console.log('🌐 Response headers:', Object.fromEntries(response.headers.entries()));

        progress.update(80);

        if (response.ok) {
            const responseData = await response.json();
            if (authToken !== token) { progress.complete(false); return; }
            console.log('✅ Save response:', responseData);
            localStorage.setItem('dataVersion', localData.version.toString());
            if (localStorage.getItem(PENDING_SAVE_KEY) === pendingAt) clearPendingCloudSave();
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
                showNotification('保存到云端失败，稍后会自动重试', 'error');
            }
        }
    } catch (error) {
        console.error('❌ Error saving user data:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack
        });
        progress.complete(false);
        showNotification('保存到云端失败，稍后会自动重试', 'error');
    } finally {
        // 清除正在保存的标志
        window.isSavingToCloud = false;
        console.log('🏁 Setting isSavingToCloud = false, version checks now allowed');
    }
}

// 更新本地数据
async function updateLocalData(cloudData) {
    if (!Array.isArray(cloudData.categories) || !cloudData.websites || typeof cloudData.websites !== 'object' || Array.isArray(cloudData.websites)) {
        throw new Error('云端收藏数据格式错误');
    }
    console.log('🔄 Updating local data with cloud data:', cloudData);

    // 设置标志，防止在更新过程中触发自动保存
    window.isUpdatingFromCloud = true;
    try {

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
        }

        // 更新设置（不覆盖本地偏好：theme 与 categoriesCompactMode 保持 localStorage）
        if (cloudData.settings) {
            console.log('⚙️ Received cloud settings (ignored for local prefs):', cloudData.settings);
            // 保留占位逻辑，未来可扩展其它非本地偏好类设置
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
        window.navDataReady = true;
        window.navDataLoadFailed = false;
    } finally {
        // 渲染异常或存储失败也不能把后续保存永远锁住。
        window.isUpdatingFromCloud = false;
    }

    // 已下载的收藏先显示，缓存失败不会让页面空白；只有持久化成功才推进版本号。
    try {
        await Promise.all([
            dbStorage.setItem('navSiteCategories', categories),
            dbStorage.setItem('navSiteWebsites', websites)
        ]);
        if (window.isClearingLocalData) return false;
        window.hasStoredNavData = true;
        if (cloudData.version) localStorage.setItem('dataVersion', cloudData.version.toString());
        return true;
    } catch (error) {
        console.error('❌ Cloud data displayed but local persistence failed:', error);
        return false;
    }
}

// 用户菜单「历史版本」：选一个云端版本覆盖本地
async function loadUserDataFromCloud() {
    document.getElementById('userMenu').classList.remove('show');

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

                const persisted = await updateLocalData(data);
                if (!persisted) {
                    showNavLoadStatus('').fail('收藏已恢复，但本机保存失败，请重试。', () => loadUserData(true));
                    throw new Error('收藏已恢复，但本机保存失败');
                }
            }

            // 用户选了历史版本覆盖本地，本机没传上去的改动也一并放弃
            clearTimeout(window.saveTimeout);
            window.saveTimeout = null;
            clearPendingCloudSave();

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

    // 断网期间没传上去的改动，联网后马上重传
    window.addEventListener('online', checkForCloudUpdates);

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
    window.removeEventListener('online', checkForCloudUpdates);

    console.log('✅ Sync detection stopped');
}

// 检查云端更新
async function checkForCloudUpdates({ force = false } = {}) {
    if (!authToken) return;
    const token = authToken;
    if (cloudCheckPromise && cloudCheckToken === token) return cloudCheckPromise;
    const pending = runCloudUpdateCheck(force, token);
    cloudCheckPromise = pending;
    cloudCheckToken = token;
    try { return await pending; }
    finally { if (cloudCheckPromise === pending) cloudCheckPromise = null; }
}

async function runCloudUpdateCheck(force, token) {
    if (window.dataLoaded) await window.dataLoaded;
    if (authToken !== token) return;
    // 本地尚未读出时，不能上传空内存，也不能用云端覆盖尚未同步的本机收藏。
    if (window.navDataLoadFailed && (hasPendingCloudSave() || hasLoggedOutChanges())) {
        showNavLoadStatus('').fail('本机收藏读取失败，请重试后再同步。', retryNavDataLoad);
        return;
    }

    // 如果正在保存或有待保存的本地改动，跳过版本检查，避免云端数据覆盖还没上传的修改
    if (window.isSavingToCloud || window.saveTimeout) {
        console.log('🔍 Skipping sync check - local changes are being saved');
        return;
    }

    // 登录前本机改过数据：先让用户决定留哪份，决定之前不下载
    if (hasLoggedOutChanges()) {
        await resolveLoggedOutChanges();
        return;
    }

    // 本机有没传上去的改动：先重传，不下载。整份覆盖模式下本机的改动优先，
    // 被覆盖的云端版本还在历史版本里
    if (flushPendingCloudSave()) return;

    // 避免频繁检查
    const now = Date.now();
    if (!force && now - lastSyncCheck < MIN_CHECK_INTERVAL) {
        console.log('🔍 Skipping sync check - too frequent');
        return;
    }
    lastSyncCheck = now;

    console.log('🔍 Checking for cloud updates...');

    const revision = window.navDataRevision;
    const status = showNavLoadStatus('正在检查云端收藏…', { quiet: true });
    try {
        const { response, data } = await fetchJSONWithRetry('/api/user-data/status', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, { onRetry: () => status.update('云端暂时未响应，正在重试…') });
        if (authToken !== token) { status.complete(); return; }

        if (response.ok) {
            const localVersion = parseInt(localStorage.getItem('dataVersion') || '0');
            const cloudVersion = data.version || 0;

            console.log('📊 Version check:', {
                local: localVersion,
                cloud: cloudVersion,
                hasCloudData: data.hasData,
                lastUpdated: data.lastUpdated,
                isSavingToCloud: window.isSavingToCloud
            });

            if (data.hasData && (cloudVersion > localVersion || window.navDataLoadFailed || !window.hasStoredNavData)) {
                console.log('🆕 New cloud data detected!');

                // 检查请求期间用户可能又改了数据，再确认一次
                if (window.navDataRevision !== revision || window.isSavingToCloud || window.saveTimeout || hasPendingCloudSave() || hasLoggedOutChanges()) {
                    console.log('🔍 Skipping cloud update - local changes are being saved');
                    status.complete();
                    return;
                }

                await loadUserData();
            } else {
                console.log('📊 Local data is up to date');
                if (window.navDataLoadFailed) status.fail('收藏加载失败，请重试。', retryNavDataLoad);
                else status.complete();
            }
        } else {
            const errorInfo = data;

            // 处理需要重新认证的情况
            if (errorInfo.needReauth || response.status === 401) {
                console.log('🔄 Token outdated during sync check');
                stopSyncDetection();
                showNotification('登录状态已过期，请重新登录', 'error');
                status.fail('登录状态已过期，请重新登录。');
                setTimeout(() => {
                    logout();
                }, 2000);
            } else status.fail('云端收藏检查失败，请重试。', () => checkForCloudUpdates({ force: true }));
        }
    } catch (error) {
        console.error('❌ Error checking cloud updates:', error);
        if (authToken !== token) { status.complete(); return; }
        status.fail(error.name === 'TimeoutError' ? '云端响应超时，请重试。' : '云端收藏检查失败，请重试。', () => checkForCloudUpdates({ force: true }));
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



// 监听数据变化，自动保存到云端。令牌还没校验完（比如断网打开）也先记下标记，校验通过后重传
document.addEventListener('dataChanged', function () {
    if (!localStorage.getItem('authToken')) {
        console.log('📝 Data changed event triggered, but no auth token available');
        localStorage.setItem(LOGGED_OUT_CHANGES_KEY, String(Date.now()));
        return;
    }
    // 登录前的改动还没决定留哪份，先不上传，免得不问就覆盖了云端
    if (hasLoggedOutChanges()) return;
    localStorage.setItem(PENDING_SAVE_KEY, String(Date.now()));
    if (!authToken) return;

    console.log('📝 Data changed event triggered, scheduling save in 2 seconds...');
    // 延迟保存，避免频繁请求
    clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(() => {
        window.saveTimeout = null;
        saveUserData();
    }, 2000);
});

// 页面转到后台或关闭时，还在 2 秒等待里的改动立刻上传；没发出去的留着标记，下次打开时重传
function saveBeforeHide() {
    if (!authToken || !window.saveTimeout) return;
    clearTimeout(window.saveTimeout);
    window.saveTimeout = null;
    saveUserData({ keepalive: true });
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveBeforeHide();
});
window.addEventListener('pagehide', saveBeforeHide);
