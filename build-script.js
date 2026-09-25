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

        // 4. 压缩 HTML 文件
        console.log('📄 压缩 HTML 文件...');
        execSync(`npx html-minifier-terser --collapse-whitespace --remove-comments --remove-redundant-attributes --remove-script-type-attributes --remove-tag-whitespace --use-short-doctype --minify-css true --minify-js true -o dist/index.html public/index.html`);

        // 5. 更新版本号和构建时间
        console.log('🕒 更新版本号和构建时间...');
        const buildTime = execSync(`TZ='Asia/Shanghai' date '+%y%m%d%H%M'`, { encoding: 'utf8' }).trim();

        // 读取生成的 HTML 文件
        let htmlContent = fs.readFileSync('dist/index.html', 'utf8');

        // 替换版本号
        htmlContent = htmlContent.replace(/id="version">[^<]*/, `id="version">${buildTime}`);

        // 添加构建时间注释
        htmlContent += `\n<!-- build time: ${buildTime} -->`;

        // 写回文件
        fs.writeFileSync('dist/index.html', htmlContent);

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
