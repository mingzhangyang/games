// 页脚主题三档：全站唯一写 site_theme 的地方（docs/contracts/theme.md），首页声明支持浅色才显现。
import { getThemePref, setThemePref } from '../platform/site-settings.js';
import { supportsLight } from '../platform/theme.js';

export function bindThemeSwitch() {
    const box = document.getElementById('theme-switch');
    if (!box) return;
    box.hidden = !supportsLight();
    const buttons = [...box.querySelectorAll('[data-theme-pref]')];
    const sync = () => {
        const pref = getThemePref();
        buttons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.themePref === pref)));
    };
    buttons.forEach(btn => btn.addEventListener('click', () => { setThemePref(btn.dataset.themePref); sync(); }));
    window.addEventListener('storage', e => { if (!e.key || e.key === 'site_theme') sync(); });
    sync();
}
