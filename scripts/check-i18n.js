// 静态覆盖检查使用 Node 文件接口；Workers 测试池只运行语言行为测试。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { decodeHTML } = require('entities');
const { buildExtensionI18n } = require('./build-extension-i18n');
const root = path.join(__dirname, '..');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'public/locales.js'), 'utf8'), context);
const keys = new Set();

for (const dir of ['public', 'extension', 'extension/lib']) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
        if (!/\.(js|html)$/.test(name) || ['locales.js', 'i18n-bundle.js'].includes(name)) continue;
        const source = fs.readFileSync(path.join(root, dir, name), 'utf8');
        for (const match of source.matchAll(/I18n\.(?:t|html)\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)) {
            keys.add(match[1].startsWith('"') ? JSON.parse(match[1]) : match[1].slice(1, -1));
        }
        if (name.endsWith('.html')) {
            for (const match of source.matchAll(/data-i18n(?:-(?:title|placeholder|aria-label|alt|content))?="([^"]+)"/g)) {
                keys.add(decodeHTML(match[1]));
            }
            if (dir === 'public') {
                assert(source.includes('src="/locales.js"'), `${name}: missing catalog`);
                assert(source.includes('src="/i18n.js"'), `${name}: missing runtime`);
                assert(source.includes('data-language-select'), `${name}: missing language selector`);
            }
        }
    }
}

for (const key of keys) {
    for (const language of ['zh-CN', 'zh-TW', 'en']) {
        assert(Object.hasOwn(context.I18nMessages[language], key), `${language}: missing ${key}`);
    }
}
buildExtensionI18n({ check: true });
console.log(`✓ ${keys.size} 个界面翻译键完整，页面入口和扩展翻译已同步`);
