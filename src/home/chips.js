// 卡片胶囊：「每日」「站外」由 gen 静态输出；「新」按 addedAt 运行时补；「仅深色」浅色下才显示并进可访问名。
// 胶囊都在 .card-desc > .card-chips（简介行首），标题独占一行（PR #147 review）。
import { getTheme, onThemeChange } from '../platform/theme.js';
import { isFresh } from './freshness.js';
import { onLanguage, t } from './i18n.js';

const CHIP_KEYS = { daily: 'badgeDaily', new: 'badgeNew', external: 'badgeExternal' };
const CHIP_FALLBACK = { daily: 'Daily', new: 'New', external: 'External ↗' };

const addChip = (card, className, suffix) => {
    const chip = document.createElement('span');
    chip.className = className;
    chip.id = card.querySelector('.card-title').id.replace(/-name$/, suffix);
    card.querySelector('.card-chips').append(chip);
    return chip;
};

function markNew() {
    document.querySelectorAll('.game-card[data-added]').forEach(card => {
        if (!isFresh(card.dataset.added) || card.querySelector('.card-chip--new')) return;
        const chip = addChip(card, 'card-chip card-chip--new', '-chip-new');
        chip.textContent = CHIP_FALLBACK.new;
        card.setAttribute('aria-labelledby', `${card.getAttribute('aria-labelledby')} ${chip.id}`);
    });
}

function markDarkOnly() {
    document.querySelectorAll('.game-card[data-dark-only]').forEach(card => {
        // 手机横条隐藏页脚，「仅深色」仍须在浅色下可见，所以也进简介行首的胶囊组
        if (!card.querySelector('.tag--dark-only')) addChip(card, 'card-chip tag--dark-only', '-chip-dark');
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

function localize() {
    document.querySelectorAll('.game-card .card-chip').forEach(chip => {
        if (chip.classList.contains('tag--dark-only')) {
            chip.textContent = t('darkOnly', 'Dark only');
            chip.title = t('darkOnlyTitle', 'This game is designed for dark mode and always opens dark');
            return;
        }
        const kind = [...chip.classList].find(c => c.startsWith('card-chip--'))?.slice('card-chip--'.length);
        if (CHIP_KEYS[kind]) chip.textContent = t(CHIP_KEYS[kind], CHIP_FALLBACK[kind]);
    });
}

export function bindChips() {
    markNew();
    markDarkOnly();
    onLanguage(localize);
}
