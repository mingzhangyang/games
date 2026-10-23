/** Render already-calculated display rows; scoring, storage and locale stay with the game. */
export function renderSideRecords(container, rows, { rowClass = '', labelClass = '', valueClass = '' } = {}) {
    if (!container) return;
    const document = container.ownerDocument;
    const fragment = document.createDocumentFragment();
    for (const { label, value } of rows) {
        const row = document.createElement('div');
        row.className = (rowClass ? rowClass + ' ' : '') + 'game-side-row';
        const name = document.createElement('span');
        if (labelClass) name.className = labelClass;
        name.textContent = String(label ?? '');
        const number = document.createElement('b');
        if (valueClass) number.className = valueClass;
        number.textContent = String(value ?? '');
        row.append(name, number);
        fragment.appendChild(row);
    }
    container.replaceChildren(fragment);
}
