import { getLang, setLang } from './site-settings.js';
import { updateMoreGames } from './more-games.js';
import { createSfx } from './game-sfx.js';
import { bindChrome } from './game-chrome.js';
import { bindFrame } from './game-frame.js';
import { track } from './analytics.js';

// 音效：落子/胜利/失败/平局
const sfx = createSfx({
    place: { freq: 720, slideTo: 320, type: 'triangle', dur: 0.09, vol: 0.25 },
    win:   { freqs: [523.25, 659.25, 783.99, 1046.5], delay: 0.1, type: 'sine', dur: 0.45, vol: 0.3 },
    lose:  { freqs: [392, 329.63, 261.63], delay: 0.16, type: 'sawtooth', dur: 0.4, vol: 0.2 },
    draw:  { freqs: [440, 440], delay: 0.2, type: 'triangle', dur: 0.25, vol: 0.22 }
});

const canvas = document.getElementById('gameBoard');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('statusText');
const restartBtn = document.getElementById('restartBtn');
const modeBtn = document.getElementById('modeBtn');
const modal = document.getElementById('gameOverModal');
const modalMessage = document.getElementById('modalMessage');
const modalRestartBtn = document.getElementById('modalRestartBtn');
const difficultySelect = document.getElementById('difficultySelect');
const modeText = document.getElementById('modeText'); // Fix #8

const LANGUAGES = {
    en: {
        title: 'Gomoku - Five in a Row',
        h1: 'Gomoku',
        langBtn: '中文',
        blackTurn: "Black's Turn",
        whiteTurn: "White's Turn",
        computerThinking: 'Computer Thinking...',
        modeVsComputer: 'vs Computer',
        mode2Players: '2 Players',
        modeBtnVsComputer: 'Mode: vs Computer',
        modeBtn2Players: 'Mode: 2 Players',
        restart: 'Restart Game',
        diffEasy: 'Easy',
        diffMedium: 'Medium',
        diffHard: 'Hard',
        gameOver: 'Game Over',
        draw: "It's a Draw!",
        blackWins: 'Black Wins!',
        whiteWins: 'White Wins!',
        playAgain: 'Play Again',
        viewBoard: 'View Board',
        changeDiffConfirm: 'Changing difficulty will clear the current game. Continue?',
        leaveConfirm: 'A game is in progress. Leave and discard it?',
        home: 'Home',
        sound: 'Sound',
        moreGames: 'More games',
        hint: 'Click a point to place your stone',
    },
    zh: {
        title: '五子棋 - 经典策略棋牌',
        h1: '五子棋',
        langBtn: 'English',
        blackTurn: '黑方走棋',
        whiteTurn: '白方走棋',
        computerThinking: '电脑思考中...',
        modeVsComputer: '人机对战',
        mode2Players: '双人对战',
        modeBtnVsComputer: '模式: 人机对战',
        modeBtn2Players: '模式: 双人对战',
        restart: '重新开始',
        diffEasy: '简单',
        diffMedium: '中等',
        diffHard: '困难',
        gameOver: '对局结束',
        draw: '平局！',
        blackWins: '黑方获胜！',
        whiteWins: '白方获胜！',
        playAgain: '再来一局',
        viewBoard: '查看棋盘',
        changeDiffConfirm: '切换难度将清空当前对局，确定继续吗？',
        leaveConfirm: '对局进行中，离开将丢失当前进度。确定离开吗？',
        home: '返回主页',
        sound: '声音',
        moreGames: '更多游戏',
        hint: '点击交叉点落子',
    }
};

let currentLang = getLang();
function getTEXT() {
    return LANGUAGES[currentLang] || LANGUAGES.en;
}

// Game Constants
const BOARD_SIZE = 15;
const CELL_PADDING = 20; // Padding around the grid
let CELL_SIZE = 40; // Will be calculated based on canvas size

// Game State
let board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
let currentPlayer = 1; // 1: Black, 2: White
let gameActive = false;
let gameMode = 'pve'; // 'pvp' or 'pve'
let difficulty = 'medium';
let isComputerThinking = false;
let winningCells = null; // Fix #7: track winning cells for highlight
let lastResult = null; // 上一局结果：null=未结束 / 0=平局 / 1=黑胜 / 2=白胜
let moveCount = 0; // 每局手数（用于统计首手）
let aiTimer = null; // AI 走棋定时器句柄，重置/切换模式时必须清除
let cssSize = 600; // 画布 CSS 逻辑尺寸（canvas.width 是 DPR 缩放后的设备像素）

// Initialize
function init() {
    // 先量 chrome 再排版：bindFrame 把实测值写进 --frame-chrome，resizeCanvas 据此定棋盘边长。
    //
    // gomoku 的 shell 不是「顶栏 / main / 页脚」三段式，而是五个在流内的直接子节点
    // （顶栏 · 状态条 · 棋盘 · 控制条 · 页脚），彼此还有 18px 的 flex gap，棋盘外面
    // 又套了 12px 的木框内距。bindFrame 只认 shell 内距 + 顶栏 + 页脚（= 166px），
    // 剩下的 168px 必须经 extraChrome 补齐，否则棋盘按 700px 排，整页 1038px > 视口。
    //
    // ⚠️ 只累加**高度与 gap，不累加 margin**：.game-footer 带 margin-top:auto，
    //    内容不足一屏时它的计算值是「剩余空白」，把它算进 chrome 会让棋盘越缩越小。
    //    高度和 gap 与空白无关，因此这个量是稳定不动点。
    bindFrame({
        extraChrome: () => {
            const shell = document.querySelector('.game-shell');
            const stage = document.querySelector('.game-stage');
            if (!shell || !stage) return 0;
            const topbar = shell.querySelector(':scope > .game-topbar');
            const footer = shell.querySelector(':scope > .game-footer');
            const kids = [...shell.children]
                .filter(el => getComputedStyle(el).display !== 'none');
            let h = 0;
            for (const el of kids) {
                if (el === topbar || el === footer || el === stage) continue;
                // 这里可以安全地算 margin：带 margin-top:auto 的只有页脚，而它已被跳过
                // （bindFrame 自己按高度算它）。.controls 就带着真实的 margin-top:4px。
                const cs = getComputedStyle(el);
                h += el.getBoundingClientRect().height
                    + (parseFloat(cs.marginTop) || 0)
                    + (parseFloat(cs.marginBottom) || 0);
            }
            const rowGap = parseFloat(getComputedStyle(shell).rowGap) || 0;
            if (kids.length > 1) h += rowGap * (kids.length - 1);
            const tcs = getComputedStyle(stage);
            h += (parseFloat(tcs.paddingTop) || 0) + (parseFloat(tcs.paddingBottom) || 0);
            return h;
        },
    });
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('game-frame:changed', resizeCanvas);
    canvas.addEventListener('click', handleCanvasClick);

    // Fix #6: touch input support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!gameActive || isComputerThinking) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const scaleX = cssSize / rect.width;
        const scaleY = cssSize / rect.height;
        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;
        const c = Math.round((x - CELL_PADDING) / CELL_SIZE);
        const r = Math.round((y - CELL_PADDING) / CELL_SIZE);
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] === 0) {
                makeMove(r, c);
            }
        }
    }, { passive: false });

    restartBtn.addEventListener('click', resetGame);
    modalRestartBtn.addEventListener('click', () => {
        closeModal();
        resetGame();
    });
    // 关闭弹窗以便复盘最终棋局
    const modalViewBtn = document.getElementById('modalViewBtn');
    if (modalViewBtn) {
        modalViewBtn.addEventListener('click', closeModal);
    }
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    modeBtn.addEventListener('click', toggleMode);
    let prevDifficulty = difficultySelect.value;
    difficultySelect.addEventListener('change', (e) => {
        // 对局进行中且有落子时需确认，避免误触清盘
        const inProgress = gameActive && moveCount > 0;
        if (inProgress && !window.confirm(getTEXT().changeDiffConfirm)) {
            e.target.value = prevDifficulty; // 回滚选择
            return;
        }
        difficulty = e.target.value;
        prevDifficulty = e.target.value;
        resetGame();
    });

    // 语言钮（#langBtn，data-chrome="lang"）的点击与文案由 js/game-chrome.js 独家接管：
    // 它 setLang() 后派发 site-settings:changed，下面的监听器再调 applyLanguage()。
    // 对局进行中返回首页需确认，防止误触丢局
    const homeLink = document.getElementById('homeLink');
    if (homeLink) {
        homeLink.addEventListener('click', (e) => {
            if (gameActive && moveCount > 0 && !window.confirm(getTEXT().leaveConfirm)) {
                e.preventDefault();
            }
        });
    }
    window.addEventListener('site-settings:changed', () => {
        applyLanguage(getLang());
    });

    applyLanguage(currentLang);
    resetGame();
}

function resizeCanvas() {
    // 桌面端放宽棋盘上限（≤1024px 视口维持 600，大屏最高 700）
    const desktopCap = window.matchMedia('(min-width: 1024px)').matches ? 700 : 600;
    const containerWidth = Math.min(window.innerWidth - 40, desktopCap);
    // 纵向预算取 js/game-frame.js 实测写入的 --frame-chrome（顶栏 + 状态条 + 页脚 + 容器内距）。
    // 这里原本写死减 200，而实际 chrome 是 338 —— 1280×900 下整页被撑到 1038px，
    // 桌面端要滚动才能看全棋盘（2026-09-19 修）。200 仅作 bindFrame 落笔前的首帧兜底。
    const shell = document.querySelector('.game-shell');
    const chrome = shell
        ? parseFloat(getComputedStyle(shell).getPropertyValue('--frame-chrome')) || 200
        : 200;
    const containerHeight = Math.min(window.innerHeight - chrome, desktopCap);
    // 下限 200：视口极矮时（innerHeight < 200）上式会得到负值，CELL_SIZE 随之为负，
    // 之后 drawPiece 的 arc() 会抛异常并中断整个 resize 回调，棋盘就停在被清空的状态
    const size = Math.max(200, Math.min(containerWidth, containerHeight));
    cssSize = size;

    // 按 devicePixelRatio 放大画布 backing store，让棋盘在高清屏上清晰；
    // 绘制坐标系仍使用 CSS 像素（setTransform 统一缩放）
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Calculate cell size based on canvas width and padding
    // We need 14 squares across, but 15 lines.
    // Let's leave some padding on edges.
    const availableWidth = cssSize - (2 * CELL_PADDING);
    CELL_SIZE = availableWidth / (BOARD_SIZE - 1);

    drawBoard();
}

function resetGame() {
    // 清除尚未触发的 AI 定时器，防止残留回调在新的对局/模式里替 AI 落子
    if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
    }
    moveCount = 0;
    board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
    currentPlayer = 1; // Black always starts
    gameActive = true;
    isComputerThinking = false;
    winningCells = null; // Fix #7: reset winning cells
    lastMove = null;
    lastResult = null; // 新一局开始，清掉上一局结果，否则状态栏会一直停在「对局结束」
    updateStatus();
    drawBoard();
    closeModal();
}

function toggleMode() {
    gameMode = gameMode === 'pvp' ? 'pve' : 'pvp';
    const t = getTEXT();
    modeBtn.textContent = gameMode === 'pvp' ? t.modeBtn2Players : t.modeBtnVsComputer;
    difficultySelect.style.display = gameMode === 'pve' ? 'inline-block' : 'none';
    resetGame();
}

function drawBoard() {
    // Clear canvas（坐标系是 CSS 像素，canvas.width 是设备像素）
    ctx.clearRect(0, 0, cssSize, cssSize);

    // Draw grid lines
    ctx.beginPath();
    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 1.5;

    for (let i = 0; i < BOARD_SIZE; i++) {
        // Vertical lines
        const x = CELL_PADDING + i * CELL_SIZE;
        ctx.moveTo(x, CELL_PADDING);
        ctx.lineTo(x, cssSize - CELL_PADDING);

        // Horizontal lines
        const y = CELL_PADDING + i * CELL_SIZE;
        ctx.moveTo(CELL_PADDING, y);
        ctx.lineTo(cssSize - CELL_PADDING, y);
    }
    ctx.stroke();

    // Draw star points (3,3), (11,3), (7,7), (3,11), (11,11) for 15x15
    const stars = [[3,3], [11,3], [7,7], [3,11], [11,11]];
    ctx.fillStyle = '#5D4037';
    stars.forEach(([c, r]) => {
        const x = CELL_PADDING + c * CELL_SIZE;
        const y = CELL_PADDING + r * CELL_SIZE;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw pieces
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== 0) {
                drawPiece(r, c, board[r][c]);
            }
        }
    }

    // Highlight last move if exists — 用与棋子对比色的圆环标记，手机上也看得清
    if (lastMove) {
        const x = CELL_PADDING + lastMove.c * CELL_SIZE;
        const y = CELL_PADDING + lastMove.r * CELL_SIZE;
        const stonePlayer = board[lastMove.r][lastMove.c];
        ctx.beginPath();
        ctx.strokeStyle = stonePlayer === 1 ? '#ffffff' : '#ef4444'; // 黑子上白圈，白子上红圈
        ctx.lineWidth = 2;
        ctx.arc(x, y, CELL_SIZE * 0.32, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Fix #7: Draw winning-line highlight
    if (winningCells) {
        ctx.strokeStyle = '#f6e05e';
        ctx.lineWidth = 3;
        winningCells.forEach(([wr, wc]) => {
            const x = CELL_PADDING + wc * CELL_SIZE;
            const y = CELL_PADDING + wr * CELL_SIZE;
            ctx.beginPath();
            ctx.arc(x, y, CELL_SIZE * 0.38, 0, Math.PI * 2);
            ctx.stroke();
        });
    }
}

let lastMove = null;

function drawPiece(r, c, player) {
    const x = CELL_PADDING + c * CELL_SIZE;
    const y = CELL_PADDING + r * CELL_SIZE;
    const radius = CELL_SIZE * 0.4;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);

    // Gradient for 3D effect
    const gradient = ctx.createRadialGradient(
        x - radius/3, y - radius/3, radius/10,
        x, y, radius
    );

    if (player === 1) { // Black
        gradient.addColorStop(0, '#666');
        gradient.addColorStop(1, '#000');
    } else { // White
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(1, '#ddd');
    }

    ctx.fillStyle = gradient;

    // Fix #5: set shadow BEFORE the single fill(), then reset after
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

function handleCanvasClick(e) {
    if (!gameActive || isComputerThinking) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = cssSize / rect.width;
    const scaleY = cssSize / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Find nearest intersection
    // x = padding + c * size => c = (x - padding) / size
    const c = Math.round((x - CELL_PADDING) / CELL_SIZE);
    const r = Math.round((y - CELL_PADDING) / CELL_SIZE);

    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] === 0) {
            makeMove(r, c);
        }
    }
}

function makeMove(r, c) {
    moveCount++;
    track('gomoku', 'play');
    board[r][c] = currentPlayer;
    lastMove = { r, c };
    sfx.play('place');
    drawBoard();

    if (checkWin(r, c, currentPlayer)) {
        drawBoard(); // Redraw to show winning highlight
        sfx.play(currentPlayer === 1 ? 'win' : (gameMode === 'pve' ? 'lose' : 'win'));
        endGame(currentPlayer);
        return;
    }

    if (checkDraw()) {
        sfx.play('draw');
        endGame(0);
        return;
    }

    currentPlayer = currentPlayer === 1 ? 2 : 1;
    updateStatus();

    if (gameActive && gameMode === 'pve' && currentPlayer === 2) {
        isComputerThinking = true;
        aiTimer = setTimeout(() => {
            aiTimer = null;
            computerMove();
        }, 500); // Small delay for realism
    } else {
        isComputerThinking = false;
    }
}

function updateStatus() {
    // Fix #4: use a light color for both turns (dark background)
    statusText.style.color = '#e2e8f0';
    const t = getTEXT();

    if (!gameActive && lastResult !== null) {
        // 对局已结束。此前这里继续走下面的分支，于是结算面板写着「黑方获胜！」
        // 而状态栏还停在「黑方走棋」，两句自相矛盾。
        statusText.textContent = t.gameOver;
    } else if (gameMode === 'pve' && currentPlayer === 2 && gameActive) {
        statusText.textContent = t.computerThinking;
    } else {
        const playerText = currentPlayer === 1 ? t.blackTurn : t.whiteTurn;
        statusText.textContent = playerText;
    }

    // Fix #8: populate modeText
    modeText.textContent = gameMode === 'pve' ? t.modeVsComputer : t.mode2Players;
}

// Fix #7: checkWin now collects winning cells into winningCells
function checkWin(r, c, player) {
    const directions = [
        [0, 1],  // Horizontal
        [1, 0],  // Vertical
        [1, 1],  // Diagonal \
        [1, -1]  // Diagonal /
    ];

    for (let [dr, dc] of directions) {
        const cells = [[r, c]];

        // Check forward
        for (let i = 1; i < 5; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
                cells.push([nr, nc]);
            } else {
                break;
            }
        }

        // Check backward
        for (let i = 1; i < 5; i++) {
            const nr = r - dr * i;
            const nc = c - dc * i;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
                cells.push([nr, nc]);
            } else {
                break;
            }
        }

        if (cells.length >= 5) {
            winningCells = cells; // store for highlight
            return true;
        }
    }
    return false;
}

// Fix #12: fast win check for minimax (does NOT set winningCells)
function checkWinFast(r, c, player) {
    const directions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1]
    ];

    for (let [dr, dc] of directions) {
        let count = 1;

        for (let i = 1; i < 5; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
                count++;
            } else {
                break;
            }
        }

        for (let i = 1; i < 5; i++) {
            const nr = r - dr * i;
            const nc = c - dc * i;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
                count++;
            } else {
                break;
            }
        }

        if (count >= 5) return true;
    }
    return false;
}

function checkDraw() {
    return board.every(row => row.every(cell => cell !== 0));
}

// 结算文案：endGame 与 applyLanguage 共用同一处渲染，
// 这样面板开着时切语言，结果文案才会跟着变（否则只有标题和按钮变了）
function resultText(t) {
    if (lastResult === 0) return t.draw;
    if (lastResult === 1) return t.blackWins;
    if (lastResult === 2) return t.whiteWins;
    return '';
}

function endGame(winner) {
    gameActive = false;
    lastResult = winner;
    track('gomoku', 'finish');

    modalMessage.textContent = resultText(getTEXT());
    updateStatus(); // 结束态由 updateStatus 统一渲染（显示「对局结束」）
    showModal();
}

function showModal() {
    modal.style.display = 'flex';
}

function closeModal() {
    modal.style.display = 'none';
}

function applyLanguage(lang) {
    currentLang = lang || getLang();
    const t = getTEXT();
    document.documentElement.lang = currentLang;
    document.title = t.title;

    const gameTitle = document.getElementById('gameTitle');
    if (gameTitle) gameTitle.textContent = t.h1;

    // 页脚操作提示（契约里 hint 不归 chrome，由各页自己的语言渲染入口写）
    const gmHint = document.getElementById('gm-hint');
    if (gmHint) gmHint.textContent = t.hint;

    // #langBtn 的文案由 js/game-chrome.js 渲染（它写的是「目标语言的自称」，
    // 与这里的 t.langBtn 同值）——只保留一个写入者，避免两处漂移。
    if (restartBtn) restartBtn.textContent = t.restart;
    if (modeBtn) modeBtn.textContent = gameMode === 'pvp' ? t.modeBtn2Players : t.modeBtnVsComputer;

    const optEasy = document.getElementById('optEasy');
    if (optEasy) optEasy.textContent = t.diffEasy;
    const optMedium = document.getElementById('optMedium');
    if (optMedium) optMedium.textContent = t.diffMedium;
    const optHard = document.getElementById('optHard');
    if (optHard) optHard.textContent = t.diffHard;

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = t.gameOver;
    // 结果文案同样要跟随语言。面板开着时切语言，只有标题和按钮变、
    // 「黑方获胜！」还留着上一个语言的版本会很割裂。
    // 这条路径真实可达：结算浮层盖住了顶栏，键盘 Tab 聚焦后用 Enter 激活
    // 走的是元素自身的 click，不经过浮层的命中测试。
    if (lastResult !== null) modalMessage.textContent = resultText(t);
    if (modalRestartBtn) modalRestartBtn.textContent = t.playAgain;
    const modalViewBtn = document.getElementById('modalViewBtn');
    if (modalViewBtn) modalViewBtn.textContent = t.viewBoard;

    updateStatus();
    updateMoreGames(currentLang);
}

// Fix #11: getCandidateMoves helper - cells within distance 2 of existing pieces
function getCandidateMoves() {
    if (board.every(row => row.every(cell => cell === 0))) {
        return [{r: 7, c: 7}];
    }
    const seen = new Set();
    const result = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== 0) {
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === 0) {
                            const key = nr * BOARD_SIZE + nc;
                            if (!seen.has(key)) { seen.add(key); result.push({r: nr, c: nc}); }
                        }
                    }
                }
            }
        }
    }
    return result;
}

// --- AI ---

// Fix #12: evaluateBoardState for minimax
function evaluateBoardState() {
    const candidates = getCandidateMoves();
    let score = 0;
    for (const {r, c} of candidates) {
        score += evaluatePosition(r, c, 2) - evaluatePosition(r, c, 1);
    }
    return score;
}

// Fix #12: minimax with alpha-beta pruning (depth 1 look-ahead)
function minimaxSearch(depth, alpha, beta, isMaximizing) {
    if (depth === 0) {
        return evaluateBoardState();
    }

    const candidates = getCandidateMoves().slice(0, 8);

    if (isMaximizing) {
        let maxScore = -Infinity;
        for (const {r, c} of candidates) {
            board[r][c] = 2;
            if (checkWinFast(r, c, 2)) {
                board[r][c] = 0;
                return 80000;
            }
            const score = minimaxSearch(depth - 1, alpha, beta, false);
            board[r][c] = 0;
            maxScore = Math.max(maxScore, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        return maxScore;
    } else {
        let minScore = Infinity;
        for (const {r, c} of candidates) {
            board[r][c] = 1;
            if (checkWinFast(r, c, 1)) {
                board[r][c] = 0;
                return -80000;
            }
            const score = minimaxSearch(depth - 1, alpha, beta, true);
            board[r][c] = 0;
            minScore = Math.min(minScore, score);
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
        return minScore;
    }
}

// Fix #12: hard AI using minimax 2-ply
function hardAIMove() {
    const candidates = getCandidateMoves();

    // 1. Check immediate AI win
    for (const {r, c} of candidates) {
        board[r][c] = 2;
        if (checkWinFast(r, c, 2)) {
            board[r][c] = 0;
            makeMove(r, c);
            return;
        }
        board[r][c] = 0;
    }

    // 2. Check immediate block needed
    for (const {r, c} of candidates) {
        board[r][c] = 1;
        if (checkWinFast(r, c, 1)) {
            board[r][c] = 0;
            makeMove(r, c);
            return;
        }
        board[r][c] = 0;
    }

    // 3. Score candidates and take top 12
    const scored = candidates.map(({r, c}) => ({
        r, c,
        score: evaluatePosition(r, c, 2) * 1.2 + evaluatePosition(r, c, 1)
    }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 12);

    // 4. Run minimax for each top candidate
    let bestScore = -Infinity;
    let bestMove = top[0];
    for (const {r, c} of top) {
        board[r][c] = 2;
        const score = minimaxSearch(1, -Infinity, Infinity, false);
        board[r][c] = 0;
        if (score > bestScore) {
            bestScore = score;
            bestMove = {r, c};
        }
    }

    // 5. Make the best move
    makeMove(bestMove.r, bestMove.c);
}

function computerMove() {
    if (!gameActive || currentPlayer !== 2) return;

    // Fix #12: delegate to hardAIMove for hard difficulty
    if (difficulty === 'hard') {
        hardAIMove();
        return;
    }

    // 1. Check if can win immediately
    const winMove = findBestMove(2); // AI is player 2 (White)
    if (winMove.score >= 10000) {
        makeMove(winMove.r, winMove.c);
        return;
    }

    // 2. Check if need to block player win
    const blockMove = findBestMove(1); // Opponent is player 1 (Black)
    if (blockMove.score >= 10000) {
        // Easy mode: 20% chance to miss a block
        if (difficulty === 'easy' && Math.random() < 0.2) {
            // Missed block, fall through to random/offensive move
        } else {
            makeMove(blockMove.r, blockMove.c);
            return;
        }
    }

    // 3. Otherwise, pick best offensive move
    let bestScore = -1;
    let bestMoves = [];

    // Weights based on difficulty
    let attackWeight = 1.0;
    let defenseWeight = 1.0;

    if (difficulty === 'easy') {
        // Easy: Mostly random, low defense awareness
        attackWeight = 1.0;
        defenseWeight = 0.2;
    } else if (difficulty === 'medium') {
        // Medium: Balanced
        attackWeight = 1.0;
        defenseWeight = 0.8;
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === 0) {
                const attackScore = evaluatePosition(r, c, 2);
                const defenseScore = evaluatePosition(r, c, 1);
                const totalScore = (attackScore * attackWeight) + (defenseScore * defenseWeight);

                if (totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMoves = [{r, c}];
                } else if (totalScore === bestScore) {
                    bestMoves.push({r, c});
                }
            }
        }
    }

    if (bestMoves.length > 0) {
        // Fix #10: easy mode random pick from nearby candidates only
        if (difficulty === 'easy' && Math.random() < 0.3) {
            const randomMoves = getCandidateMoves();
            if (randomMoves.length > 0) {
                const move = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                makeMove(move.r, move.c);
                return;
            }
        }

        const move = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        makeMove(move.r, move.c);
    } else {
        // Fallback (shouldn't happen unless board full)
        makeMove(7, 7);
    }
}

function findBestMove(player) {
    let bestScore = -1;
    let move = {r: -1, c: -1, score: -1};

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === 0) {
                const score = evaluatePosition(r, c, player);
                if (score > bestScore) {
                    bestScore = score;
                    move = {r, c, score};
                }
            }
        }
    }
    return move;
}

function evaluatePosition(r, c, player) {
    let score = 0;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (let [dr, dc] of directions) {
        score += evaluateLine(r, c, dr, dc, player);
    }
    return score;
}

// Fix #9: corrected scoring table
function evaluateLine(r, c, dr, dc, player) {
    let count = 0;
    let openEnds = 0;

    // Check forward
    let i = 1;
    while (true) {
        const nr = r + dr * i;
        const nc = c + dc * i;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
        if (board[nr][nc] === player) {
            count++;
        } else if (board[nr][nc] === 0) {
            openEnds++;
            break;
        } else {
            break;
        }
        i++;
    }

    // Check backward
    i = 1;
    while (true) {
        const nr = r - dr * i;
        const nc = c - dc * i;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
        if (board[nr][nc] === player) {
            count++;
        } else if (board[nr][nc] === 0) {
            openEnds++;
            break;
        } else {
            break;
        }
        i++;
    }

    // Scoring rules (Fix #9: closed-4 > open-3)
    if (count >= 4) return 10000;           // win (5 in a row: current + 4)
    if (count === 3 && openEnds === 2) return 1000;  // open 4 - immediate threat
    if (count === 3 && openEnds === 1) return 200;   // closed 4 - higher than open 3
    if (count === 2 && openEnds === 2) return 100;   // open 3
    if (count === 2 && openEnds === 1) return 20;    // closed 3
    if (count === 1 && openEnds === 2) return 10;    // open 2
    if (count === 1 && openEnds === 1) return 1;

    return 0;
}

// Start
init();

/* ── 顶栏 / 页脚通用控件：Home · Sound · Lang · More ──
   槽位结构见 css/layout.css 的契约，行为统一由 js/game-chrome.js 接管。
   owns 默认只含 lang / more：静音钮在本页早就有自己的 handler（还要顺带做
   SFX 初始化之类的页面私事），chrome 再挂一个就会一次点击切换两次 = 净效果为零。
       本页的静音钮是随槽位契约新增的，页面自身没有 handler，
       所以显式把 sound 交给 chrome 接管。 */
window.addEventListener('DOMContentLoaded', () => {
    bindChrome({
        self: 'gomoku.html',
        owns: ['lang', 'more', 'sound'],
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
        labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
    });
});
