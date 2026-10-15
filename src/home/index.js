// 首页组合根（docs/proposal-home-layout.md）：英语来自静态 HTML，卡片 / 分区 / 筛选条 / 新上线横排
// 都由 registry 生成；这里只按顺序接线。中文翻译的加载器由入口 js/index-page.js 注入。
import { onReady } from '../platform/boot.js';
import { getLang, setLang } from '../platform/site-settings.js';
import { bindChips } from './chips.js';
import { bindDailyHub, updateDailyHub } from './daily-hub.js';
import { bindFilter } from './filter.js';
import { applyLanguage, currentLang, rememberDefaults } from './i18n.js';
import { trimNewRow } from './new-row.js';
import { bindRecent } from './recent.js';
import { injectStructuredData, syncSocialMeta } from './seo.js';
import { bindThemeSwitch } from './theme-switch.js';

export function startHome({ loadZh }) {
    onReady(async () => {
        // 先记英文原文：JSON-LD 与语言切回英文都依赖它
        rememberDefaults();
        syncSocialMeta();
        injectStructuredData();
        trimNewRow();
        bindChips();
        bindFilter();
        bindRecent();
        await applyLanguage(getLang(), loadZh);
        const toggleLang = async () => {
            const next = currentLang() === 'zh' ? 'en' : 'zh';
            setLang(next);
            await applyLanguage(next, loadZh);
            updateDailyHub();
        };
        document.querySelectorAll('#lang-toggle, #footer-lang-toggle').forEach(btn => btn.addEventListener('click', toggleLang));
        bindThemeSwitch();
        bindDailyHub();
    });
}
