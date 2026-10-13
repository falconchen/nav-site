/**
 * 全站统一的安全响应头
 *
 * 只放不会改变页面行为的三个。另外两个常被扫描工具点名的故意不加：
 * - X-Frame-Options / CSP frame-ancestors：扩展的新标签页用 iframe 嵌入导航站（extension/newtab.js），
 *   X-Frame-Options 没法放行扩展来源，Firefox 扩展的来源每次安装都不同、也列不进 frame-ancestors。
 *   真正怕点击劫持的授权页在自己的路由里单独加
 * - Content-Security-Policy：首页还有大量内联事件和内联脚本，只能配成 'unsafe-inline'，等于没加
 */

const SECURITY_HEADERS = {
	// 不让浏览器猜类型，把不是脚本 / 样式的响应当脚本 / 样式执行
	'X-Content-Type-Options': 'nosniff',
	// 就是浏览器现在的默认值，显式写出来；个别页面要更严的在自己的路由里设
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	// 用不到的设备能力一律关掉。不要把 clipboard-write 列进来：复制网址、复制描述要用，扩展的 iframe 也靠它
	'Permissions-Policy':
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()'
};

/**
 * 给响应补上安全响应头；路由自己已经设过的（比如授权页的 Referrer-Policy: no-referrer）保持不变
 * @param {Response} response
 * @returns {Response}
 */
export function withSecurityHeaders(response) {
	// 静态资源和 fetch 回来的响应头是只读的，要重新包一层
	const wrapped = new Response(response.body, response);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!wrapped.headers.has(name)) wrapped.headers.set(name, value);
	}
	return wrapped;
}
