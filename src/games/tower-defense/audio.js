import { getMuted, setMuted } from '../../platform/site-settings.js';
import { createSfxEngine } from '../../platform/game-sfx.js';

const sfxEngine = createSfxEngine();

export const Sfx = {
    get muted() { return getMuted(); },

    noise(duration, volume, delay = 0) {
        sfxEngine.noise({ dur: duration, vol: volume, delay, filterFreq: 0 });
    },

    place() { sfxEngine.tone({ freq: 300, slideTo: 520, type: 'triangle', dur: 0.12, vol: 0.16 }); },
    upgrade() {
        sfxEngine.tone({ freq: 520, type: 'triangle', dur: 0.09, vol: 0.14 });
        sfxEngine.tone({ freq: 780, type: 'triangle', dur: 0.11, vol: 0.12, delay: 0.07 });
    },
    sell() { sfxEngine.tone({ freq: 520, slideTo: 260, type: 'sine', dur: 0.14, vol: 0.13 }); },
    explode() { this.noise(0.22, 0.18); sfxEngine.tone({ freq: 140, slideTo: 60, type: 'sawtooth', dur: 0.2, vol: 0.16 }); },
    zap() { sfxEngine.tone({ freq: 900, slideTo: 240, type: 'sawtooth', dur: 0.1, vol: 0.08 }); },
    leak() {
        sfxEngine.tone({ freq: 220, slideTo: 90, type: 'square', dur: 0.25, vol: 0.18 });
        this.noise(0.15, 0.1);
    },
    bigDeath() { this.noise(0.35, 0.22); sfxEngine.tone({ freq: 180, slideTo: 50, type: 'sawtooth', dur: 0.3, vol: 0.18 }); },
    waveStart() {
        sfxEngine.tone({ freq: 392, type: 'triangle', dur: 0.12, vol: 0.15 });
        sfxEngine.tone({ freq: 523, type: 'triangle', dur: 0.14, vol: 0.15, delay: 0.12 });
    },
    win() {
        [523, 659, 784, 1046].forEach((freq, index) => {
            sfxEngine.tone({ freq, type: 'triangle', dur: 0.18, vol: 0.15, delay: index * 0.1 });
        });
    },
    lose() {
        sfxEngine.tone({ freq: 380, slideTo: 80, type: 'sawtooth', dur: 0.8, vol: 0.2 });
        this.noise(0.5, 0.18, 0.1);
    },
    click() { sfxEngine.tone({ freq: 640, type: 'square', dur: 0.05, vol: 0.06 }); },
    emp() {
        sfxEngine.tone({ freq: 1100, slideTo: 70, type: 'sawtooth', dur: 0.45, vol: 0.22 });
        this.noise(0.3, 0.15, 0.05);
    },
    overdrive() {
        [330, 440, 554, 659, 880].forEach((freq, index) => {
            sfxEngine.tone({ freq, type: 'triangle', dur: 0.11, vol: 0.11, delay: index * 0.05 });
        });
    },
    crit() { sfxEngine.tone({ freq: 1200, slideTo: 1600, type: 'sine', dur: 0.08, vol: 0.15 }); },
    freeze() {
        sfxEngine.tone({ freq: 880, slideTo: 440, type: 'sine', dur: 0.18, vol: 0.14 });
        this.noise(0.12, 0.08);
    },
    earlyWave() {
        [440, 554, 659, 880].forEach((freq, index) => {
            sfxEngine.tone({ freq, type: 'triangle', dur: 0.1, vol: 0.13, delay: index * 0.06 });
        });
    },
    shieldBreak() {
        sfxEngine.tone({ freq: 900, slideTo: 250, type: 'square', dur: 0.15, vol: 0.12 });
        this.noise(0.15, 0.1);
    },
    toggleMuted() {
        const muted = !getMuted();
        setMuted(muted);
        return muted;
    }
};
