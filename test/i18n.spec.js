import { afterEach, describe, expect, it } from 'vitest';
import '../public/locales.js';
import '../public/i18n.js';
import '../public/note-render.js';

const { I18n, I18nMessages, NoteRender } = globalThis;

afterEach(() => I18n.setLanguage('zh-CN', { persist: false }));

describe('语言选择', () => {
    it('识别简繁脚本、地区和英语，不接受不支持的语言', () => {
        for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans-TW']) expect(I18n.normalizeLanguage(tag)).toBe('zh-CN');
        for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-CN', 'zh_Hant_HK']) expect(I18n.normalizeLanguage(tag)).toBe('zh-TW');
        expect(I18n.normalizeLanguage('en-GB')).toBe('en');
        expect(I18n.normalizeLanguage('fr')).toBeNull();
        expect(I18n.normalizeLanguage('english')).toBeNull();
    });

    it('链接语言优先，其次是手动选择、浏览器语言和简体中文兜底', () => {
        expect(I18n.resolveLanguage({ query: 'en', saved: 'zh-CN', browser: ['zh-TW'] })).toBe('en');
        expect(I18n.resolveLanguage({ saved: 'zh-TW', browser: ['en-US'] })).toBe('zh-TW');
        expect(I18n.resolveLanguage({ saved: 'invalid', browser: ['fr-FR', 'en-GB'] })).toBe('en');
        expect(I18n.resolveLanguage({ browser: ['fr-FR'] })).toBe('zh-CN');
    });
});

describe('翻译和用户内容边界', () => {
    it('三种语言都能翻译文案，未知键保留原文', () => {
        const expected = { 'zh-CN': '保存', 'zh-TW': '儲存', en: 'Save' };
        for (const language of I18n.languages) {
            I18n.setLanguage(language, { persist: false });
            expect(I18n.t('保存')).toBe(expected[language]);
            expect(I18n.t('custom user content')).toBe('custom user content');
        }
    });

    it('参数按译文顺序插入，不翻译参数、不展开替换指令', () => {
        I18n.setLanguage('en', { persist: false });
        expect(I18n.t('已移到「{0}」', { 0: '保存 $& {1}' })).toBe('Moved to “保存 $& {1}”');
        expect(I18n.t('上移{0}', { 0: '私密收藏' })).toBe('Move 私密收藏 up');
    });

    it('HTML 翻译转义动态内容，保留用户名称而不作为 HTML 执行', () => {
        I18n.setLanguage('en', { persist: false });
        expect(I18n.html('文件夹「{0}」', { 0: '<img src=x onerror="alert(1)">' }))
            .toBe('Folder “&lt;img src=x onerror=&quot;alert(1)&quot;&gt;”');
    });

    it('只翻译系统未分类名称，保留普通分类及自定义名称', () => {
        I18n.setLanguage('en', { persist: false });
        const system = { id: 'uncategorized', name: '未分类' };
        expect(I18n.categoryName(system)).toBe('Uncategorized');
        expect(system.name).toBe('未分类');
        expect(I18n.categoryName({ id: 'custom', name: '未分类' })).toBe('未分类');
        expect(I18n.categoryName({ id: 'uncategorized', name: '我的目录' })).toBe('我的目录');
    });

    it('数字和笔记时间随语言格式化，英语处理单复数', () => {
        I18n.setLanguage('en', { persist: false });
        expect(I18n.number(12345)).toBe('12,345');
        const now = new Date('2026-10-03T12:00:00Z').getTime();
        expect(NoteRender.formatNoteTime(now - 60000, now)).toBe('1 minute ago');
        expect(NoteRender.formatNoteTime(now - 120000, now)).toBe('2 minutes ago');
        I18n.setLanguage('zh-TW', { persist: false });
        expect(NoteRender.formatNoteTime(now - 60000, now)).toBe('1 分鐘前');
    });
});

describe('翻译覆盖', () => {
    it('所有语言都有完整键集，保留相同的动态占位符', () => {
        const placeholders = text => (text.match(/\{\w+\}/g) || []).sort();
        const keys = Object.keys(I18nMessages['zh-CN']);
        for (const language of I18n.languages) {
            expect(Object.keys(I18nMessages[language])).toEqual(keys);
            for (const key of keys) {
                expect(I18nMessages[language][key], `${language}: ${key}`).toBeTruthy();
                expect(placeholders(I18nMessages[language][key]), `${language}: ${key}`).toEqual(placeholders(key));
            }
        }
    });

});
