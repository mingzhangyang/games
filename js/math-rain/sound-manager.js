/**
 * 音效管理器 - 处理游戏音效和背景音乐
 * Sound Manager for Math Rain Game
 */

class SoundManager {
    constructor() {
        this.sounds = new Map();
        this.isEnabled = true;
        this.masterVolume = 0.7;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.6;
        
        // Web Audio API 上下文
        this.audioContext = null;
        this.gainNode = null;
        
        // 背景音乐相关
        this.currentMusic = null;
        this.musicGainNode = null;
        
        // 音效缓存
        this.audioBuffers = new Map();
        
        // 音效配置
        this.soundConfig = {
            correct: {
                frequency: 523.25, // C5
                duration: 0.3,
                type: 'sine',
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.2 }
            },
            incorrect: {
                frequency: 220, // A3
                duration: 0.4,
                type: 'sawtooth',
                envelope: { attack: 0, decay: 0.05, sustain: 0.1, release: 0.35 }
            },
            combo: {
                frequencies: [523.25, 659.25, 783.99], // C5, E5, G5 和弦
                duration: 0.5,
                type: 'sine',
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3 }
            },
            targetChange: {
                frequencies: [440, 554.37, 659.25], // A4, C#5, E5 上行和弦
                duration: 0.6,
                type: 'sine',
                envelope: { attack: 0.02, decay: 0.15, sustain: 0.3, release: 0.25 }
            },
            gameOver: {
                frequency: 196, // G3
                duration: 1.0,
                type: 'triangle',
                envelope: { attack: 0.1, decay: 0.3, sustain: 0.2, release: 0.6 }
            },
            levelUp: {
                frequencies: [261.63, 329.63, 392, 523.25], // C4, E4, G4, C5 琶音
                duration: 0.8,
                type: 'sine',
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 }
            },
            click: {
                frequency: 800,
                duration: 0.1,
                type: 'square',
                envelope: { attack: 0, decay: 0.05, sustain: 0, release: 0.05 }
            }
        };
        
        this.init();
    }

    /**
     * 初始化音频系统
     */
    async init() {
        try {
            // 创建 Web Audio API 上下文
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 创建主增益节点
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = this.masterVolume;
            
            // 创建音乐增益节点
            this.musicGainNode = this.audioContext.createGain();
            this.musicGainNode.connect(this.audioContext.destination);
            this.musicGainNode.gain.value = this.musicVolume;
            

        } catch (error) {

            this.audioContext = null;
        }
    }

    /**
     * 确保音频上下文已激活（需要用户交互）
     */
    async ensureAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
    
            } catch (error) {
    
            }
        }
    }

    /**
     * 播放音效
     * @param {string} soundName - 音效名称
     * @param {Object} options - 播放选项
     */
    async playSound(soundName, options = {}) {
        if (!this.isEnabled || !this.audioContext) return;
        
        await this.ensureAudioContext();
        
        const config = this.soundConfig[soundName];
        if (!config) {

            return;
        }

        try {
            if (config.frequencies && Array.isArray(config.frequencies)) {
                // 播放和弦或琶音
                this.playChord(config, options);
            } else {
                // 播放单音
                this.playTone(config, options);
            }
        } catch (error) {

        }
    }

    /**
     * 播放单音
     */
    playTone(config, options = {}) {
        const frequency = options.frequency || config.frequency;
        const duration = options.duration || config.duration;
        const volume = (options.volume || this.sfxVolume) * this.masterVolume;
        
        // 验证参数有效性
        if (!isFinite(frequency) || frequency <= 0) {

            return;
        }
        if (!isFinite(duration) || duration <= 0) {

            return;
        }
        if (!isFinite(volume) || volume < 0) {

            return;
        }
        
        // 创建振荡器
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // 连接节点
        oscillator.connect(gainNode);
        gainNode.connect(this.gainNode);
        
        // 设置振荡器参数
        oscillator.type = config.type || 'sine';
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        
        // 设置音量包络
        const now = this.audioContext.currentTime;
        const envelope = config.envelope;
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + envelope.attack);
        gainNode.gain.linearRampToValueAtTime(volume * envelope.sustain, now + envelope.attack + envelope.decay);
        gainNode.gain.setValueAtTime(volume * envelope.sustain, now + duration - envelope.release);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);
        
        // 播放
        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    /**
     * 播放和弦或琶音
     */
    playChord(config, options = {}) {
        // 使用传入的频率数组，如果没有则使用配置中的
        const frequencies = options.frequencies || config.frequencies;
        const isArpeggio = options.arpeggio || false;
        
        frequencies.forEach((frequency, index) => {
            // 验证频率值是否有效
            if (!isFinite(frequency) || frequency <= 0) {
    
                return;
            }
            
            const delay = isArpeggio ? index * 0.1 : 0;
            
            // 使用 requestAnimationFrame 进行更精确的时间控制
            const playTime = Date.now() + (delay * 1000);
            const delayedPlay = () => {
                if (Date.now() >= playTime) {
                    this.playTone({
                        ...config,
                        frequency: frequency
                    }, options);
                } else {
                    requestAnimationFrame(delayedPlay);
                }
            };
            requestAnimationFrame(delayedPlay);
        });
    }

    /**
     * 播放正确音效
     */
    playCorrect(options = {}) {
        this.playSound('correct', options);
    }

    /**
     * 播放错误音效
     */
    playIncorrect(options = {}) {
        this.playSound('incorrect', options);
    }

    /**
     * 播放连击音效
     */
    playCombo(comboCount, options = {}) {
        // 根据连击数调整音调
        const pitchMultiplier = 1 + (comboCount * 0.1);
        
        // 创建调整后的频率数组
        const adjustedFrequencies = this.soundConfig.combo.frequencies.map(f => f * pitchMultiplier);
        
        this.playSound('combo', {
            ...options,
            frequencies: adjustedFrequencies, // 使用正确的属性名
            arpeggio: comboCount > 5 // 连击大于5时播放琶音
        });
    }

    /**
     * 播放升级音效
     */
    playLevelUp(options = {}) {
        this.playSound('levelUp', {
            ...options,
            arpeggio: true
        });
    }

    /**
     * 播放游戏结束音效
     */
    playGameOver(options = {}) {
        this.playSound('gameOver', options);
    }

    /**
     * 播放点击音效
     */
    playClick(options = {}) {
        this.playSound('click', options);
    }

    /**
     * 播放目标数字改变音效
     */
    playTargetChange(options = {}) {
        this.playSound('targetChange', {
            ...options,
            arpeggio: true // 使用琶音效果
        });
    }

    /**
     * 通用播放方法（别名）
     */
    play(soundName, options = {}) {
        // 检查是否有专门的方法
        const methodName = 'play' + soundName.charAt(0).toUpperCase() + soundName.slice(1);
        if (typeof this[methodName] === 'function') {
            return this[methodName](options);
        }
        
        // 否则使用通用方法
        return this.playSound(soundName, options);
    }

    /**
     * 创建背景音乐（程序生成）
     */
    createBackgroundMusic() {
        if (!this.audioContext) return;

        // 创建简单的背景音乐循环
        const musicPatterns = [
            // 主旋律（C大调）
            [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25], // C4-C5
            // 和声
            [130.81, 146.83, 164.81, 174.61, 196, 220, 246.94, 261.63]  // C3-C4
        ];

        // 这里可以实现更复杂的背景音乐生成逻辑
        
    }

    /**
     * 播放背景音乐
     */
    playBackgroundMusic() {
        // 这里可以实现背景音乐播放逻辑
        // 为了简化，先预留接口

    }

    /**
     * 停止背景音乐
     */
    stopBackgroundMusic() {
        if (this.currentMusic) {
            // 停止当前播放的音乐
    
        }
    }

    /**
     * 设置主音量
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.gainNode) {
            this.gainNode.gain.setValueAtTime(this.masterVolume, this.audioContext.currentTime);
        }
    }

    /**
     * 设置音效音量
     */
    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }

    /**
     * 设置音效音量（别名方法）
     */
    setSoundVolume(volume) {
        this.setSfxVolume(volume);
    }

    /**
     * 设置音乐音量
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        if (this.musicGainNode) {
            this.musicGainNode.gain.setValueAtTime(this.musicVolume, this.audioContext.currentTime);
        }
    }

    /**
     * 启用/禁用音效
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        if (!enabled) {
            this.stopBackgroundMusic();
        }
    }

    /**
     * 获取音效状态
     */
    isAudioEnabled() {
        return this.isEnabled && !!this.audioContext;
    }

    /**
     * 预加载音效文件（如果使用外部音频文件）
     */
    async preloadSound(name, url) {
        if (!this.audioContext) return;

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.audioBuffers.set(name, audioBuffer);

        } catch (error) {

        }
    }

    /**
     * 播放预加载的音效文件
     */
    playPreloadedSound(name, options = {}) {
        if (!this.isEnabled || !this.audioContext) return;

        const buffer = this.audioBuffers.get(name);
        if (!buffer) {

            return;
        }

        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = buffer;
        source.connect(gainNode);
        gainNode.connect(this.gainNode);
        
        const volume = (options.volume || this.sfxVolume) * this.masterVolume;
        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        
        source.start(this.audioContext.currentTime + (options.delay || 0));
    }

    /**
     * 创建音效序列（用于复杂的音效组合）
     */
    playSequence(sequence, options = {}) {
        sequence.forEach((item, index) => {
            // 使用 requestAnimationFrame 提供更精确的时间控制
            const playTime = Date.now() + (item.delay || index * 100);
            const delayedSequencePlay = () => {
                if (Date.now() >= playTime) {
                    if (typeof item === 'string') {
                        this.playSound(item, options);
                    } else if (item.sound) {
                        this.playSound(item.sound, { ...options, ...item.options });
                    }
                } else {
                    requestAnimationFrame(delayedSequencePlay);
                }
            };
            requestAnimationFrame(delayedSequencePlay);
        });
    }

    /**
     * 获取音频上下文状态
     */
    getAudioContextState() {
        return this.audioContext ? this.audioContext.state : 'unavailable';
    }

    /**
     * 销毁音频资源
     */
    destroy() {
        this.stopBackgroundMusic();
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.sounds.clear();
        this.audioBuffers.clear();
    }
}

// ES模块导出
export default SoundManager;

// 兼容性导出（用于非模块环境）
if (typeof window !== 'undefined') {
    window.SoundManager = SoundManager;
}