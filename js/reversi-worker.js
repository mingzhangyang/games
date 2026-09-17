/**
 * Reversi AI Worker — 把搜索移出主线程，UI 不再被阻塞。
 * 协议：输入 { id, board, color, level } → 输出 { id, move: { i, flips } | null }
 */

import { pickAiMove } from './reversi-ai.js';

self.onmessage = (e) => {
    const { id, board, color, level } = e.data;
    let move = null;
    try {
        move = pickAiMove(board, color, level);
    } catch (err) {
        move = null;
    }
    self.postMessage({ id, move });
};
