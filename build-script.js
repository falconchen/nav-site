const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { build } = require('esbuild');

async function buildProject() {
    console.log('🚀 开始构建项目...');

    try {
        // 1. 清理并创建 dist 目录
        console.log('📁 清理构建目录...');
        if (fs.existsSync('dist')) {
            fs.rmSync('dist', { recursive: true, force: true });
        }
        fs.mkdirSync('dist', { recursive: true });

        // 2. 使用 esbuild 构建 JS 和 CSS 文件
        console.log('📦 构建 JavaScript 和 CSS 文件...');
        await build({
            entryPoints: [
                'public/styles.css',
                'public/data.js',
                'public/utils.js',
                'public/sync.js',
                'public/session.js',
                'public/api-tokens.js',
                'public/auth.js',
                'public/image-upload.js',
                'public/visit-stats.js',
                'public/script.js',
                'public/category-edit.js',
                'public/icon-selector.js',
                'public/card-tooltip.js',
                'public/view-tabs.js'
            ],
            minify: true,
            outdir: 'dist'
        });

        // 3. 复制图片目录
        console.log('🖼️ 复制图片资源...');
        if (fs.existsSync('public/img')) {
            fs.cpSync('public/img', 'dist/img', { recursive: true });
        }
        // PWA 清单（分享到手机、添加到主屏幕用）
        if (fs.existsSync('public/manifest.webmanifest')) {
            fs.copyFileSync('public/manifest.webmanifest', 'dist/manifest.webmanifest');
        }

        // 4. 压缩 public/ 下所有 HTML 文件（index、about、privacy、terms 等，新增页面自动包含）
        const htmlFiles = fs.readdirSync('public').filter(name => name.endsWith('.html'));
        console.log(`📄 压缩 HTML 文件: ${htmlFiles.join(', ')}`);
        for (const name of htmlFiles) {
            execSync(`npx html-minifier-terser --collapse-whitespace --remove-comments --remove-redundant-attributes --remove-script-type-attributes --remove-tag-whitespace --use-short-doctype --minify-css true --minify-js true -o ${path.join('dist', name)} ${path.join('public', name)}`);
        }

        // 5. 更新版本号和构建时间
        console.log('🕒 更新版本号和构建时间...');
        const buildTime = execSync(`TZ='Asia/Shanghai' date '+%y%m%d%H%M'`, { encoding: 'utf8' }).trim();

        for (const name of htmlFiles) {
            const file = path.join('dist', name);
            let htmlContent = fs.readFileSync(file, 'utf8');

            // 替换版本号（只有带 id="version" 的页面会命中）
            htmlContent = htmlContent.replace(/id="version">[^<]*/, `id="version">${buildTime}`);

            // 添加构建时间注释
            htmlContent += `\n<!-- build time: ${buildTime} -->`;

            fs.writeFileSync(file, htmlContent);
        }

        console.log(`✅ 构建完成! 版本: ${buildTime}`);
        console.log('📂 输出目录: dist/');

    } catch (error) {
        console.error('❌ 构建失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    buildProject();
}

module.exports = { buildProject };
