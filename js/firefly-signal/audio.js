/**
 * 萤火信号 — 声音（WebAudio 合成，走共享引擎 js/game-sfx.js，跟随全站静音 site_muted）
 * ===================================================================================
 * 声音只是锦上添花：Audio OFF 时游戏信息必须完整（HUD / 扩散圆 / 环境照明都不依赖声音）。
 *   · 单只萤火虫闪光：无声
 *   · 局部同步（同一 tick 附近一群一起闪）：极轻的玻璃 / 钟声泛音，群越大音越高越亮
 *   · 同步度向上越过 60% / 75% / 90%：逐层加一个和声音
 *   · 全局同步：柔和的完整和弦（琶音展开）
 *   · 玩家干预：一声很低、很短的「信号」
 */
import { createSfxEngine } from '../game-sfx.js';

// D 大调五声音阶里取音：和谐、没有「错音」
const PENTA = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98, 1760];
const LAYERS = [
    { at: 0.6, freqs: [293.66] },
    { at: 0.75, freqs: [293.66, 440] },
    { at: 0.9, freqs: [293.66, 440, 587.33] },
];

export function createFireflyAudio() {
    const engine = createSfxEngine({ masterGain: 0.9 });
    let layer = 0;          // 已经响过的和声层数（只在向上越过时响）
    let lastBell = -1e9;

    function bell(freq, vol, delay = 0) {
        engine.tone({ freq, type: 'sine', dur: 1.6, vol, delay });
        engine.tone({ freq: freq * 2.01, type: 'sine', dur: 0.9, vol: vol * 0.35, delay });
    }

    return {
        prime() { engine.ensure(); },
        /** 每 tick 调一次：size = 本 tick 闪光数，total = 虫总数 */
        onFlashes(size, total, nowSec) {
            if (size < 3 || nowSec - lastBell < 0.35) return;
            lastBell = nowSec;
            const frac = Math.min(1, size / total);
            const idx = Math.min(PENTA.length - 1, Math.floor(frac * (PENTA.length - 1)));
            bell(PENTA[idx], 0.018 + frac * 0.035);
        },
        onHarmony(h) {
            while (layer < LAYERS.length && h >= LAYERS[layer].at) {
                LAYERS[layer].freqs.forEach((f, i) => engine.tone({ freq: f, type: 'triangle', dur: 2.2, vol: 0.03, delay: i * 0.09 }));
                layer++;
            }
            // 掉回去以后允许再次响起（但要跌得够多，避免在阈值附近来回抖）
            while (layer > 0 && h < LAYERS[layer - 1].at - 0.12) layer--;
        },
        intervene() {
            engine.tone({ freq: 196, slideTo: 247, type: 'sine', dur: 0.35, vol: 0.05 });
        },
        chord() {
            [293.66, 369.99, 440, 587.33, 739.99, 880].forEach((f, i) => {
                engine.tone({ freq: f, type: 'triangle', dur: 3.2, vol: 0.045, delay: i * 0.11 });
                engine.tone({ freq: f, type: 'sine', dur: 3.6, vol: 0.03, delay: i * 0.11 + 0.02 });
            });
        },
        groupFlash(n) {
            bell(PENTA[Math.min(PENTA.length - 1, 4 + n)], 0.05);
        },
        reset() { layer = 0; lastBell = -1e9; },
    };
}
