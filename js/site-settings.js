/**
 * 全站统一设置 — 语言与声音开关的唯一读写入口
 *
 * 规范键：site_lang（'en' | 'zh'）、site_muted（'1' | '0'）。
 * 首次读取时若规范键缺失，按探测链从各游戏历史键迁移（回填规范键，
 * 旧键保留不删，可随时回滚）；两者都缺时按浏览器语言兜底。
 *
 * 写入时派发 `site-settings:changed` CustomEvent（同页监听）；
 * 跨标签页由浏览器原生 storage 事件自然同步。
 */

const LANG_KEY = 'site_lang';
const MUTED_KEY = 'site_muted';

// 各游戏历史键（迁移探测链，顺序无关，取到即用）
const LEGACY_LANG_KEYS = [
    'pm_lang', 'hs_lang', 'wd_lang', 'ms_lang',
    'rv_lang', 'td_lang', 'gd_lang', 'tankBattleLanguage'
];
const LEGACY_MUTED_KEYS = [
    'pm_muted', 'hs_muted', 'wd_muted', 'ms_muted',
    'rv_muted', 'td_muted', 'gd_muted'
];

function read(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // 隐私模式下存储不可用：静默降级为会话内默认值
    }
}

function emitChanged() {
    try {
        window.dispatchEvent(new CustomEvent('site-settings:changed'));
    } catch (e) {
        // ignore
    }
}

/** 语言偏好：'en' | 'zh' */
export function getLang() {
    const saved = read(LANG_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
    for (const key of LEGACY_LANG_KEYS) {
        const v = read(key);
        if (v === 'zh' || v === 'en') {
            write(LANG_KEY, v);
            return v;
        }
    }
    return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function setLang(lang) {
    const v = lang === 'zh' ? 'zh' : 'en';
    write(LANG_KEY, v);
    emitChanged();
    return v;
}

/** 声音开关：true = 已静音 */
export function getMuted() {
    const saved = read(MUTED_KEY);
    if (saved === '1' || saved === '0') return saved === '1';
    for (const key of LEGACY_MUTED_KEYS) {
        const v = read(key);
        if (v === '1' || v === '0') {
            write(MUTED_KEY, v);
            return v === '1';
        }
    }
    return false;
}

export function setMuted(muted) {
    write(MUTED_KEY, muted ? '1' : '0');
    emitChanged();
    return muted;
}
