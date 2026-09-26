/**
 * 从 extension/ 生成 Firefox 版扩展到 extension-firefox/
 *
 * 两个浏览器共用同一套代码，只有 manifest 不同，所以不另外维护一份 Firefox 源码：
 * 复制 extension/，再把 Chrome 的 manifest 改写成 Firefox 能用的。版本号直接沿用 Chrome 的。
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'extension');
const OUT = path.join(__dirname, 'extension-firefox');

// 扩展 id 一旦发布就不能改：storage 按 id 存，AMO 签名也认 id
const GECKO_ID = 'pipi2047-collector@pipi2047.eu.org';

// 不进扩展包的文件
const SKIP = new Set(['README.md', 'manifest.json']);

function toFirefoxManifest(chrome) {
    const manifest = structuredClone(chrome);

    // Firefox 不支持 service worker 后台，要用事件页
    manifest.background = { scripts: [chrome.background.service_worker], type: chrome.background.type };

    // Firefox 用 options_ui，open_in_tab 和 Chrome 的 options_page 一样在新标签页打开
    manifest.options_ui = { page: chrome.options_page, open_in_tab: true };
    delete manifest.options_page;

    manifest.browser_specific_settings = {
        gecko: {
            id: GECKO_ID,
            // data_collection_permissions 从 140 开始支持，140 也是 ESR
            strict_min_version: '140.0',
            // 收藏时会把网址和页面内容发给导航站服务端
            data_collection_permissions: { required: ['browsingActivity', 'websiteContent'] }
        }
    };
    return manifest;
}

function main() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.cpSync(SRC, OUT, {
        recursive: true,
        filter: (src) => !SKIP.has(path.relative(SRC, src))
    });

    const chrome = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
    const manifest = toFirefoxManifest(chrome);
    fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    console.log(`✅ Firefox 扩展 ${manifest.version} 已生成到 ${path.relative(process.cwd(), OUT) || '.'}/`);
}

main();
