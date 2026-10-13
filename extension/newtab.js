/**
 * 新标签页：显示导航站
 *
 * chrome_url_overrides 只能指向扩展自己的页面，写死在 manifest 里没法按设置开关，所以由这个页面决定显示什么。
 *
 * 用全屏 iframe 嵌入导航站：地址栏保持为空、光标停在地址栏，和自带新标签页一样能直接输入网址或搜索。
 * 跳转过去的话地址栏会被导航站网址占住。
 * 嵌在扩展页面里的网站默认算第三方上下文，localStorage 会被分区，读不到用户在导航站上的本地数据和登录状态；
 * 但扩展有该站点的主机权限时，iframe 用顶层分区（Chrome 文档 “Storage and cookies” 写明；Firefox 140 实测同样如此）。
 * 默认地址的权限写在 manifest 的 host_permissions 里，自定义地址在设置页保存时申请。
 *
 * 没有权限时不能悄悄跳转了事：Firefox 版从 2.6.0 才带主机权限，而 Firefox 更新扩展时不会授予新增的主机权限
 * （Bugzilla 1893232），用户也能在 about:addons 里随时撤销，从旧版本升上来的会一直停在「跳转、地址栏留着网址」。
 * 所以先在页面上问一次，点「允许并显示」当场申请（申请权限必须由点击触发）；选了「以后直接打开」才记下来、之后直接跳转。
 *
 * Firefox 不让扩展跳到自带的新标签页（about:newtab 是特权页面），但它的设置里本来就能选新标签页用谁，
 * 所以 Firefox 版不提供开关，永远显示导航站。
 */

import { ext, isFirefox } from './lib/ext.js';
import { hasServerPermission, loadSettings, saveNewTabEmbedDeclined, serverOriginPattern } from './lib/api.js';

// Chrome 自带的新标签页。chrome://newtab 会被本扩展接管，不能用它
const CHROME_NEW_TAB = 'chrome://new-tab-page';

const { serverUrl, newTab, newTabEmbedDeclined } = await loadSettings();

if (newTab || isFirefox) {
    if (await hasServerPermission(serverUrl)) {
        embed(serverUrl);
        // 之后在设置页或浏览器里给了权限：下次权限再没了要重新问，不沿用以前的「直接打开」
        if (newTabEmbedDeclined) saveNewTabEmbedDeclined(false);
    } else if (newTabEmbedDeclined) {
        // replace 不留历史记录，后退不会回到这个空页面
        location.replace(serverUrl);
    } else {
        askPermission(serverUrl);
    }
} else {
    try {
        const tab = await ext.tabs.getCurrent();
        await ext.tabs.update(tab.id, { url: CHROME_NEW_TAB });
    } catch (error) {
        console.warn('无法打开 Chrome 自带的新标签页：', error);
        document.getElementById('fallback').hidden = false;
    }
}

function askPermission(url) {
    const prompt = document.getElementById('grant');
    document.getElementById('grantOrigin').textContent = new URL(url).host;
    prompt.hidden = false;

    document.getElementById('grantBtn').addEventListener('click', async () => {
        let granted = false;
        try {
            // 要趁点击还没过期发出申请，前面不能有 await
            granted = await ext.permissions.request({ origins: [serverOriginPattern(url)] });
        } catch (error) {
            console.warn('申请导航站主机权限失败：', error);
        }
        // 拒绝了就留在这里，可以再点一次，或者选下面的直接打开
        if (!granted) return;
        prompt.hidden = true;
        embed(url);
    });

    document.getElementById('grantSkip').addEventListener('click', async (event) => {
        event.preventDefault();
        await saveNewTabEmbedDeclined(true);
        location.replace(url);
    });
}

function embed(url) {
    const frame = document.createElement('iframe');
    frame.id = 'site';
    frame.src = url;
    // 导航站有「复制网址」「复制描述」，跨源 iframe 要显式放行剪贴板
    frame.allow = 'clipboard-write';
    document.body.append(frame);
}
