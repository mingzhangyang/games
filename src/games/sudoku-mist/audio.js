/**
 * 雾隐九宫 — 声音（WebAudio 合成，走共享引擎 src/platform/game-sfx.js，跟随全站静音 site_muted）。
 * 声音只是第二通道：静音时浮字、红闪和读屏播报已经包含全部信息。
 */
import { createSfxEngine } from '../../platform/game-sfx.js';

// 五声音阶：档位越高落子音越亮
const PENTA = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];

export function createSudokuMistAudio(sfx = createSfxEngine({ masterGain: 0.55 })) {
    return {
        place(tier, intoFog) {
            const base = PENTA[Math.min(PENTA.length - 1, 1 + Math.max(tier, 0) * 1.5 | 0)];
            sfx.tone({ freq: base, type: 'triangle', dur: 0.18, vol: 0.12 });
            if (tier >= 3) sfx.tone({ freq: base * 1.5, type: 'sine', dur: 0.22, vol: 0.07, delay: 0.06 });
            // 揭雾：一口轻风
            if (intoFog) sfx.noise({ dur: 0.35, vol: 0.05, filterFreq: 2200, filterSlideTo: 500 });
        },
        luck() {
            sfx.tone({ freq: 330, slideTo: 310, type: 'sine', dur: 0.14, vol: 0.07 });
        },
        wrong() {
            sfx.tone({ freq: 180, slideTo: 120, type: 'square', dur: 0.2, vol: 0.06 });
        },
        hint() {
            sfx.tone({ freq: 659.25, type: 'sine', dur: 0.25, vol: 0.07 });
            sfx.tone({ freq: 987.77, type: 'sine', dur: 0.3, vol: 0.05, delay: 0.09 });
        },
        cleared() {
            [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
                sfx.tone({ freq, type: 'triangle', dur: 0.5, vol: 0.09, delay: i * 0.09 });
            });
            sfx.noise({ dur: 0.9, vol: 0.05, filterFreq: 1800, filterSlideTo: 300 });
        },
    };
}
