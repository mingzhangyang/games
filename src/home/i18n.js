// 首页语言：英语就是静态 HTML，中文翻译由入口注入的 loadZh() 按需加载（gen 产物 js/index-i18n-zh.js）。
// 其余模块不被这里调用，而是用 onLanguage() 自己挂上「换语言后要做的事」（胶囊文案、最近玩过重渲染）。
const SELECTORS = '[data-i18n], [data-i18n-placeholder], [data-i18n-label]';
const defaults = new WeakMap();
const listeners = [];
let lang = 'en';
let translations = new Map();

export const currentLang = () => lang;
export const t = (key, fallback) => translations.get(key) ?? fallback;
export const onLanguage = fn => { listeners.push(fn); };
/** 卡片的英文原文（JSON-LD 只用英文，不随界面语言变） */
export const cardDefaults = card => defaults.get(card);

export function rememberDefaults() {
    document.querySelectorAll(SELECTORS).forEach(el => {
        if (defaults.has(el)) return;
        defaults.set(el, { text: el.textContent, placeholder: el.getAttribute('placeholder'), label: el.getAttribute('aria-label') });
    });
    document.querySelectorAll('.game-card[data-game-id]').forEach(card => {
        if (defaults.has(card)) return;
        defaults.set(card, {
            name: card.querySelector('.card-title')?.textContent || '',
            desc: card.querySelector('.card-desc-text')?.textContent || '',
            tag: card.querySelector('.tag:not(.tag--dark-only)')?.textContent || '',
        });
    });
}

async function load(wanted, loadZh) {
    if (wanted !== 'zh') return new Map();
    try { return (await loadZh()).default; }
    catch (e) { return new Map(); }
}

export async function applyLanguage(wantedLang, loadZh) {
    rememberDefaults();
    const wanted = wantedLang === 'zh' ? 'zh' : 'en';
    const next = await load(wanted, loadZh);
    lang = wanted === 'zh' && next.size ? 'zh' : 'en';
    translations = lang === 'zh' ? next : new Map();
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

    document.querySelectorAll(SELECTORS).forEach(el => {
        const base = defaults.get(el);
        if (el.dataset.i18n) el.textContent = t(el.dataset.i18n, base.text);
        if (el.dataset.i18nPlaceholder) el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder, base.placeholder ?? ''));
        if (el.dataset.i18nLabel) el.setAttribute('aria-label', t(el.dataset.i18nLabel, base.label ?? ''));
    });
    document.querySelectorAll('.game-card[data-game-id]').forEach(card => {
        const id = card.dataset.gameId;
        const base = defaults.get(card);
        const set = (sel, key, fallback) => { const el = card.querySelector(sel); if (el) el.textContent = t(key, fallback); };
        set('.card-title', `${id}.name`, base.name);
        set('.card-desc-text', `${id}.desc`, base.desc);
        set('.tag:not(.tag--dark-only)', `${id}.tag`, base.tag);
    });
    listeners.forEach(fn => fn(lang));
}
