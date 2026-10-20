/**
 * Lumen 每日榜单面板：提交 → 拉全球榜；离线 / 提交失败时退回本地榜（lm_local_<date>）。
 * 网络层收敛在 src/platform/leaderboard.js（submitScore 不抛出，false = 未进全球榜）。
 */
import { fetchBoard, submitScore } from '../../../platform/leaderboard.js';
import { pushLocalScore, readLocalBoard } from '../systems/records.js';

function buildRow(rank, entry) {
    const row = document.createElement('div');
    row.className = 'lm-lb-row game-lb-row' + (rank < 3 ? ` lm-lb-top${rank + 1}` : '');
    const rankEl = document.createElement('span');
    rankEl.className = 'lm-lb-rank game-lb-rank';
    rankEl.textContent = `${rank + 1}.`;
    const nameEl = document.createElement('span');
    nameEl.className = 'lm-lb-name game-lb-name';
    nameEl.textContent = entry.name; // textContent 防注入
    const scoreEl = document.createElement('span');
    scoreEl.className = 'lm-lb-score game-lb-score';
    scoreEl.textContent = `${entry.score}`;
    row.append(rankEl, nameEl, scoreEl);
    return row;
}

/**
 * list / status：榜单与状态行元素；getText：当前语言文案；
 * isOpen：结算面板是否仍在显示（拉榜回来时已离开就不再改 DOM）。
 */
export function createDailyBoard({ list, status, getText, isOpen }) {
    const setStatus = text => { if (status) status.textContent = text; };

    function renderEntries(entries) {
        list.textContent = '';
        entries.slice(0, 10).forEach((entry, i) => list.appendChild(buildRow(i, entry)));
    }

    function renderLocal(date) {
        const local = readLocalBoard(date);
        if (!local.length) {
            list.textContent = '';
            const empty = document.createElement('div');
            empty.className = 'lm-lb-empty game-lb-empty';
            empty.textContent = getText().noScores;
            list.appendChild(empty);
            return;
        }
        renderEntries(local);
    }

    return {
        async publish({ game, date, name, score }) {
            if (!list) return;
            const ok = await submitScore({ game, name, score });
            if (!ok) {
                pushLocalScore(date, { name, score });
                renderLocal(date);
                setStatus(getText().lbOffline);
                return;
            }
            try {
                const data = await fetchBoard(game);
                if (!isOpen()) return;
                if (!Array.isArray(data) || data.length === 0) {
                    renderLocal(date);
                    return;
                }
                renderEntries(data);
                setStatus('');
            } catch (e) {
                renderLocal(date);
                setStatus(getText().lbOffline);
            }
        },
    };
}
