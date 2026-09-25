import { createClient, describeError, loadSettings, normalizeServerUrl, saveSettings } from './lib/api.js';

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
        setStatus('请先填写地址和令牌', 'error');
        return false;
    }

    setStatus('连接中…');
    try {
        const { user, auth } = await createClient(settings).me();
        const who = user.name || user.login || user.id;
        setStatus(`连接成功：${who}（令牌「${auth.tokenName}」）`, 'success');
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

    $('testBtn').addEventListener('click', testConnection);
    $('settingsForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        // 保存前先验证，免得存一个用不了的令牌
        if (!await testConnection()) return;
        await saveSettings(readForm());
        $('serverUrl').value = readForm().serverUrl;
        setStatus(`${$('status').textContent}，已保存`, 'success');
    });
}

init();
