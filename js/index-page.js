// 首页运行时：英语来自静态 HTML；中文翻译按需加载，卡片数据由 registry 生成。
import { onReady } from '../src/platform/boot.js';
import { getLang, setLang, getThemePref, setThemePref } from '../src/platform/site-settings.js';
import { supportsLight, getTheme, onThemeChange } from '../src/platform/theme.js';

const selectors = '[data-i18n], [data-i18n-placeholder], [data-i18n-label]';
const defaults = new WeakMap();
let currentLang = 'en';
let translations = new Map();

function rememberDefaults() {
    document.querySelectorAll(selectors).forEach(el => {
        if (defaults.has(el)) return;
        defaults.set(el, {
            text: el.textContent,
            placeholder: el.getAttribute('placeholder'),
            label: el.getAttribute('aria-label'),
        });
    });
    document.querySelectorAll('.game-card[data-game-id]').forEach(card => {
        if (defaults.has(card)) return;
        defaults.set(card, {
            name: card.querySelector('.card-title')?.textContent || '',
            desc: card.querySelector('.card-desc')?.textContent || '',
            tag: card.querySelector('.tag:not(.tag--dark-only)')?.textContent || '',
        });
    });
}

async function loadTranslations(lang) {
    if (lang !== 'zh') return new Map();
    try { return (await import('./index-i18n-zh.js')).default; }
    catch (e) { return new Map(); }
}

function setText(el, key, fallback) {
    if (el) el.textContent = translations.get(key) ?? fallback;
}

async function applyLanguage(lang) {
    rememberDefaults();
    const wanted = lang === 'zh' ? 'zh' : 'en';
    const next = await loadTranslations(wanted);
    currentLang = wanted === 'zh' && next.size ? 'zh' : 'en';
    translations = currentLang === 'zh' ? next : new Map();
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';

    document.querySelectorAll(selectors).forEach(el => {
        const base = defaults.get(el);
        const key = el.dataset.i18n;
        if (key) el.textContent = translations.get(key) ?? base.text;
        if (el.dataset.i18nPlaceholder) el.setAttribute('placeholder', translations.get(el.dataset.i18nPlaceholder) ?? base.placeholder ?? '');
        if (el.dataset.i18nLabel) el.setAttribute('aria-label', translations.get(el.dataset.i18nLabel) ?? base.label ?? '');
    });

    document.querySelectorAll('.game-card[data-game-id]').forEach(card => {
        const id = card.dataset.gameId;
        const base = defaults.get(card);
        setText(card.querySelector('.card-title'), `${id}.name`, base.name);
        setText(card.querySelector('.card-desc'), `${id}.desc`, base.desc);
        setText(card.querySelector('.tag:not(.tag--dark-only)'), `${id}.tag`, base.tag);
        setText(card.querySelector('.play-btn'), 'play', 'Play ›');
        const dark = card.querySelector('.tag--dark-only');
        if (dark) {
            dark.textContent = translations.get('darkOnly') || 'Dark only';
            dark.title = translations.get('darkOnlyTitle') || 'This game is designed for dark mode and always opens dark';
        }
        const badge = card.querySelector('.card-badge');
        if (badge) {
            const badgeKey = badge.classList.contains('card-badge--daily') ? 'badgeDaily' : 'badgeNew';
            const label = translations.get(badgeKey) || (badgeKey === 'badgeDaily' ? 'Daily' : 'New');
            badge.dataset.tooltip = label;
            badge.setAttribute('aria-label', label);
        }
    });
}

function syncSocialMeta() {
    const currentUrl = window.location.href.split('#')[0];
    document.getElementById('canonical-link')?.setAttribute('href', currentUrl);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', currentUrl);
    const baseUrl = new URL('.', currentUrl).href;
    const imageUrl = new URL('assets/seo/og-collection.svg', baseUrl).href;
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', imageUrl);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', imageUrl);
}

function injectStructuredData() {
    const currentUrl = window.location.href.split('#')[0];
    const baseUrl = new URL('.', currentUrl).href;
    const items = [...document.querySelectorAll('.game-card[data-game-id]')].map((card, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: defaults.get(card)?.name || card.querySelector('.card-title')?.textContent || '',
        description: defaults.get(card)?.desc || card.querySelector('.card-desc')?.textContent || '',
        url: new URL(card.querySelector('.card-title')?.getAttribute('href') || '', baseUrl).href,
    }));
    const graph = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'WebSite', name: 'Mini Games Collection', url: currentUrl, publisher: { '@type': 'Organization', name: 'Orangely' } },
            { '@type': 'ItemList', name: 'Mini Games Collection', itemListElement: items },
        ],
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(graph);
    document.head.appendChild(script);
}

function markDarkOnlyCards() {
    document.querySelectorAll('.game-card[data-dark-only]').forEach(card => {
        const footer = card.querySelector('.card-footer');
        const play = footer?.querySelector('.play-btn');
        if (!footer || !play || footer.querySelector('.tag--dark-only')) return;
        const tag = document.createElement('span');
        tag.className = 'tag tag--dark-only';
        play.before(tag);
    });
    const sync = () => document.body.classList.toggle('theme-light-active', getTheme() === 'light');
    onThemeChange(sync);
    sync();
}

function updateDailyHub() {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const compact = iso.replace(/-/g, '');
    const ls = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const wordDone = !!(ls(`wd_daily_${iso}_en`) || ls(`wd_daily_${iso}_en_4`) || ls(`wd_daily_${iso}_en_5`) || ls(`wd_daily_${iso}_en_6`) || ls(`wd_daily_${iso}_zh`));
    const mergeDone = !!ls(`pm_daily_${compact}`);
    const gravityDone = !!ls(`gs_daily_${compact}`);
    const doneCount = (wordDone ? 1 : 0) + (mergeDone ? 1 : 0) + (gravityDone ? 1 : 0);
    const setTask = (id, done) => {
        const task = document.getElementById(id);
        if (!task) return;
        task.classList.toggle('done', done);
        const status = task.querySelector('.daily-task-status');
        if (status) status.textContent = done ? '✅' : '⚪';
    };
    setTask('hub-task-word', wordDone);
    setTask('hub-task-merge', mergeDone);
    setTask('hub-task-gravity', gravityDone);
    const progress = document.getElementById('hub-progress');
    if (progress) {
        progress.textContent = `${doneCount}/3`;
        progress.classList.toggle('all-done', doneCount === 3);
    }
    const nameInput = document.getElementById('player-name');
    if (nameInput && document.activeElement !== nameInput) {
        let name = ls('player_name');
        if (!name) {
            for (const k of ['tetris_username', 'pm_username', 'hs_username']) {
                name = ls(k);
                if (name) break;
            }
        }
        nameInput.value = name || '';
    }
    fetch('https://games-analytics.orangely.workers.dev/stats?day=' + compact)
        .then(r => r.ok ? r.json() : Promise.reject(new Error('offline')))
        .then(s => {
            const el = document.getElementById('hub-total');
            if (el && s?.total?.p > 0) {
                el.textContent = currentLang === 'zh'
                    ? ('🔥 今日已玩 ' + s.total.p + ' ' + (translations.get('hubTotalPlayed') || '次今日对局'))
                    : ('🔥 ' + s.total.p + ' plays today');
                el.hidden = false;
            }
        })
        .catch(() => {});
}

function bindThemeSwitch() {
    const box = document.getElementById('theme-switch');
    if (!box) return;
    box.hidden = !supportsLight();
    const buttons = [...box.querySelectorAll('[data-theme-pref]')];
    const sync = () => {
        const pref = getThemePref();
        buttons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.themePref === pref)));
    };
    buttons.forEach(btn => btn.addEventListener('click', () => {
        setThemePref(btn.dataset.themePref);
        sync();
    }));
    window.addEventListener('storage', e => { if (!e.key || e.key === 'site_theme') sync(); });
    sync();
}

onReady(async () => {
    rememberDefaults();
    syncSocialMeta();
    injectStructuredData();
    markDarkOnlyCards();
    await applyLanguage(getLang());
    const toggleLang = async () => {
        const next = currentLang === 'zh' ? 'en' : 'zh';
        setLang(next);
        await applyLanguage(next);
        updateDailyHub();
    };
    document.querySelectorAll('#lang-toggle, #footer-lang-toggle').forEach(btn => btn.addEventListener('click', toggleLang));
    bindThemeSwitch();
    updateDailyHub();
    const nameInput = document.getElementById('player-name');
    if (nameInput) {
        nameInput.addEventListener('change', () => {
            const clean = String(nameInput.value).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 20);
            nameInput.value = clean;
            try { localStorage.setItem('player_name', clean); } catch (e) { /* ignore */ }
        });
        nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });
    }
});
