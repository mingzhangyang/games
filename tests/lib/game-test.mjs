import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './browser.mjs';

export async function launchGame(path, {
    base = process.env.TEST_BASE || 'http://127.0.0.1:8899',
    lang = 'en',
    viewport = { width: 1280, height: 900 },
    clearStorage = true,
    waitUntil = 'networkidle0',
    timeout = 45000,
} = {}) {
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: LAUNCH_ARGS,
    });
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', error => errors.push(String(error?.message || error).split('\n')[0]));
    page.on('console', msg => {
        if (msg.type() !== 'error') return;
        const url = (msg.location() && msg.location().url) || '';
        consoleErrors.push(`${msg.text().split('\n')[0]} @ ${url}`);
    });
    await page.evaluateOnNewDocument(({ lang, clearStorage }) => {
        try {
            if (clearStorage) localStorage.clear();
            localStorage.setItem('site_lang', lang);
        } catch {}
    }, { lang, clearStorage });
    await page.goto(`${base}/${path}`, { waitUntil, timeout });

    return {
        browser,
        page,
        errors,
        consoleErrors,
        async close() { await browser.close(); },
        async expectNoPageErrors() {
            if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
        },
        async snapshot(selector, fn = el => el.textContent) {
            return page.$eval(selector, fn);
        },
    };
}
