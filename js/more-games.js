import { getLang } from './site-settings.js';

export const MORE_GAMES = [
    { href: 'math-rain.html', emoji: '🔢', en: 'Math Rain', zh: '数字雨' },
    { href: 'tetris.html', emoji: '🟦', en: 'Tetris', zh: '俄罗斯方块' },
    { href: 'tank-battle.html', emoji: '🎯', en: 'Tank Battle', zh: '坦克大战' },
    { href: 'gomoku.html', emoji: '⚫', en: 'Gomoku', zh: '五子棋' },
    { href: 'planet-merge.html', emoji: '🪐', en: 'Planet Merge', zh: '星球合成' },
    { href: 'word-daily.html', emoji: '🔤', en: 'Word Daily', zh: '每日猜词' },
    { href: 'hoop-shot.html', emoji: '🏀', en: 'Hoop Shot', zh: '街机投篮' },
    { href: 'minesweeper.html', emoji: '💣', en: 'Minesweeper', zh: '扫雷' },
    { href: 'reversi.html', emoji: '⚪', en: 'Reversi', zh: '黑白棋' },
    { href: 'tower-defense.html', emoji: '🏰', en: 'Neon TD', zh: '霓虹塔防' },
    { href: 'gravity-slingshot.html', emoji: '🚀', en: 'Gravity Slingshot', zh: '引力弹弓' },
    { href: 'needle-awn.html', emoji: '⚔️', en: 'Pinpoint Clash', zh: '针尖对麦芒' },
    { href: 'sword-flight.html', emoji: '🗡️', en: 'Sword Flight', zh: '御剑飞行' }
];

export function updateMoreGames(lang) {
    const activeLang = lang || getLang();
    const isZh = activeLang === 'zh';
    const navs = document.querySelectorAll('.more-games');
    if (!navs.length) return;

    navs.forEach(nav => {
        const title = nav.querySelector('.more-games-title');
        if (title) {
            title.textContent = isZh ? '🎮 更多游戏' : '🎮 MORE GAMES';
        }
        const links = nav.querySelectorAll('.more-games-links a');
        links.forEach(a => {
            const rawHref = a.getAttribute('href') || '';
            const href = rawHref.split('?')[0].split('#')[0];
            const item = MORE_GAMES.find(g => g.href === href);
            if (item) {
                a.textContent = `${item.emoji} ${isZh ? item.zh : item.en}`;
            }
        });
    });
}

// 监听全站语言变更事件自动同步
if (typeof window !== 'undefined') {
    window.addEventListener('site-settings:changed', () => {
        updateMoreGames(getLang());
    });
}
