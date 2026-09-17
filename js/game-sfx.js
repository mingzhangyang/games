/**
 * 轻量音效工厂 — WebAudio 合成，无外部资源，跟随全站静音设置（site_muted）。
 *
 * 用法：
 *   import { createSfx } from './game-sfx.js';
 *   const sfx = createSfx({ move: { freq: 440, type: 'square', dur: 0.05, vol: 0.15 }, ... });
 *   sfx.play('move');
 *
 * 音色参数：
 *   freq    起始频率（Hz）；freqs 数组 = 和弦/琶音（配合 delay 依次发声）
 *   slideTo 结束频率（Hz），滑音
 *   type    'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'（噪声爆发，用于爆炸）
 *   dur     时长（秒）
 *   vol     音量 0~1（默认 0.3）
 *   delay   和弦中相邻音的间隔（秒）
 */

import { getMuted } from './site-settings.js';

export function createSfx(tones) {
    let ctx = null;
    let master = null;

    function ensure() {
        if (!ctx) {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = 0.5;
                master.connect(ctx.destination);
            } catch (e) {
                ctx = null;
                return null;
            }
        }
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        return ctx;
    }

    // 首次用户交互时预热音频上下文（移动端自动播放策略）
    function prime() {
        ensure();
    }
    if (typeof window !== 'undefined') {
        const opts = { passive: true };
        window.addEventListener('pointerdown', prime, opts);
        window.addEventListener('keydown', prime, opts);
        window.addEventListener('touchstart', prime, opts);
    }

    function playNoise(start, t) {
        const dur = t.dur || 0.3;
        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(t.filterFreq || 800, start);
        if (t.filterSlideTo) {
            filter.frequency.exponentialRampToValueAtTime(t.filterSlideTo, start + dur);
        }
        const g = ctx.createGain();
        const vol = t.vol || 0.3;
        g.gain.setValueAtTime(vol, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + dur);
        src.connect(filter);
        filter.connect(g);
        g.connect(master);
        src.start(start);
        src.stop(start + dur + 0.02);
    }

    function playTone(start, freq, t) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = t.type || 'sine';
        osc.frequency.setValueAtTime(freq, start);
        if (t.slideTo && t.slideTo > 0 && freq > 0) {
            osc.frequency.exponentialRampToValueAtTime(t.slideTo, start + (t.dur || 0.15));
        }
        const vol = t.vol || 0.3;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(vol, start + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, start + (t.dur || 0.15));
        osc.connect(g);
        g.connect(master);
        osc.start(start);
        osc.stop(start + (t.dur || 0.15) + 0.02);
    }

    function play(name, overrides = {}) {
        const t = Object.assign({}, tones[name], overrides);
        if (!t || getMuted()) return;
        if (!ensure()) return;

        const now = ctx.currentTime;
        if (t.type === 'noise') {
            playNoise(now, t);
            return;
        }
        const freqs = t.freqs || [t.freq];
        if (!freqs) return;
        freqs.forEach((f, i) => {
            if (!isFinite(f) || f <= 0) return;
            const start = now + (t.delay ? i * t.delay : 0);
            playTone(start, f, t);
        });
    }

    return { play, ensure, prime };
}
