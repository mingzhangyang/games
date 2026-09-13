/**
 * Minesweeper 扫雷 — classic logic puzzle
 * 安全首击（首点及其邻域必不为雷）、零值泛洪展开、
 * 和弦快开、长按/右键插旗、三档难度、全球最快通关榜。
 *
 * Vanilla JS, DOM board. No runtime dependencies.
 */

import { ensurePlayerName, setPlayerName } from './player.js';
import { getLang, setLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';

/* ────────────────────────── utilities ────────────────────────── */

function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // 存储不可用时静默降级
    }
}

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = {
    en: {
        title: 'Minesweeper',
        subtitle: 'Logic · Deduction · Nerves of steel',
        howto: 'Tap to reveal a square. Numbers show adjacent mines. Right-click / long-press to flag. Clear every safe square without detonating a mine — your first click is always safe!',
        play: 'Play',
        easy: 'Easy', medium: 'Medium', hard: 'Expert',
        flagModeOn: 'Flag mode: ON',
        flagModeOff: 'Flag mode: OFF',
        youWin: 'Cleared!',
        youLose: 'BOOM!',
        newBest: 'New best time!',
        personalBest: 'Personal best',
        noBest: 'No clear yet',
        timeSec: 's',
        leaderboard: 'Fastest Clears',
        loadingScores: 'Loading…',
        noScores: 'No clears yet',
        lbOffline: 'Leaderboard offline',
        usernameLabel: 'Username (Enter to save)',
        copyResult: 'Copy',
        copied: 'Copied!',
        close: 'Close',
        hintDefault: 'Right-click / long-press to flag · tap a number to chord',
        hintFlagMode: 'Flag mode on — taps place flags',
        mines: 'Mines',
        time: 'Time',
        language: '中文',
        shareLine: 'Cleared in'
    },
    zh: {
        title: '扫雷',
        subtitle: '推理 · 演算 · 心跳加速',
        howto: '点击翻开格子，数字表示周围雷数。右键或长按插旗。翻开所有安全格子即获胜——第一次点击永远不会踩雷！',
        play: '开始游戏',
        easy: '简单', medium: '中等', hard: '困难',
        flagModeOn: '插旗模式：开',
        flagModeOff: '插旗模式：关',
        youWin: '通关！',
        youLose: 'Boom！',
        newBest: '新纪录！',
        personalBest: '个人最快',
        noBest: '尚未通关',
        timeSec: '秒',
        leaderboard: '全球最快通关',
        loadingScores: '加载中…',
        noScores: '暂无成绩',
        lbOffline: '榜单离线',
        usernameLabel: '用户名（回车保存）',
        copyResult: '复制',
        copied: '已复制！',
        close: '关闭',
        hintDefault: '右键 / 长按插旗 · 点数字快开',
        hintFlagMode: '插旗模式已开启——点击即插旗',
        mines: '剩余雷数',
        time: '用时',
        language: 'English',
        shareLine: '用时'
    }
};

/* ────────────────────────── audio ────────────────────────── */

const Sfx = {
    ctx: null,
    muted: getMuted(),

    ensure() {
        if (this.muted) return null;
        try {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                this.ctx = new AC();
            }
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return this.ctx;
        } catch (e) {
            return null;
        }
    },

    tone({ freq = 440, endFreq = null, type = 'sine', duration = 0.1, volume = 0.14, delay = 0 }) {
        const ctx = this.ensure();
        if (!ctx) return;
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    },

    reveal(n) {
        this.tone({ freq: 420 + Math.min(n, 6) * 60, type: 'triangle', duration: 0.05, volume: 0.07 });
    },
    flag(on) {
        this.tone({ freq: on ? 760 : 520, endFreq: on ? 980 : 380, type: 'square', duration: 0.07, volume: 0.09 });
    },
    chord() {
        this.tone({ freq: 500, type: 'triangle', duration: 0.08, volume: 0.1 });
        this.tone({ freq: 700, type: 'triangle', duration: 0.08, volume: 0.08, delay: 0.05 });
    },
    boom() {
        this.tone({ freq: 160, endFreq: 40, type: 'sawtooth', duration: 0.7, volume: 0.22 });
        this.tone({ freq: 90, endFreq: 30, type: 'square', duration: 0.9, volume: 0.16, delay: 0.05 });
    },
    win() {
        [523, 659, 784, 1046].forEach((f, i) => {
            this.tone({ freq: f, type: 'triangle', duration: 0.16, volume: 0.14, delay: i * 0.09 });
        });
    },
    click() { this.tone({ freq: 640, type: 'square', duration: 0.05, volume: 0.06 }); },
    toggleMuted() {
        this.muted = !this.muted;
        setMuted(this.muted);
        return this.muted;
    }
};

/* ────────────────────────── config ────────────────────────── */

const DIFFICULTIES = {
    easy:   { cols: 9,  rows: 9,  mines: 10, lb: 'minesweeper-easy' },
    medium: { cols: 16, rows: 16, mines: 40, lb: 'minesweeper-medium' },
    hard:   { cols: 30, rows: 16, mines: 99, lb: 'minesweeper-hard' }
};

const LEADERBOARD_URL = 'https://game-scores.orangely.workers.dev';
const LONG_PRESS_MS = 320;

// 隐藏 / 翻开 / 插旗
const HIDDEN = 0, REVEALED = 1, FLAGGED = 2;

/* ────────────────────────── game ────────────────────────── */

class MinesweeperGame {
    constructor() {
        this.boardEl = document.getElementById('ms-board');
        this.el = {};
        ['ms-mines', 'ms-timer', 'ms-face', 'ms-btn-home', 'ms-mute-btn',
         'ms-flagmode', 'ms-hint', 'ms-start', 'ms-title', 'ms-subtitle', 'ms-howto',
         'ms-btn-play', 'ms-best-grid', 'ms-start-mute', 'ms-start-lang',
         'ms-result', 'ms-result-title', 'ms-result-time', 'ms-result-best',
         'ms-lb-title', 'ms-lb-list', 'ms-lb-status', 'ms-username', 'ms-username-label',
         'ms-btn-again', 'ms-btn-copy', 'ms-btn-close'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^ms-/, '')] = el;
        });

        this.diff = this.readSavedDiff();
        this.flagMode = false;
        this.lang = this.readLang();
        this.applyLanguage();

        this.bindUI();
        this.newGame();
        this.showStart();
    }

    /* ── 基础状态 ── */

    readSavedDiff() {
        const saved = storageGet('ms_diff');
        return DIFFICULTIES[saved] ? saved : 'easy';
    }

    readLang() {
        return getLang();
    }

    get TEXT() { return LANGUAGES[this.lang]; }

    bestTimeKey() { return `ms_best_${this.diff}`; }

    /* ── 语言 ── */

    applyLanguage() {
        const t = this.TEXT;
        document.documentElement.lang = this.lang;
        if (this.el.title) this.el.title.textContent = t.title;
        if (this.el.subtitle) this.el.subtitle.textContent = t.subtitle;
        if (this.el.howto) this.el.howto.textContent = t.howto;
        if (this.el['btn-play']) this.el['btn-play'].textContent = `💣 ${t.play}`;
        if (this.el['lb-title']) this.el['lb-title'].textContent = `🏆 ${t.leaderboard}`;
        if (this.el['username-label']) this.el['username-label'].textContent = t.usernameLabel;
        if (this.el.username) this.el.username.placeholder = t.usernameLabel;
        if (this.el['btn-copy']) this.el['btn-copy'].textContent = `📋 ${t.copyResult}`;
        if (this.el['btn-close']) this.el['btn-close'].textContent = `✖ ${t.close}`;
        if (this.el['start-lang']) this.el['start-lang'].textContent = t.language;

        for (const d of ['easy', 'medium', 'hard']) {
            const btn = document.querySelector(`[data-diff="${d}"]`);
            if (btn) btn.textContent = t[d];
        }

        this.updateFlagModeButton();
        this.updateHint();
        this.renderBestChips();
    }

    updateHint() {
        if (this.el.hint) {
            this.el.hint.textContent = this.flagMode ? this.TEXT.hintFlagMode : this.TEXT.hintDefault;
        }
    }

    updateFlagModeButton() {
        if (this.el.flagmode) this.el.flagmode.classList.toggle('active', this.flagMode);
    }

    /* ── 新局 ── */

    newGame() {
        const cfg = DIFFICULTIES[this.diff];
        this.cols = cfg.cols;
        this.rows = cfg.rows;
        this.mines = cfg.mines;

        this.total = this.cols * this.rows;
        this.mineGrid = new Uint8Array(this.total);
        this.countGrid = new Uint8Array(this.total);
        this.stateGrid = new Uint8Array(this.total); // HIDDEN | REVEALED | FLAGGED
        this.placed = false;
        this.state = 'idle';       // idle | playing | won | lost
        this.revealedCount = 0;
        this.flagCount = 0;
        this.startTs = 0;
        this.elapsed = 0;
        this.boomIndex = -1;

        this.stopTimer();
        this.updateMineCounter();
        this.updateTimerDisplay();
        this.setFace('🙂');
        this.buildBoard();
        this.layoutCells();
    }

    buildBoard() {
        const frag = document.createDocumentFragment();
        this.boardEl.style.gridTemplateColumns = `repeat(${this.cols}, var(--ms-cell, 30px))`;
        this.boardEl.textContent = '';

        this.cellEls = new Array(this.total);
        for (let i = 0; i < this.total; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ms-cell';
            btn.dataset.i = i;
            btn.setAttribute('role', 'gridcell');
            this.cellEls[i] = btn;
            frag.appendChild(btn);
        }
        this.boardEl.appendChild(frag);
    }

    layoutCells() {
        // 以壳层宽度为基准（board-wrap 是 fit-content，自宽会跟随内容形成死循环）
        const shell = this.boardEl.closest('.ms-shell');
        const gap = 2;
        const avail = (shell ? shell.clientWidth : window.innerWidth) - 32; // 壳内边距 + 余量
        // 桌面大屏允许更大的格子（20px 下限不变，移动端行为不变）
        const maxCell = window.matchMedia('(min-width: 1024px)').matches ? 48 : 40;
        const cell = clamp(Math.floor((avail - (this.cols + 1) * gap) / this.cols), 20, maxCell);
        this.boardEl.style.setProperty('--ms-cell', `${cell}px`);
        this.boardEl.style.setProperty('--ms-gap', `${gap}px`);
    }

    /* ── 布雷（安全首击） ── */

    placeMines(safeIndex) {
        const forbidden = new Set([safeIndex]);
        for (const n of this.neighbors(safeIndex)) forbidden.add(n);

        // 理论上雷数远小于非禁区格子数；极端情况下退化为只避开首击格
        if (this.total - forbidden.size < this.mines) {
            forbidden.clear();
            forbidden.add(safeIndex);
        }

        const candidates = [];
        for (let i = 0; i < this.total; i++) {
            if (!forbidden.has(i)) candidates.push(i);
        }
        // Fisher–Yates 部分洗牌取前 mines 个
        for (let i = 0; i < this.mines; i++) {
            const j = i + Math.floor(Math.random() * (candidates.length - i));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            this.mineGrid[candidates[i]] = 1;
        }

        for (let i = 0; i < this.total; i++) {
            if (this.mineGrid[i]) continue;
            let c = 0;
            for (const n of this.neighbors(i)) c += this.mineGrid[n];
            this.countGrid[i] = c;
        }
        this.placed = true;
    }

    *neighbors(i) {
        const x = i % this.cols;
        const y = (i / this.cols) | 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
                    yield ny * this.cols + nx;
                }
            }
        }
    }

    /* ── 交互 ── */

    handleReveal(i) {
        if (this.state === 'won' || this.state === 'lost') return;
        if (this.stateGrid[i] === FLAGGED || this.stateGrid[i] === REVEALED) return;

        if (!this.placed) {
            this.placeMines(i);
            this.state = 'playing';
            this.startTs = performance.now();
            this.startTimer();
        }

        if (this.mineGrid[i]) {
            this.lose(i);
            return;
        }
        this.floodReveal(i);
        this.afterAction();
    }

    handleChord(i) {
        if (this.state !== 'playing' && this.state !== 'idle') return;
        if (this.stateGrid[i] !== REVEALED || this.countGrid[i] === 0) return;

        let flags = 0;
        const targets = [];
        for (const n of this.neighbors(i)) {
            if (this.stateGrid[n] === FLAGGED) flags++;
            else if (this.stateGrid[n] === HIDDEN) targets.push(n);
        }
        if (flags !== this.countGrid[i] || targets.length === 0) return;

        Sfx.chord();
        let hitMine = -1;
        for (const n of targets) {
            if (this.mineGrid[n]) { hitMine = n; break; }
        }
        if (hitMine >= 0) {
            this.lose(hitMine);
            return;
        }
        for (const n of targets) {
            if (this.stateGrid[n] === HIDDEN) this.floodReveal(n);
        }
        this.afterAction();
    }

    toggleFlag(i) {
        if (this.state === 'won' || this.state === 'lost') return;
        if (this.stateGrid[i] === REVEALED) return;
        if (this.stateGrid[i] === FLAGGED) {
            this.stateGrid[i] = HIDDEN;
            this.flagCount--;
        } else {
            this.stateGrid[i] = FLAGGED;
            this.flagCount++;
        }
        Sfx.flag(this.stateGrid[i] === FLAGGED);
        this.renderCell(i);
        this.updateMineCounter();
    }

    /* ── 泛洪展开（迭代式，防栈溢出） ── */

    floodReveal(start) {
        const queue = [start];
        while (queue.length) {
            const i = queue.pop();
            if (this.stateGrid[i] !== HIDDEN || this.mineGrid[i]) continue;
            this.stateGrid[i] = REVEALED;
            this.revealedCount++;
            this.renderCell(i);
            if (this.countGrid[i] === 0) {
                for (const n of this.neighbors(i)) queue.push(n);
            }
        }
        Sfx.reveal(this.countGrid[start]);
    }

    afterAction() {
        if (this.revealedCount === this.total - this.mines) {
            this.win();
        }
    }

    /* ── 胜负 ── */

    win() {
        this.state = 'won';
        this.stopTimer();
        // 剩余雷自动插旗
        for (let i = 0; i < this.total; i++) {
            if (this.mineGrid[i] && this.stateGrid[i] !== FLAGGED) {
                this.stateGrid[i] = FLAGGED;
                this.flagCount++;
                this.renderCell(i);
            }
        }
        this.updateMineCounter();
        this.setFace('😎');
        Sfx.win();
        this.finishGame(true);
    }

    lose(boomIndex) {
        this.state = 'lost';
        this.boomIndex = boomIndex;
        this.stopTimer();
        this.setFace('💀');
        Sfx.boom();
        for (let i = 0; i < this.total; i++) {
            if (this.mineGrid[i] && this.stateGrid[i] !== FLAGGED) this.renderCell(i);
            if (!this.mineGrid[i] && this.stateGrid[i] === FLAGGED) {
                const el = this.cellEls[i];
                if (el) el.classList.add('wrong-flag');
            }
        }
        this.finishGame(false);
    }

    async finishGame(won) {
        const seconds = Math.max(1, Math.round((performance.now() - this.startTs) / 1000));
        this.elapsed = seconds;

        if (window.hubTrack) window.hubTrack('minesweeper', 'finish');

        let isBest = false;
        if (won) {
            const prev = Number(storageGet(this.bestTimeKey()));
            if (!prev || seconds < prev) {
                storageSet(this.bestTimeKey(), String(seconds));
                isBest = true;
            }
        }
        this.showResult(won, seconds, isBest);
        if (won) {
            await this.submitScore(seconds);
        }
        this.renderBestChips();
    }

    /* ── 计时器 ── */

    startTimer() {
        this.timerId = setInterval(() => this.updateTimerDisplay(), 250);
    }

    stopTimer() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    updateTimerDisplay() {
        const secs = this.state === 'playing' || this.state === 'idle'
            ? (this.placed ? Math.floor((performance.now() - this.startTs) / 1000) : 0)
            : this.elapsed;
        if (this.el.timer) this.el.timer.textContent = String(clamp(secs, 0, 999)).padStart(3, '0');
    }

    updateMineCounter() {
        const left = this.mines - this.flagCount;
        if (this.el.mines) this.el.mines.textContent = String(clamp(left, -99, 999)).padStart(3, '0');
    }

    setFace(face) {
        if (this.el.face) this.el.face.textContent = face;
    }

    /* ── 渲染单个格子 ── */

    renderCell(i) {
        const el = this.cellEls[i];
        if (!el) return;
        const st = this.stateGrid[i];
        el.className = 'ms-cell';

        if (st === REVEALED) {
            el.classList.add('revealed');
            const n = this.countGrid[i];
            if (n > 0) {
                el.classList.add(`n${n}`);
                el.textContent = String(n);
            } else {
                el.textContent = '';
            }
            return;
        }

        if (st === FLAGGED) {
            el.classList.add('flagged');
            el.textContent = '🚩';
            if (this.state === 'lost' && !this.mineGrid[i]) el.classList.add('wrong-flag');
            return;
        }
        if (this.mineGrid[i] && this.state === 'lost') {
            el.classList.add(i === this.boomIndex ? 'boom' : 'mine-shown');
            el.textContent = '💣';
            return;
        }
        el.textContent = '';
    }

    /* ── 结算浮层 ── */

    showResult(won, seconds, isBest) {
        const t = this.TEXT;
        if (this.el['result-title']) {
            this.el['result-title'].textContent = won ? t.youWin : t.youLose;
            this.el['result-title'].classList.toggle('win', won);
            this.el['result-title'].classList.toggle('lose', !won);
        }
        if (this.el['result-time']) {
            this.el['result-time'].textContent = won ? `${seconds}${t.timeSec}` : '💥';
        }
        if (this.el['result-best']) {
            if (won) {
                const best = Number(storageGet(this.bestTimeKey()));
                this.el['result-best'].textContent = isBest ? `🌟 ${t.newBest}` : `${t.personalBest}: ${best}${t.timeSec}`;
            } else {
                this.el['result-best'].textContent = '';
            }
        }
        if (this.el.username) this.el.username.value = ensurePlayerName() || '';
        if (this.el.result) this.el.result.classList.remove('hidden');
        if (won) {
            this.lbTabGame = DIFFICULTIES[this.diff].lb;
            this.renderLocalScores();
            this.fetchLeaderboard();
        } else if (this.el['lb-list']) {
            this.el['lb-list'].textContent = '';
            if (this.el['lb-status']) this.el['lb-status'].textContent = '';
        }
    }

    hideResult() {
        if (this.el.result) this.el.result.classList.add('hidden');
        Sfx.click();
    }

    /* ── 排行榜 ── */

    localScoresKey() { return `ms_local_${this.diff}`; }

    localScores() {
        try {
            const all = JSON.parse(storageGet(this.localScoresKey()));
            return Array.isArray(all) ? all : [];
        } catch (e) {
            return [];
        }
    }

    recordLocalScore(seconds) {
        const local = this.localScores();
        local.push({ name: ensurePlayerName() || 'Anonymous', score: seconds });
        local.sort((a, b) => a.score - b.score);
        storageSet(this.localScoresKey(), JSON.stringify(local.slice(0, 30)));
    }

    renderLocalScores() {
        const list = this.el['lb-list'];
        if (!list) return;
        list.textContent = '';
        const filtered = this.localScores().slice(0, 10);
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ms-lb-empty';
            empty.textContent = this.TEXT.noScores;
            list.appendChild(empty);
            return;
        }
        filtered.forEach((s, i) => list.appendChild(this.buildLbRow(i, s)));
    }

    buildLbRow(rank, entry) {
        const row = document.createElement('div');
        row.className = 'ms-lb-row' + (rank < 3 ? ` ms-lb-top${rank + 1}` : '');
        const rankEl = document.createElement('span');
        rankEl.className = 'ms-lb-rank';
        rankEl.textContent = `${rank + 1}.`;
        const nameEl = document.createElement('span');
        nameEl.className = 'ms-lb-name';
        nameEl.textContent = entry.name; // textContent 防注入
        const scoreEl = document.createElement('span');
        scoreEl.className = 'ms-lb-score';
        scoreEl.textContent = `${entry.score}s`;
        row.append(rankEl, nameEl, scoreEl);
        return row;
    }

    async submitScore(seconds) {
        this.recordLocalScore(seconds);
        const game = DIFFICULTIES[this.diff].lb;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            await fetch(`${LEADERBOARD_URL}/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game, name: ensurePlayerName() || 'Anonymous', score: seconds }),
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
            await this.fetchLeaderboard();
        } catch (e) {
            // Worker 未部署：保留本地榜
        }
    }

    async fetchLeaderboard() {
        const list = this.el['lb-list'];
        const statusEl = this.el['lb-status'];
        const game = DIFFICULTIES[this.diff].lb;
        const atStart = this.lbTabGame === game;
        if (!list) return;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`${LEADERBOARD_URL}/scores?game=${encodeURIComponent(game)}`, {
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!atStart || !Array.isArray(data)) return;
            list.textContent = '';
            if (data.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'ms-lb-empty';
                empty.textContent = this.TEXT.noScores;
                list.appendChild(empty);
            } else {
                data.slice(0, 10).forEach((entry, i) => list.appendChild(this.buildLbRow(i, entry)));
            }
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            if (atStart && statusEl) statusEl.textContent = this.TEXT.lbOffline;
        }
    }

    /* ── 开始界面 ── */

    showStart() {
        if (this.el.start) this.el.start.classList.remove('hidden');
        this.renderBestChips();
    }

    hideStart() {
        if (this.el.start) this.el.start.classList.add('hidden');
        Sfx.click();
        if (window.hubTrack) window.hubTrack('minesweeper', 'play');
    }

    renderBestChips() {
        const grid = this.el['best-grid'];
        if (!grid) return;
        grid.textContent = '';
        const t = this.TEXT;
        for (const d of ['easy', 'medium', 'hard']) {
            const chip = document.createElement('span');
            chip.className = 'ms-best-chip';
            chip.textContent = `${t[d]} `;
            const best = Number(storageGet(`ms_best_${d}`));
            const b = document.createElement('b');
            b.textContent = best ? `${best}${t.timeSec}` : '—';
            chip.appendChild(b);
            grid.appendChild(chip);
        }
    }

    /* ── 复制成绩 ── */

    async copyResult() {
        const t = this.TEXT;
        const best = Number(storageGet(this.bestTimeKey()));
        const text = `💣 ${t.title} · ${t[this.diff]}\n${t.shareLine}: ${this.elapsed}${t.timeSec}\n${t.personalBest}: ${best}${t.timeSec}\nhttps://games.orangely.xyz/minesweeper.html`;
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

    /* ── 事件绑定 ── */

    bindUI() {
        let pressTimer = null;
        let pressFired = false;

        const clearPress = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        // 指针按下：经典“惊讶脸” + 长按计时
        this.boardEl.addEventListener('pointerdown', (e) => {
            const cell = e.target.closest('.ms-cell');
            if (!cell) return;
            pressFired = false;
            if (e.pointerType === 'touch') {
                const i = Number(cell.dataset.i);
                pressTimer = setTimeout(() => {
                    pressFired = true;
                    this.toggleFlag(i);
                    if (navigator.vibrate) {
                        try { navigator.vibrate(30); } catch (err) { /* ignore */ }
                    }
                }, LONG_PRESS_MS);
            }
            this.setFace('😮');
        });
        this.boardEl.addEventListener('pointerup', () => {
            clearPress();
            if (this.state !== 'lost' && this.state !== 'won') this.setFace('🙂');
        });
        this.boardEl.addEventListener('pointerleave', () => {
            clearPress();
            if (this.state !== 'lost' && this.state !== 'won') this.setFace('🙂');
        });
        this.boardEl.addEventListener('pointercancel', () => {
            clearPress();
            if (this.state !== 'lost' && this.state !== 'won') this.setFace('🙂');
        });

        // 主点击：翻格 / 和弦 / 插旗模式
        this.boardEl.addEventListener('click', (e) => {
            const cell = e.target.closest('.ms-cell');
            if (!cell) return;
            if (pressFired) { pressFired = false; return; } // 长按已处理
            const i = Number(cell.dataset.i);
            if (this.flagMode && this.stateGrid[i] !== REVEALED) {
                this.toggleFlag(i);
                return;
            }
            if (this.stateGrid[i] === REVEALED) {
                this.handleChord(i);
            } else {
                this.handleReveal(i);
            }
        });

        // 右键插旗
        this.boardEl.addEventListener('contextmenu', (e) => {
            const cell = e.target.closest('.ms-cell');
            if (!cell) return;
            e.preventDefault();
            this.toggleFlag(Number(cell.dataset.i));
        });

        // 难度切换
        document.getElementById('ms-diff-row').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-diff]');
            if (!btn) return;
            const diff = btn.dataset.diff;
            if (diff === this.diff) return;
            this.diff = diff;
            storageSet('ms_diff', diff);
            document.querySelectorAll('.ms-diff').forEach(b => b.classList.toggle('active', b.dataset.diff === diff));
            Sfx.click();
            this.newGame();
        });

        if (this.el.face) this.el.face.addEventListener('click', () => { Sfx.click(); this.newGame(); });
        if (this.el.flagmode) this.el.flagmode.addEventListener('click', () => {
            this.flagMode = !this.flagMode;
            Sfx.click();
            this.updateFlagModeButton();
            this.updateHint();
        });

        if (this.el['btn-play']) this.el['btn-play'].addEventListener('click', () => {
            this.newGame();
            this.hideStart();
        });
        if (this.el['btn-home']) this.el['btn-home'].addEventListener('click', () => { window.location.href = 'index.html'; });
        if (this.el['btn-again']) this.el['btn-again'].addEventListener('click', () => {
            this.hideResult();
            this.newGame();
        });
        if (this.el['btn-close']) this.el['btn-close'].addEventListener('click', () => this.hideResult());
        if (this.el['btn-copy']) this.el['btn-copy'].addEventListener('click', () => this.copyResult());

        if (this.el.mute) this.el.mute.addEventListener('click', () => this.toggleMute());
        if (this.el['start-mute']) this.el['start-mute'].addEventListener('click', () => this.toggleMute());

        if (this.el['start-lang']) this.el['start-lang'].addEventListener('click', () => {
            this.lang = this.lang === 'zh' ? 'en' : 'zh';
            setLang(this.lang);
            this.applyLanguage();
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

        window.addEventListener('resize', () => this.layoutCells());
        document.addEventListener('visibilitychange', () => {
            // 页面隐藏时暂停计时显示不中断真实计时，回归后立即刷新
            if (!document.hidden && this.state === 'playing') this.updateTimerDisplay();
        });
    }

    toggleMute() {
        const muted = Sfx.toggleMuted();
        const icon = muted ? ICONS.soundOff : ICONS.soundOn;
        if (this.el.mute) this.el.mute.innerHTML = icon;
        if (this.el['start-mute']) this.el['start-mute'].innerHTML = icon;
        if (!muted) Sfx.click();
    }
}

/* ────────────────────────── boot ────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    const game = new MinesweeperGame();
    window.msGame = game; // 调试/测试句柄
    // 初始静音按钮状态
    const icon = Sfx.muted ? ICONS.soundOff : ICONS.soundOn;
    if (game.el.mute) game.el.mute.innerHTML = icon;
    if (game.el['start-mute']) game.el['start-mute'].innerHTML = icon;
    // 初始难度高亮
    document.querySelectorAll('.ms-diff').forEach(b => b.classList.toggle('active', b.dataset.diff === game.diff));
});
