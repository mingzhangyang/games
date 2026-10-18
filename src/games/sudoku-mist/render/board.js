/**
 * 雾隐九宫 — DOM 棋盘（81 个按钮格，role="grid"；键盘与读屏都靠它，命中测试只走 DOM）。
 * 只读规则层给出的知识视图（session.view()）：雾中格从来拿不到数字，DOM 里也就不会有。
 */
import { PEERS, rowOf, colOf, UNITS } from '../model/grid.js';

export function createBoard(root, { onCell }) {
    const cells = [];
    const digits = [];
    const notes = [];
    root.textContent = '';
    for (let r = 0; r < 9; r++) {
        const row = document.createElement('div');
        row.className = 'sm-row';
        row.setAttribute('role', 'row');
        for (let c = 0; c < 9; c++) {
            const i = r * 9 + c;
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'sm-cell';
            if (c % 3 === 2 && c < 8) cell.classList.add('sm-cell--box-r');
            if (r % 3 === 2 && r < 8) cell.classList.add('sm-cell--box-b');
            cell.setAttribute('role', 'gridcell');
            cell.dataset.cell = String(i);
            cell.tabIndex = i === 40 ? 0 : -1;
            const digit = document.createElement('span');
            digit.className = 'sm-cell-digit';
            digit.setAttribute('aria-hidden', 'true');
            const grid = document.createElement('span');
            grid.className = 'sm-cell-notes';
            grid.setAttribute('aria-hidden', 'true');
            const marks = [];
            for (let d = 1; d <= 9; d++) {
                const m = document.createElement('span');
                m.className = 'sm-note';
                grid.appendChild(m);
                marks.push(m);
            }
            cell.append(digit, grid);
            cell.addEventListener('click', () => onCell(i));
            row.appendChild(cell);
            cells.push(cell);
            digits.push(digit);
            notes.push(marks);
        }
        root.appendChild(row);
    }

    /**
     * state: { view, selected, armed, notes(Uint16Array), hintCell, hintUnit, label(i, view, noteMask) }
     */
    function update(state) {
        const { view, selected, armed, hintCell = -1, hintUnit = -1 } = state;
        const peers = selected >= 0 ? new Set(PEERS[selected]) : null;
        const focusDigit = armed || (selected >= 0 && view[selected].digit) || 0;
        const unitCells = hintUnit >= 0 ? new Set(UNITS[hintUnit]) : null;
        for (let i = 0; i < 81; i++) {
            const v = view[i];
            const el = cells[i];
            el.classList.toggle('sm-cell--fog', v.state === 'fog');
            el.classList.toggle('sm-cell--given', v.state === 'given');
            el.classList.toggle('sm-cell--placed', v.state === 'placed');
            el.classList.toggle('sm-cell--open', v.state === 'open');
            el.classList.toggle('sm-cell--selected', i === selected);
            el.classList.toggle('sm-cell--peer', !!peers?.has(i));
            el.classList.toggle('sm-cell--same', !!focusDigit && v.digit === focusDigit);
            el.classList.toggle('sm-cell--hint', i === hintCell);
            el.classList.toggle('sm-cell--hint-unit', !!unitCells?.has(i));
            digits[i].textContent = v.digit ? String(v.digit) : '';
            const mask = v.digit ? 0 : state.notes[i];
            for (let d = 1; d <= 9; d++) {
                notes[i][d - 1].textContent = mask & (1 << (d - 1)) ? String(d) : '';
            }
            el.setAttribute('aria-label', state.label(i, v, mask));
            el.setAttribute('aria-selected', i === selected ? 'true' : 'false');
        }
    }

    /** 落错：短暂红闪（CSS transition，样式里没有 keyframes） */
    function flash(i, cls) {
        const el = cells[i];
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 450);
    }

    function focus(i) {
        cells.forEach((el, j) => { el.tabIndex = j === i ? 0 : -1; });
        if (i >= 0) cells[i].focus({ preventScroll: true });
    }

    /** 格中心在棋盘里的百分比坐标（浮字定位用） */
    const center = i => ({ x: (colOf(i) + 0.5) / 9 * 100, y: (rowOf(i) + 0.5) / 9 * 100 });

    return { cells, update, flash, focus, center };
}
