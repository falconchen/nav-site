import { I18n } from './lib/i18n.js';
import { ext, isFirefox } from './lib/ext.js';
import {
    createClient,
    DEFAULT_SERVER_URL,
    describeError,
    loadSettings,
    normalizeServerUrl,
    saveNewTabEnabled,
    saveSettings,
    serverOriginPattern
} from './lib/api.js';

const $ = (id) => document.getElementById(id);

function setStatus(text, type) {
    const status = $('status');
    status.hidden = !text;
    status.textContent = text;
    status.className = `notice ${type || ''}`;
}

function readForm() {
    return {
        serverUrl: normalizeServerUrl($('serverUrl').value),
        token: $('token').value.trim()
    };
}

async function testConnection() {
    const settings = readForm();
    if (!settings.serverUrl || !settings.token) {
        setStatus(I18n.t("请先填写地址和令牌"), 'error');
        return false;
    }

    setStatus(I18n.t("连接中…"));
    try {
        const { user, auth } = await createClient(settings).me();
        const who = user.name || user.login || user.id;
        setStatus(I18n.t("连接成功：{0}（令牌「{1}」）", { 0: who, 1: auth.tokenName }), 'success');
        return true;
    } catch (error) {
        setStatus(describeError(error), 'error');
        return false;
    }
}

async function init() {
    const settings = await loadSettings();
    $('serverUrl').value = settings.serverUrl;
    $('token').value = settings.token;
    $('newTab').checked = settings.newTab;
    document.documentElement.dataset.browser = isFirefox ? 'firefox' : 'chrome';
    for (const code of document.querySelectorAll('.homepage-url')) code.textContent = DEFAULT_SERVER_URL;

    // 开关不用验证令牌，改了立刻生效
    $('newTab').addEventListener('change', async (event) => {
        await saveNewTabEnabled(event.target.checked);
        const status = $('newTabStatus');
        status.hidden = false;
        status.className = 'notice success';
        status.textContent = event.target.checked ? I18n.t("已开启，新开的标签页会打开导航站") : I18n.t("已关闭，新标签页恢复为 Chrome 自带的");
    });
    // 扩展页面里的 chrome:// 链接点了没反应，要用 tabs API 打开
    $('openAppearance').addEventListener('click', (event) => {
        event.preventDefault();
        ext.tabs.create({ url: 'chrome://settings/appearance' });
    });

    $('testBtn').addEventListener('click', testConnection);
    $('settingsForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        // 新标签页嵌入自定义地址要主机权限（见 newtab.js）。申请必须趁用户点击还没过期，所以放在联网验证前面；
        // 拒绝了也照常保存，新标签页退回跳转
        const permission = requestServerPermission(readForm().serverUrl);
        // 保存前先验证，免得存一个用不了的令牌
        if (!await testConnection()) return;
        await permission;
        await saveSettings(readForm());
        $('serverUrl').value = readForm().serverUrl;
        setStatus(I18n.t("{0}，已保存", { 0: $('status').textContent }), 'success');
    });
}

function requestServerPermission(serverUrl) {
    if (!serverUrl) return Promise.resolve();
    return ext.permissions.request({ origins: [serverOriginPattern(serverUrl)] }).catch((error) => {
        console.warn('申请导航站主机权限失败：', error);
    });
}

init();
