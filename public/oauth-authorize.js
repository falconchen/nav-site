/**
 * /oauth/authorize：AI 工具通过 MCP 接入时的授权确认页
 *
 * 地址栏里是 OAuth 授权请求（client_id、redirect_uri、PKCE 等），原样交给服务端校验。
 * 页面只做两件事：确认是谁在授权，让他亲手点同意或拒绝。服务端实现在 server/api/oauth.js。
 *
 * 身份有两个来源：
 * - 这个浏览器已经登录过首页：直接用 localStorage 里的 authToken
 * - 没登录（手机 App 的内嵌浏览器存储是隔离的，一定没有）：整页跳去 GitHub / Google 登录再跳回来，
 *   拿到的令牌只放 sessionStorage，授权完就注销。这次登录只为授权，不改变这个浏览器里首页的登录状态
 *
 * 和记事本页一样不加载 auth.js，收到 401 也不删 authToken：是否真过期由首页的校验流程判断。
 */

// 和 server/api/auth.js 的 LOGIN_RESULT_KEY 对应
const LOGIN_RESULT_KEY = 'oauthLoginResult';
const TEMP_TOKEN_KEY = 'oauthLoginToken';

const $ = (id) => document.getElementById(id);

// 授权请求就是地址栏里的查询串，登录跳转来回都带着它
const authQuery = location.search;

let token = '';
// 令牌是不是这一页为了授权临时登录拿到的
let tokenIsTemporary = false;
let busy = false;

function sessionGet(key) {
    try {
        return sessionStorage.getItem(key) || '';
    } catch {
        return '';
    }
}

function sessionRemove(key) {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // 无痕模式下 sessionStorage 可能不可用
    }
}

function showMessage(type, text, hint = '') {
    const icons = { loading: 'fa-spinner fa-spin', success: 'fa-circle-check', error: 'fa-circle-exclamation' };
    $('oauthConsent').hidden = true;
    $('oauthMessage').hidden = false;
    $('oauthMessage').dataset.type = type;
    $('oauthMessageIcon').className = `fas ${icons[type]}`;
    $('oauthMessageText').textContent = text;
    $('oauthMessageHint').textContent = hint;
    $('oauthMessageHint').hidden = !hint;
}

function showNotice(text) {
    $('oauthNotice').textContent = text;
    $('oauthNotice').hidden = !text;
}

async function api(path, { method = 'GET', body, auth = false } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

/**
 * 取出整页跳转登录带回来的结果
 * @returns {string} 登录失败时的原因，没有失败返回空串
 */
function takeLoginResult() {
    const raw = sessionGet(LOGIN_RESULT_KEY);
    if (!raw) return '';
    sessionRemove(LOGIN_RESULT_KEY);
    try {
        const result = JSON.parse(raw);
        if (result.type === 'AUTH_SUCCESS' && result.token) {
            sessionStorage.setItem(TEMP_TOKEN_KEY, result.token);
            return '';
        }
        return String(result.error || '未知错误');
    } catch {
        return '登录结果读取失败';
    }
}

function readToken() {
    const temporary = sessionGet(TEMP_TOKEN_KEY);
    if (temporary) {
        token = temporary;
        tokenIsTemporary = true;
        return;
    }
    tokenIsTemporary = false;
    try {
        token = localStorage.getItem('authToken') || '';
    } catch {
        token = '';
    }
}

// 临时登录的会话用完就注销；首页的登录状态不碰
async function dropTemporarySession() {
    if (!tokenIsTemporary || !token) return;
    sessionRemove(TEMP_TOKEN_KEY);
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            keepalive: true
        });
    } catch {
        // 注销失败不影响授权结果，这个会话没人拿着令牌也用不了
    }
}

function renderRequest(info) {
    $('oauthClient').textContent = info.client.name;
    $('oauthOrigin').textContent = info.client.domain
        ? `由 ${info.client.domain} 发布。`
        : '这个应用是自己登记的，名称没有经过核实，请留意下面的跳转地址。';
    $('oauthRedirect').textContent = info.redirectHost;
    $('oauthLoopback').hidden = !info.redirectIsLoopback;
    $('oauthMessage').hidden = true;
    $('oauthConsent').hidden = false;
}

function showDecision(user) {
    const name = user?.name || user?.login || '';
    $('oauthAccount').textContent = name;
    $('oauthAccountRow').hidden = !name;
    $('oauthLogin').hidden = true;
    $('oauthDecision').hidden = false;
}

function showLogin() {
    $('oauthAccountRow').hidden = true;
    $('oauthDecision').hidden = true;
    $('oauthLogin').hidden = false;
}

/**
 * 校验手里的令牌还能不能用
 * @returns {Promise<Object|null|undefined>} 用户信息；令牌无效返回 null；网络或服务端故障返回 undefined
 */
async function verifyToken() {
    if (!token) return null;
    try {
        const { ok, status, data } = await api('/api/auth/verify', { auth: true });
        if (ok && data.valid) return data.user;
        if (status === 401) return null;
        return undefined;
    } catch {
        return undefined;
    }
}

function setBusy(value) {
    busy = value;
    document.querySelectorAll('#oauthConsent button').forEach((button) => {
        button.disabled = value;
    });
}

// 授权请求本身有问题：回调地址通过了校验就把错误带回应用，否则只能停在这里
function handleRequestError(data) {
    if (data.redirectTo) {
        location.replace(data.redirectTo);
        return;
    }
    if (data.code === 'CLIENT_UNVERIFIED') {
        // 多半是对方的服务器不让我们拉它的元数据文档（ChatGPT 就是），重试没用，要换注册方式
        showMessage('error', '没能核实这个应用的身份', '如果应用的连接设置里能选客户端注册方式，请改成「动态客户端注册（DCR）」后重新连接。');
        return;
    }
    const text = data.code === 'OAUTH_UNAVAILABLE' ? '这个地址上没有启用授权' : '这个授权请求无效';
    showMessage('error', text, '请回到应用里重新发起连接。');
}

async function decide(action) {
    if (busy) return;
    setBusy(true);
    showNotice('');

    try {
        const { ok, status, data } = await api(`/api/oauth/${action}`, {
            method: 'POST',
            body: { query: authQuery },
            auth: action === 'approve'
        });

        if (ok && data.redirectTo) {
            await dropTemporarySession();
            showMessage('success', action === 'approve' ? '已授权，正在返回应用…' : '已拒绝，正在返回应用…');
            location.replace(data.redirectTo);
            return;
        }
        if (status === 401) {
            // 登录过期了：临时令牌直接丢掉，首页的令牌留着不删
            if (tokenIsTemporary) sessionRemove(TEMP_TOKEN_KEY);
            token = '';
            showLogin();
            showNotice('登录已过期，请重新登录后再授权。');
            return;
        }
        if (status === 400) {
            handleRequestError(data);
            return;
        }
        showNotice('操作没有成功，请稍后再试。');
    } catch {
        showNotice('网络好像断了，请稍后再试。');
    } finally {
        setBusy(false);
    }
}

function startLogin(provider) {
    const returnTo = `${location.pathname}${authQuery}`;
    location.assign(`/api/auth/${provider}?return_to=${encodeURIComponent(returnTo)}`);
}

async function init() {
    // 响应头已经禁止嵌入，这里再挡一道：被嵌在别的页面里时什么都不做
    if (window.top !== window.self) {
        showMessage('error', '这个页面不能嵌在别的网页里打开');
        return;
    }

    $('oauthApproveBtn').addEventListener('click', () => decide('approve'));
    $('oauthDenyBtn').addEventListener('click', () => decide('deny'));
    $('oauthDenyLink').addEventListener('click', () => decide('deny'));
    document.querySelectorAll('#oauthLogin [data-provider]').forEach((button) => {
        button.addEventListener('click', () => startLogin(button.dataset.provider));
    });

    const loginError = takeLoginResult();
    readToken();

    let info;
    try {
        const { ok, data } = await api(`/api/oauth/request${authQuery}`);
        if (!ok) {
            handleRequestError(data);
            return;
        }
        info = data;
    } catch {
        showMessage('error', '网络好像断了', '请刷新页面再试。');
        return;
    }

    renderRequest(info);

    const user = await verifyToken();
    if (user) {
        showDecision(user);
    } else {
        if (user === null && tokenIsTemporary) sessionRemove(TEMP_TOKEN_KEY);
        showLogin();
        if (user === undefined) {
            showNotice('没能确认登录状态，可以刷新页面重试，或者重新登录。');
        }
    }
    if (loginError) showNotice(`登录没有成功：${loginError}`);
}

init();
