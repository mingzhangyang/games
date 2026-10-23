/**
 * Shared visible leaderboard dialog for games that did not previously expose a board.
 * Gameplay owns the score and eligibility; this module owns identity, network and DOM.
 */
import { fetchBoard, UnsupportedLeaderboardError } from './leaderboard.js';
import { hasPendingScore, pendingScoreCount, subscribePendingScoreUploads } from './scoreboard-pending.js';
import { retryScoreResults, sameScoreEntry, submitScoreResult } from './scoreboard-submission.js';
import { ensurePlayerName, getPlayerName, setPlayerName } from './player.js';
import { getLang } from './site-settings.js';
import { ICONS } from './icons.js';
import { bindDialogToVisualViewport } from './visual-viewport-dialog.js';

const TEXT = {
    en: {
        title: 'Global leaderboard', open: 'View rankings', close: 'Close',
        name: 'Player', empty: 'No results yet', loading: 'Loading rankings…',
        offline: 'Rankings unavailable. Try again later.',
        failed: 'This score was not uploaded. Check your connection.',
        submitting: 'Submitting score…',
        sent: 'Score submitted. Placement depends on the leaderboard.',
        reload: 'Refresh', board: 'Leaderboard',
        pendingWorker: 'Rankings for this game are not live yet.',
        queued: 'Score saved on this device; upload will retry when rankings are available.',
        notSaved: 'Score was not uploaded or saved on this device.',
    },
    zh: {
        title: '全球排行榜', open: '查看排名', close: '关闭',
        name: '昵称', empty: '暂无成绩', loading: '正在加载排行榜…',
        offline: '排行榜暂不可用，请稍后重试。',
        failed: '本次成绩未上传，请检查网络。',
        submitting: '正在上传成绩…',
        sent: '成绩已提交，是否上榜以榜单结果为准。',
        reload: '刷新', board: '榜单',
        pendingWorker: '本游戏排行榜尚未上线。',
        queued: '成绩已暂存在本设备；排行榜可用后将重试上传。',
        notSaved: '成绩未能上传，也未能保存在本设备。',
    },
};
const value = (label, lang) => typeof label === 'string'
    ? label : (label?.[lang] || label?.en || '');
const isFiniteScore = score => Number.isFinite(score) && score >= 0;

/**
 * @param {object} opts
 * @param {{id:string,key:string|function,label:object,format?:function}[]} opts.boards
 * @param {{selector?:string,before?:string,after?:string,icon?:boolean}[]} opts.triggers
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
    reload.innerHTML = ICONS.retry;
    const reloadLabel = el(document.createElement('span'));
    reload.append(reloadLabel);
    reload.addEventListener('click', () => { void refresh(); });
    panel.append(header, boardLabel, description, list, status, row, reload);
    dialog.append(panel);
    dialog.setAttribute('aria-labelledby', title.id);
    document.body.append(dialog);
    const visualViewportBinding = bindDialogToVisualViewport(dialog);

    let requestId = 0;
    let readState = 'idle';
    const notices = new Map();
    const boardFor = id => boards.find(board => board.id === id);
    const resolvedKey = board => typeof board.key === 'function' ? board.key() : board.key;
    const setStatus = message => { status.textContent = message; };

    function renderStatus() {
        const key = resolvedKey(boardFor(select.value));
        const notice = notices.get(key);
        const state = notice?.status === 'queued' && !hasPendingScore(notice.entry) ? 'notSaved' : notice?.status;
        const submission = notice ? text(state) : (pendingScoreCount(key) ? text('queued') : '');
        const reading = readState === 'loading' ? text('loading')
            : readState === 'unsupported' ? text('pendingWorker')
                : readState === 'offline' ? text('offline') : '';
        setStatus([submission, reading].filter(Boolean).join(' '));
    }

    // Keep the latest result's notice separate from old entries on the same board.
    // This also observes startup/online retries initiated outside this dialog.
    const stopUploads = subscribePendingScoreUploads(entry => {
        const notice = notices.get(entry.game);
        if (notice && !sameScoreEntry(notice.entry, entry)) return;
        notices.set(entry.game, { entry, status: 'sent' });
        if (dialog.open) renderStatus();
    });

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
        readState = 'loading';
        renderStatus();
        try {
            const data = await fetchBoard(key);
            if (seq !== requestId || !dialog.open || board !== boardFor(select.value)) return;
            renderRows(data, board);
            readState = 'ready';
            renderStatus();

            // A successful GET proves this independently deployed Worker has
            // been updated. Replay queued scores across ALL boards, including
            // yesterday's date-specific runs, with bounded/idempotent POSTs.
            const uploaded = await retryScoreResults();
            if (seq !== requestId || !dialog.open || board !== boardFor(select.value)) return;
            if (uploaded.includes(key)) {
                void refresh(); // Read the now-persisted ranking exactly once.
            } else {
                renderStatus();
            }
        } catch (error) {
            if (seq !== requestId || !dialog.open || board !== boardFor(select.value)) return;
            readState = error instanceof UnsupportedLeaderboardError ? 'unsupported' : 'offline';
            renderStatus();
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
        reloadLabel.textContent = text('reload');
        [...select.options].forEach((option, i) => { option.textContent = value(boards[i].label, locale); });
        description.textContent = value(boardFor(select.value)?.description, locale);
        for (const button of buttons) {
            button.title = text('open');
            button.setAttribute('aria-label', text('open'));
            if (!button.dataset.scoreboardIcon) button.querySelector('span').textContent = text('open');
        }
        if (dialog.open) renderStatus();
    }

    const buttons = [];
    const triggerBindings = [];
    for (const target of triggers) {
        let button;
        if (target.selector) {
            button = document.querySelector(target.selector);
            if (target.before || target.after || button?.tagName !== 'BUTTON' || buttons.includes(button)) {
                throw new Error('Invalid or duplicate generated scoreboard entry: ' + target.selector);
            }
        } else {
            const anchor = document.querySelector(target.before || target.after);
            if (!anchor?.parentElement) {
                throw new Error('Missing scoreboard entry anchor: ' + (target.before || target.after));
            }
            button = el(document.createElement('button'), target.icon
                ? 'scoreboard-trigger scoreboard-trigger--icon game-icon-btn'
                : 'scoreboard-trigger scoreboard-trigger--text game-btn game-action-btn');
            button.type = 'button';
            button.dataset.scoreboardTrigger = '';
            button.innerHTML = ICONS.trophy;
            if (target.icon) button.dataset.scoreboardIcon = 'true';
            else button.append(el(document.createElement('span')));
            anchor.parentElement.insertBefore(button, target.before ? anchor : anchor.nextSibling);
        }
        button.setAttribute('aria-haspopup', 'dialog');
        const openFromTrigger = () => {
            const selected = typeof target.boardId === 'function' ? target.boardId() : target.boardId;
            open(selected);
        };
        button.addEventListener('click', openFromTrigger);
        triggerBindings.push({ button, openFromTrigger, owned: !target.selector });
        buttons.push(button);
    }
    if (!buttons.length) throw new Error('Scoreboard has no visible entry');

    select.addEventListener('change', () => {
        description.textContent = value(boardFor(select.value)?.description, lang());
        void refresh();
    });
    // Modal owns its keyboard events. Let native input/select/Tab/Escape behavior
    // run, but never bubble those keys to each game's document/window controls.
    // In particular Escape must retain the native dialog close default.
    for (const type of ['keydown', 'keyup', 'keypress']) {
        dialog.addEventListener(type, event => event.stopPropagation());
    }
    dialog.addEventListener('close', () => {
        // A native close event is queued, not dispatched synchronously.
        // close() followed by showModal() in the same turn must not release
        // the *new* opening's pause lease or detach its viewport listeners.
        if (dialog.open) return;
        ++requestId;
        visualViewportBinding.stop();
        onClose();
    });
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
            visualViewportBinding.start();
            onOpen();
        }
        void refresh();
    }

    /**
     * journal: write the score to the local retry journal BEFORE the POST and drop it
     * on acknowledgement, so closing the page mid-request still leaves it retryable.
     * For one-shot scores the game will never offer again (a daily first clear).
     * A duplicate POST is harmless: each board keeps one best score per name.
     */
    async function submit({ boardId, score, key, journal = false }) {
        const board = boardFor(boardId);
        if (!board || !isFiniteScore(score)) return false;
        const resolved = key || resolvedKey(board);
        const name = getPlayerName() || ensurePlayerName();
        const entry = Object.freeze({ game: resolved, name, score });
        const notice = { entry, status: 'submitting' };
        notices.set(resolved, notice);
        if (dialog.open) renderStatus();
        const receipt = await submitScoreResult(entry, { journal });
        const current = notices.get(resolved);
        if (current === notice || (current?.status === 'sent' && sameScoreEntry(current.entry, entry))) {
            if (current.status !== 'sent') current.status = receipt.status;
            if (dialog.open && resolvedKey(boardFor(select.value)) === resolved) void refresh();
        }
        return receipt.status === 'sent'; // Only remote acknowledgement counts as success.
    }

    function destroy() {
        stopUploads();
        ++requestId;
        if (dialog.open) dialog.close();
        visualViewportBinding.stop();
        window.removeEventListener('site-settings:changed', sync);
        for (const { button, openFromTrigger, owned } of triggerBindings) {
            button.removeEventListener('click', openFromTrigger);
            if (owned) button.remove();
        }
        dialog.remove();
    }

    return { open, submit, refresh, dialog, destroy };
}
