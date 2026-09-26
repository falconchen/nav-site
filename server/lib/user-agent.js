/**
 * 抓取外部网页和图片时用的 User-Agent
 *
 * 网页抓取（website-analyzer.js）和远程图片抓取（fetch-remote-image.js）共用。
 * 伪装成桌面版 Chrome，不少站点会拦截没有 UA 或 UA 像爬虫的请求。
 * 版本号是写死的，太旧时可能被当成异常客户端，隔一段时间更新一次。
 */
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

/**
 * 环境变量 USER_AGENT 优先（本地可用 `wrangler dev --var USER_AGENT:...` 模拟被拦截），没设就用默认值
 */
export function getUserAgent(env = {}) {
    return env.USER_AGENT || DEFAULT_USER_AGENT;
}
