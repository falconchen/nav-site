/**
 * 用户会话管理功能
 */

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
