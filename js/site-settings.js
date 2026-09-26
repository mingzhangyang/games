/**
 * 全站统一设置 — 语言、声音与主题偏好的唯一读写入口
 *
 * 规范键：site_lang（'en' | 'zh'）、site_muted（'1' | '0'）、
 * site_theme（'dark' | 'light' | 'system'，缺省深色；见 docs/contracts/theme.md）。
 * 首次读取时若规范键缺失，按探测链从各游戏历史键迁移（回填规范键，
 * 旧键保留不删，可随时回滚）；两者都缺时按浏览器语言兜底。
 *
 * 写入时派发 `site-settings:changed` CustomEvent（同页监听）；
 * 跨标签页由浏览器原生 storage 事件自然同步。
 */

const LANG_KEY = 'site_lang';
const MUTED_KEY = 'site_muted';
const THEME_KEY = 'site_theme';
const THEME_PREFS = ['dark', 'light', 'system'];

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
    // 同步 <html lang>：切语言按钮统一进顶栏后，这是唯一还能顺手做对的地方。
    // （此前只有 gd/ms/tetris 在自己的 applyLanguage 里改，其余 8 页读屏标签
    //   永远停在上一次页面加载时的语言。）各页重复写同一个值是无害的幂等操作。
    syncDocumentLang(v);
    emitChanged();
    return v;
}

function syncDocumentLang(v) {
    try {
        document.documentElement.lang = v === 'zh' ? 'zh-CN' : 'en';
    } catch (e) {
        // document 不可用（非浏览器环境）时静默跳过
    }
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

/**
 * 主题偏好：'dark' | 'light' | 'system'。缺失或非法值一律视为 'dark'（默认深色）。
 * 这里只管偏好；「这一页实际显示什么」由 public/theme-boot.js 结合页面是否支持浅色决定，
 * 运行时从 js/theme.js 的 getTheme() 读。
 */
export function getThemePref() {
    const saved = read(THEME_KEY);
    return THEME_PREFS.includes(saved) ? saved : 'dark';
}

/** 只在首页调用（游戏页对 site_theme 只读不写，见 theme.md §1） */
export function setThemePref(pref) {
    const v = THEME_PREFS.includes(pref) ? pref : 'dark';
    write(THEME_KEY, v);
    emitChanged();
    return v;
}
