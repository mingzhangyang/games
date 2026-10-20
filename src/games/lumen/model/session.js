/**
 * Lumen 折光 — 一局的可变状态（纯模块：无 DOM、无 window）
 * ======================================================
 * 盘面、光迹、点击数只有这一个写入方：runtime 持有 PlaySession，渲染与 HUD 只读。
 * tap() 把「这一下改变了什么」作为事件返回（翻了哪些格、新亮的水晶、新照到的暗晶、
 * 是否通关），runtime 据此驱动音效 / 特效 / 结算，自己不再比对前后光迹。
 */

import { tapGrid, traceGrid } from './beam.js';

/** 星级规则：≤ par 三星，≤ par + 2 两星，其余一星 */
export function starsFor(flips, par) {
    return flips <= par ? 3 : flips <= par + 2 ? 2 : 1;
}

export class PlaySession {
    /** level：buildLevel() 产物（章节关或每日），需带 grid / sol / par / split / links */
    constructor(level) {
        this.level = level;
        this.reset();
    }

    /** 回到初盘（Reset 按钮 / 重开） */
    reset() {
        this.grid = this.level.grid.slice();
        this.flips = 0;
        this.trace = traceGrid(this.grid, this.level.split);
    }

    get par() { return this.level.par; }
    get solved() { return this.trace.solved; }

    /**
     * 点击 (r, c)：联动组整组翻转、点击数 +1。不可点（不是镜面）返回 null，状态不变。
     * 返回 { cells, before, gained, newShadows, solved }：
     *   cells 翻转的格 idx；before 点击前的盘面（渲染做转动补间用）；
     *   gained / newShadows 这一下新点亮的水晶 / 新照到的暗晶 idx。
     */
    tap(r, c) {
        const t = tapGrid(this.level, this.grid, r, c);
        if (!t) return null;
        const before = this.grid;
        const prev = this.trace;
        this.grid = t.grid;
        this.flips += 1;
        this.trace = traceGrid(this.grid, this.level.split);
        const wasLit = new Set(prev.crystalLit);
        const wasDark = new Set(prev.shadowLit);
        return {
            cells: t.cells,
            before,
            gained: this.trace.crystalLit.filter(idx => !wasLit.has(idx)),
            newShadows: this.trace.shadowLit.filter(idx => !wasDark.has(idx)),
            solved: this.trace.solved,
        };
    }
}
