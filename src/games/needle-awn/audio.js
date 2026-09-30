import { getMuted } from '../../platform/site-settings.js';
import { createSfxEngine } from '../../platform/game-sfx.js';

const sfxEngine = createSfxEngine();

export const SoundEngine = {
    bgmInterval: null,
    pentatonic: [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25],

    init() {
        if (getMuted()) return null;
        return sfxEngine.ensure();
    },

    playTone(freq, duration, type = 'sine', vol = 0.12, endFreq = null) {
        sfxEngine.tone({ freq, dur: duration, type, vol, slideTo: endFreq || undefined });
    },

    clashPing() {
        // 银针碰撞：高频金属脆响 + 泛音
        const ctx = this.init();
        if (!ctx) return;
        this.playTone(1320, 0.28, 'triangle', 0.16, 2640);
        this.playTone(2640, 0.18, 'sine', 0.12);
        this.playTone(90, 0.12, 'triangle', 0.2, 45); // 顿击低音
    },

    awnBurst() {
        // 金麦芒爆：洪厚青铜钟鸣 + 暖音低破
        const ctx = this.init();
        if (!ctx) return;
        this.playTone(440, 0.35, 'triangle', 0.18, 220);
        this.playTone(880, 0.25, 'sine', 0.14);
        this.playTone(65, 0.22, 'sawtooth', 0.18, 30);
    },

    dashWhoosh() {
        // 破空急啸
        const ctx = this.init();
        if (!ctx) return;
        const now = ctx.currentTime;
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.16), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.8);
        }
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(2400, now + 0.08);
        filter.frequency.exponentialRampToValueAtTime(600, now + 0.16);
        filter.Q.value = 3.0;

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        src.buffer = buffer;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start(now);
    },

    stanceSwitch() {
        this.playTone(620, 0.08, 'sine', 0.09, 880);
    },

    hurt() {
        this.playTone(220, 0.25, 'sawtooth', 0.22, 60);
    },

    awaken() {
        const ctx = this.init();
        if (!ctx) return;
        // 琴音拂弦升调 + 爆鸣
        [329.63, 440, 493.88, 659.25, 880].forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 0.35, 'triangle', 0.15);
            }, idx * 45);
        });
        setTimeout(() => {
            this.playTone(60, 0.5, 'triangle', 0.25, 20);
        }, 220);
    },

    startAmbientMusic() {
        if (this.bgmInterval) return;
        this.bgmInterval = setInterval(() => {
            if (getMuted()) return;
            // 随机弹拨五声音阶
            if (Math.random() < 0.6) {
                const note = this.pentatonic[Math.floor(Math.random() * this.pentatonic.length)];
                this.playTone(note, 0.6, 'sine', 0.04);
            }
        }, 1200);
    },

    stopAmbientMusic() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
    }
};

