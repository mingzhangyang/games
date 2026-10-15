// 新上线横排（proposal §4.4）：gen 输出全部带 addedAt 的游戏，这里移除 45 天以外的大卡；
// 一张不剩就保持整行 hidden。名称 / 副标签走通用 data-i18n，图片 URL 是 gen 写死的字面路径。
import { isFresh } from './freshness.js';

export function trimNewRow() {
    document.querySelectorAll('.new-card[data-added]').forEach(card => { if (!isFresh(card.dataset.added)) card.remove(); });
    const row = document.getElementById('home-new');
    if (row) row.hidden = !row.querySelector('.new-card');
}
