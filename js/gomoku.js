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

// Initialize
function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('click', handleCanvasClick);

    // Fix #6: touch input support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!gameActive || isComputerThinking) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
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
    modeBtn.addEventListener('click', toggleMode);
    difficultySelect.addEventListener('change', (e) => {
        difficulty = e.target.value;
        resetGame();
    });

    resetGame();
}

function resizeCanvas() {
    const containerWidth = Math.min(window.innerWidth - 40, 600);
    const containerHeight = Math.min(window.innerHeight - 200, 600);
    const size = Math.min(containerWidth, containerHeight);

    canvas.width = size;
    canvas.height = size;

    // Calculate cell size based on canvas width and padding
    // We need 14 squares across, but 15 lines.
    // Let's leave some padding on edges.
    const availableWidth = canvas.width - (2 * CELL_PADDING);
    CELL_SIZE = availableWidth / (BOARD_SIZE - 1);

    drawBoard();
}

function resetGame() {
    board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
    currentPlayer = 1; // Black always starts
    gameActive = true;
    isComputerThinking = false;
    winningCells = null; // Fix #7: reset winning cells
    lastMove = null;
    updateStatus();
    drawBoard();
    closeModal();
}

function toggleMode() {
    gameMode = gameMode === 'pvp' ? 'pve' : 'pvp';
    modeBtn.textContent = gameMode === 'pvp' ? 'Mode: 2 Players' : 'Mode: vs Computer';
    difficultySelect.style.display = gameMode === 'pve' ? 'inline-block' : 'none';
    resetGame();
}

function drawBoard() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.beginPath();
    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 1.5;

    for (let i = 0; i < BOARD_SIZE; i++) {
        // Vertical lines
        const x = CELL_PADDING + i * CELL_SIZE;
        ctx.moveTo(x, CELL_PADDING);
        ctx.lineTo(x, canvas.height - CELL_PADDING);

        // Horizontal lines
        const y = CELL_PADDING + i * CELL_SIZE;
        ctx.moveTo(CELL_PADDING, y);
        ctx.lineTo(canvas.width - CELL_PADDING, y);
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

    // Highlight last move if exists
    if (lastMove) {
        const x = CELL_PADDING + lastMove.c * CELL_SIZE;
        const y = CELL_PADDING + lastMove.r * CELL_SIZE;
        ctx.beginPath();
        ctx.strokeStyle = '#ef4444'; // Red indicator
        ctx.lineWidth = 2;
        ctx.arc(x, y, CELL_SIZE * 0.1, 0, Math.PI * 2);
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
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
    board[r][c] = currentPlayer;
    lastMove = { r, c };
    drawBoard();

    if (checkWin(r, c, currentPlayer)) {
        drawBoard(); // Redraw to show winning highlight
        endGame(currentPlayer);
        return;
    }

    if (checkDraw()) {
        endGame(0);
        return;
    }

    currentPlayer = currentPlayer === 1 ? 2 : 1;
    updateStatus();

    if (gameActive && gameMode === 'pve' && currentPlayer === 2) {
        isComputerThinking = true;
        setTimeout(computerMove, 500); // Small delay for realism
    } else {
        isComputerThinking = false;
    }
}

function updateStatus() {
    // Fix #4: use a light color for both turns (dark background)
    statusText.style.color = '#e2e8f0';

    if (gameMode === 'pve' && currentPlayer === 2 && gameActive) {
        statusText.textContent = "Computer Thinking...";
    } else {
        const playerText = currentPlayer === 1 ? "Black's Turn" : "White's Turn";
        statusText.textContent = playerText;
    }

    // Fix #8: populate modeText
    modeText.textContent = gameMode === 'pve' ? 'vs Computer' : '2 Players';
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

function endGame(winner) {
    gameActive = false;
    let msg = '';
    if (winner === 0) {
        msg = "It's a Draw!";
    } else {
        const winnerName = winner === 1 ? "Black" : "White";
        msg = `${winnerName} Wins!`;
    }

    modalMessage.textContent = msg;
    showModal();
}

function showModal() {
    modal.style.display = 'flex';
}

function closeModal() {
    modal.style.display = 'none';
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
