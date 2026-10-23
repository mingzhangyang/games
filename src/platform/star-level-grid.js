// The five isomorphic science puzzles share only their numbered three-star chip DOM.
// Each game still owns progress, level transitions, sound, and the surrounding menu.
export function renderStarLevelGrid(grid, levels, progress, prefix, onPick) {
    if (!grid) return;
    grid.innerHTML = '';
    levels.forEach((spec, i) => {
        const p = progress[spec.id] || { stars: 0 };
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = prefix + '-chip game-start-level-chip' + (p.stars > 0 ? ' is-done' : '');
        btn.dataset.level = String(i);
        const num = document.createElement('span');
        num.className = prefix + '-chip-num game-start-chip-num';
        num.textContent = String(i + 1);
        const stars = document.createElement('span');
        stars.className = prefix + '-chip-stars game-start-chip-stars';
        stars.textContent = '★'.repeat(p.stars) + '☆'.repeat(3 - p.stars);
        btn.appendChild(num);
        btn.appendChild(stars);
        btn.addEventListener('click', () => onPick(i));
        grid.appendChild(btn);
    });
}
