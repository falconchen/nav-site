// 页面和扩展共用的语言运行时。翻译只作用于显式标记的界面文案，不扫描用户内容。
(function (root) {
    const STORAGE_KEY = 'language';
    const languages = ['zh-CN', 'zh-TW', 'en'];
    const attributes = ['title', 'placeholder', 'aria-label', 'alt', 'content'];

    function normalizeLanguage(value) {
        const tag = String(value || '').replace(/_/g, '-').toLowerCase();
        if (/^zh(?:-|$)/.test(tag)) {
            if (tag.includes('-hant')) return 'zh-TW';
            if (tag.includes('-hans')) return 'zh-CN';
            return /^zh-(tw|hk|mo)(-|$)/.test(tag) ? 'zh-TW' : 'zh-CN';
        }
        return /^en(?:-|$)/.test(tag) ? 'en' : null;
    }

    function resolveLanguage({ saved, browser = [], query } = {}) {
        return normalizeLanguage(query) || normalizeLanguage(saved) ||
            browser.map(normalizeLanguage).find(Boolean) || 'zh-CN';
    }

    let saved;
    let query;
    try { saved = root.localStorage?.getItem(STORAGE_KEY); } catch (error) {}
    try { query = new URL(root.location.href).searchParams.get('lang'); } catch (error) {}
    let language = resolveLanguage({
        saved, query,
        browser: Array.from(root.navigator?.languages || [root.navigator?.language])
    });

    function t(key, params = {}) {
        const source = String(key ?? '');
        const catalog = root.I18nMessages?.[language];
        const message = catalog && Object.hasOwn(catalog, source) ? catalog[source] : source;
        // 函数替换避免把参数里的 $& 等内容当作替换指令，也不递归翻译参数。
        return message.replace(/\{(\w+)\}/g, (match, name) =>
            Object.hasOwn(params, name) ? String(params[name] ?? '') : match);
    }

    function escape(value) {
        return String(value).replace(/[&<>"']/g, char =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    function apply(container = root.document) {
        if (!container) return;
        const selector = ['[data-i18n]', ...attributes.map(attr => `[data-i18n-${attr}]`)].join(',');
        const nodes = Array.from(container.querySelectorAll(selector));
        if (container.matches?.(selector)) nodes.unshift(container);
        for (const node of nodes) {
            if (node.hasAttribute('data-i18n')) node.textContent = t(node.getAttribute('data-i18n'));
            for (const attr of attributes) {
                if (node.hasAttribute(`data-i18n-${attr}`)) {
                    node.setAttribute(attr, t(node.getAttribute(`data-i18n-${attr}`)));
                }
            }
        }
        root.document.documentElement.lang = language;
        const ogLocale = root.document.querySelector('meta[property="og:locale"]');
        if (ogLocale) ogLocale.content = { 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', en: 'en_US' }[language];
        root.document.querySelectorAll('[data-language-select]').forEach(select => {
            select.value = language;
            if (select.dataset.languageBound) return;
            select.dataset.languageBound = 'true';
            select.addEventListener('change', async () => {
                const next = select.value;
                const event = new CustomEvent('beforelanguagechange', { cancelable: true, detail: { language: next } });
                if (!root.dispatchEvent(event)) {
                    select.value = language;
                    return;
                }
                if (api.onLanguageSelect) await api.onLanguageSelect(next);
                else reloadInLanguage(next);
            });
        });
    }

    function setLanguage(value, { persist = true } = {}) {
        const next = normalizeLanguage(value);
        if (!next) return false;
        language = next;
        let stored = false;
        if (persist) {
            try { root.localStorage.setItem(STORAGE_KEY, next); stored = true; } catch (error) {}
        }
        if (root.document) root.document.documentElement.lang = next;
        return stored;
    }

    function reloadInLanguage(next) {
        const stored = setLanguage(next);
        const url = new URL(root.location.href);
        if (stored) url.searchParams.delete('lang');
        else url.searchParams.set('lang', language);
        root.location.replace(url.href);
    }

    const api = {
        STORAGE_KEY, languages, normalizeLanguage, resolveLanguage, t, escape, apply, setLanguage,
        html: (key, params) => escape(t(key, params)),
        get language() { return language; },
        get locale() { return language === 'en' ? 'en-US' : language; },
        number: value => new Intl.NumberFormat(api.locale).format(value),
        relativeTime: (value, unit) => new Intl.RelativeTimeFormat(api.locale, { numeric: 'always' }).format(value, unit),
        categoryName: category => category?.id === 'uncategorized' &&
            ['未分类', '未分類', 'Uncategorized'].includes(category.name)
            ? t('未分类') : category?.name || '',
        onLanguageSelect: null
    };
    root.I18n = api;
    if (root.document) {
        root.document.documentElement.lang = language;
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => apply());
        else apply();
    }
})(globalThis);
