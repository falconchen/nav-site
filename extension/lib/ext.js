/**
 * Chrome 和 Firefox 共用的扩展 API 入口
 *
 * Firefox 两个命名空间都有，browser.* 是它的原生实现、一律返回 Promise；Chrome 只有 chrome.*。
 */

export const ext = globalThis.browser ?? globalThis.chrome;

// Firefox 的扩展页面和后台脚本跑在 moz-extension:// 下
export const isFirefox = globalThis.location?.protocol === 'moz-extension:';
