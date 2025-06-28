const fs = require('fs-extra');
const { execSync } = require('child_process');
const path = require('path');

// 保存当前工作目录
const currentDir = process.cwd();


try {
  // 备份public目录下的文件到bak目录
  console.log('开始备份public目录文件...');

  // 检查public/bak目录是否存在，如果存在则移除
  const bakDir = path.join(currentDir, 'public', 'bak');
  if (fs.existsSync(bakDir)) {
    console.log('移除已存在的bak目录');
    fs.removeSync(bakDir);
  }

  // 创建bak目录
  fs.ensureDirSync(bakDir);

  // 读取public目录下所有文件和目录
  const publicDir = path.join(currentDir, 'public');
  const items = fs.readdirSync(publicDir);

  // 复制文件到bak目录，排除bak目录本身
  items.forEach(item => {
    if (item !== 'bak') {
      const srcPath = path.join(publicDir, item);
      const destPath = path.join(bakDir, item);
      fs.copySync(srcPath, destPath);
    }
  });

  console.log('备份完成');

  // 执行构建命令
  console.log('开始执行构建命令...');
  execSync(`cd public && esbuild styles.css data.js script.js category-edit.js icon-selector.js --minify --outdir=dist && html-minifier-terser --collapse-whitespace --remove-comments --remove-redundant-attributes --remove-script-type-attributes --remove-tag-whitespace --use-short-doctype --minify-css true --minify-js true -o dist/index.html index.html && echo "" >> dist/index.html && echo "<!-- 构建时间: $(date '+%Y-%m-%d %H:%M:%S %z') -->" >> dist/index.html`, { stdio: 'inherit' });
  console.log('构建命令执行完成');

  // 将dist目录中的文件复制到public根目录
  console.log('正在将构建文件从dist目录复制到public根目录...');
  fs.copySync('./public/dist', './public', { overwrite: true });
  console.log('文件复制完成');

  // 删除dist目录
  console.log('正在删除dist目录...');
  fs.removeSync('./public/dist');
  console.log('dist目录已删除');

} catch (error) {
  console.error('构建过程中发生错误:', error);
} finally {
  // 恢复原始工作目录
  process.chdir(currentDir);
}