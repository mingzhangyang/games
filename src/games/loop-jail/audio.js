/**
 * 画牢 Loop Jail — 声音（WebAudio 合成，走共享引擎 src/platform/game-sfx.js，跟随全站静音 site_muted）
 * 声音只是反馈的第二通道：静音时画面上的闪光 / 飘字 / 红闪已经包含全部信息。
 */
import { createSfxEngine } from '../../platform/game-sfx.js';

// C 大调五声音阶：一笔抓得越多，琶音越长越高
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

export function createLoopJailAudio() {
    const sfx = createSfxEngine({ masterGain: 0.6 });
    let lastCharge = -1;

    return {
        prime() { sfx.ensure(); },
        capture(count) {
            if (count <= 0) {
                sfx.tone({ freq: 330, slideTo: 300, type: 'sine', dur: 0.12, vol: 0.06 });
                return;
            }
            const notes = Math.min(PENTA.length, 2 + count);
            for (let i = 0; i < notes; i++) {
                sfx.tone({ freq: PENTA[i], type: 'triangle', dur: 0.16, vol: 0.11, delay: i * 0.045 });
            }
        },
        bite() {
            sfx.noise({ dur: 0.18, vol: 0.12, filterFreq: 1400, filterSlideTo: 300 });
            sfx.tone({ freq: 240, slideTo: 120, type: 'sawtooth', dur: 0.16, vol: 0.05 });
        },
        shieldBlock() {
            sfx.tone({ freq: 880, slideTo: 1320, type: 'square', dur: 0.12, vol: 0.05 });
            sfx.noise({ dur: 0.1, vol: 0.06, filterFreq: 2400 });
        },
        hit() {
            sfx.tone({ freq: 196, slideTo: 82, type: 'square', dur: 0.26, vol: 0.08 });
            sfx.noise({ dur: 0.2, vol: 0.08, filterFreq: 600 });
        },
        split() {
            sfx.tone({ freq: 440, slideTo: 660, type: 'triangle', dur: 0.1, vol: 0.06, delay: 0.05 });
        },
        pickup(kind) {
            const base = kind === 'shield' ? 587.33 : kind === 'double' ? 659.25 : 523.25;
            sfx.tone({ freq: base, slideTo: base * 1.5, type: 'sine', dur: 0.14, vol: 0.1 });
            sfx.tone({ freq: base * 1.5, slideTo: base * 2, type: 'sine', dur: 0.16, vol: 0.08, delay: 0.08 });
        },
        charge(now) {
            // 同一时刻多只三角一起蓄力只响一次，避免嗡成一片
            if (now - lastCharge < 0.25) return;
            lastCharge = now;
            sfx.tone({ freq: 300, slideTo: 620, type: 'sine', dur: 0.3, vol: 0.025 });
        },
        inkEmpty() {
            sfx.tone({ freq: 210, slideTo: 170, type: 'triangle', dur: 0.12, vol: 0.07 });
        },
        waveStart() {
            sfx.tone({ freq: 392, slideTo: 523.25, type: 'triangle', dur: 0.22, vol: 0.07 });
        },
        waveClear() {
            [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
                sfx.tone({ freq, type: 'triangle', dur: 0.32, vol: 0.08, delay: i * 0.07 });
            });
        },
        gameOver() {
            sfx.tone({ freq: 392, slideTo: 130.81, type: 'sawtooth', dur: 0.7, vol: 0.06 });
            sfx.tone({ freq: 261.63, slideTo: 98, type: 'triangle', dur: 0.8, vol: 0.07, delay: 0.12 });
        },
        start() {
            sfx.tone({ freq: 392, slideTo: 784, type: 'triangle', dur: 0.2, vol: 0.08 });
        },
    };
}
