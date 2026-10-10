/**
 * Shared visible leaderboard dialog for games that did not previously expose a board.
 * Gameplay owns the score and eligibility; this module owns identity, network and DOM.
 */
import { fetchBoard, submitScore } from './leaderboard.js';
import { ensurePlayerName, getPlayerName, setPlayerName } from './player.js';
import { getLang } from './site-settings.js';
import { ICONS } from './icons.js';

const TEXT = {
    en: {
        title: 'Global leaderboard', open: 'View rankings', close: 'Close',
        name: 'Player', empty: 'No results yet', loading: 'Loading rankings…',
        offline: 'Rankings unavailable. Try again later.',
        failed: 'This score was not uploaded. Check your connection.',
        sent: 'Score submitted. Placement depends on the leaderboard.',
        reload: 'Refresh', board: 'Leaderboard',
    },
    zh: {
        title: '全球排行榜', open: '查看排名', close: '关闭',
        name: '昵称', empty: '暂无成绩', loading: '正在加载排行榜…',
        offline: '排行榜暂不可用，请稍后重试。',
        failed: '本次成绩未上传，请检查网络。',
        sent: '成绩已提交，是否上榜以榜单结果为准。',
        reload: '刷新', board: '榜单',
    },
};
const value = (label, lang) => typeof label === 'string'
    ? label : (label?.[lang] || label?.en || '');
const isFiniteScore = score => Number.isFinite(score) && score >= 0;

/**
 * @param {object} opts
 * @param {{id:string,key:string|function,label:object,format?:function}[]} opts.boards
 * @param {{before?:string,after?:string,icon?:boolean}[]} opts.triggers
 * @param {function} [opts.onOpen]   Called exactly once after opening.
 * @param {function} [opts.onClose]  Called when the native dialog closes.
 */
export function mountScoreboardDialog({ boards, triggers, onOpen = () => {}, onClose = () => {} }) {
    if (!Array.isArray(boards) || !boards.length
        || new Set(boards.map(b => b.id)).size !== boards.length) {
        throw new Error('Scoreboard needs distinct, nonempty boards');
    }
    // The audited DOM boundary requires static createElement tag arguments.
    // Keep only class assignment shared; node creation must remain explicit.
    const el = (node, className = '') => {
        node.className = className;
        return node;
    };
    const lang = () => getLang() === 'zh' ? 'zh' : 'en';
    const text = key => TEXT[lang()][key];

    const dialog = el(document.createElement('dialog'), 'scoreboard-dialog');
    dialog.dataset.scoreboardDialog = '';
    const panel = el(document.createElement('section'), 'scoreboard-panel game-lb');
    const header = el(document.createElement('div'), 'scoreboard-head');
    const title = el(document.createElement('h2'), 'scoreboard-title game-lb-title');
    title.id = 'scoreboard-title-' + boards[0].id;
    const close = el(document.createElement('button'), 'scoreboard-close game-icon-btn');
    close.type = 'button';
    close.innerHTML = ICONS.close;
    close.addEventListener('click', () => dialog.close());
    header.append(title, close);

    const boardLabel = el(document.createElement('label'), 'scoreboard-label');
    const select = el(document.createElement('select'), 'scoreboard-select');
    select.setAttribute('aria-label', 'Leaderboard');
    boardLabel.append(select);
    for (const board of boards) {
        const opt = el(document.createElement('option'));
        opt.value = board.id;
        select.append(opt);
    }

    const description = el(document.createElement('p'), 'scoreboard-description');
    const list = el(document.createElement('div'), 'scoreboard-list game-lb-list');
    list.setAttribute('aria-live', 'polite');
    const status = el(document.createElement('p'), 'scoreboard-status game-lb-status');
    status.setAttribute('role', 'status');

    const row = el(document.createElement('label'), 'scoreboard-player game-lb-username-row');
    const nameLabel = el(document.createElement('span'), 'game-lb-username-label');
    const nameInput = el(document.createElement('input'), 'game-lb-username');
    nameInput.type = 'text';
    nameInput.maxLength = 20;
    nameInput.autocomplete = 'nickname';
    nameInput.addEventListener('change', () => {
        nameInput.value = setPlayerName(nameInput.value);
    });
    row.append(nameLabel, nameInput);

    const reload = el(document.createElement('button'), 'scoreboard-refresh game-btn game-action-btn');
    reload.type = 'button';
    reload.addEventListener('click', () => { void refresh(); });
    panel.append(header, boardLabel, description, list, status, row, reload);
    dialog.append(panel);
    dialog.setAttribute('aria-labelledby', title.id);
    document.body.append(dialog);

    let requestId = 0;
    const notices = new Map();
    const boardFor = id => boards.find(board => board.id === id);
    const resolvedKey = board => typeof board.key === 'function' ? board.key() : board.key;
    const setStatus = message => { status.textContent = message; };

    function renderRows(data, board) {
        list.replaceChildren();
        if (!Array.isArray(data) || !data.length) {
            const empty = el(document.createElement('p'), 'game-lb-empty');
            empty.textContent = text('empty');
            list.append(empty);
            return;
        }
        data.slice(0, 10).forEach((item, index) => {
            const entry = el(document.createElement('div'), 'game-lb-row');
            const rank = el(document.createElement('span'), 'game-lb-rank');
            rank.textContent = String(index + 1) + '.';
            const player = el(document.createElement('span'), 'game-lb-name');
            player.textContent = String(item?.name || '');
            const score = el(document.createElement('b'), 'game-lb-score');
            score.textContent = typeof board.format === 'function'
                ? board.format(Number(item.score), lang())
                : Number(item.score).toLocaleString();
            entry.append(rank, player, score);
            list.append(entry);
        });
    }

    async function refresh() {
        const board = boardFor(select.value);
        if (!board || !dialog.open) return;
        const seq = ++requestId;
        const key = resolvedKey(board);
        list.replaceChildren();
        setStatus(text('loading'));
        try {
            const data = await fetchBoard(key);
            if (seq !== requestId || !dialog.open || board !== boardFor(select.value)) return;
            renderRows(data, board);
            setStatus(notices.get(key) || '');
        } catch {
            if (seq !== requestId || !dialog.open || board !== boardFor(select.value)) return;
            setStatus(notices.get(key) || text('offline'));
        }
    }

    function sync() {
        const locale = lang();
        title.textContent = text('title');
        close.setAttribute('aria-label', text('close'));
        close.title = text('close');
        boardLabel.setAttribute('aria-label', text('board'));
        select.setAttribute('aria-label', text('board'));
        nameLabel.textContent = text('name');
        reload.textContent = text('reload');
        [...select.options].forEach((option, i) => { option.textContent = value(boards[i].label, locale); });
        description.textContent = value(boardFor(select.value)?.description, locale);
        for (const button of buttons) {
            button.title = text('open');
            button.setAttribute('aria-label', text('open'));
            if (!button.dataset.scoreboardIcon) button.querySelector('span').textContent = text('open');
        }
    }

    const buttons = [];
    for (const target of triggers) {
        const anchor = document.querySelector(target.before || target.after);
        if (!anchor?.parentElement) {
            throw new Error('Missing scoreboard entry anchor: ' + (target.before || target.after));
        }
        const button = el(document.createElement('button'), target.icon
            ? 'scoreboard-trigger scoreboard-trigger--icon game-icon-btn'
            : 'scoreboard-trigger scoreboard-trigger--text game-btn game-action-btn');
        button.type = 'button';
        button.dataset.scoreboardTrigger = '';
        if (target.icon) {
            button.innerHTML = ICONS.trophy;
            button.dataset.scoreboardIcon = 'true';
        } else {
            button.innerHTML = ICONS.trophy;
            button.append(el(document.createElement('span')));
        }
        anchor.parentElement.insertBefore(button, target.before ? anchor : anchor.nextSibling);
        button.addEventListener('click', () => {
            const selected = typeof target.boardId === 'function' ? target.boardId() : target.boardId;
            open(selected);
        });
        buttons.push(button);
    }
    if (!buttons.length) throw new Error('Scoreboard has no visible entry');

    select.addEventListener('change', () => {
        description.textContent = value(boardFor(select.value)?.description, lang());
        void refresh();
    });
    dialog.addEventListener('close', () => { ++requestId; onClose(); });
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });
    window.addEventListener('site-settings:changed', sync);
    select.value = boards[0].id;
    sync();

    function open(boardId) {
        if (boardId && boardFor(boardId)) select.value = boardId;
        nameInput.value = getPlayerName() || ensurePlayerName();
        sync();
        if (!dialog.open) {
            dialog.showModal();
            onOpen();
        }
        void refresh();
    }

    async function submit({ boardId, score, key }) {
        const board = boardFor(boardId);
        if (!board || !isFiniteScore(score)) return false;
        const resolved = key || resolvedKey(board);
        const ok = await submitScore({ game: resolved, name: getPlayerName() || ensurePlayerName(), score });
        notices.set(resolved, text(ok ? 'sent' : 'failed'));
        if (dialog.open && resolvedKey(boardFor(select.value)) === resolved) void refresh();
        return ok;
    }

    return { open, submit, refresh, dialog };
}
