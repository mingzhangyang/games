/**
 * Word Daily 输入框占位文案校验：
 * 覆盖 UI 语言(en/zh) × 词库模式(单词/成语) × 字数(4/5/6)，断言 placeholder 不残留未展开的 {n}。
 * 走真实路径：localStorage site_lang + site-settings:changed 事件、setWordLength()、wd-btn-lang 点击。
 * 用法：node scripts/wd-placeholder-check.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const EXE = CHROME_PATH;

const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${BASE}/word-daily.html`, { waitUntil: 'networkidle2' }).catch(() => { });
await new Promise(r => setTimeout(r, 900));

const cases = await page.evaluate(async () => {
    const game = window.wordDailyGame;
    if (!game) return { error: 'window.wordDailyGame 不存在', keys: Object.keys(window).slice(0, 50) };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const out = [];
    const read = async (label) => {
        await sleep(80);
        out.push({
            label,
            lang: game.lang,
            mode: game.langMode,
            len: game.wordLen(),
            maxLength: game.el.input?.maxLength,
            placeholder: game.el.input?.placeholder,
            inputVisible: !game.el['input-row']?.classList.contains('hidden'),
        });
    };
    const setLang = async (lang) => {
        localStorage.setItem('site_lang', lang);
        window.dispatchEvent(new Event('site-settings:changed'));
        await sleep(60);
    };
    const setMode = async (langMode) => {
        if (game.langMode !== langMode) {
            game.el['btn-lang'].click();
            await sleep(80);
        }
    };

    for (const lang of ['en', 'zh']) {
        await setLang(lang);
        for (const langMode of ['en', 'zh']) {
            await setMode(langMode);
            for (const len of [4, 5, 6]) {
                if (langMode === 'en') game.setWordLength(len); else { game.startPractice(); }
                game.updateInputUi();
                await read(`ui=${lang} 库=${langMode} len=${len}`);
            }
        }
    }
    return out;
});

await browser.close();

if (cases.error) {
    console.log('ERROR', cases.error, cases.keys);
    process.exit(1);
}

let bad = 0;
for (const c of cases) {
    const leak = /\{n\}/.test(c.placeholder || '');
    if (leak) bad++;
    console.log(`${leak ? 'FAIL' : ' ok '}  ${c.label.padEnd(24)} max=${c.maxLength} vis=${String(c.inputVisible).padEnd(5)} "${c.placeholder}"`);
}
console.log(bad ? `\n未展开的 {n} 残留：${bad} 处` : '\n全部已展开，无 {n} 残留');
process.exit(bad ? 1 : 0);
