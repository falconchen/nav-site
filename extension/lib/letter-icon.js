// 首字图标：网站没有图片图标（或图片加载失败）时，用标题第一个字配一块底色。
// 规则抄自网站的 public/utils.js（letterIconChar / letterIconTone），同一网站两边的字和颜色要一样，改一边要同步另一边。
// 底色在 popup.css 的 --tone-0..5

const LETTER_ICON_TONES = 6;

function letterIconHost(url) {
    return String(url || '').trim()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
        .replace(/^www\./i, '')
        .split(/[/?#]/)[0]
        .toLowerCase();
}

function letterIconChar(title, url) {
    // Array.from 按码点切，emoji 不会被拆成半个代理对
    const char = Array.from(String(title || '').trim())[0]
        || Array.from(letterIconHost(url))[0]
        || '?';
    return char.toUpperCase();
}

function letterIconTone(url, title) {
    const key = letterIconHost(url) || String(title || '');
    let hash = 0;
    for (const ch of key) {
        hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    }
    return hash % LETTER_ICON_TONES;
}

// 返回一个铺满 .site-icon 容器的色块元素
export function createLetterIcon(title, url) {
    const span = document.createElement('span');
    span.className = 'letter-icon';
    span.dataset.tone = String(letterIconTone(url, title));
    span.textContent = letterIconChar(title, url);
    return span;
}
