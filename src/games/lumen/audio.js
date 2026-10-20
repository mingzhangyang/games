/** Lumen 音效：全部走共享 WebAudio 引擎（尊重 site_muted）。 */
import { createSfxEngine } from '../../platform/game-sfx.js';

const sfxEngine = createSfxEngine();

export const Sfx = {
    click() { sfxEngine.tone({ freq: 640, type: 'square', dur: 0.05, vol: 0.06 }); },
    /** 镜面翻转：干净的机械「嗒」 */
    flip() {
        sfxEngine.tone({ freq: 520, slideTo: 760, type: 'triangle', dur: 0.07, vol: 0.12 });
    },
    /** 暗晶被照到：低沉的嗡鸣 */
    shadow() {
        sfxEngine.tone({ freq: 196, slideTo: 140, type: 'sawtooth', dur: 0.22, vol: 0.07 });
    },
    /** 新水晶点亮：上扬双音 */
    crystal() {
        sfxEngine.tone({ freq: 880, type: 'sine', dur: 0.12, vol: 0.12 });
        sfxEngine.tone({ freq: 1320, type: 'sine', dur: 0.16, vol: 0.1, delay: 0.07 });
    },
    win() {
        [523, 659, 784, 1046].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'triangle', dur: 0.15, vol: 0.13, delay: i * 0.08 });
        });
    },
    star3() {
        [784, 988, 1175].forEach((f, i) => {
            sfxEngine.tone({ freq: f, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.3 + i * 0.1 });
        });
    },
};
