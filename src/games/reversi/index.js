/**
 * Reversi 黑白棋 — classic strategy board game
 * 标准 Othello 规则；AI 使用 negamax + α-β 剪枝 + 迭代加深，
 * 评估函数 = 位置权重 + 机动性，残局（空格 ≤ 12）直接搜索到终局。
 * 支持 vs AI（三档难度）与本地双人。
 *
 * Vanilla JS, DOM board with 3D flip animation. No runtime dependencies.
 */

import { ensurePlayerName, setPlayerName } from '../../platform/player.js';
import { getLang, getMuted, setMuted } from '../../platform/site-settings.js';
import { ICONS } from '../../platform/icons.js';
import { updateMoreGames } from '../../platform/more-games.js';
import { EMPTY, BLACK, WHITE, findFlips, genMoves, countDiscs, pickAiMove } from './reversi-ai.js';
import {
    loadReversiMode,
    loadReversiDifficulty,
    loadReversiBestStreak,
    saveReversiBestStreak,
    loadReversiLocalScores,
    saveReversiLocalScores,
    saveReversiMode,
    saveReversiDifficulty,
    loadReversiStreak,
} from './storage.js';
import { track } from '../../platform/analytics.js';
import { fetchBoard } from '../../platform/leaderboard.js';
import { createScoreboardResultSession, retryScoreResults } from '../../platform/scoreboard-submission.js';
import { renderEmbeddedScoreResult, resetEmbeddedScoreResult } from '../../platform/scoreboard-result-view.js';
import { makeText } from '../../platform/i18n.js';
import { createI18nBinder } from '../../platform/i18n/bindings.js';
import { onReady } from '../../platform/boot.js';
import { bindTopbarClearance } from '../../platform/topbar-clearance.js';
import { mountGameRuntime } from '../../platform/runtime/game-runtime.js';
import { createSfxEngine } from '../../platform/game-sfx.js';

/* ────────────────────────── utilities ────────────────────────── */

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = makeText({
    en: {
        pageTitle: 'Reversi — Classic Strategy Board Game',
        boardLabel: 'Reversi board',
        title: 'Reversi',
        subtitle: 'Flip · Trap · Dominate',
        howto: 'Place a disc to flank the opponent\'s line and flip it to your color. Most discs when the board fills wins. Corners never flip — fight for them!',
        vsAI: 'vs AI',
        twoPlayers: '2 Players',
        easy: 'Easy', medium: 'Medium', hard: 'Hard',
        play: 'Play',
        you: 'You', ai: 'AI', black: 'Black', white: 'White',
        yourTurn: 'Your turn',
        aiThinking: 'AI thinking…',
        blackTurn: 'Black\'s turn',
        whiteTurn: 'White\'s turn',
        passToast: 'No legal move — {who} passes',
        gameOver: 'Game Over',
        youWin: 'You win! 🎉',
        youLose: 'AI wins',
        draw: 'Draw',
        blackWins: 'Black wins! 🎉',
        whiteWins: 'White wins! 🎉',
        winStreak: '🔥 Win streak',
        newBestStreak: 'New best streak!',
        bestStreak: 'Best streak',
        submitFail: 'Score upload failed — saved locally',
        leaveConfirm: 'A game is in progress. Leave and discard it?',
        leaderboard: 'Global Win Streaks',
        loadingScores: 'Loading…',
        noScores: 'No games yet',
        lbOffline: 'Leaderboard offline',
        lbSubmitting: 'Uploading score…',
        lbSent: 'Score uploaded.',
        lbQueued: 'Saved on this device; upload will retry.',
        lbNotSaved: 'Score was not uploaded or saved on this device.',
        lbLoading: 'Loading rankings…',
        again: 'Play Again',
        copyResult: 'Copy Result',
        home: 'Home',
        hint: 'Tap a highlighted square to place your disc',
    },
    zh: {
        pageTitle: '黑白棋 — 经典策略棋类游戏',
        boardLabel: '黑白棋棋盘',
        title: '黑白棋',
        subtitle: '翻转 · 夹击 · 称霸',
        howto: '落子夹住对方棋子即可将其翻成己方颜色。棋盘下满时子多者胜。四角永远不会被翻——努力抢角吧！',
        vsAI: '人机对战',
        twoPlayers: '双人对战',
        easy: '简单', medium: '中等', hard: '困难',
        play: '开始游戏',
        you: '你', ai: 'AI', black: '黑方', white: '白方',
        yourTurn: '轮到你了',
        aiThinking: 'AI 思考中…',
        blackTurn: '黑方行棋',
        whiteTurn: '白方行棋',
        passToast: '{who} 无处可落，跳过一手',
        gameOver: '对局结束',
        youWin: '你赢了！🎉',
        youLose: 'AI 获胜',
        draw: '平局',
        blackWins: '黑方获胜！🎉',
        whiteWins: '白方获胜！🎉',
        winStreak: '🔥 连胜',
        newBestStreak: '连胜新纪录！',
        bestStreak: '最长连胜',
        submitFail: '成绩上传失败——已保存到本地',
        leaveConfirm: '对局进行中，离开将丢失当前进度。确定离开吗？',
        leaderboard: '全球连胜榜',
        loadingScores: '加载中…',
        noScores: '暂无对局',
        lbOffline: '榜单离线',
        lbSubmitting: '正在上传成绩…',
        lbSent: '成绩已上传。',
        lbQueued: '成绩已暂存在本设备，稍后重试上传。',
        lbNotSaved: '成绩未上传，也未保存在本设备。',
        lbLoading: '正在加载排名…',
        again: '再来一局',
        copyResult: '复制成绩',
        home: '返回主页',
        hint: '点击高亮格子落子',
    }
});

/* ────────────────────────── audio ────────────────────────── */

const sfxEngine = createSfxEngine();

const Sfx = {
    get muted() { return getMuted(); },

    place() {
        sfxEngine.tone({ freq: 320, slideTo: 180, type: 'sine', dur: 0.09, vol: 0.18 });
    },
    flip(n) {
        sfxEngine.tone({ freq: 500 + Math.min(n, 10) * 40, type: 'triangle', dur: 0.07, vol: 0.08, delay: 0.06 });
    },
    win() {
        [523, 659, 784, 1046].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.14, delay: i * 0.09 });
        });
    },
    lose() {
        sfxEngine.tone({ freq: 420, slideTo: 110, type: 'sawtooth', dur: 0.55, vol: 0.16 });
    },
    click() { sfxEngine.tone({ freq: 640, type: 'square', dur: 0.05, vol: 0.06 }); },
    toggleMuted() {
        const muted = !getMuted();
        setMuted(muted);
        return muted;
    }
};

/* ────────────────────────── engine (see reversi-ai.js) ────────────────────────── */

/* ────────────────────────── game ────────────────────────── */

class ReversiGame {
    constructor({ i18nBinder = null } = {}) {
        this.i18nBinder = i18nBinder;
        this.boardEl = document.getElementById('rv-board');
        this.el = {};
        ['rv-btn-home', 'rv-box-black', 'rv-box-white', 'rv-name-black', 'rv-name-white',
            'rv-count-black', 'rv-count-white', 'rv-mute-btn', 'rv-status',
            'rv-toast', 'rv-start', 'rv-title', 'rv-subtitle', 'rv-howto',
            'rv-mode-ai-label', 'rv-mode-2p-label', 'rv-diff-easy', 'rv-diff-medium', 'rv-diff-hard',
            'rv-btn-play', 'rv-streak-line',
            'rv-over', 'rv-over-title', 'rv-over-verdict', 'rv-over-score', 'rv-over-streak',
            'rv-btn-again', 'rv-btn-copy', 'rv-btn-menu', 'rv-lb-box',
            'rv-lb-title', 'rv-lb-list', 'rv-lb-status', 'rv-username', 'rv-username-label',
            'rv-hint'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^rv-/, '')] = el;
        });

        this.mode = loadReversiMode();
        this.diff = loadReversiDifficulty();
        this.lang = this.readLang();

        this.gameId = 0;      // 递增令牌，用于作废过期的 AI 回调
        this.lbReadId = 0;
        this.lbOpen = false;
        this.resultSession = createScoreboardResultSession({
            onChange: result => this.renderScoreResult(result),
        });
        this.el['lb-status']?.setAttribute('role', 'status');
        this.timeouts = [];
        this.state = 'menu';

        this.applyLanguage();
        this.syncModeButtons();
        this.buildBoard();
        this.bindUI();
        this.updateMuteButtons();
        this.updateStreakLine();
        this.showStart();
        window.addEventListener('online', () => {
            if (this.resultSession.getState()) void this.resultSession.refresh();
            else void retryScoreResults();
        });
        void retryScoreResults();
    }

    readLang() {
        return getLang();
    }

    get TEXT() { return LANGUAGES[this.lang]; }

    /* ── 语言 ── */

    applyLanguage() {
        const t = this.TEXT;
        this.i18nBinder?.apply(this.lang);
        // Copy feedback swaps the icon and label temporarily, so it remains a
        // table-driven compound control rather than a declarative text node.
        if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;
        this.updatePlayerNames();
        this.updateStreakLine();

        if (this.state === 'playing') {
            const BLACK = 1, WHITE = 2;
            if (this.mode === 'ai') {
                this.setStatus(this.turn === BLACK ? t.yourTurn : t.aiThinking, this.turn === WHITE);
            } else {
                this.setStatus(this.turn === BLACK ? t.blackTurn : t.whiteTurn, false);
            }
        } else if (this.state === 'over') {
            this.setStatus(t.gameOver, false);
        }

        if (this.resultSession?.getState()) this.renderScoreResult();
        else if (this.readOnlyBoardStatus === 'offline' && this.lbOpen && this.el['lb-status']) {
            this.el['lb-status'].textContent = this.TEXT.lbOffline;
        }
        updateMoreGames(this.lang);
    }

    updatePlayerNames() {
        const t = this.TEXT;
        if (this.mode === 'ai') {
            if (this.el['name-black']) this.el['name-black'].textContent = t.you;
            if (this.el['name-white']) this.el['name-white'].textContent = `${t.ai} · ${t[this.diff]}`;
        } else {
            if (this.el['name-black']) this.el['name-black'].textContent = t.black;
            if (this.el['name-white']) this.el['name-white'].textContent = t.white;
        }
    }

    syncModeButtons() {
        document.querySelectorAll('.rv-mode').forEach(b => b.classList.toggle('active', b.dataset.mode === this.mode));
        document.querySelectorAll('.rv-diff').forEach(b => {
            b.classList.toggle('active', b.dataset.diff === this.diff);
            b.style.display = this.mode === 'ai' ? '' : 'none';
        });
        if (this.el['lb-box']) this.el['lb-box'].style.display = this.mode === 'ai' ? '' : 'none';
        this.updatePlayerNames();
    }

    /* ── 棋盘 DOM ── */

    buildBoard() {
        this.boardEl.textContent = '';
        this.cellEls = new Array(64);
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 64; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rv-cell';
            btn.dataset.i = i;
            btn.setAttribute('role', 'gridcell');
            this.cellEls[i] = btn;
            frag.appendChild(btn);
        }
        this.boardEl.appendChild(frag);
    }

    discEl(i) {
        return this.cellEls[i].querySelector('.rv-disc3');
    }

    // 在空格放置新棋子（带弹入动画）
    addDisc(i, color, pop = true) {
        const cell = this.cellEls[i];
        const old = this.discEl(i);
        if (old) old.remove();
        const disc = document.createElement('div');
        disc.className = 'rv-disc3' + (color === WHITE ? ' show-white' : '') + (pop ? ' pop' : '');
        disc.innerHTML = '<div class="rv-face rv-face-b"></div><div class="rv-face rv-face-w"></div>';
        cell.appendChild(disc);
    }

    renderAll() {
        for (let i = 0; i < 64; i++) {
            const cell = this.cellEls[i];
            const existing = this.discEl(i);
            if (this.board[i] === EMPTY) {
                if (existing) existing.remove();
                cell.classList.remove('last-move');
                continue;
            }
            if (!existing) {
                this.addDisc(i, this.board[i], false);
            } else {
                existing.classList.toggle('show-white', this.board[i] === WHITE);
            }
        }
    }

    /* ── 对局流程 ── */

    newGame() {
        resetEmbeddedScoreResult(this.resultSession, this.el);
        this.lbReadId++;
        this.lbOpen = false;
        this.readOnlyBoardStatus = null;
        this.gameId++;
        this.clearTimeouts();
        this.board = new Int8Array(64);
        this.board[27] = WHITE; this.board[28] = BLACK;
        this.board[35] = BLACK; this.board[36] = WHITE;
        this.turn = BLACK;
        this.state = 'playing';
        track('reversi', 'play');
        this.lastMove = -1;

        this.renderAll();
        for (let i = 0; i < 64; i++) this.cellEls[i].classList.remove('last-move');
        this.updateCounts();
        this.beginTurn();
    }

    beginTurn() {
        if (this.state !== 'playing') return;
        const id = this.gameId;
        const moves = genMoves(this.board, this.turn);

        if (moves.length === 0) {
            const oppMoves = genMoves(this.board, 3 - this.turn);
            if (oppMoves.length === 0) {
                this.gameOver();
                return;
            }
            // 过路
            this.showToast(this.TEXT.passToast.replace('{who}', this.turn === BLACK ? this.TEXT.black : this.TEXT.white));
            this.turn = 3 - this.turn;
            this.timeouts.push(setTimeout(() => {
                if (id === this.gameId) this.beginTurn();
            }, 900));
            return;
        }

        this.updateTurnUi(moves);

        const aiTurn = this.mode === 'ai' && this.turn === WHITE;
        if (aiTurn) {
            this.setStatus(this.TEXT.aiThinking, true);
            const level = this.diff;
            const boardCopy = this.board.slice();
            // 让 UI 先渲染，再进行同步搜索
            this.timeouts.push(setTimeout(() => {
                if (id !== this.gameId) return;
                const move = pickAiMove(boardCopy, WHITE, level);
                if (id !== this.gameId || !move || this.state !== 'playing') return;
                this.playMove(move.i, move.flips);
            }, 420));
        }
    }

    updateTurnUi(moves) {
        const legalSet = new Set(moves.map(m => m.i));
        for (let i = 0; i < 64; i++) {
            this.cellEls[i].classList.toggle('legal', legalSet.has(i));
        }
        // 当前回合方高亮
        if (this.el['box-black']) this.el['box-black'].classList.toggle('active', this.turn === BLACK);
        if (this.el['box-white']) this.el['box-white'].classList.toggle('active', this.turn === WHITE);

        const t = this.TEXT;
        if (this.mode === 'ai') {
            this.setStatus(this.turn === BLACK ? t.yourTurn : t.aiThinking, this.turn === WHITE);
        } else {
            this.setStatus(this.turn === BLACK ? t.blackTurn : t.whiteTurn, false);
        }
    }

    playMove(i, flips) {
        const color = this.turn;
        this.board[i] = color;
        for (const f of flips) this.board[f] = color;
        this.lastMove = i;

        // 落子 + 翻转动画（按与落点的距离错开）
        this.addDisc(i, color, true);
        const px = i & 7, py = i >> 3;
        for (const f of flips) {
            const dist = Math.max(Math.abs((f & 7) - px), Math.abs((f >> 3) - py));
            const id = this.gameId;
            this.timeouts.push(setTimeout(() => {
                if (id !== this.gameId) return;
                const disc = this.discEl(f);
                if (disc) disc.classList.toggle('show-white', color === WHITE);
            }, 60 + dist * 70));
        }

        Sfx.place();
        Sfx.flip(flips.length);

        // 最后落点标记
        for (let c = 0; c < 64; c++) this.cellEls[c].classList.remove('last-move', 'legal');
        this.cellEls[i].classList.add('last-move');

        this.updateCounts();
        this.turn = 3 - this.turn;
        // 翻转动画的最远距离决定下一手等待时间
        let maxDist = 1;
        for (const f of flips) {
            maxDist = Math.max(maxDist, Math.max(Math.abs((f & 7) - px), Math.abs((f >> 3) - py)));
        }
        const wait = 140 + maxDist * 70 + 300;
        const id = this.gameId;
        this.timeouts.push(setTimeout(() => {
            if (id === this.gameId) this.beginTurn();
        }, wait));
    }

    updateCounts() {
        const { b, w } = countDiscs(this.board);
        if (this.el['count-black']) this.el['count-black'].textContent = b;
        if (this.el['count-white']) this.el['count-white'].textContent = w;
        return { b, w };
    }

    setStatus(text, thinking) {
        if (!this.el.status) return;
        this.el.status.textContent = text;
        this.el.status.classList.toggle('thinking', !!thinking);
    }

    showToast(text) {
        if (!this.el.toast) return;
        this.el.toast.textContent = text;
        this.el.toast.classList.remove('hidden');
        const id = this.gameId;
        this.timeouts.push(setTimeout(() => {
            if (id === this.gameId) this.el.toast.classList.add('hidden');
        }, 1400));
    }

    gameOver() {
        if (this.state !== 'playing') return;
        this.state = 'over';
        for (let i = 0; i < 64; i++) this.cellEls[i].classList.remove('legal');
        if (this.el['box-black']) this.el['box-black'].classList.remove('active');
        if (this.el['box-white']) this.el['box-white'].classList.remove('active');

        const { b, w } = countDiscs(this.board);
        const t = this.TEXT;
        this.setStatus(t.gameOver, false);

        let verdictKey;
        if (b > w) verdictKey = this.mode === 'ai' ? 'youWin' : 'blackWins';
        else if (w > b) verdictKey = this.mode === 'ai' ? 'youLose' : 'whiteWins';
        else verdictKey = 'draw';
        const verdict = t[verdictKey];

        if (this.el['over-title']) this.el['over-title'].textContent = t.gameOver;
        if (this.el['over-verdict']) this.el['over-verdict'].textContent = verdict;
        if (this.el['over-score']) this.el['over-score'].textContent = `${b} : ${w}`;

        track('reversi', 'finish');

        // AI 模式才更新连胜/榜单
        let streakNote = '';
        if (this.mode === 'ai') {
            const won = b > w;
            if (won) {
                this.streak = (this.streak || 0) + 1;
                const best = loadReversiBestStreak();
                if (this.streak > best) saveReversiBestStreak(this.streak);
                const entry = {
                    runId: this.gameId, date: null, game: 'reversi',
                    name: ensurePlayerName() || 'Anonymous', score: this.streak,
                };
                this.recordLocalScore(entry);
                void this.resultSession.publish(entry);
                streakNote = `${t.winStreak} ${this.streak}`;
            } else if (b < w) {
                this.streak = 0;
            }
            // 平局保持连胜
            if (won) Sfx.win();
            else if (b < w) Sfx.lose();
        }
        if (this.el['over-streak']) this.el['over-streak'].textContent = streakNote;
        this.updateStreakLine();

        if (this.el.over) this.el.over.classList.remove('hidden');
        if (this.mode === 'ai') {
            this.lbOpen = true;
            if (this.resultSession.getState()) this.renderScoreResult();
            else void this.fetchLeaderboard(); // Read-only after AI draw/loss; no score eligible.
        }
    }

    updateStreakLine() {
        if (!this.el['streak-line']) return;
        const best = loadReversiBestStreak();
        this.el['streak-line'].textContent = best > 0
            ? `${this.TEXT.winStreak}: ${this.streak || 0}   ·   ${this.TEXT.bestStreak}: ${best}`
            : '';
    }

    /* ── 排行榜 ── */

    localScores() {
        return loadReversiLocalScores();
    }

    renderLocalScores() {
        this.renderBoard(this.localScores().slice(0, 10));
    }

    renderBoard(rows) {
        const list = this.el['lb-list'];
        if (!list) return;
        list.replaceChildren();
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'rv-lb-empty game-lb-empty';
            empty.textContent = this.TEXT.noScores;
            list.appendChild(empty);
            return;
        }
        rows.slice(0, 10).forEach((entry, i) => list.appendChild(this.buildLbRow(i, entry)));
    }

    recordLocalScore(entry) {
        const local = this.localScores();
        local.push({ name: entry.name, score: entry.score });
        local.sort((a, b) => b.score - a.score);
        saveReversiLocalScores(local.slice(0, 30));
    }

    renderScoreResult(result = this.resultSession.getState()) {
        if (!this.lbOpen || this.mode !== 'ai' || this.state !== 'over') return;
        renderEmbeddedScoreResult({
            result, el: this.el, text: key => this.TEXT[key],
            renderBoard: rows => this.renderBoard(rows.length ? rows : this.localScores().slice(0, 10)),
            readLocalBoard: () => this.localScores().slice(0, 10),
        });
    }

    buildLbRow(rank, entry) {
        const row = document.createElement('div');
        row.className = 'rv-lb-row game-lb-row' + (rank < 3 ? ` rv-lb-top${rank + 1}` : '');
        const rankEl = document.createElement('span');
        rankEl.className = 'rv-lb-rank game-lb-rank';
        rankEl.textContent = `${rank + 1}.`;
        const nameEl = document.createElement('span');
        nameEl.className = 'rv-lb-name game-lb-name';
        nameEl.textContent = entry.name; // textContent 防注入
        const scoreEl = document.createElement('span');
        scoreEl.className = 'rv-lb-score game-lb-score';
        scoreEl.textContent = `🔥 ${entry.score}`;
        row.append(rankEl, nameEl, scoreEl);
        return row;
    }



    // AI defeat/draw is read-only; never manufacture an upload or a retry entry.
    async fetchLeaderboard() {
        const seq = ++this.lbReadId;
        const gameId = this.gameId;
        const stillOpen = () => seq === this.lbReadId && gameId === this.gameId
            && this.state === 'over' && this.mode === 'ai' && this.lbOpen;
        this.readOnlyBoardStatus = 'loading';
        try {
            const rows = await fetchBoard('reversi');
            if (!stillOpen()) return;
            if (!Array.isArray(rows)) throw new Error('Invalid leaderboard');
            this.readOnlyBoardStatus = 'ready';
            this.renderBoard(rows.length ? rows : this.localScores().slice(0, 10));
            if (this.el['lb-status']) this.el['lb-status'].textContent = '';
        } catch (error) {
            if (!stillOpen()) return;
            this.readOnlyBoardStatus = 'offline';
            this.renderLocalScores();
            if (this.el['lb-status']) this.el['lb-status'].textContent = this.TEXT.lbOffline;
        }
    }

    /* ── 开始 / 菜单 ── */

    showStart() {
        resetEmbeddedScoreResult(this.resultSession, this.el);
        this.lbReadId++;
        this.lbOpen = false;
        this.readOnlyBoardStatus = null;
        this.gameId++;
        this.clearTimeouts();
        this.state = 'menu';
        if (this.el.start) this.el.start.classList.remove('hidden');
        if (this.el.over) this.el.over.classList.add('hidden');
        this.setStatus('', false);
        this.syncModeButtons();
        this.updateStreakLine();
    }

    hideStart() {
        if (this.el.start) this.el.start.classList.add('hidden');
        Sfx.click();
    }

    /* ── 复制成绩 ── */

    async copyResult() {
        const t = this.TEXT;
        const { b, w } = countDiscs(this.board);
        const mode = this.mode === 'ai' ? `${t.vsAI} · ${t[this.diff]}` : t.twoPlayers;
        const text = `⚪ ${t.title} (${mode})\n${t.black} ${b} : ${w} ${t.white}\nhttps://games.orangely.xyz/reversi.html`;
        let ok = false;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch (e) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0;left:-999px;top:-999px;';
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand('copy');
                ta.remove();
            } catch (e2) {
                ok = false;
            }
        }
        if (this.el['btn-copy']) {
            const original = `📋 ${t.copyResult}`;
            this.el['btn-copy'].textContent = ok ? `✅ ${t.copied}` : original;
            setTimeout(() => {
                if (this.el['btn-copy']) this.el['btn-copy'].textContent = original;
            }, 1600);
        }
    }

    /* ── 工具 ── */

    clearTimeouts() {
        this.timeouts.forEach(t => clearTimeout(t));
        this.timeouts = [];
    }

    updateMuteButtons() {
        const icon = Sfx.muted ? ICONS.soundOff : ICONS.soundOn;
        if (this.el['mute-btn']) this.el['mute-btn'].innerHTML = icon;
    }

    /* ── 事件绑定 ── */

    bindUI() {
        this.boardEl.addEventListener('click', (e) => {
            const cell = e.target.closest('.rv-cell');
            if (!cell || this.state !== 'playing') return;
            if (this.mode === 'ai' && this.turn === WHITE) return; // AI 回合禁手
            const i = Number(cell.dataset.i);
            if (!cell.classList.contains('legal')) return;
            const flips = findFlips(this.board, i & 7, i >> 3, this.turn);
            if (!flips) return;
            this.playMove(i, flips);
        });

        document.getElementById('rv-mode-row').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-mode]');
            if (!btn) return;
            this.mode = btn.dataset.mode;
            saveReversiMode(this.mode);
            this.syncModeButtons();
            Sfx.click();
        });

        document.getElementById('rv-diff-row').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-diff]');
            if (!btn) return;
            this.diff = btn.dataset.diff;
            saveReversiDifficulty(this.diff);
            this.syncModeButtons();
            Sfx.click();
        });

        if (this.el['btn-play']) this.el['btn-play'].addEventListener('click', () => {
            this.hideStart();
            this.newGame();
        });
        if (this.el['btn-again']) this.el['btn-again'].addEventListener('click', () => {
            if (this.el.over) this.el.over.classList.add('hidden');
            this.lbOpen = false;
            Sfx.click();
            this.newGame();
        });
        if (this.el['btn-menu']) this.el['btn-menu'].addEventListener('click', () => {
            this.lbOpen = false;
            this.showStart();
            Sfx.click();
        });
        if (this.el['btn-home']) this.el['btn-home'].addEventListener('click', () => {
            if (this.state === 'playing' && !window.confirm(this.TEXT.leaveConfirm)) return;
            window.location.href = 'index.html';
        });
        if (this.el['btn-copy']) this.el['btn-copy'].addEventListener('click', () => this.copyResult());

        if (this.el['mute-btn']) this.el['mute-btn'].addEventListener('click', () => {
            Sfx.toggleMuted();
            this.updateMuteButtons();
        });

        if (this.el.username) {
            this.el.username.addEventListener('change', () => {
                setPlayerName(this.el.username.value);
                this.el.username.value = ensurePlayerName();
            });
            this.el.username.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.el.username.blur();
            });
        }

        window.addEventListener('site-settings:changed', () => {
            this.lang = this.readLang();
            this.applyLanguage();
        });
    }
}

/* ────────────────────────── boot ────────────────────────── */

onReady(() => {
    const i18nBinder = createI18nBinder({ getLang, tables: LANGUAGES });
    i18nBinder.apply();
    bindTopbarClearance(); // 全屏开始 / 结算层从顶栏下沿排起，顶栏声音 / Home 始终可点
    const game = new ReversiGame({ i18nBinder });
    window.rvGame = game; // 调试/测试句柄
    game.streak = loadReversiStreak(); // 连胜跨会话持久化
    game.updateStreakLine();
    game.board = new Int8Array(64);
    game.board[27] = WHITE; game.board[28] = BLACK;
    game.board[35] = BLACK; game.board[36] = WHITE;
    game.renderAll();
    game.updateCounts();
});

/* ── 顶栏 / 页脚通用控件：Home · Sound · More ──
   槽位结构见 css/layout.css 的契约，行为统一由 src/platform/game-chrome.js 接管。
   owns 默认只含 more：静音钮在本页早就有自己的 handler（还要顺带做
   SFX 初始化之类的页面私事），chrome 再挂一个就会一次点击切换两次 = 净效果为零。 */
onReady(() => {
    const getText = () => LANGUAGES[getLang()] || LANGUAGES.en;
    window.reversiRuntime = mountGameRuntime({
        self: 'reversi.html',
        game: window.rvGame,
        frame: false,
        chrome: {
            getText,
            labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
        },
    });
});
