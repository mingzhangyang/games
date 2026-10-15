// 筛选条（proposal §4.2）：状态只放 location.hash（#cat=science），可分享、可后退；
// 不进本地存储，回访默认「全部」（D-5）。
// 冻结的 .game-card { display:flex } 盖过 hidden 属性，所以「每日」筛选把其余卡片移进
// 分区内 hidden 的暂存 div（仍在文档里，语言切换 / 主题同步照样覆盖）。
const sectionCards = new WeakMap();

export function applyFilter() {
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

/** 筛选按钮与 Daily Hub 的「更多每日」共用。pushState 不触发 hashchange，所以手动刷新；
 *  吸顶时内容高度骤变、或 jump（从 Hub 跳来）时，回到分区开头。 */
export function setFilter(filter, jump = false) {
    const hash = filter === 'all' ? '' : `#cat=${filter}`;
    if (location.hash !== hash) history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
    applyFilter();
    const box = document.getElementById('games-filter');
    const cats = document.getElementById('games-cats');
    if (jump || (cats && box && cats.getBoundingClientRect().top < box.offsetHeight)) document.getElementById('section-label')?.scrollIntoView();
}

export function bindFilter() {
    const box = document.getElementById('games-filter');
    if (!box) return;
    box.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
    window.addEventListener('hashchange', applyFilter);
    window.addEventListener('popstate', applyFilter);
    box.hidden = false;
    applyFilter();
}
