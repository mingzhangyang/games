import puppeteer from 'puppeteer-core';

const DEFAULT_VIEWPORTS = {
    desktop: { width: 1280, height: 900, deviceScaleFactor: 1 },
    mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
};

export async function runCssLayerBehaviorBatch({
    name,
    base,
    cases,
    chromePath,
    launchArgs,
    viewports = DEFAULT_VIEWPORTS,
}) {
    const failures = [];
    let passes = 0;
    const check = (condition, label, detail = '') => {
        if (condition) {
            passes++;
            console.log(`  ✓ ${label}${detail ? ` (${detail})` : ''}`);
            return;
        }
        const message = `${label}${detail ? ` — ${detail}` : ''}`;
        failures.push(message);
        console.log(`  ✗ ${message}`);
    };

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: launchArgs,
    });
    const page = await browser.newPage();
    let pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.message || error).split('\n')[0]));

    const navigate = async (testCase, viewport, themePreference, expectedTheme = themePreference) => {
        await page.setViewport(viewport);
        pageErrors = [];
        await page.evaluate(value => localStorage.setItem('site_theme', value), themePreference);
        await page.goto(`${base}/${testCase.href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(
            expected => document.documentElement.getAttribute('data-theme') === expected,
            { timeout: 5000 },
            expectedTheme,
        );
        if (testCase.stage) {
            await page.waitForFunction(selector => {
                const el = document.querySelector(selector);
                if (!el) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }, { timeout: 5000 }, testCase.stage);
        }
        if (testCase.ready) {
            await testCase.ready(page, { viewport, theme });
        }
    };

    const snapshot = testCase => page.evaluate(config => {
        const rectOf = selector => {
            const el = document.querySelector(selector);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height,
                display: getComputedStyle(el).display,
            };
        };
        const rootStyle = getComputedStyle(document.documentElement);
        const shell = config.shell ? document.querySelector(config.shell) : null;
        const shellStyle = shell ? getComputedStyle(shell) : null;
        const bodyStyle = getComputedStyle(document.body);
        const selectors = [...new Set([
            ...(config.probes || []),
            config.shell,
            config.stage,
        ].filter(Boolean))];

        return {
            theme: document.documentElement.getAttribute('data-theme'),
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
            bodyBackground: `${bodyStyle.backgroundColor}|${bodyStyle.backgroundImage}`,
            themeVar: rootStyle.getPropertyValue(config.themeVar).trim(),
            frame: shellStyle ? {
                max: shellStyle.getPropertyValue('--frame-max').trim(),
                wide: shellStyle.getPropertyValue('--frame-max-wide').trim(),
                stage: shellStyle.getPropertyValue('--frame-stage').trim(),
            } : null,
            rects: Object.fromEntries(selectors.map(selector => [selector, rectOf(selector)])),
        };
    }, testCase);

    const assertGeometry = (testCase, snap, viewportName) => {
        const overflowAllowance = typeof testCase.horizontalOverflowAllowance === 'function'
            ? testCase.horizontalOverflowAllowance(viewportName)
            : (testCase.horizontalOverflowAllowance ?? 1);
        check(
            snap.scrollWidth <= snap.viewportWidth + overflowAllowance,
            `${testCase.id} ${viewportName}: no horizontal overflow`,
            `scroll=${snap.scrollWidth}, viewport=${snap.viewportWidth}, allowance=${overflowAllowance}`,
        );
        for (const [selector, rect] of Object.entries(snap.rects)) {
            check(!!rect, `${testCase.id} ${viewportName}: ${selector} exists`);
            if (!rect) continue;
            check(
                rect.width > 0 && rect.height > 0 && rect.display !== 'none',
                `${testCase.id} ${viewportName}: ${selector} has visible geometry`,
                `${Math.round(rect.width)}×${Math.round(rect.height)} display=${rect.display}`,
            );
            check(
                rect.left >= -1 && rect.right <= snap.viewportWidth + 1,
                `${testCase.id} ${viewportName}: ${selector} stays inside viewport`,
                `left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)}`,
            );
        }
    };

    const assertFrame = (testCase, snap, viewportName) => {
        if (!testCase.frame) return;
        const labels = { max: '--frame-max', wide: '--frame-max-wide', stage: '--frame-stage' };
        for (const [key, expected] of Object.entries(testCase.frame)) {
            check(
                snap.frame?.[key] === expected,
                `${testCase.id} ${viewportName}: ${labels[key]} keeps page contract`,
                `got ${snap.frame?.[key] || 'missing'}, want ${expected}`,
            );
        }
    };

    const assertCustom = async (testCase, snap, viewportName, viewport) => {
        if (!testCase.validate) return;
        await testCase.validate({
            page,
            snapshot: snap,
            viewportName,
            viewport,
            check,
        });
    };

    const flushPageErrors = () => page.evaluate(
        () => new Promise(resolve => requestAnimationFrame(() => resolve())),
    );

    try {
        await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });

        for (const testCase of cases) {
            console.log(`\n=== ${name} ${testCase.id} ===`);

            await navigate(testCase, viewports.desktop, 'dark');
            const dark = await snapshot(testCase);
            check(dark.theme === 'dark', `${testCase.id}: dark preference resolves to dark`, dark.theme);
            check(Boolean(dark.themeVar), `${testCase.id}: ${testCase.themeVar} is populated`);
            check(
                dark.bodyBackground !== 'rgba(0, 0, 0, 0)|none',
                `${testCase.id}: dark page background is styled`,
            );
            assertGeometry(testCase, dark, 'desktop');
            assertFrame(testCase, dark, 'desktop');
            await assertCustom(testCase, dark, 'desktop', viewports.desktop);
            check(pageErrors.length === 0, `${testCase.id} desktop dark: no pageerror`, pageErrors.join(' | '));

            // Navigation and interaction errors are separate evidence. Clear only after
            // the navigation assertion so a handler that mutates expected DOM and then
            // throws cannot be hidden by the next navigate() resetting pageErrors.
            pageErrors = [];
            let interactionOk = false;
            try {
                interactionOk = await testCase.interact(page);
                // Give browser error events one rendering turn to cross the CDP boundary.
                await flushPageErrors();
            } catch (error) {
                check(false, `${testCase.id}: interaction probe succeeds`, error.message);
            }
            if (interactionOk) check(true, `${testCase.id}: interaction probe succeeds`);
            else if (!failures.some(item => item.startsWith(`${testCase.id}: interaction probe succeeds`))) {
                check(false, `${testCase.id}: interaction probe succeeds`);
            }
            check(
                pageErrors.length === 0,
                `${testCase.id} interaction: no pageerror`,
                pageErrors.join(' | '),
            );

            if (testCase.darkOnly === true) {
                await navigate(testCase, viewports.desktop, 'light', 'dark');
                const forcedDark = await snapshot(testCase);
                check(
                    forcedDark.theme === 'dark',
                    `${testCase.id}: light preference is forced back to dark on dark-only page`,
                    forcedDark.theme,
                );
                check(
                    forcedDark.themeVar === dark.themeVar,
                    `${testCase.id}: dark-only theme variable stays identical under light preference`,
                    `dark=${dark.themeVar}, light-pref=${forcedDark.themeVar}`,
                );
                check(
                    forcedDark.bodyBackground === dark.bodyBackground,
                    `${testCase.id}: dark-only background stays identical under light preference`,
                );
                assertGeometry(testCase, forcedDark, 'desktop-light-pref-dark-only');
                assertFrame(testCase, forcedDark, 'desktop-light-pref-dark-only');
                await assertCustom(testCase, forcedDark, 'desktop-light-pref-dark-only', viewports.desktop);
                check(
                    pageErrors.length === 0,
                    `${testCase.id} desktop light preference/dark-only: no pageerror`,
                    pageErrors.join(' | '),
                );
            } else if (testCase.lightTheme !== false) {
                await navigate(testCase, viewports.desktop, 'light');
                const light = await snapshot(testCase);
                check(light.theme === 'light', `${testCase.id}: light preference resolves to light`, light.theme);
                check(Boolean(light.themeVar), `${testCase.id}: light ${testCase.themeVar} is populated`);
                check(
                    light.themeVar !== dark.themeVar,
                    `${testCase.id}: page/theme variable changes between dark and light`,
                );
                check(
                    light.bodyBackground !== dark.bodyBackground,
                    `${testCase.id}: computed page background changes in light mode`,
                );
                assertGeometry(testCase, light, 'desktop-light');
                assertFrame(testCase, light, 'desktop-light');
                await assertCustom(testCase, light, 'desktop-light', viewports.desktop);
                check(pageErrors.length === 0, `${testCase.id} desktop light: no pageerror`, pageErrors.join(' | '));

            }

            await navigate(testCase, viewports.mobile, 'dark');
            const mobile = await snapshot(testCase);
            assertGeometry(testCase, mobile, 'mobile');
            assertFrame(testCase, mobile, 'mobile');
            await assertCustom(testCase, mobile, 'mobile', viewports.mobile);
            check(pageErrors.length === 0, `${testCase.id} mobile dark: no pageerror`, pageErrors.join(' | '));

            if (testCase.mobileInteract) {
                pageErrors = [];
                let mobileInteractionOk = false;
                try {
                    mobileInteractionOk = await testCase.mobileInteract(page);
                    if (testCase.ready) {
                        await testCase.ready(page, { viewport: viewports.mobile, theme: 'dark' });
                    }
                    // Match the desktop probe: let late CDP pageerror events arrive
                    // before the mobile gameplay assertion can report a false pass.
                    await flushPageErrors();
                } catch (error) {
                    check(false, `${testCase.id}: mobile gameplay probe succeeds`, error.message);
                }
                if (mobileInteractionOk) {
                    check(true, `${testCase.id}: mobile gameplay probe succeeds`);
                    const mobileGameplay = await snapshot(testCase);
                    assertGeometry(testCase, mobileGameplay, 'mobile-gameplay');
                    assertFrame(testCase, mobileGameplay, 'mobile-gameplay');
                    await assertCustom(testCase, mobileGameplay, 'mobile-gameplay', viewports.mobile);
                } else if (!failures.some(item => item.startsWith(`${testCase.id}: mobile gameplay probe succeeds`))) {
                    check(false, `${testCase.id}: mobile gameplay probe succeeds`);
                }
                check(
                    pageErrors.length === 0,
                    `${testCase.id} mobile gameplay: no pageerror`,
                    pageErrors.join(' | '),
                );
            }
        }
    } finally {
        await browser.close();
    }

    console.log(`\n${name}: ${passes} checks passed, ${failures.length} failed`);
    if (failures.length) {
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exit(1);
    }
    console.log(`${name} source/dist behavioral contract passed ✅`);
}
