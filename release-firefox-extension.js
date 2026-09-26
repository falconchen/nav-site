/**
 * 把签好名的 Firefox 扩展发布到 GitHub Releases，已安装的扩展据此自动更新
 *
 * - firefox-v<版本>：每个版本一个 Release，放 .xpi
 * - firefox-updates：固定的 Release，只放 updates.json，每次发版覆盖。manifest 的 update_url 指向它，
 *   不用 releases/latest：以后有别的 Release 时 latest 会指错
 *
 * 先 npm run sign:firefox 生成 web-ext-artifacts/*-<版本>.xpi，再运行本脚本。需要已登录的 gh
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = 'falconchen/nav-site';
const GECKO_ID = 'pipi2047-collector@pipi2047.eu.org';
const UPDATES_TAG = 'firefox-updates';
const ARTIFACTS = path.join(__dirname, 'web-ext-artifacts');

function gh(args) {
    return execFileSync('gh', [...args, '-R', REPO], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function releaseExists(tag) {
    try {
        execFileSync('gh', ['release', 'view', tag, '-R', REPO], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function main() {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'extension', 'manifest.json'), 'utf8'));
    const version = manifest.version;

    // web-ext 生成的文件名是 <随机前缀>-<版本>.xpi
    const signed = fs.existsSync(ARTIFACTS)
        ? fs.readdirSync(ARTIFACTS).find((name) => name.endsWith(`-${version}.xpi`))
        : null;
    if (!signed) {
        console.error(`❌ web-ext-artifacts/ 里没有 ${version} 的 .xpi，先运行 npm run sign:firefox`);
        process.exit(1);
    }

    const tag = `firefox-v${version}`;
    if (releaseExists(tag)) {
        console.error(`❌ Release ${tag} 已存在。改了扩展要先升 extension/manifest.json 的版本号`);
        process.exit(1);
    }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'firefox-release-'));
    const xpiName = `pipi2047-collector-${version}.xpi`;
    const xpiPath = path.join(tmp, xpiName);
    fs.copyFileSync(path.join(ARTIFACTS, signed), xpiPath);

    gh(['release', 'create', tag, xpiPath,
        '--title', `Firefox 扩展 ${version}`,
        '--notes', `皮皮2047 收藏助手 Firefox 版 ${version}。\n\n首次安装：下载 ${xpiName} 拖进 Firefox。之后会自动更新。`]);

    // 清单只列最新版本就够了：Firefox 只挑比已装版本高的里最新的一个
    const hash = crypto.createHash('sha256').update(fs.readFileSync(xpiPath)).digest('hex');
    const updates = {
        addons: {
            [GECKO_ID]: {
                updates: [{
                    version,
                    update_link: `https://github.com/${REPO}/releases/download/${tag}/${xpiName}`,
                    update_hash: `sha256:${hash}`
                }]
            }
        }
    };
    const updatesPath = path.join(tmp, 'updates.json');
    fs.writeFileSync(updatesPath, `${JSON.stringify(updates, null, 2)}\n`);

    if (releaseExists(UPDATES_TAG)) {
        gh(['release', 'upload', UPDATES_TAG, updatesPath, '--clobber']);
    } else {
        // 标成预发布，免得在 Releases 页面被当成「Latest」
        gh(['release', 'create', UPDATES_TAG, updatesPath, '--prerelease',
            '--title', 'Firefox 扩展更新清单',
            '--notes', '只放 updates.json，供已安装的 Firefox 扩展检查更新，每次发版自动覆盖。请到 firefox-v* 下载安装包。']);
    }

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`✅ 已发布 ${tag}，updates.json 已指向 ${version}`);
}

main();
