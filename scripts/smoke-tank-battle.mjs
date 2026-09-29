// Tank Battle production-art smoke: landscape shell, art readiness, controls, and canvas render.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8895';
const fails = [];
const fail = message => fails.push(message);

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [...LAUNCH_ARGS, '--auto-accept-this-tab-capture'],
});

const cases = [
    { name: 'desktop', width: 1280, height: 720, isMobile: false, hasTouch: false },
    { name: 'landscape-small', width: 844, height: 390, isMobile: true, hasTouch: true },
    { name: 'landscape-wide', width: 932, height: 430, isMobile: true, hasTouch: true },
];

for (const testCase of cases) {
    const page = await browser.newPage();
    await page.setViewport({
        width: testCase.width,
        height: testCase.height,
        isMobile: testCase.isMobile,
        hasTouch: testCase.hasTouch,
    });
    const errs = [];
    page.on('pageerror', error => errs.push(String(error.message || error).split('\n')[0]));
    await page.evaluateOnNewDocument(() => {
        try { localStorage.setItem('site_lang', 'zh'); } catch { /* ignore */ }
    });
    await page.goto(BASE + '/tank-battle.html', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 900));

    const snap = await page.evaluate(() => {
        const canvas = document.getElementById('gameCanvas');
        const rect = canvas?.getBoundingClientRect();
        const container = document.getElementById('gameContainer');
        const containerRect = container?.getBoundingClientRect();
        const instance = window.tankBattleInstance;
        const dpad = document.getElementById('dpad')?.getBoundingClientRect();
        const fire = document.getElementById('btnFire')?.getBoundingClientRect();
        const pixels = canvas?.getContext('2d')?.getImageData(2, 2, 1, 1).data || [];
        return {
            mainTag: !!document.querySelector('main.tb-main'),
            h1: document.querySelector('h1.sr-only')?.textContent || '',
            canvasSize: canvas ? canvas.width + 'x' + canvas.height : 'missing',
            canvasVisible: !!rect && rect.width > 100 && rect.height > 100,
            containerCentered: !!containerRect
                && Math.abs((window.innerWidth - containerRect.width) / 2 - containerRect.left) < 60,
            artState: container?.dataset.tbArtState || 'missing',
            loaderReady: instance?.art?.ready === true,
            noLegacyPhone: !document.querySelector('.phone-frame, .phone-screen'),
            orientationArt: !!document.querySelector('.rotate-device-illustration[src*="rotate-device.svg"]'),
            hud: !!document.getElementById('gameInfo'),
            virtualControllerVisible: (() => {
                const el = document.getElementById('virtualController');
                return el ? getComputedStyle(el).display !== 'none' : false;
            })(),
            dpadHitArea: !!dpad && dpad.width >= 100 && dpad.height >= 100,
            fireHitArea: !!fire && fire.width >= 60 && fire.height >= 60,
            pixels: [...pixels],
            bodyFlex: getComputedStyle(document.body).display === 'flex',
            layoutVarApplied: getComputedStyle(document.documentElement)
                .getPropertyValue('--frame-max').trim() !== '',
        };
    });

    if (errs.length) fail(testCase.name + ': page errors: ' + errs.join(' | '));
    if (snap.canvasSize !== '800x600') fail(testCase.name + ': canvas size ' + snap.canvasSize);
    if (!snap.canvasVisible) fail(testCase.name + ': canvas is not visible');
    if (!snap.containerCentered) fail(testCase.name + ': game container is not centered');
    if (snap.artState !== 'ready' || !snap.loaderReady) fail(testCase.name + ': production art state is ' + snap.artState);
    if (!snap.noLegacyPhone || !snap.orientationArt) fail(testCase.name + ': authored orientation art is not wired');
    if (!snap.hud) fail(testCase.name + ': HUD is missing');
    if (!snap.dpadHitArea || !snap.fireHitArea) fail(testCase.name + ': virtual-controller hit area shrank');
    if (testCase.isMobile && !snap.virtualControllerVisible) fail(testCase.name + ': virtual controller is hidden');
    if (!testCase.isMobile && snap.virtualControllerVisible) fail(testCase.name + ': desktop virtual controller is visible');
    if (!snap.bodyFlex) fail(testCase.name + ': body flex centering was lost');
    if (!snap.layoutVarApplied) fail(testCase.name + ': layout.css variable is missing');
    if (snap.pixels.length !== 4 || snap.pixels.every(value => value === 0)) fail(testCase.name + ': canvas appears blank');

    await page.close();
}

await browser.close();
if (fails.length) {
    console.error('✗ smoke-tank-battle');
    for (const message of fails) console.error('  - ' + message);
    process.exit(1);
}
console.log('smoke-tank-battle：production art + desktop/landscape controls + canvas 全部通过 ✅');
