// public/ 中的语言文件是唯一源文件；扩展不能引用包外文件，所以打包为包内脚本。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function buildExtensionI18n({ check = false } = {}) {
    const root = path.join(__dirname, '..');
    const source = '// 此文件由 npm run build:extension 生成，请修改 public/locales.js 和 public/i18n.js。\n' +
        ['locales.js', 'i18n.js'].map(name => fs.readFileSync(path.join(root, 'public', name), 'utf8')).join('\n');
    const target = path.join(root, 'extension/lib/i18n-bundle.js');
    if (check) {
        if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== source) {
            throw new Error('扩展翻译未同步，请运行 npm run build:extension');
        }
    } else {
        fs.writeFileSync(target, source);
    }
    // 安装名称、快捷键说明等由浏览器的原生 i18n 接口读取，跟随浏览器语言。
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(root, 'public/locales.js'), 'utf8'), context);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
    const fields = {
        appName: '皮皮2047 收藏助手',
        appDescription: '把当前网页收藏到皮皮2047导航站，AI 自动补全标题、分类和描述；新标签页和首页打开导航站。',
        actionTitle: '收藏到皮皮2047',
        saveCommand: '打开收藏弹窗'
    };
    for (const [language, browserLocale] of [['zh-CN', 'zh_CN'], ['zh-TW', 'zh_TW'], ['en', 'en']]) {
        const messages = Object.fromEntries(Object.entries(fields).map(([name, key]) => {
            const message = context.I18nMessages[language][key];
            if (!message) throw new Error(`缺少扩展清单翻译: ${language} ${key}`);
            return [name, { message }];
        }));
        const content = JSON.stringify(messages, null, 2) + '\n';
        const file = path.join(root, 'extension/_locales', browserLocale, 'messages.json');
        if (check) {
            if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
                throw new Error('扩展清单翻译未同步，请运行 npm run build:extension');
            }
        } else {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, content);
        }
    }
    for (const match of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) {
        if (!Object.hasOwn(fields, match[1])) throw new Error(`扩展清单中的翻译键未知: ${match[1]}`);
    }
}

if (require.main === module) buildExtensionI18n({ check: process.argv.includes('--check') });
module.exports = { buildExtensionI18n };
