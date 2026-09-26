/**
 * 新标签页：跳到导航站
 *
 * chrome_url_overrides 只能指向扩展自己的页面，写死在 manifest 里没法按设置开关，所以由这个页面决定去哪。
 * 用跳转而不是 iframe 嵌入：嵌在扩展页面里的导航站算第三方上下文，localStorage 会被分区，
 * 读不到用户在导航站上的本地数据和登录状态。
 *
 * Firefox 不让扩展跳到自带的新标签页（about:newtab 是特权页面），但它的设置里本来就能选新标签页用谁，
 * 所以 Firefox 版不提供开关，永远跳导航站。
 */

import { ext, isFirefox } from './lib/ext.js';
import { loadSettings } from './lib/api.js';

// Chrome 自带的新标签页。chrome://newtab 会被本扩展接管，不能用它
const CHROME_NEW_TAB = 'chrome://new-tab-page';

const { serverUrl, newTab } = await loadSettings();

if (newTab || isFirefox) {
    // replace 不留历史记录，后退不会回到这个空页面
    location.replace(serverUrl);
} else {
    try {
        const tab = await ext.tabs.getCurrent();
        await ext.tabs.update(tab.id, { url: CHROME_NEW_TAB });
    } catch (error) {
        console.warn('无法打开 Chrome 自带的新标签页：', error);
        document.getElementById('fallback').hidden = false;
    }
}
