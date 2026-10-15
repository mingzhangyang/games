// 首页运行时：英语来自静态 HTML；中文翻译按需加载，卡片数据由 registry 生成。
import { onReady } from '../src/platform/boot.js';
import { getLang, setLang, getThemePref, setThemePref } from '../src/platform/site-settings.js';
import { supportsLight, getTheme, onThemeChange } from '../src/platform/theme.js';
import { todayKey } from '../src/platform/daily.js';
import { storageGet, storageSet } from '../src/platform/safe-storage.js';

const selectors = '[data-i18n], [data-i18n-placeholder], [data-i18n-label]';
const defaults = new WeakMap();
let currentLang = 'en';
let translations = new Map();
const CHIP_KEYS = { daily: 'badgeDaily', new: 'badgeNew', external: 'badgeExternal' };
const CHIP_FALLBACK = { daily: 'Daily', new: 'New', external: 'External ↗' };
// 「新」胶囊的有效期（docs/proposal-home-layout.md §8 D-3）
const NEW_DAYS = 45;

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
            desc: card.querySelector('.card-desc-text')?.textContent || '',
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
        setText(card.querySelector('.card-desc-text'), `${id}.desc`, base.desc);
        setText(card.querySelector('.tag:not(.tag--dark-only)'), `${id}.tag`, base.tag);
        const dark = card.querySelector('.tag--dark-only');
        if (dark) {
            dark.textContent = translations.get('darkOnly') || 'Dark only';
            dark.title = translations.get('darkOnlyTitle') || 'This game is designed for dark mode and always opens dark';
        }
        card.querySelectorAll('.card-chip').forEach(chip => {
            const kind = [...chip.classList].find(c => c.startsWith('card-chip--'))?.slice('card-chip--'.length);
            const key = CHIP_KEYS[kind];
            if (key) chip.textContent = translations.get(key) || CHIP_FALLBACK[kind];
        });
    });
    // 最近玩过的名字取自卡片标题，换语言后重渲染
    renderRecent();
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
        description: defaults.get(card)?.desc || card.querySelector('.card-desc-text')?.textContent || '',
        url: new URL(card.getAttribute('href') || '', baseUrl).href,
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

// 「新」随日期变化，不进 gen（否则 gen --check 会随日期变红）：gen 只写 data-added，
// 这里按 UTC+8 今天、都转 UTC 毫秒算天数。
// 新上线横排同一判定：过期的大卡直接移除，一张不剩就保持整行 hidden（proposal §4.4）。
function markNewCards() {
    const t = todayKey();
    const today = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
    const isNew = el => {
        const [y, m, d] = el.dataset.added.split('-').map(Number);
        const age = (today - Date.UTC(y, m - 1, d)) / 864e5;
        return age >= 0 && age < NEW_DAYS;
    };
    document.querySelectorAll('.new-card[data-added]').forEach(card => { if (!isNew(card)) card.remove(); });
    const row = document.getElementById('home-new');
    if (row) row.hidden = !row.querySelector('.new-card');
    document.querySelectorAll('.game-card[data-added]').forEach(card => {
        if (!isNew(card)) return;
        const chip = document.createElement('span');
        chip.className = 'card-chip card-chip--new';
        chip.id = card.querySelector('.card-title').id.replace(/-name$/, '-chip-new');
        chip.textContent = CHIP_FALLBACK.new;
        card.querySelector('.card-chips').append(chip);
        card.setAttribute('aria-labelledby', `${card.getAttribute('aria-labelledby')} ${chip.id}`);
    });
}

// 筛选条（proposal §4.2）：状态只放 location.hash（#cat=science），可分享、可后退；
// 不写 localStorage，回访默认「全部」（D-5）。
// 冻结的 .game-card { display:flex } 盖过 hidden 属性，所以「每日」筛选把其余卡片移进
// 分区内 hidden 的暂存 div（仍在文档里，语言切换 / 主题同步照样覆盖）。
const sectionCards = new WeakMap();

function applyFilter() {
    const box = document.getElementById('games-filter');
    if (!box) return;
    const buttons = [...box.querySelectorAll('[data-filter]')];
    const wanted = (location.hash.match(/^#cat=([a-z-]+)$/) || [])[1];
    const filter = buttons.some(b => b.dataset.filter === wanted) ? wanted : 'all';
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    document.querySelectorAll('.games-cat').forEach(section => {
        const grid = section.querySelector('.games-grid');
        if (!sectionCards.has(section)) {
            const stash = document.createElement('div');
            stash.hidden = true;
            section.append(stash);
            sectionCards.set(section, { cards: [...grid.querySelectorAll('.game-card')], stash });
        }
        const { cards, stash } = sectionCards.get(section);
        const shown = cards.filter(card => filter !== 'daily' || card.querySelector('.card-chip--daily'));
        grid.append(...shown);
        stash.append(...cards.filter(card => !shown.includes(card)));
        const count = section.querySelector('.games-cat-count');
        if (count) count.textContent = String(shown.length);
        section.hidden = !shown.length || !(filter === 'all' || filter === 'daily' || section.dataset.cat === filter);
    });
}

// 筛选按钮与 Daily Hub 的「更多每日」共用：pushState 不触发 hashchange，手动刷新
function setFilter(filter, jump) {
    const hash = filter === 'all' ? '' : `#cat=${filter}`;
    if (location.hash !== hash) history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
    applyFilter();
    const box = document.getElementById('games-filter');
    const cats = document.getElementById('games-cats');
    // 吸顶时内容高度骤变、或从 Hub 跳来时，回到分区开头
    if (jump || (cats && box && cats.getBoundingClientRect().top < box.offsetHeight)) document.getElementById('section-label')?.scrollIntoView();
}

function bindFilter() {
    const box = document.getElementById('games-filter');
    if (!box) return;
    box.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
    window.addEventListener('hashchange', applyFilter);
    window.addEventListener('popstate', applyFilter);
    box.hidden = false;
    applyFilter();
    // 「更多每日 (N)」：N = 带「每日」胶囊的卡减去 Hub 已列出的三项
    const more = document.getElementById('hub-more-daily');
    if (!more) return;
    const hub = [...document.querySelectorAll('.daily-task[href]')].map(a => a.getAttribute('href'));
    const n = [...document.querySelectorAll('.game-card')].filter(c => c.querySelector('.card-chip--daily') && !hub.includes(c.getAttribute('href'))).length;
    document.getElementById('hub-more-count').textContent = String(n);
    more.hidden = !n;
    more.addEventListener('click', e => { e.preventDefault(); setFilter('daily', true); });
}

// 最近玩过（proposal §4.2）：只记首页上的点击（卡片 / 横排 / 最近本身），最多 6 个、去重置顶。
// 从 more-games 条或直链进入的游戏不计入，属可接受误差；不改任何游戏页。
const RECENT_KEY = 'site_recent';
const readRecent = () => {
    try { const v = JSON.parse(storageGet(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; }
    catch (e) { return []; }
};

function renderRecent() {
    const row = document.getElementById('home-recent');
    const list = document.getElementById('home-recent-list');
    if (!row || !list) return;
    const items = readRecent().map(id => document.querySelector(`.game-card[data-game-id="${CSS.escape(id)}"]`)).filter(Boolean).map(card => {
        const a = document.createElement('a');
        a.className = 'recent-card';
        a.href = card.getAttribute('href');
        a.dataset.gameId = card.dataset.gameId;
        const icon = card.querySelector('.card-icon');
        const badge = document.createElement('span');
        badge.className = `recent-icon ${[...icon.classList].find(c => c.startsWith('card-icon--')) || ''}`;
        badge.innerHTML = icon.innerHTML;
        const name = document.createElement('span');
        name.textContent = card.querySelector('.card-title').textContent;
        a.append(badge, name);
        return a;
    });
    list.replaceChildren(...items);
    row.hidden = !items.length;
}

function bindRecent() {
    const record = e => {
        const link = e.target.closest?.('a[data-game-id]');
        if (!link || (e.type === 'auxclick' && e.button !== 1)) return;
        const ids = [link.dataset.gameId, ...readRecent().filter(id => id !== link.dataset.gameId)].slice(0, 6);
        storageSet(RECENT_KEY, JSON.stringify(ids));
    };
    const main = document.querySelector('.idx-main');
    main?.addEventListener('click', record);
    main?.addEventListener('auxclick', record);
}

function markDarkOnlyCards() {
    document.querySelectorAll('.game-card[data-dark-only]').forEach(card => {
        // 进简介行首的胶囊组：手机横条隐藏页脚，「仅深色」仍须在浅色下可见
        const chips = card.querySelector('.card-chips');
        const title = card.querySelector('.card-title');
        if (!chips || !title || chips.querySelector('.tag--dark-only')) return;
        const tag = document.createElement('span');
        tag.className = 'card-chip tag--dark-only';
        tag.id = title.id.replace(/-name$/, '-chip-dark');
        chips.append(tag);
    });
    // 整卡用 aria-labelledby 命名，未引用的子文本不会被读出；而被引用的隐藏元素仍会被读出。
    // 所以「仅深色」胶囊只在它可见（浅色）时加入可访问名，深色时移除。
    const sync = () => {
        const light = getTheme() === 'light';
        document.body.classList.toggle('theme-light-active', light);
        document.querySelectorAll('.game-card .tag--dark-only').forEach(tag => {
            const card = tag.closest('.game-card');
            const ids = (card.getAttribute('aria-labelledby') || '').split(/\s+/).filter(id => id && id !== tag.id);
            if (light) ids.push(tag.id);
            card.setAttribute('aria-labelledby', ids.join(' '));
        });
    };
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
    markNewCards();
    markDarkOnlyCards();
    bindFilter();
    bindRecent();
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
