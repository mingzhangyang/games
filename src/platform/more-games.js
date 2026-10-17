import { getLang } from './site-settings.js';

// registry:begin more-games
export const MORE_GAMES = [
    { href: 'needle-awn.html', emoji: '⚔️', en: "Pinpoint Clash", zh: "针尖对麦芒", cat: 'action' },
    { href: 'sword-flight.html', emoji: '🗡️', en: "Sword Flight", zh: "御剑飞行", cat: 'action' },
    { href: 'loop-jail.html', emoji: '⭕', en: "Loop Jail", zh: "画牢", cat: 'action', light: true },
    { href: 'tank-battle.html', emoji: '🎯', en: "Tank Battle", zh: "坦克大战", cat: 'action' },
    { href: 'hoop-shot.html', emoji: '🏀', en: "Hoop Shot", zh: "街机投篮", cat: 'action', light: true },
    { href: 'carrot-pull.html', emoji: '🥕', en: "Carrot Pull", zh: "拔萝卜", cat: 'action', light: true },
    { href: 'tetris.html', emoji: '🟦', en: "Tetris", zh: "俄罗斯方块", cat: 'action', light: true },
    { href: 'math-rain.html', emoji: '🔢', en: "Math Rain", zh: "数字雨", cat: 'action' },
    { href: 'gomoku.html', emoji: '⚫', en: "Gomoku", zh: "五子棋", cat: 'strategy', light: true },
    { href: 'planet-merge.html', emoji: '🪐', en: "Planet Merge", zh: "星球合成", cat: 'puzzle' },
    { href: 'word-daily.html', emoji: '🔤', en: "Word Daily", zh: "每日猜词", cat: 'puzzle', light: true },
    { href: 'minesweeper.html', emoji: '💣', en: "Minesweeper", zh: "扫雷", cat: 'puzzle', light: true },
    { href: 'reversi.html', emoji: '⚪', en: "Reversi", zh: "黑白棋", cat: 'strategy', light: true },
    { href: 'tower-defense.html', emoji: '◈', en: "Neon TD", zh: "霓虹塔防", cat: 'strategy' },
    { href: 'gravity-slingshot.html', emoji: '🚀', en: "Gravity Slingshot", zh: "引力弹弓", cat: 'puzzle' },
    { href: 'lumen.html', emoji: '💎', en: "Lumen", zh: "折光", cat: 'science' },
    { href: 'circuit.html', emoji: '💡', en: "Circuit", zh: "电路谜题", cat: 'science', light: true },
    { href: 'silk-dew.html', emoji: '💧', en: "Silkfall", zh: "垂丝引露", cat: 'science', light: true },
    { href: 'bond-forge.html', emoji: '⚗️', en: "Bond Forge", zh: "键合工坊", cat: 'science', light: true },
    { href: 'echo-cave.html', emoji: '🦇', en: "Echo Cave", zh: "回声洞窟", cat: 'science' },
    { href: 'maxwell-demon.html', emoji: '😈', en: "Maxwell's Demon", zh: "麦克斯韦妖", cat: 'science', light: true },
    { href: 'crystal-bloom.html', emoji: '💎', en: "Crystal Bloom", zh: "晶绽", cat: 'science', light: true },
    { href: 'flame-verse.html', emoji: '🔥', en: "Flame Verse", zh: "焰语", cat: 'science' },
    { href: 'ripple-duet.html', emoji: '🌊', en: "Ripple Duet", zh: "涟漪双生", cat: 'science', light: true },
    { href: 'firefly-signal.html', emoji: '✨', en: "Firefly Signal", zh: "萤火信号", cat: 'puzzle' },
    { href: 'shadow-loom.html', emoji: '🕯️', en: "Shadow Loom", zh: "影织", cat: 'puzzle' },
];
// registry:end more-games

/** 推荐条最多展示的游戏数；完整列表由顶栏 Home（首页）提供，这里不再铺满全站。 */
export const MORE_GAMES_LIMIT = 6;

// 统一成登记表里的 'xxx.html'：去掉 query/hash 与目录，并补上 Cloudflare Assets
// 默认的无扩展名 URL（/reversi、/reversi/）缺失的 .html，否则同类推荐会查不到自己。
const cleanHref = href => {
    const name = String(href || '').split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || '';
    return name && !name.includes('.') ? name + '.html' : name;
};

function currentPage() {
    if (typeof location === 'undefined') return '';
    return cleanHref(location.pathname);
}

/**
 * 为当前页挑选少量相关游戏，而不是把全站游戏一次铺开：
 * 先取同类游戏（MORE_GAMES 已按 rank 排序，从自身之后循环取，避免每页都推同一批），
 * 再从其他分类轮流各取一款补足。结果对同一页面是确定的。
 *
 * @param {string} [exclude]  当前页 href
 * @param {number} [limit]
 * @returns {Array<object>}
 */
export function pickMoreGames(exclude = '', limit = MORE_GAMES_LIMIT) {
    const self = cleanHref(exclude);
    const me = MORE_GAMES.find(g => g.href === self);
    const others = MORE_GAMES.filter(g => g.href !== self);
    if (!me) return others.slice(0, limit);

    const rotate = (list, offset) => list.slice(offset).concat(list.slice(0, offset));
    const sameCat = MORE_GAMES.filter(g => g.cat === me.cat);
    const peers = rotate(sameCat, sameCat.indexOf(me) + 1).filter(g => g !== me);
    const picks = peers.slice(0, Math.ceil(limit / 2));

    const seed = MORE_GAMES.indexOf(me);
    const buckets = [...new Set(others.map(g => g.cat))]
        .filter(cat => cat !== me.cat)
        .map(cat => {
            const list = others.filter(g => g.cat === cat);
            return rotate(list, seed % list.length);
        });
    for (let round = 0; picks.length < limit && buckets.some(b => b[round]); round++) {
        for (const bucket of rotate(buckets, seed % buckets.length)) {
            if (picks.length >= limit) break;
            if (bucket[round]) picks.push(bucket[round]);
        }
    }
    // 分类不足时用剩余同类补齐
    for (const g of peers) {
        if (picks.length >= limit) break;
        if (!picks.includes(g)) picks.push(g);
    }
    return picks;
}

/**
 * 往一个容器里生成「更多游戏」导航条（标题 + 少量推荐），排除自身。
 * 静态 <nav class="more-games"> 走 updateMoreGames()；动态侧栏 / 菜单容器
 * 可直接调用本函数生成推荐内容。
 *
 * @param {Element} container  目标容器（会被清空重建）
 * @param {object}  [opts]
 * @param {string}  [opts.exclude]  排除的 href（通常传当前页文件名）
 * @param {string}  [opts.lang]     语言，缺省读 getLang()
 * @param {string}  [opts.title]    标题文案，缺省用内置的「更多游戏 / MORE GAMES」
 * @param {number}  [opts.limit]    推荐条数，缺省 MORE_GAMES_LIMIT
 * @returns {number} 写入的推荐游戏条数
 */
export function renderMoreGames(container, opts = {}) {
    if (!container) return 0;
    const { exclude = currentPage(), lang = getLang(), title = '', limit = MORE_GAMES_LIMIT } = opts;
    const isZh = lang === 'zh';
    const picks = pickMoreGames(exclude, limit);

    container.dataset.moreExclude = cleanHref(exclude);
    if (title) container.dataset.moreTitle = title;
    container.innerHTML =
        `<div class="more-games-title">${title || (isZh ? '🎮 更多游戏' : '🎮 MORE GAMES')}</div>` +
        `<div class="more-games-links">${picks.map(g => `<a href="${g.href}">${g.emoji} ${isZh ? g.zh : g.en}</a>`).join('')}</div>`;
    return picks.length;
}

export function updateMoreGames(lang) {
    const activeLang = lang || getLang();
    document.querySelectorAll('.more-games').forEach(nav => {
        renderMoreGames(nav, {
            lang: activeLang,
            exclude: nav.dataset.moreExclude || currentPage(),
            title: nav.dataset.moreTitle || '',
        });
    });
}

// 监听全站语言变更事件自动同步
if (typeof window !== 'undefined') {
    window.addEventListener('site-settings:changed', () => {
        updateMoreGames(getLang());
    });
}
