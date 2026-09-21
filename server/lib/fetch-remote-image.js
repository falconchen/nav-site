/**
 * 抓取远程图片
 *
 * 很多站点对图片做了防盗链，直接 fetch 会被拒。这里按图片自身的 origin
 * 伪造 Referer，绕过大多数简单的防盗链判断。
 *
 * 图片代理（/api/proxy-image）和图床转存（/api/upload-image/from-url）
 * 共用这一份抓取逻辑。
 *
 * @param {string} imageUrl 远程图片地址
 * @param {Object} env Worker 环境变量
 * @returns {Promise<Response>} 上游响应，由调用方决定怎么消费
 */
export async function fetchRemoteImage(imageUrl, env = {}) {
    // 用图片自身的协议+域名作为 Referer
    const imageUrlObj = new URL(imageUrl);
    const referer = imageUrlObj.protocol + '//' + imageUrlObj.host;

    return await fetch(imageUrl, {
        headers: {
            'User-Agent': env.USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            'Accept-Language': env.ACCEPT_LANGUAGE || 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Referer': referer
        }
    });
}
