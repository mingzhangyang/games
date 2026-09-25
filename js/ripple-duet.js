/**
 * 涟漪双生 Ripple Duet — 波的干涉解谜
 * ==================================================================
 * 玩法：一片海上有两个你能动的波源，还有一个搬不走的风暴源。拖动波源、拧动
 * 它的相位，让干涉图样听你的话：把「平静」标记放进暗带（两列波相消的地方），
 * 或者把波峰叠起来点亮浮标，再按「定格」收下这张图样。
 *
 * 机制即教学：
 *   · 波峰烧橙、波谷沉蓝，**从来不动的暗带就是相消带** —— 眼睛先学会看；
 *   · 一个源永远消不掉自己（实测最小包络 0.184），所以「平静」必须有第二个
 *     波或者一场风暴来抵消 —— 对消天生是两个波的事；
 *   · 相位是 8 档（45° 一档）；把波源挪半格就能换来半波程差，等价于反相。
 *
 * 计分（asc）：每拖一次落位 1 次 + 每拧一档相位 1 次。par 是理论最少操作数，
 * 由 solvePar() 按成本分层穷举现算（关卡离线算好，每日现场算）。
 *
 * 关卡数据 js/ripple-duet-levels.js（生成器产出）；
 * 内核 js/ripple-duet-rules.js（纯模块，页面与校验器共用）。
 *
 * 共享层（2026-09 契约）：game-frame / game-drawer / game-chrome /
 * leaderboard / daily / i18n / safe-storage / analytics / game-sfx / boot。
 */

import {
    STAGE,
    SEA,
    READOUT,
    CONSOLE,
    GRID,
    PHASES,
    K,
    gridX,
    gridY,
    emitters,
    fieldAt,
    measure,
    starsForLevel,
    dailyCourse,
} from './ripple-duet-rules.js';
import { LEVELS } from './ripple-duet-levels.js';
import { ensurePlayerName, setPlayerName } from './player.js';
import { getLang, getMuted, setMuted } from './site-settings.js';
import { ICONS } from './icons.js';
import { renderMoreGames } from './more-games.js';
import { createStatsDrawer } from './game-drawer.js';
import { bindChrome } from './game-chrome.js';
import { bindFrame } from './game-frame.js';
import { storageGet, storageSet } from './safe-storage.js';
import { track } from './analytics.js';
import { todayKey, todayKeyDisplay } from './daily.js';
import { submitScore, fetchBoard } from './leaderboard.js';
import { makeText } from './i18n.js';
import { onReady } from './boot.js';
import { createSfxEngine } from './game-sfx.js';

/* ────────────────────────── 常量 ────────────────────────── */

const W = STAGE.w;
const H = STAGE.h;

/** 波场缓冲：半分辨率够了（放大 2 倍后干涉条纹反而更柔和） */
const FW = 260;
const FH = 200;

const OMEGA = Math.PI * 2 * 0.45;        // 0.45Hz：看得清起伏，也不晃眼
const GOLD = '#e17b61';             // coral marker / active control
const DIM = 'rgba(200,214,255,0.62)';
const CREST = [222, 126, 98];            // 波峰：珊瑚红
const TROUGH = [78, 180, 183];           // 波谷：深海青
const BASEC = [13, 35, 42];              // 静止水面（也是相消带的颜色）
const SRC_R = 21;                        // 波源命中半径（逻辑像素；窄屏换算后 ≈15px，靠视觉圆盘 42px 兜底）

/* 控制台命中区（逻辑坐标，CONSOLE 内） */
const BTN = {
    minus: { x: 330, y: 552, w: 64, h: 64 },
    plus: { x: 400, y: 552, w: 64, h: 64 },
    freeze: { x: 470, y: 552, w: 70, h: 64 },
};
const CHIP = { x: 20, y: 552, w: 62, h: 64, gap: 6 };

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function inBox(p, b) {
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/* ────────────────────────── 音效 ────────────────────────── */
/* createSfxEngine() 是裸引擎（只有 tone/noise/ensure/prime），语义音效自己包一层 */

const sfxEngine = createSfxEngine();
const Sfx = {
    click() {
        sfxEngine.tone({ freq: 520, type: 'triangle', dur: 0.05, vol: 0.05 });
    },
    drop() {
        sfxEngine.tone({ freq: 340, slideTo: 250, type: 'sine', dur: 0.12, vol: 0.06 });
    },
    phase() {
        sfxEngine.tone({ freq: 700, slideTo: 880, type: 'sine', dur: 0.07, vol: 0.045 });
    },
    win() {
        sfxEngine.tone({ freq: 523, type: 'triangle', dur: 0.12, vol: 0.07 });
        sfxEngine.tone({ freq: 659, type: 'triangle', dur: 0.14, vol: 0.07 });
        sfxEngine.tone({ freq: 784, type: 'triangle', dur: 0.2, vol: 0.07 });
    },
    star3() {
        sfxEngine.tone({ freq: 880, type: 'sine', dur: 0.1, vol: 0.06 });
        sfxEngine.tone({ freq: 1174, type: 'sine', dur: 0.16, vol: 0.06 });
    },
    fail() {
        sfxEngine.tone({ freq: 220, slideTo: 160, type: 'sawtooth', dur: 0.18, vol: 0.05 });
    },
};

/* ────────────────────────── i18n ────────────────────────── */

const LANGUAGES = makeText({
    en: {
        stats: 'Stats',
        title: 'Ripple Duet',
        subtitle: 'Two Sources · One Sea',
        howto: 'A still sea is not a silent one — it is two waves arriving opposite and calling it even. You can drag a source or two, and turn their phase; the storm never stops and cannot be moved. Watch the water: crests burn orange, troughs sink blue, and the dark bands that never move are where the waves cancel. Lay the calm marker into that dark, or pile the crests up until a beacon lights — then freeze the pattern. Every drop and every eighth turn of phase costs one operation, and you are judged on how few it took.',
        playLevels: 'Levels',
        playDaily: 'Daily',
        levelSelect: 'Select wave',
        wave: 'Wave',
        daily: 'Daily',
        cost: 'Ops',
        par: 'Par',
        ops: 'Ops',
        calm: 'Calm',
        blaze: 'Beacon',
        lane: 'Channel',
        phase: 'Phase',
        freeze: 'Freeze',
        menu: 'Home',
        retry: 'Retry',
        next: 'Next',
        again: 'Again',
        levelCleared: 'Sea mastered!',
        dailyDone: 'Daily complete!',
        bestToday: 'Your best today',
        stars: 'Stars',
        best: 'Fewest ops',
        leaderboard: 'Global · Today\'s Run',
        noScores: 'No scores yet',
        lbOffline: 'Leaderboard offline',
        copyResult: 'Copy',
        resetTitle: 'Restart wave',
        home: 'Home',
        playerName: 'Name',
        hint: 'The dark band that never moves is where the two waves cancel — put the calm marker there',
        sideHowTo: 'How to play',
        sideRecords: 'Records',
        legendTitle: 'Reading the water',
        legendNote: 'One source alone can never flatten its own wave — stillness always takes two',
        dailyStartToast: 'Five waves today · same course for everyone',
        srcLabel: 'Source',
        stormLabel: 'Storm',
        wallLabel: 'Breakwater',
        legendCrest: 'Crest',
        legendTrough: 'Trough',
        legendDark: 'Dark band — the waves cancel',
        legendStorm: 'Storm — fixed, never stops',
        legendWall: 'Breakwater — reflects the wave',
        notReady: 'Not still yet',
        readyToFreeze: 'Still — freeze it',
        needBrighter: 'Needs more wave',
        litUp: 'Lit',
        dragHint: 'Drag a source · buttons turn its phase',
        phaseStep: '45° a step · stepping around the dial is cheaper than going back',
        tipCancel: 'Opposite arrival cancels: half a wavelength of extra path is the same as flipping the phase',
        tipStorm: 'The storm cannot be moved — answer it with your own wave, equal and opposite',
        tipWall: 'A breakwater answers with a mirror wave: the reflected crest arrives as if from behind the wall',
    },
    zh: {
        stats: '数据统计',
        title: '涟漪双生',
        subtitle: '两源 · 一海',
        howto: '平静的海面不是没有波，是两列波正好相反地抵达、彼此抵消。你能拖动一两个波源，还能拧动它们的相位；风暴源不会停，也搬不走。看水：波峰烧成橙色，波谷沉成蓝色，而那些从来不动的暗带，就是两列波相消的地方。把「平静」标记放进暗带，或者把波峰叠起来点亮浮标，然后定格。每落位一次、每拧四十五度，都算一次操作——评判只看你用了几次。',
        playLevels: '关卡模式',
        playDaily: '每日挑战',
        levelSelect: '选择海面',
        wave: '海面',
        daily: '每日',
        cost: '操作',
        par: '目标',
        ops: '操作数',
        calm: '平静',
        blaze: '浮标',
        lane: '航道',
        phase: '相位',
        freeze: '定格',
        menu: '返回',
        retry: '重试',
        next: '下一关',
        again: '再来一次',
        levelCleared: '海面已定！',
        dailyDone: '每日完成！',
        bestToday: '今日最佳',
        stars: '星数',
        best: '最少操作',
        leaderboard: '全球 · 今日赛程',
        noScores: '还没有成绩',
        lbOffline: '排行榜离线',
        copyResult: '复制',
        resetTitle: '重开本海面',
        home: '首页',
        playerName: '昵称',
        hint: '从来不动的暗带就是两列波相消的地方——把平静标记放那儿',
        sideHowTo: '玩法',
        sideRecords: '记录',
        legendTitle: '读水',
        legendNote: '一个源永远抹不平自己的波——平静从来是两个波的事',
        dailyStartToast: '今日五片海 · 全世界同一份赛程',
        srcLabel: '波源',
        stormLabel: '风暴',
        wallLabel: '防波堤',
        legendCrest: '波峰',
        legendTrough: '波谷',
        legendDark: '暗带——两列波在此相消',
        legendStorm: '风暴——固定不动，也停不下来',
        legendWall: '防波堤——把波反射回来',
        notReady: '还不够静',
        readyToFreeze: '静了——定格',
        needBrighter: '浪还不够高',
        litUp: '已点亮',
        dragHint: '拖动波源 · 按钮拧它的相位',
        phaseStep: '一格四十五度 · 顺着方向拧比往回拧便宜',
        tipCancel: '相反抵达即相消：多走半个波长，等同于把相位翻过来',
        tipStorm: '风暴搬不走——用你自己那一列波去回答它，等大反向',
        tipWall: '防波堤会用一列镜像波回答：反射波峰像是从堤后头赶来的',
    },
});

function storageParseProgress() {
    try {
        const obj = JSON.parse(storageGet('rd_progress') || '{}');
        const out = {};
        if (obj && typeof obj === 'object') {
            for (const k of Object.keys(obj)) {
                const v = obj[k];
                if (v && typeof v === 'object') {
                    out[k] = { stars: clamp(v.stars | 0, 0, 3), bestCost: v.bestCost | 0 };
                }
            }
        }
        return out;
    } catch (e) {
        return {};
    }
}

/* ────────────────────────── 游戏主体 ────────────────────────── */

class RippleDuetGame {
    constructor() {
        this.canvas = document.getElementById('rd-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.el = {};
        [
            'rd-hud-level', 'rd-budget', 'rd-par', 'rd-reset-btn', 'rd-mute-btn', 'rd-toast',
            'rd-start', 'rd-title', 'rd-subtitle', 'rd-howto', 'rd-btn-levels', 'rd-btn-daily',
            'rd-level-label', 'rd-level-grid', 'rd-daily-best', 'rd-start-mute',
            'rd-side-howto-title', 'rd-side-howto', 'rd-side-records-title', 'rd-side-records',
            'rd-side-legend-title', 'rd-side-legend',
            'rd-clear', 'rd-clear-stars', 'rd-clear-line', 'rd-btn-next', 'rd-btn-replay', 'rd-btn-menu1',
            'rd-over', 'rd-over-title', 'rd-over-score', 'rd-over-sub',
            'rd-btn-again', 'rd-btn-copy', 'rd-btn-menu2',
            'rd-lb-title', 'rd-lb-list', 'rd-lb-status', 'rd-username', 'rd-username-label',
            'rd-hint',
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) this.el[id.replace(/^rd-/, '')] = el;
        });

        this.lang = getLang();
        this.progress = storageParseProgress();

        // 对局状态：menu | playing | won-level | won-daily
        // （没有 terminal 失败态：图样不达标只是读数不够，继续调就是）
        // ⚠️ 字段名与 verify-stats-drawer.mjs 的 AUGMENT runningExpr 严格对应
        this.state = 'menu';
        this.isPaused = false;
        this.mode = 'levels';
        this.levelIdx = 0;
        this.spec = null;
        this.place = [];
        this.cost = 0;
        this.sel = 0;
        this.dragIdx = -1;
        this.dragFrom = null;
        this.daily = null;

        this.time = 0;
        this.toastTimer = 0;
        this.animationId = null;
        this.lastFrame = 0;

        // 波场缓冲：静态复振幅（源一动就重算），每帧只做一次旋转
        this.field = { re: new Float32Array(FW * FH), im: new Float32Array(FW * FH) };
        this.fieldCanvas = document.createElement('canvas');
        this.fieldCanvas.width = FW;
        this.fieldCanvas.height = FH;
        this.fieldCtx = this.fieldCanvas.getContext('2d');
        this.fieldImg = this.fieldCtx.createImageData(FW, FH);

        this.buildLevelGrid();
        this.loadLevel(LEVELS[0]);
        this.rebuildField();
        this.applyLanguage();
        this.bindEvents();
        this.resize();
        this.loop = this.loop.bind(this);
        this.animationId = requestAnimationFrame(this.loop);
    }

    /* ---------------------- 关卡装载 ---------------------- */

    loadLevel(spec) {
        this.spec = spec;
        this.place = (spec.ctrl || []).map((c) => ({ i: c.i, j: c.j, ph: c.ph }));
        this.cost = 0;
        this.sel = 0;
        this.k = K(spec.lambda);
        this.rebuildField();
    }

    startLevel(ref) {
        const spec = typeof ref === 'number' ? LEVELS[clamp(ref, 0, LEVELS.length - 1)] : ref;
        if (!spec) return;
        this.mode = 'levels';
        this.levelIdx = LEVELS.indexOf(spec);
        if (this.levelIdx < 0) this.levelIdx = 0;
        this.loadLevel(spec);
        this.state = 'playing';
        this.hide(this.el['start']);
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.updateHud();
        track('ripple-duet', 'level_start', this.levelIdx + 1);
    }

    startDaily() {
        const key = todayKey();
        const course = dailyCourse(key);
        if (!course.length) return;
        this.mode = 'daily';
        this.daily = { key, display: todayKeyDisplay(), course, cursor: 0, totalCost: 0, stars: 0 };
        this.loadLevel(course[0]);
        this.state = 'playing';
        this.hide(this.el['start']);
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.updateHud();
        this.showToast(this.t('dailyStartToast'));
        track('ripple-duet', 'daily_start', 0);
    }

    restartLevel() {
        if (!this.spec) return;
        this.loadLevel(this.spec);
        this.state = 'playing';
        this.hide(this.el['clear']);
        this.updateHud();
    }

    toMenu() {
        this.state = 'menu';
        this.hide(this.el['clear']);
        this.hide(this.el['over']);
        this.show(this.el['start']);
        this.renderRecords();
    }

    nextLevel() {
        if (this.mode === 'daily' && this.daily) {
            this.daily.cursor += 1;
            if (this.daily.cursor >= this.daily.course.length) {
                this.finishDaily();
                return;
            }
            this.loadLevel(this.daily.course[this.daily.cursor]);
            this.state = 'playing';
            this.hide(this.el['clear']);
            this.updateHud();
            return;
        }
        const next = this.levelIdx + 1;
        if (next >= LEVELS.length) {
            this.toMenu();
            return;
        }
        this.startLevel(next);
    }

    /* ---------------------- 波场 ---------------------- */

    /** 源一动就重算：每个像素的复振幅（re/im）。每帧只拿它做一次旋转 */
    rebuildField() {
        if (!this.spec) return;
        const list = emitters(this.spec, this.place, this.k);
        const re = this.field.re;
        const im = this.field.im;
        const stepX = SEA.w / FW;
        const stepY = SEA.h / FH;
        let p = 0;
        for (let py = 0; py < FH; py++) {
            const y = SEA.y + (py + 0.5) * stepY;
            for (let px = 0; px < FW; px++) {
                const x = SEA.x + (px + 0.5) * stepX;
                const f = fieldAt(list, x, y, this.k);
                re[p] = f.re;
                im[p] = f.im;
                p++;
            }
        }
    }

    /** 每帧：u = Re[A·e^{iωt}] = re·cos(ωt) − im·sin(ωt)；ωt 是标量，两次三角函数就够 */
    paintField(cosT, sinT) {
        const re = this.field.re;
        const im = this.field.im;
        const d = this.fieldImg.data;
        for (let i = 0, o = 0; i < re.length; i++, o += 4) {
            const u = re[i] * cosT - im[i] * sinT;
            const a = Math.abs(u) / 0.9;
            const s = a >= 1 ? 1 : Math.pow(a, 0.8);
            const tgt = u >= 0 ? CREST : TROUGH;
            d[o] = BASEC[0] + (tgt[0] - BASEC[0]) * s;
            d[o + 1] = BASEC[1] + (tgt[1] - BASEC[1]) * s;
            d[o + 2] = BASEC[2] + (tgt[2] - BASEC[2]) * s;
            d[o + 3] = 255;
        }
        this.fieldCtx.putImageData(this.fieldImg, 0, 0);
    }

    /* ---------------------- 交互 ---------------------- */

    stagePos(ev) {
        const r = this.canvas.getBoundingClientRect();
        return {
            x: ((ev.clientX - r.left) * W) / r.width,
            y: ((ev.clientY - r.top) * H) / r.height,
        };
    }

    sourceAt(p) {
        for (let i = 0; i < this.place.length; i++) {
            const s = this.place[i];
            if (Math.hypot(p.x - gridX(s.i), p.y - gridY(s.j)) <= SRC_R + 8) return i;
        }
        return -1;
    }

    chipBox(idx) {
        return { x: CHIP.x + idx * (CHIP.w + CHIP.gap), y: CHIP.y, w: CHIP.w, h: CHIP.h };
    }

    onPointerDown(ev) {
        if (this.state !== 'playing' || this.isPaused) return;
        const p = this.stagePos(ev);
        const hit = this.sourceAt(p);
        if (hit >= 0) {
            this.sel = hit;
            this.dragIdx = hit;
            this.dragFrom = { i: this.place[hit].i, j: this.place[hit].j };
            Sfx.click();
            return;
        }
        for (let i = 0; i < this.place.length; i++) {
            if (inBox(p, this.chipBox(i))) {
                this.sel = i;
                Sfx.click();
                return;
            }
        }
        if (inBox(p, BTN.minus)) { this.turnPhase(-1); return; }
        if (inBox(p, BTN.plus)) { this.turnPhase(1); return; }
        if (inBox(p, BTN.freeze)) { this.pressFreeze(); return; }
    }

    onPointerMove(ev) {
        if (this.dragIdx < 0) return;
        const p = this.stagePos(ev);
        const i = clamp(Math.floor(((p.x - SEA.x) / SEA.w) * GRID.cols), 0, GRID.cols - 1);
        const j = clamp(Math.floor(((p.y - SEA.y) / SEA.h) * GRID.rows), 0, GRID.rows - 1);
        const s = this.place[this.dragIdx];
        if (s.i !== i || s.j !== j) {
            s.i = i;
            s.j = j;
            this.rebuildField();
        }
    }

    onPointerUp() {
        if (this.dragIdx < 0) return;
        const s = this.place[this.dragIdx];
        const moved = this.dragFrom && (s.i !== this.dragFrom.i || s.j !== this.dragFrom.j);
        this.dragIdx = -1;
        this.dragFrom = null;
        if (moved) {
            this.cost += 1;          // 一次拖动 = 一次操作（拖多远都一样）
            Sfx.drop();
            this.updateHud();
        }
    }

    /** 相位 ±1 档（8 档一圈）；每次点击记 1 次操作 */
    turnPhase(dir) {
        if (this.state !== 'playing' || this.isPaused || !this.place.length) return;
        const s = this.place[this.sel];
        s.ph = (s.ph + dir + PHASES) % PHASES;
        this.cost += 1;
        Sfx.phase();
        this.rebuildField();
        this.updateHud();
    }

    pressFreeze() {
        if (this.state !== 'playing' || this.isPaused) return;
        if (!this.allSatisfied()) {
            Sfx.fail();
            this.showToast(this.t('notReady'));
            return;
        }
        this.winLevel();
    }

    allSatisfied() {
        if (!this.spec) return false;
        for (let i = 0; i < this.spec.targets.length; i++) {
            if (!measure(this.spec, this.place, i, this.k).ok) return false;
        }
        return true;
    }

    /* ---------------------- 结算 ---------------------- */

    winLevel() {
        const par = this.spec.par;
        const stars = starsForLevel(this.cost, par);
        Sfx.win();
        if (this.mode === 'daily' && this.daily) {
            this.daily.totalCost += this.cost;
            this.daily.stars += stars;
        } else {
            const prev = this.progress[this.spec.id];
            if (!prev || this.cost < prev.bestCost || stars > prev.stars) {
                this.progress[this.spec.id] = {
                    stars: Math.max(stars, prev ? prev.stars : 0),
                    bestCost: prev && prev.bestCost ? Math.min(prev.bestCost, this.cost) : this.cost,
                };
                this.saveProgress();
            }
            this.maybeSubmitCampaign();
        }
        this.showClearPanel(stars, this.cost);
        if (stars === 3) Sfx.star3();
        track('ripple-duet', 'level_win', stars);
    }

    maybeSubmitCampaign() {
        let sum = 0;
        let complete = true;
        for (const spec of LEVELS) {
            const p = this.progress[spec.id];
            if (!p || p.stars === 0) { complete = false; break; }
            sum += p.bestCost;
        }
        if (complete && sum > 0) this.submit('ripple-duet', sum);
    }

    showClearPanel(stars, cost) {
        const el = this.el;
        this.state = 'won-level';
        if (el['clear-stars']) el['clear-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        if (el['clear-line']) {
            el['clear-line'].textContent = `${this.t('cost')} ${cost} · ${this.t('par')} ${this.spec.par}`;
        }
        const isLast = this.mode === 'levels' && this.levelIdx + 1 >= LEVELS.length;
        if (el['btn-next']) {
            el['btn-next'].style.display = (this.mode === 'daily') ? '' : (isLast ? 'none' : '');
        }
        this.show(el['clear']);
    }

    finishDaily() {
        this.state = 'won-daily';
        const el = this.el;
        this.hide(el['clear']);
        if (el['over-title']) el['over-title'].textContent = this.t('dailyDone');
        if (el['over-score']) el['over-score'].textContent = `${this.t('cost')} ${this.daily.totalCost} · ★ ${this.daily.stars}`;
        if (el['over-sub']) el['over-sub'].textContent = `${this.t('bestToday')}: ${this.daily.display}`;
        this.show(el['over']);
        const game = `ripple-duet-d${this.daily.key.replace(/-/g, '')}`;
        this.submit(game, this.daily.totalCost);
    }

    /* ---------------------- 榜单 ---------------------- */

    submit(game, score) {
        const name = ensurePlayerName();
        const el = this.el;
        if (el['lb-status']) el['lb-status'].textContent = '…';
        submitScore({ game, name, score })
            .then(() => fetchBoard(game))
            .then((rows) => this.renderBoard(rows))
            .catch(() => {
                if (el['lb-status']) el['lb-status'].textContent = this.t('lbOffline');
                const local = this.readLocalBoard(game);
                if (local.length) this.renderBoard(local);
            });
    }

    readLocalBoard(game) {
        try {
            const arr = JSON.parse(storageGet('rd_lb_' + game));
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    renderBoard(rows) {
        const el = this.el;
        const list = el['lb-list'];
        if (!list) return;
        list.innerHTML = '';
        if (!rows || !rows.length) {
            if (el['lb-status']) el['lb-status'].textContent = this.t('noScores');
            return;
        }
        if (el['lb-status']) el['lb-status'].textContent = '';
        rows.slice(0, 10).forEach((row, i) => {
            const li = document.createElement('li');
            li.className = 'rd-lb-row';
            if (i < 3) li.classList.add(`rd-lb-top${i + 1}`);
            const rank = document.createElement('span');
            rank.className = 'rd-lb-rank';
            rank.textContent = String(i + 1);
            const nm = document.createElement('span');
            nm.className = 'rd-lb-name';
            nm.textContent = row.name || '—';
            const sc = document.createElement('span');
            sc.className = 'rd-lb-score';
            sc.textContent = String(row.score);
            li.appendChild(rank);
            li.appendChild(nm);
            li.appendChild(sc);
            list.appendChild(li);
        });
    }

    copyResult() {
        const text = this.mode === 'daily' && this.daily
            ? `${this.t('title')} · ${this.daily.display} · ${this.t('cost')} ${this.daily.totalCost} · ★${this.daily.stars}`
            : `${this.t('title')} · ${this.t('wave')} ${this.levelIdx + 1} · ${this.t('cost')} ${this.cost}`;
        const done = () => this.showToast(this.t('copyResult') + ' ✓');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(done);
        } else {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (e) { /* 忽略 */ }
            done();
        }
    }

    saveProgress() {
        try {
            storageSet('rd_progress', JSON.stringify(this.progress));
        } catch (e) { /* 忽略 */ }
    }

    /* ---------------------- HUD / 面板 ---------------------- */

    updateHud() {
        const el = this.el;
        const total = this.mode === 'daily' && this.daily ? this.daily.course.length : LEVELS.length;
        const idx = this.mode === 'daily' && this.daily ? this.daily.cursor : this.levelIdx;
        if (el['hud-level']) {
            el['hud-level'].textContent = `${this.mode === 'daily' ? this.t('daily') : this.t('wave')} ${idx + 1}/${total}`;
        }
        if (el['budget']) el['budget'].textContent = String(this.cost);
        if (el['par']) el['par'].textContent = `${this.t('par')} ${this.spec ? this.spec.par : 0}`;
    }

    showToast(msg) {
        const el = this.el['toast'];
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('hidden');
        this.toastTimer = 2.2;
    }

    buildLevelGrid() {
        const grid = this.el['level-grid'];
        if (!grid) return;
        grid.innerHTML = '';
        LEVELS.forEach((spec, i) => {
            const btn = document.createElement('button');
            // ⚠️ 类名必须与 css/ripple-duet.css 的 .rd-chip* 家族逐字一致。
            // 这里写成 rd-level-* 时整块容器规则静默失效 → 芯片失去颜色来源
            // → 继承到开始覆盖层的黑色文字 → fg-audit 报「纯黑 20 处」。
            const rec = this.progress[spec.id];
            btn.className = 'rd-chip' + (rec && rec.stars ? ' is-done' : '');
            btn.type = 'button';
            btn.dataset.index = String(i);
            btn.innerHTML = `<span class="rd-chip-num">${i + 1}</span>${rec && rec.stars
                ? `<span class="rd-chip-stars">${'★'.repeat(rec.stars)}</span>`
                : '<span class="rd-chip-stars rd-chip-stars--none">☆☆☆</span>'}`;
            btn.addEventListener('click', () => this.startLevel(i));
            grid.appendChild(btn);
        });
    }

    renderRecords() {
        const box = this.el['side-records'];
        if (!box) return;
        const rows = [];
        let sum = 0;
        let done = 0;
        LEVELS.forEach((spec) => {
            const p = this.progress[spec.id];
            if (p && p.stars > 0) { done++; sum += p.bestCost; }
        });
        rows.push(`<div class="rd-rec"><span>${this.t('stars')}</span><b>${this.totalStars()}/60</b></div>`);
        rows.push(`<div class="rd-rec"><span>${this.t('best')}</span><b>${done ? sum : '—'}</b></div>`);
        const best = this.readLocalBoard('ripple-duet');
        if (best.length) {
            rows.push(`<div class="rd-rec"><span>${this.t('leaderboard')}</span><b>${best[0].score}</b></div>`);
        }
        box.innerHTML = rows.join('');
    }

    totalStars() {
        let n = 0;
        for (const spec of LEVELS) {
            const p = this.progress[spec.id];
            if (p) n += p.stars;
        }
        return n;
    }

    renderLegend() {
        const box = this.el['side-legend'];
        if (!box) return;
        const row = (cls, label) => `<div class="rd-legend-row"><span class="${cls}"></span><span>${label}</span></div>`;
        box.innerHTML = [
            row('rd-legend-swatch rd-legend-crest', this.t('legendCrest')),
            row('rd-legend-swatch rd-legend-trough', this.t('legendTrough')),
            row('rd-legend-swatch rd-legend-dark', this.t('legendDark')),
            row('rd-legend-swatch rd-legend-storm', this.t('legendStorm')),
            row('rd-legend-swatch rd-legend-wall', this.t('legendWall')),
            `<p class="rd-legend-note">${this.t('legendNote')}</p>`,
        ].join('');
    }

    /* ---------------------- 渲染 ---------------------- */

    loop(ts) {
        const dt = this.lastFrame ? Math.min(0.05, (ts - this.lastFrame) / 1000) : 0;
        this.lastFrame = ts;
        if (!this.isPaused) this.time += dt;
        if (this.toastTimer > 0) {
            this.toastTimer -= dt;
            if (this.toastTimer <= 0 && this.el['toast']) this.el['toast'].classList.add('hidden');
        }
        this.render();
        this.animationId = requestAnimationFrame(this.loop);
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);

        const cosT = Math.cos(OMEGA * this.time);
        const sinT = Math.sin(OMEGA * this.time);
        this.paintField(cosT, sinT);

        // 海面
        ctx.save();
        ctx.beginPath();
        ctx.rect(SEA.x, SEA.y, SEA.w, SEA.h);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.fieldCanvas, SEA.x, SEA.y, SEA.w, SEA.h);
        this.drawContours(ctx);
        this.drawWalls(ctx);
        this.drawTargets(ctx);
        this.drawSources(ctx, cosT, sinT);
        ctx.restore();
        ctx.strokeStyle = 'rgba(120,160,220,0.28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(SEA.x + 0.5, SEA.y + 0.5, SEA.w - 1, SEA.h - 1);

        this.drawReadout(ctx);
        this.drawConsole(ctx);
    }

    /**
     * 叠在瞬时波场上的等高线：实线是波峰、虚线是波谷，静区用菱形点记号。
     * 这些线只解释传播现象，不参与判定；判定仍完全来自 rules 的复振幅。
     */
    drawContours(ctx) {
        // 与判定同源：emitters() 的前 ctrl+storms 项就是真实波源（其后是墙的镜像源）。
        // 等高线只画真实波源各自的波前；反射波不另画圈，否则墙边会糊成一片。
        const list = emitters(this.spec, this.place, this.k);
        const realCount = (this.spec.ctrl || []).length + (this.spec.storms || []).length;
        const sources = list.slice(0, realCount);

        // 瞬时波面 u = Σ a·cos(φ − k·r + ωt)（与 paintField 一致）：
        //   波峰在 r ≡ (φ + ωt)/k (mod λ)，波谷在其外 λ/2 处。
        // 所以圈距必须是 λ/2、奇偶交替，且 λ 不能被截断，否则线会与底下的波场错位。
        const lambda = (Math.PI * 2) / this.k;
        const half = lambda / 2;
        const maxRadius = Math.hypot(SEA.w, SEA.h);
        ctx.save();
        ctx.lineWidth = 1.1;
        ctx.lineCap = 'round';
        sources.forEach((source) => {
            const crest0 = ((((source.ph + OMEGA * this.time) / this.k) % lambda) + lambda) % lambda;
            for (let n = 0; crest0 + n * half < maxRadius; n++) {
                const radius = crest0 + n * half;
                if (radius < 7) continue;
                const trough = n % 2 === 1;
                ctx.strokeStyle = trough ? 'rgba(116,211,207,0.25)' : 'rgba(241,152,125,0.29)';
                ctx.setLineDash(trough ? [5, 5] : []);
                ctx.beginPath();
                ctx.arc(source.x, source.y, radius, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        // A quiet zone is a symbol, not merely a dark colour patch.
        ctx.setLineDash([1, 4]);
        ctx.strokeStyle = 'rgba(215,235,222,0.36)';
        ctx.lineWidth = 1;
        for (let y = SEA.y + 24; y < SEA.y + SEA.h - 12; y += 34) {
            for (let x = SEA.x + 24; x < SEA.x + SEA.w - 12; x += 34) {
                if (fieldAt(list, x, y, this.k).mag > 0.12) continue;
                ctx.beginPath();
                ctx.moveTo(x, y - 3);
                ctx.lineTo(x + 3, y);
                ctx.lineTo(x, y + 3);
                ctx.lineTo(x - 3, y);
                ctx.closePath();
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);
        ctx.restore();
    }

    drawWalls(ctx) {
        const walls = this.spec.walls || [];
        ctx.save();
        ctx.strokeStyle = 'rgba(181,211,210,0.76)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        walls.forEach((w) => {
            // 判定用的是无限长直线的镜像，画的时候裁到海面内，视觉与判定一致
            const pts = clipLineToBox(w, SEA);
            if (!pts) return;
            ctx.beginPath();
            ctx.moveTo(pts[0], pts[1]);
            ctx.lineTo(pts[2], pts[3]);
            ctx.stroke();
            // 虚线内芯提示“反射边界”，与波峰/波谷线型形成第三种读法。
            ctx.strokeStyle = 'rgba(224,239,233,0.38)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.moveTo(pts[0], pts[1]);
            ctx.lineTo(pts[2], pts[3]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(181,211,210,0.76)';
            ctx.lineWidth = 4;
        });
        ctx.restore();
    }

    drawTargets(ctx) {
        const list = emitters(this.spec, this.place, this.k);
        this.spec.targets.forEach((t, i) => {
            const m = measure(this.spec, this.place, i, this.k);
            if (t.kind === 'lane') {
                ctx.save();
                ctx.strokeStyle = m.ok ? GOLD : 'rgba(210,231,224,0.62)';
                ctx.lineWidth = m.ok ? 4 : 3;
                ctx.setLineDash(m.ok ? [] : [3, 7]);
                ctx.beginPath();
                ctx.moveTo(t.x1, t.y1);
                ctx.lineTo(t.x2, t.y2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                return;
            }
            if (t.kind === 'blaze') {
                const glow = clamp(m.value / Math.max(m.need, 0.001), 0, 1.4);
                ctx.save();
                ctx.translate(t.x, t.y);
                ctx.rotate(Math.PI / 4);
                const s = 13;
                ctx.fillStyle = m.ok ? GOLD : `rgba(255,211,77,${0.25 + 0.4 * Math.min(glow, 1)})`;
                ctx.strokeStyle = m.ok ? '#fff3cf' : 'rgba(255,240,210,0.7)';
                ctx.lineWidth = 2;
                ctx.fillRect(-s / 2, -s / 2, s, s);
                ctx.strokeRect(-s / 2, -s / 2, s, s);
                ctx.restore();
                ctx.save();
                ctx.globalAlpha = m.ok ? 0.48 : 0.22;
                ctx.strokeStyle = m.ok ? GOLD : 'rgba(241,205,178,0.72)';
                ctx.lineWidth = 1.4;
                ctx.setLineDash([2, 4]);
                ctx.beginPath();
                ctx.arc(t.x, t.y, 17 + (m.ok ? 2 * Math.sin(this.time * 2) : 0), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                return;
            }
            // calm：同心圆环，达标即填满
            ctx.save();
            ctx.strokeStyle = m.ok ? '#a9d8c1' : 'rgba(210,231,224,0.62)';
            ctx.lineWidth = m.ok ? 3 : 2;
            ctx.setLineDash(m.ok ? [] : [2, 4]);
            ctx.beginPath();
            ctx.arc(t.x, t.y, 15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(t.x, t.y, 7, 0, Math.PI * 2);
            ctx.stroke();
            // “平静”用叉号标记，避免只靠青绿色环来识别。
            ctx.beginPath();
            ctx.moveTo(t.x - 4, t.y - 4); ctx.lineTo(t.x + 4, t.y + 4);
            ctx.moveTo(t.x + 4, t.y - 4); ctx.lineTo(t.x - 4, t.y + 4);
            ctx.stroke();
            if (m.ok) {
                ctx.fillStyle = 'rgba(169,216,193,0.22)';
                ctx.beginPath();
                ctx.arc(t.x, t.y, 15, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // 未达标时给出方向感：包络越大，环越"响"
                const shake = Math.min(1, m.value / Math.max(m.need * 3, 0.001));
                ctx.globalAlpha = 0.25 + 0.35 * shake;
                ctx.strokeStyle = '#e17b61';
                ctx.beginPath();
                ctx.arc(t.x, t.y, 15 + 3 * shake * (1 + Math.sin(this.time * 4)), 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            void list;
        });
    }

    drawSources(ctx, cosT, sinT) {
        // 风暴源：搬不动，也停不下来
        (this.spec.storms || []).forEach((s) => {
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.fillStyle = 'rgba(125,151,153,0.92)';
            ctx.strokeStyle = '#d8e8e4';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -14);
            ctx.lineTo(13, 10);
            ctx.lineTo(-13, 10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#102027';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('!', 0, 7);
            ctx.restore();
        });

        this.place.forEach((s, idx) => {
            const x = gridX(s.i);
            const y = gridY(s.j);
            const u = fieldAt(emitters(this.spec, this.place, this.k), x, y, this.k);
            void u;
            const on = idx === this.sel;
            ctx.save();
            // 外圈：选中时呼吸
            ctx.strokeStyle = on ? GOLD : 'rgba(220,230,255,0.7)';
            ctx.lineWidth = on ? 3 : 2;
            ctx.beginPath();
            ctx.arc(x, y, SRC_R + (on ? 3 + Math.sin(this.time * 3) * 2 : 0), 0, Math.PI * 2);
            ctx.stroke();
            // 相位指针：随波形一起摆，看得见"这一列波此刻推到哪"
            const ph = s.ph * (Math.PI * 2 / PHASES) + Math.atan2(sinT, cosT) * 0;
            ctx.translate(x, y);
            ctx.rotate(ph);
            ctx.strokeStyle = on ? GOLD : 'rgba(230,240,255,0.85)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(SRC_R - 4, 0);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.fillStyle = on ? GOLD : 'rgba(230,240,255,0.9)';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#08131f';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`S${idx + 1}`, x, y - SRC_R - 10);
            ctx.restore();
        });
    }

    drawReadout(ctx) {
        const box = READOUT;
        ctx.save();
        ctx.fillStyle = '#132832';
        ctx.strokeStyle = 'rgba(133,184,183,0.34)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.w, box.h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        const rows = this.spec.targets;
        const rowH = Math.min(34, (box.h - 10) / Math.max(rows.length, 1));
        const LABEL_FONT = 'bold 13px system-ui, sans-serif';
        const STATE_FONT = '12px ui-monospace, monospace';
        const lines = rows.map((t, i) => {
            const m = measure(this.spec, this.place, i, this.k);
            const label = t.kind === 'calm'
                ? `× ${this.t('calm')}`
                : t.kind === 'blaze' ? `◆ ${this.t('blaze')}` : `∥ ${this.t('lane')}`;
            const state = t.kind === 'blaze'
                ? (m.ok ? this.t('litUp') : this.t('needBrighter'))
                : (m.ok ? this.t('readyToFreeze') : this.t('notReady'));
            return { t, m, label, readout: `${m.value.toFixed(3)} · ${state}` };
        });
        // 进度条夹在最宽的标签与最宽的读数之间（按实际文字宽度量，换语言/加符号都不会压字）
        ctx.save();
        ctx.font = LABEL_FONT;
        const labelW = Math.max(0, ...lines.map((l) => ctx.measureText(l.label).width));
        ctx.font = STATE_FONT;
        // 取所有状态文案里最长的一条：状态切换（未达标 → 达标）时进度条不跳宽
        const readoutW = Math.max(0, ...['litUp', 'needBrighter', 'readyToFreeze', 'notReady']
            .map((k) => ctx.measureText(`0.000 · ${this.t(k)}`).width));
        ctx.restore();
        const bx = box.x + 12 + labelW + 10;
        const bw = Math.max(24, box.x + box.w - 12 - readoutW - 10 - bx);
        lines.forEach(({ t, m, label, readout }, i) => {
            const y = box.y + 6 + rowH * i + rowH / 2;
            ctx.save();
            ctx.fillStyle = m.ok ? (t.kind === 'blaze' ? GOLD : '#a9d8c1') : DIM;
            ctx.font = LABEL_FONT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, box.x + 12, y);

            // 进度条：平静要"压下去"，点亮要"顶上去"
            ctx.fillStyle = 'rgba(221,240,236,0.10)';
            ctx.fillRect(bx, y - 6, bw, 12);
            const ratio = t.kind === 'blaze'
                ? clamp(m.value / Math.max(m.need, 0.001) / 1.5, 0, 1)
                : clamp(1 - m.value / Math.max(m.need * 4, 0.001), 0, 1);
            ctx.fillStyle = m.ok ? (t.kind === 'blaze' ? GOLD : '#a9d8c1') : '#5faeaf';
            ctx.fillRect(bx, y - 6, bw * ratio, 12);

            ctx.fillStyle = m.ok ? '#e8eefc' : DIM;
            ctx.font = STATE_FONT;
            ctx.textAlign = 'right';
            ctx.fillText(readout, box.x + box.w - 12, y);
            ctx.restore();
        });
    }

    drawConsole(ctx) {
        const box = CONSOLE;
        ctx.save();
        ctx.fillStyle = '#132832';
        ctx.strokeStyle = 'rgba(133,184,183,0.34)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.w, box.h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        const active = this.state === 'playing' && !this.isPaused;

        // 源选择 chips
        this.place.forEach((_, i) => {
            const b = this.chipBox(i);
            ctx.save();
            ctx.fillStyle = i === this.sel ? 'rgba(225,123,97,0.20)' : 'rgba(221,240,236,0.06)';
            ctx.strokeStyle = i === this.sel ? GOLD : 'rgba(160,190,240,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(b.x, b.y, b.w, b.h, 10);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = i === this.sel ? GOLD : DIM;
            ctx.font = 'bold 16px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`S${i + 1}`, b.x + b.w / 2, b.y + b.h / 2);
            ctx.restore();
        });

        // 相位读数 + 8 档点
        const ph = this.place.length ? this.place[this.sel].ph : 0;
        const cx = 244;
        const cy = 584;
        ctx.save();
        ctx.fillStyle = '#dcebe7';
        ctx.font = 'bold 15px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${ph * 45}°`, cx, cy - 16);
        for (let i = 0; i < PHASES; i++) {
            const a = (i / PHASES) * Math.PI * 2 - Math.PI / 2;
            const px = cx + Math.cos(a) * 20;
            const py = cy + 12 + Math.sin(a) * 20;
            ctx.beginPath();
            ctx.arc(px, py, i === ph ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = i === ph ? GOLD : 'rgba(190,215,210,0.35)';
            ctx.fill();
        }
        ctx.restore();

        // − / +
        this.drawRoundButton(ctx, BTN.minus, '–', active);
        this.drawRoundButton(ctx, BTN.plus, '+', active);

        // 定格：达标才亮
        const ready = this.allSatisfied();
        ctx.save();
        const b = BTN.freeze;
        ctx.fillStyle = ready ? 'rgba(225,123,97,0.90)' : 'rgba(221,240,236,0.08)';
        ctx.strokeStyle = ready ? '#ffe0d2' : 'rgba(160,190,240,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ready ? '#102027' : DIM;
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.t('freeze'), b.x + b.w / 2, b.y + b.h / 2);
        ctx.restore();
    }

    drawRoundButton(ctx, b, glyph, active) {
        ctx.save();
        ctx.globalAlpha = active ? 1 : 0.45;
        ctx.fillStyle = 'rgba(221,240,236,0.08)';
        ctx.strokeStyle = 'rgba(160,190,240,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#dcebe7';
        ctx.font = 'bold 26px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, b.x + b.w / 2, b.y + b.h / 2 - 1);
        ctx.restore();
    }

    /* ---------------------- 通用 ---------------------- */

    show(el) { if (el) el.classList.remove('hidden'); }
    hide(el) { if (el) el.classList.add('hidden'); }

    resize() {
        // ⚠️ 场景按逻辑 560×640 绘制，必须**适配缩放**到 CSS 宽（flame-verse 同款）：
        // 只写 dpr 变换的话，桌面端缓冲比场景宽 → 右/下留黑边；移动端缓冲比场景窄
        // → 海面被裁、底部控制台整个画不进缓冲（真机就是点不到定格钮）。
        const cssW = this.canvas.clientWidth || W;
        const scale = cssW / W;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderScale = scale * dpr;
        const pw = Math.round(W * renderScale);
        if (this.canvas.width !== pw) {
            this.canvas.width = pw;
            this.canvas.height = Math.round(H * renderScale);
        }
        this.ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    }

    t(key) {
        const table = LANGUAGES[this.lang] || LANGUAGES.en;
        return table[key] ?? key;
    }

    textTable() {
        // 共享层 getText 契约：返回整张表，不是 (k)=>t(k)
        return LANGUAGES[this.lang] || LANGUAGES.en;
    }

    applyLanguage() {
        this.lang = getLang();
        // 与其余 20 个游戏页一致：语言切换要同步 <html lang>（无障碍 + 断词），
        // 漏掉时 verify-chrome 会提醒「zh 下 <html lang="en">」。
        document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
        const el = this.el;
        const put = (id, key) => { if (el[id]) el[id].textContent = this.t(key); };
        put('title', 'title');
        put('subtitle', 'subtitle');
        put('howto', 'howto');
        // 与 maxwell-demon / crystal-bloom / flame-verse / echo-cave 同款：图标 + 文字 span
        // （纯 textContent 会让模式按钮缺图标，且移动端热区掉到 41px）
        if (el['btn-levels']) el['btn-levels'].innerHTML = `${ICONS.play}<span class="btn-text">${this.t('playLevels')}</span>`;
        if (el['btn-daily']) el['btn-daily'].innerHTML = `${ICONS.calendar}<span class="btn-text">${this.t('playDaily')}</span>`;
        put('level-label', 'levelSelect');
        put('side-howto-title', 'sideHowTo');
        put('side-howto', 'howto');
        put('side-records-title', 'sideRecords');
        put('side-legend-title', 'legendTitle');
        put('hint', 'hint');
        put('btn-next', 'next');
        put('btn-replay', 'retry');
        put('btn-menu1', 'menu');
        put('btn-again', 'again');
        put('btn-copy', 'copyResult');
        put('btn-menu2', 'menu');
        put('lb-title', 'leaderboard');
        put('username-label', 'playerName');
        document.title = this.lang === 'zh'
            ? '涟漪双生 Ripple Duet — 波的干涉解谜'
            : 'Ripple Duet — Wave Interference Puzzle';
        this.renderLegend();
        this.renderRecords();
        this.updateHud();
        if (el['daily-best']) el['daily-best'].textContent = `${this.t('bestToday')}: —`;
    }

    bindEvents() {
        const el = this.el;
        this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
        window.addEventListener('pointerup', () => this.onPointerUp());
        this.canvas.addEventListener('pointercancel', () => this.onPointerUp());

        if (this.el['reset-btn']) this.el['reset-btn'].addEventListener('click', () => this.restartLevel());
        if (el['btn-levels']) el['btn-levels'].addEventListener('click', () => this.startLevel(0));
        if (el['btn-daily']) el['btn-daily'].addEventListener('click', () => this.startDaily());
        if (el['btn-next']) el['btn-next'].addEventListener('click', () => this.nextLevel());
        if (el['btn-replay']) el['btn-replay'].addEventListener('click', () => this.restartLevel());
        if (el['btn-menu1']) el['btn-menu1'].addEventListener('click', () => this.toMenu());
        if (el['btn-menu2']) el['btn-menu2'].addEventListener('click', () => this.toMenu());
        if (el['btn-again']) el['btn-again'].addEventListener('click', () => this.startDaily());
        if (el['btn-copy']) el['btn-copy'].addEventListener('click', () => this.copyResult());
        if (el['username']) {
            el['username'].value = ensurePlayerName();
            el['username'].addEventListener('change', () => setPlayerName(el['username'].value.trim()));
        }

        const muteBtns = [el['mute-btn'], el['start-mute']].filter(Boolean);
        muteBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                setMuted(!getMuted());
                this.syncMuteIcons();
            });
        });
        this.syncMuteIcons();

        window.addEventListener('keydown', (e) => {
            if (e.target instanceof Element && e.target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"]')) return;
            if (this.state !== 'playing' || this.isPaused) return;
            if ((e.key === 'q' || e.key === 'Q') && !e.repeat) {
                if (this.place.length) this.sel = (this.sel + 1) % this.place.length;
                Sfx.click();
            } else if (e.key === 'ArrowLeft') { e.preventDefault(); this.turnPhase(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); this.turnPhase(1); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pressFreeze(); }
            else if (e.key === 'r' || e.key === 'R') { this.restartLevel(); }
        });

        window.addEventListener('resize', () => this.resize());
        // ⚠️ 接入了 desktop 纵向预算就必须听这个事件：bindFrame 写出 --frame-chrome
        // 会改变舞台 CSS 宽，只有跟着重算画布后端缓冲才不会比 CSS 宽小几像素
        // （desktop-frame 的「画布糊 attrW 654 < clientW 660」就是这个）。
        window.addEventListener('game-frame:changed', () => this.resize());
        window.addEventListener('site-settings:changed', () => {
            this.applyLanguage();
            this.syncMuteIcons();
        });
    }

    syncMuteIcons() {
        const on = !getMuted();
        const svg = on ? ICONS.soundOn : ICONS.soundOff;
        [this.el['mute-btn'], this.el['start-mute']].forEach((btn) => {
            if (btn) btn.innerHTML = svg;
        });
    }

    pauseQuiet() { this.isPaused = true; }
    resumeQuiet() { this.isPaused = false; }
    isRunning() { return this.state === 'playing' && !this.isPaused; }
}

/** 把无限长直线裁进矩形（与判定的镜像解保持视觉一致） */
function clipLineToBox(w, box) {
    const x1 = w.x1, y1 = w.y1, x2 = w.x2, y2 = w.y2;
    const dx = x2 - x1, dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - box.x, box.x + box.w - x1, y1 - box.y, box.y + box.h - y1];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0) return null;
        } else {
            const t = q[i] / p[i];
            if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
            else { if (t < t0) return null; if (t < t1) t1 = t; }
        }
    }
    return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

/* ────────────────────────── 启动 ────────────────────────── */

onReady(() => {
    const game = new RippleDuetGame();
    window.rdGame = game;

    // bindFrame 只认 logicalWidth / extraChrome（传 canvas/ratio/onResize 会被静默忽略）
    bindFrame({ logicalWidth: W });
    // ⚠️ renderMoreGames 必须传容器 + exclude（不传就静默返回 0，侧栏「更多游戏」是空的且无任何报错）
    const more = document.getElementById('rdSideMore');
    if (more) renderMoreGames(more, { exclude: 'ripple-duet.html' });

    window.rdDrawer = createStatsDrawer({
        idPrefix: 'rd',
        getGame: () => game,
        onPause: () => game.pauseQuiet(),
        onResume: () => game.resumeQuiet(),
        isBusy: () => game.isRunning(),
        ICONS,
        getText: () => game.textTable(),
    });
    // ⚠️ 必须显式 init()：① 给 stats 钮补 title/aria-label（verify-chrome 会因为
    //    缺 title 报红）；② 打上 body.has-stats-drawer —— layout.css 靠它决定窄屏
    //    是否隐藏侧栏，漏掉会让舞台宽算错 ⇒ canvas 缓冲比 CSS 宽小几像素变糊。
    window.rdDrawer.init();

    bindChrome({
        self: 'ripple-duet.html',
        owns: ['more', 'home'],
        getText: () => game.textTable(),
    });
});
