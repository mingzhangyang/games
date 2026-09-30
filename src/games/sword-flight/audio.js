import { getMuted } from '../../platform/site-settings.js';

export class SoundFX {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.windGain = null;
        this.windFilter = null;
        this.windSource = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.updateMute();

            this.setupWindAmbience();
            this.initialized = true;
        } catch (e) {
            console.warn('AudioContext not available:', e);
        }
    }

    updateMute() {
        if (!this.masterGain || !this.ctx) return;
        const muted = getMuted();
        this.masterGain.gain.setValueAtTime(muted ? 0 : 0.38, this.ctx.currentTime);
    }

    setupWindAmbience() {
        if (!this.ctx) return;
        // 生成粉红/白噪音循环缓冲区作为环境风声
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99 * b0 + white * 0.05;
            b1 = 0.95 * b1 + white * 0.1;
            b2 = 0.85 * b2 + white * 0.15;
            data[i] = (b0 + b1 + b2) * 0.3;
        }

        this.windSource = this.ctx.createBufferSource();
        this.windSource.buffer = buffer;
        this.windSource.loop = true;

        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.frequency.value = 400;

        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0.15;

        this.windSource.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.masterGain);

        try {
            this.windSource.start(0);
        } catch (e) {}
    }

    updateWind(speedRatio) {
        if (!this.initialized || !this.windFilter || !this.ctx) return;
        const now = this.ctx.currentTime;
        const targetFreq = 300 + speedRatio * 1800;
        const targetGain = 0.08 + speedRatio * 0.25;
        this.windFilter.frequency.setTargetAtTime(targetFreq, now, 0.1);
        this.windGain.gain.setTargetAtTime(targetGain, now, 0.1);
    }

    // 仙环五音合鸣 (宫商角徵羽循环)
    playRingChime(combo) {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        // 宫商角徵羽音符频率表 (C-D-E-G-A Pentatonic)
        const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];
        const noteFreq = scale[(combo - 1) % scale.length];

        const osc = this.ctx.createOscillator();
        const oscHarmonic = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(noteFreq, now);

        oscHarmonic.type = 'triangle';
        oscHarmonic.frequency.setValueAtTime(noteFreq * 2, now);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

        osc.connect(gain);
        oscHarmonic.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        oscHarmonic.start(now);
        osc.stop(now + 0.9);
        oscHarmonic.stop(now + 0.9);
    }

    // 破空疾刺 (龙吟剑鸣 + 啸音)
    playDash() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.35);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    // 伴生剑阵出鞘 (剑气波)
    playArrayWave() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        [587.33, 880.00, 1174.66].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.04);
            gain.gain.setValueAtTime(0.2, now + idx * 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.4);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now + idx * 0.04);
            osc.stop(now + idx * 0.04 + 0.4);
        });
    }

    // 绝技：万剑归宗 / 青莲剑歌 (巨钟震鸣 + 天籁和弦)
    playUltimate() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        // 洪钟低鸣
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(110, now);
        bassOsc.frequency.exponentialRampToValueAtTime(55, now + 1.2);
        bassGain.gain.setValueAtTime(0.6, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        bassOsc.connect(bassGain);
        bassGain.connect(this.masterGain);
        bassOsc.start(now);
        bassOsc.stop(now + 1.5);

        // 仙乐琶音 (C5, E5, G5, B5, C6)
        [523.25, 659.25, 783.99, 987.77, 1046.50].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            gain.gain.setValueAtTime(0.3, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 1.2);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 1.2);
        });
    }

    // 雷劫吸收 (轰鸣雷鸣)
    playThunderAbsorb() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    // 斩击碎石 / 妖禽消散
    playSlashHit() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    // 拾取灵石
    playGem() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    // 受到冲击受损
    playHurt() {
        if (!this.ctx || getMuted()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.35);
    }
}

export const SFX = new SoundFX();

