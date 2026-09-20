/**
 * 轻量音效引擎 — WebAudio 合成，无外部资源，跟随全站静音设置（site_muted）。
 *
 * 两个导出（P2-7 收敛）：
 *
 * 1) createSfxEngine({ masterGain }) —— 裸引擎。收敛各页自造的
 *    AudioContext 管理 / 静音联动 / 首交互预热 / tone+noise 合成样板。
 *    masterGain 默认 1（直连 destination 语义，与各页历史行为一致）。
 *      import { createSfxEngine } from './game-sfx.js';
 *      const sfx = createSfxEngine();
 *      sfx.tone({ freq: 440, type: 'square', dur: 0.05, vol: 0.15 });
 *      sfx.noise({ dur: 0.25, vol: 0.15, delay: 0 });
 *
 * 2) createSfx(tones) —— 表驱动音效集（tetris / gomoku / tank-battle 在用）。
 *      const sfx = createSfx({ move: { freq: 440, ... }, ... });
 *      sfx.play('move');
 *
 * 音色参数：
 *   freq    起始频率（Hz）；freqs 数组 = 和弦/琶音（配合 delay 依次发声，仅 createSfx）
 *   slideTo 结束频率（Hz），滑音
 *   type    'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'（噪声爆发，用于爆炸）
 *   dur     时长（秒）
 *   vol     音量 0~1（默认 0.3）
 *   delay   和弦中相邻音的间隔 / 单音延迟（秒）
 *   filterFreq / filterSlideTo   noise 低通滤波（默认 800Hz；0 = 旁路直连）
 */

import { getMuted } from './site-settings.js';

export function createSfxEngine({ masterGain = 1 } = {}) {
    let ctx = null;
    let master = null;

    function ensure() {
        if (!ctx) {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = masterGain;
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
        const g = ctx.createGain();
        const vol = t.vol || 0.3;
        if (t.filterFreq !== 0) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(t.filterFreq || 800, start);
            if (t.filterSlideTo) {
                filter.frequency.exponentialRampToValueAtTime(t.filterSlideTo, start + dur);
            }
            src.connect(filter);
            filter.connect(g);
        } else {
            src.connect(g); // 旁路：无滤波白噪（各页历史 noise 语义）
        }
        g.gain.setValueAtTime(vol, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + dur);
        g.connect(master);
        src.start(start);
        src.stop(start + dur + 0.02);
    }

    function playTone(start, t) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const freq = t.freq;
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

    return {
        ensure,
        prime,
        /** 单音。{ freq, slideTo?, type?, dur?, vol?, delay? } */
        tone(params) {
            if (getMuted()) return;
            if (!ensure()) return;
            playTone(ctx.currentTime + (params.delay || 0), params);
        },
        /** 噪声爆发。{ dur?, vol?, delay?, filterFreq?, filterSlideTo? } */
        noise(params) {
            if (getMuted()) return;
            if (!ensure()) return;
            playNoise(ctx.currentTime + (params.delay || 0), params);
        },
    };
}

/** 表驱动音效集（基于裸引擎；行为与收敛前逐字一致）。 */
export function createSfx(tones) {
    const eng = createSfxEngine({ masterGain: 0.5 });

    function play(name, overrides = {}) {
        const t = Object.assign({}, tones[name], overrides);
        if (!t || getMuted()) return;
        if (!eng.ensure()) return;

        if (t.type === 'noise') {
            eng.noise(t);
            return;
        }
        const freqs = t.freqs || [t.freq];
        if (!freqs) return;
        freqs.forEach((f, i) => {
            if (!isFinite(f) || f <= 0) return;
            eng.tone({ ...t, freq: f, delay: t.delay ? i * t.delay : 0 });
        });
    }

    return { play, ensure: eng.ensure, prime: eng.prime };
}
