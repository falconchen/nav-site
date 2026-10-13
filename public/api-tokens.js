/**
 * 个人令牌管理
 *
 * 令牌给浏览器扩展、脚本调用 /api/v1 用。明文只在生成时返回一次，这里也只在本次打开的弹窗里展示。
 * 同一个弹窗下半部分是 AI 工具接入（MCP）：接入地址，和通过 OAuth 授权过的应用列表。
 */

const REVOKE_CONFIRM_MS = 3000;

async function apiTokensRequest(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: {
            'Authorization': `Bearer ${authToken}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers
        }
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        // 非 JSON 响应按失败处理
    }

    if (data.needReauth) {
        showNotification('登录状态已过期，请重新登录', 'error');
        setTimeout(() => logout(), 2000);
    }

    return { ok: response.ok, status: response.status, data };
}

async function openApiTokens() {
    document.getElementById('userMenu').classList.remove('show');

    if (!authToken) {
        showNotification('请先登录', 'error');
        return;
    }

    // 上次生成的明文不保留
    document.getElementById('apiTokenNew').hidden = true;
    document.getElementById('apiTokenNewValue').textContent = '';
    document.getElementById('apiTokenName').value = '';

    document.getElementById('mcpUrl').textContent = `${location.origin}/mcp`;

    openModal('apiTokensModal');
    await Promise.all([loadApiTokens(), loadOAuthGrants()]);
}

async function loadApiTokens() {
    const list = document.getElementById('apiTokenList');
    list.innerHTML = '<p class="api-token-empty">加载中…</p>';

    try {
        const { ok, data } = await apiTokensRequest('/api/tokens');
        if (!ok) throw new Error(data.error || '加载失败');
        renderApiTokens(data.tokens || []);
    } catch (error) {
        console.error('Error loading api tokens:', error);
        list.innerHTML = '<p class="api-token-empty">令牌列表加载失败</p>';
    }
}

function formatTokenTime(value) {
    return value ? new Date(value).toLocaleString('zh-CN') : '从未使用';
}

function renderApiTokens(tokens) {
    const list = document.getElementById('apiTokenList');

    if (tokens.length === 0) {
        list.innerHTML = '<p class="api-token-empty">还没有令牌</p>';
        return;
    }

    list.innerHTML = tokens
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .map(token => `
            <div class="api-token-item">
                <div class="api-token-info">
                    <div class="api-token-name">${escapeHtml(token.name)}</div>
                    <div class="api-token-meta">
                        <code>${escapeHtml(token.prefix)}…</code>
                        · 创建于 ${escapeHtml(formatTokenTime(token.createdAt))}
                        · 最后使用 ${escapeHtml(formatTokenTime(token.lastUsedAt))}
                    </div>
                </div>
                <button type="button" class="api-token-revoke" data-token-id="${escapeHtml(token.id)}">吊销</button>
            </div>
        `)
        .join('');

    list.querySelectorAll('.api-token-revoke').forEach(button => {
        button.addEventListener('click', () => handleRevokeClick(button));
    });
}

/**
 * 点两次才生效，避免误触：第一次变成「确认xx」，3 秒内再点才算数
 * @returns {boolean} 这一下是不是确认
 */
function confirmSecondClick(button, label) {
    if (button.classList.contains('confirming')) return true;
    button.classList.add('confirming');
    button.textContent = `确认${label}`;
    setTimeout(() => {
        if (button.isConnected && !button.disabled) {
            button.classList.remove('confirming');
            button.textContent = label;
        }
    }, REVOKE_CONFIRM_MS);
    return false;
}

async function handleRevokeClick(button) {
    if (!confirmSecondClick(button, '吊销')) return;

    button.disabled = true;
    try {
        const id = encodeURIComponent(button.dataset.tokenId);
        const { ok, data } = await apiTokensRequest(`/api/tokens/${id}`, { method: 'DELETE' });
        if (!ok) throw new Error(data.error || '吊销失败');
        showNotification('令牌已吊销', 'success');
        await loadApiTokens();
    } catch (error) {
        console.error('Error revoking api token:', error);
        showNotification('吊销令牌失败', 'error');
        button.disabled = false;
    }
}

async function createApiToken() {
    const nameInput = document.getElementById('apiTokenName');
    const createBtn = document.getElementById('apiTokenCreateBtn');
    createBtn.disabled = true;

    try {
        const { ok, status, data } = await apiTokensRequest('/api/tokens', {
            method: 'POST',
            body: JSON.stringify({ name: nameInput.value.trim() })
        });

        if (!ok) {
            showNotification(status === 409 ? '令牌数量已达上限，请先吊销不用的令牌' : '生成令牌失败', 'error');
            return;
        }

        nameInput.value = '';
        document.getElementById('apiTokenNewValue').textContent = data.token;
        document.getElementById('apiTokenNew').hidden = false;
        await loadApiTokens();
    } catch (error) {
        console.error('Error creating api token:', error);
        showNotification('生成令牌失败', 'error');
    } finally {
        createBtn.disabled = false;
    }
}

async function copyNewApiToken() {
    const value = document.getElementById('apiTokenNewValue').textContent;
    if (!value) return;

    try {
        await navigator.clipboard.writeText(value);
        showNotification('令牌已复制', 'success');
    } catch {
        // 剪贴板不可用时选中文本，让用户手动复制
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('apiTokenNewValue'));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        showNotification('请按 Ctrl/Cmd+C 复制', 'info');
    }
}

// ---------- AI 工具接入（MCP） ----------

async function copyMcpUrl() {
    try {
        await copyText(document.getElementById('mcpUrl').textContent);
        showNotification('地址已复制', 'success');
    } catch {
        showNotification('复制失败，请手动选中复制', 'error');
    }
}

async function loadOAuthGrants() {
    const list = document.getElementById('oauthGrantList');
    list.innerHTML = '<p class="api-token-empty">加载中…</p>';

    try {
        const { ok, data } = await apiTokensRequest('/api/oauth/grants');
        if (!ok) throw new Error(data.error || '加载失败');
        renderOAuthGrants(data.grants || []);
    } catch (error) {
        console.error('Error loading oauth grants:', error);
        list.innerHTML = '<p class="api-token-empty">授权列表加载失败</p>';
    }
}

function renderOAuthGrants(grants) {
    const list = document.getElementById('oauthGrantList');

    if (grants.length === 0) {
        list.innerHTML = '<p class="api-token-empty">还没有授权过应用</p>';
        return;
    }

    // 应用名和跳转域名是对方登记时自己填的，不可信
    list.innerHTML = grants
        .map(grant => `
            <div class="api-token-item">
                <div class="api-token-info">
                    <div class="api-token-name">${escapeHtml(grant.clientName)}</div>
                    <div class="api-token-meta">
                        ${grant.redirectHost ? `<code>${escapeHtml(grant.redirectHost)}</code> · ` : ''}授权于 ${escapeHtml(formatTokenTime(grant.createdAt))}
                    </div>
                </div>
                <button type="button" class="api-token-revoke" data-grant-id="${escapeHtml(grant.id)}">撤销</button>
            </div>
        `)
        .join('');

    list.querySelectorAll('.api-token-revoke').forEach(button => {
        button.addEventListener('click', () => handleGrantRevokeClick(button));
    });
}

async function handleGrantRevokeClick(button) {
    if (!confirmSecondClick(button, '撤销')) return;

    button.disabled = true;
    try {
        const id = encodeURIComponent(button.dataset.grantId);
        const { ok, data } = await apiTokensRequest(`/api/oauth/grants/${id}`, { method: 'DELETE' });
        if (!ok) throw new Error(data.error || '撤销失败');
        showNotification('已撤销授权', 'success');
        await loadOAuthGrants();
    } catch (error) {
        console.error('Error revoking oauth grant:', error);
        showNotification('撤销授权失败', 'error');
        button.disabled = false;
    }
}
