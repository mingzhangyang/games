// 最近玩过（proposal §4.2）：只记首页上的点击（分区卡片 / 新上线 / 最近本身，含中键），
// 最多 6 个、去重置顶。从 more-games 条或直链进入的游戏不计入，属可接受误差；不改任何游戏页。
import { storageGet, storageSet } from '../platform/safe-storage.js';
import { onLanguage } from './i18n.js';

export const RECENT_KEY = 'site_recent';
export const RECENT_MAX = 6;

export function readRecent() {
    try {
        const v = JSON.parse(storageGet(RECENT_KEY) || '[]');
        return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
    } catch (e) { return []; }
}

/** 名字取自当前语言的卡片标题，所以换语言后重渲染；registry 里已没有的 id 直接跳过 */
function render() {
    const row = document.getElementById('home-recent');
    const list = document.getElementById('home-recent-list');
    if (!row || !list) return;
    const items = readRecent()
        .map(id => document.querySelector(`.game-card[data-game-id="${CSS.escape(id)}"]`))
        .filter(Boolean)
        .map(card => {
            const a = document.createElement('a');
            a.className = 'recent-card';
            a.href = card.getAttribute('href');
            a.dataset.gameId = card.dataset.gameId;
            const icon = card.querySelector('.card-icon');
            const badge = document.createElement('span');
            // 配色复用冻结的 card-icon--<x>，尺寸由 .recent-icon 定（不碰 .card-icon 的 40px）
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

export function bindRecent() {
    const record = e => {
        const link = e.target.closest?.('a[data-game-id]');
        if (!link || (e.type === 'auxclick' && e.button !== 1)) return;
        const id = link.dataset.gameId;
        storageSet(RECENT_KEY, JSON.stringify([id, ...readRecent().filter(x => x !== id)].slice(0, RECENT_MAX)));
    };
    const main = document.querySelector('.idx-main');
    main?.addEventListener('click', record);
    main?.addEventListener('auxclick', record);
    onLanguage(render);
}
