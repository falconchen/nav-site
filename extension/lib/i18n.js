import { ext } from './ext.js';
import './i18n-bundle.js';

export const I18n = globalThis.I18n;
const { language } = await ext.storage.local.get('language');
I18n.setLanguage(language || I18n.language, { persist: false });
if (globalThis.document) I18n.apply();

// 设置页原地更新文案，避免刷新时清空尚未保存的地址和令牌。
I18n.onLanguageSelect = async next => {
    await ext.storage.local.set({ language: next });
    I18n.setLanguage(next, { persist: false });
    I18n.apply();
};

ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.language) return;
    const next = changes.language.newValue || I18n.resolveLanguage({ browser: Array.from(navigator.languages || [navigator.language]) });
    I18n.setLanguage(next, { persist: false });
    if (globalThis.document) I18n.apply();
});
