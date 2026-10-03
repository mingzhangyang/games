/**
 * Reversi AI 引擎 — negamax + α-β 剪枝 + 迭代加深。
 * 独立模块：主线程（同步回退）与 Worker 共用同一份实现。
 */

export const EMPTY = 0, BLACK = 1, WHITE = 2;
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// 位置权重：角最优，X 位/C 位危险，边次优
export const WEIGHTS = [
    120, -20,  20,   5,   5,  20, -20, 120,
    -20, -40,  -5,  -5,  -5,  -5, -40, -20,
    20,  -5,  15,   3,   3,  15,  -5,  20,
    5,  -5,   3,   3,   3,   3,  -5,   5,
    5,  -5,   3,   3,   3,   3,  -5,   5,
    20,  -5,  15,   3,   3,  15,  -5,  20,
    -20, -40,  -5,  -5,  -5,  -5, -40, -20,
    120, -20,  20,   5,   5,  20, -20, 120
];

// 找出在 (x,y) 落 color 子会翻转的所有子；无法翻转则返回 null
export function findFlips(board, x, y, color) {
    if (board[y * 8 + x] !== EMPTY) return null;
    const opp = 3 - color;
    const flips = [];
    for (let d = 0; d < 8; d++) {
        const dx = DIRS[d][0], dy = DIRS[d][1];
        let cx = x + dx, cy = y + dy;
        const line = [];
        while (cx >= 0 && cx < 8 && cy >= 0 && cy < 8 && board[cy * 8 + cx] === opp) {
            line.push(cy * 8 + cx);
            cx += dx;
            cy += dy;
        }
        if (line.length && cx >= 0 && cx < 8 && cy >= 0 && cy < 8 && board[cy * 8 + cx] === color) {
            for (const f of line) flips.push(f);
        }
    }
    return flips.length ? flips : null;
}

export function genMoves(board, color) {
    const moves = [];
    for (let i = 0; i < 64; i++) {
        if (board[i] !== EMPTY) continue;
        const flips = findFlips(board, i & 7, i >> 3, color);
        if (flips) moves.push({ i, flips });
    }
    return moves;
}

export function countDiscs(board) {
    let b = 0, w = 0;
    for (let i = 0; i < 64; i++) {
        if (board[i] === BLACK) b++;
        else if (board[i] === WHITE) w++;
    }
    return { b, w };
}

export function evalFor(board, color) {
    let pos = 0;
    for (let i = 0; i < 64; i++) {
        if (board[i] === color) pos += WEIGHTS[i];
        else if (board[i] === 3 - color) pos -= WEIGHTS[i];
    }
    const myMob = genMoves(board, color).length;
    const oppMob = genMoves(board, 3 - color).length;
    return pos + (myMob - oppMob) * 12;
}

// 搜索状态（模块级，避免递归参数膨胀）
let searchAborted = false;
let searchNodes = 0;

export function negamax(board, color, depth, alpha, beta, deadline) {
    if ((++searchNodes & 127) === 0 && performance.now() > deadline) {
        searchAborted = true;
    }
    if (searchAborted) return 0;

    const moves = genMoves(board, color);
    if (moves.length === 0) {
        const oppMoves = genMoves(board, 3 - color);
        if (oppMoves.length === 0) {
            // 终局：子差决定超大分值
            const { b, w } = countDiscs(board);
            const diff = color === BLACK ? b - w : w - b;
            return diff > 0 ? 100000 + diff : diff < 0 ? -100000 + diff : 0;
        }
        return -negamax(board, 3 - color, depth, -beta, -alpha, deadline); // 过路，深度不变
    }
    if (depth <= 0) return evalFor(board, color);

    moves.sort((a, b2) => WEIGHTS[b2.i] - WEIGHTS[a.i]); // 走法排序加速剪枝
    let best = -Infinity;
    for (const m of moves) {
        const nb = board.slice();
        nb[m.i] = color;
        for (const f of m.flips) nb[f] = color;
        const score = -negamax(nb, 3 - color, depth - 1, -beta, -alpha, deadline);
        if (searchAborted) return 0;
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

export function pickAiMove(board, color, level) {
    const moves = genMoves(board, color);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    // 简单：60% 随机，40% 最多翻转
    if (level === 'easy') {
        if (Math.random() < 0.6) {
            return moves[Math.floor(Math.random() * moves.length)];
        }
        let best = moves[0];
        for (const m of moves) {
            if (m.flips.length > best.flips.length) best = m;
        }
        return best;
    }

    const empties = 64 - countDiscs(board).b - countDiscs(board).w;

    // 中等：固定 3 层
    if (level === 'medium') {
        let bestMove = moves[0], bestScore = -Infinity;
        for (const m of moves) {
            const nb = board.slice();
            nb[m.i] = color;
            for (const f of m.flips) nb[f] = color;
            const score = -negamax(nb, 3 - color, 2, -Infinity, Infinity, performance.now() + 1500);
            if (score > bestScore) {
                bestScore = score;
                bestMove = m;
            }
        }
        return bestMove;
    }

    // 困难：迭代加深，700ms 预算；残局直接搜索到终局
    const budget = empties <= 12 ? 2200 : 700;
    const deadline = performance.now() + budget;
    const maxDepth = empties <= 12 ? empties : 10;
    let bestMove = moves[0];

    searchAborted = false;
    for (let depth = 2; depth <= maxDepth; depth++) {
        let iterBest = null;
        let alpha = -Infinity;
        const beta = Infinity;
        for (const m of moves) {
            const nb = board.slice();
            nb[m.i] = color;
            for (const f of m.flips) nb[f] = color;
            const score = -negamax(nb, 3 - color, depth - 1, -beta, -alpha, deadline);
            if (searchAborted) break;
            if (score > alpha) {
                alpha = score;
                iterBest = m;
            }
        }
        if (searchAborted) break;
        if (iterBest) bestMove = iterBest;
        if (alpha >= 100000) break; // 已找到必胜路线
    }
    return bestMove;
}
