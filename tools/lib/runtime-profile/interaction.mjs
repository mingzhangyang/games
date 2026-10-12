/**
 * PR #138: browser-native input scripts for opt-in performance sampling.
 * Read live state to choose inputs; NEVER alter game objects or failure rules.
 * Mobile uses trusted CDP touch events; desktop uses Puppeteer's keyboard/mouse.
 * Input is always released before opening the statistics drawer and on errors.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const touchPoint = (x, y) => ({ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 });

async function touch(client, type, positions) {
    await client.send('Input.dispatchTouchEvent', { type, touchPoints: positions });
}


/** Include viewport hit-testing in failed browser-input evidence, never silently green. */
async function diagnoseTouch(page, point, canvasId) {
    return page.evaluate(({ x, y, canvasId }) => {
        const el = document.elementFromPoint(x, y);
        const canvas = document.getElementById(canvasId);
        const r = canvas?.getBoundingClientRect();
        const v = window.visualViewport;
        const name = node => node ? { tag: node.tagName, id: node.id,
            className: typeof node.className === 'string' ? node.className : '' } : null;
        return {
            point: { x: Math.round(x), y: Math.round(y) },
            hit: name(el), canvas: name(canvas),
            canvasRect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
            viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY,
                visualWidth: v?.width, visualHeight: v?.height,
                offsetLeft: v?.offsetLeft, offsetTop: v?.offsetTop },
            game: { silkDragging: !!window.sdGame?.world?.dragging,
                needleJoyActive: !!window.gameEngine?.joy?.active },
        };
    }, { ...point, canvasId });
}

function silkAnchorSnapshot() {
    const game = window.sdGame;
    const anchor = game?.world?.ropes?.[0]?.particles?.[0];
    const rect = game?.canvas?.getBoundingClientRect();
    if (game?.state !== 'playing' || !anchor || !rect?.width || !rect?.height) {
        throw new Error('Silk Dew S1 anchor is not available for physical dragging');
    }
    return {
        x: rect.left + anchor.x * rect.width / 480,
        y: rect.top + anchor.y * rect.height / 640,
        drags: game.world.drags,
    };
}

function makeHeldAnchor(page, client, mobile) {
    let active = false;
    let position = null;
    let dragCount = 0;
    let movementCount = 0;
    return {
        api: mobile ? 'CDP trusted touch' : 'Puppeteer pointer',
        async start() {
            position = await page.evaluate(silkAnchorSnapshot);
            if (mobile) {
                active = true;
                await touch(client, 'touchStart', [touchPoint(position.x, position.y)]);
            } else {
                await page.mouse.move(position.x, position.y);
                active = true;
                await page.mouse.down();
            }
            await this.tick(0);
            try {
                await page.waitForFunction(before =>
                    window.sdGame?.state === 'playing'
                    && !!window.sdGame?.world?.dragging
                    && window.sdGame.world.drags > before,
                { timeout: 1800 }, position.drags);
            } catch (error) {
                const debug = await diagnoseTouch(page, position, 'sd-canvas');
                throw new Error('Silk Dew anchor touch not accepted: ' + JSON.stringify(debug), { cause: error });
            }
            dragCount = await page.evaluate(() => window.sdGame.world.drags);
        },
        async tick(index) {
            const x = position.x + 16 + Math.sin(index / 2) * 6;
            const y = position.y + 2;
            if (mobile) await touch(client, 'touchMove', [touchPoint(x, y)]);
            else await page.mouse.move(x, y);
            movementCount++;
        },
        async inspect() {
            const evidence = await page.evaluate(() => ({
                playing: window.sdGame?.state === 'playing',
                held: !!window.sdGame?.world?.dragging,
                drags: window.sdGame?.world?.drags,
                worldTime: window.sdGame?.world?.time,
            }));
            if (!evidence.playing || !evidence.held || evidence.drags < dragCount
                || movementCount < 2 || !(evidence.worldTime > 0)) {
                throw new Error('Silk Dew anchor input did not remain effective throughout sampling');
            }
            return { ...evidence, movementCount };
        },
        async stop() {
            if (!active) return;
            active = false;
            if (mobile) await touch(client, 'touchEnd', []);
            else await page.mouse.up();
        },
        get active() { return active; },
    };
}

/** Choose an ordinary safe lane without ever changing lives, enemies or simulation time. */
export function chooseNeedleDirection(player, tick) {
    if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)) {
        throw new Error('Needle Awn player position unavailable');
    }
    if (player.y < 595) return { x: 0, y: 1 };
    if (player.x < 90) return { x: 1, y: 0 };
    if (player.x > 390) return { x: -1, y: 0 };
    return { x: Math.floor(tick / 8) % 2 === 0 ? 1 : -1, y: 0 };
}

function makeNeedleSurvival(page, client, mobile) {
    let active = false;
    let joystick = null;
    let heldKey = null;
    let lastPlayer = null;
    let travel = 0;
    let directions = 0;
    const keyFor = direction => direction.y > 0 ? 's' : direction.x > 0 ? 'd' : 'a';
    const playerPosition = () => page.evaluate(() => {
        const game = window.gameEngine;
        if (game?.mode !== 'endless' || game?.state !== 'playing' || !game.player) {
            throw new Error('Needle Awn endless run ended or changed mode');
        }
        return { x: game.player.x, y: game.player.y, lives: game.player.lives,
            timeElapsed: game.timeElapsed, wave: game.waveIndex };
    });
    return {
        api: mobile ? 'CDP trusted touch joystick' : 'Puppeteer keyboard',
        async start() {
            lastPlayer = await playerPosition();
            if (mobile) {
                joystick = await page.evaluate(() => {
                    const r = window.gameEngine?.canvas?.getBoundingClientRect();
                    if (!r?.width || !r?.height) throw new Error('Needle Awn canvas not laid out');
                    return { x: r.left + r.width * 0.20, y: r.top + r.height * 0.72 };
                });
                active = true;
                await touch(client, 'touchStart', [touchPoint(joystick.x, joystick.y)]);
                try {
                    await page.waitForFunction(() => window.gameEngine?.joy?.active === true,
                        { timeout: 1800 });
                } catch (error) {
                    const debug = await diagnoseTouch(page, joystick, 'na-canvas');
                    throw new Error('Needle Awn joystick touch not accepted: ' + JSON.stringify(debug), { cause: error });
                }
            } else {
                active = true;
            }
            await this.tick(0);
        },
        async tick(index) {
            const player = await playerPosition();
            travel += Math.hypot(player.x - lastPlayer.x, player.y - lastPlayer.y);
            lastPlayer = player;
            const direction = chooseNeedleDirection(player, index);
            if (mobile) {
                await touch(client, 'touchMove', [touchPoint(
                    joystick.x + direction.x * 46, joystick.y + direction.y * 46,
                )]);
            } else {
                const key = keyFor(direction);
                if (heldKey !== key) {
                    if (heldKey) await page.keyboard.up(heldKey);
                    heldKey = key;
                    await page.keyboard.down(key);
                }
            }
            directions++;
        },
        async inspect() {
            const player = await playerPosition();
            travel += Math.hypot(player.x - lastPlayer.x, player.y - lastPlayer.y);
            if (directions < 2 || travel < 10 || !(player.timeElapsed > 0) || player.lives <= 0) {
                throw new Error('Needle Awn input did not cause meaningful live movement');
            }
            return { movementDistance: Math.round(travel), directions, remainingLives: player.lives,
                elapsedGameSeconds: +player.timeElapsed.toFixed(2), wave: player.wave };
        },
        async stop() {
            if (!active) return;
            active = false;
            if (mobile) await touch(client, 'touchEnd', []);
            else if (heldKey) { await page.keyboard.up(heldKey); heldKey = null; }
        },
        get active() { return active; },
    };
}

/**
 * Run an actual CDP measurement alongside user input. The input uses live
 * browser events, not a patched game loop. A failed/inert input invalidates
 * the entire measurement, and the finally block releases held controls.
 */
export async function sampleWithInput(page, client, scene, viewportTag, sample) {
    const spec = scene.profileInput;
    if (!spec) return { metrics: await sample(), input: null };
    const mobile = viewportTag !== 'desktop';
    const driver = spec.kind === 'held-anchor'
        ? makeHeldAnchor(page, client, mobile) : makeNeedleSurvival(page, client, mobile);
    return captureInputSample(driver, spec, sample, scene.workload);
}

/** Factored from the browser layer so cancellation and cleanup can be unit-tested. */
export async function captureInputSample(driver, spec, sample, workload = 'test scenario') {
    let running = false;
    let loop = null;
    let steps = 0;
    let tickError = null;
    try {
        await driver.start();
        running = true;
        loop = (async () => {
            while (running) {
                await sleep(spec.cadenceMs);
                if (!running) break;
                try { await driver.tick(++steps); }
                catch (error) { tickError = error; running = false; }
            }
        })();
        const metrics = await sample();
        running = false;
        await loop;
        if (tickError) throw tickError;
        if (steps < 1) throw new Error('No profile input steps were delivered');
        const evidence = await driver.inspect();
        return {
            metrics,
            input: { kind: spec.kind, workload, api: driver.api, steps, evidence },
        };
    } finally {
        running = false;
        if (loop) await loop;
        if (driver.active) await driver.stop();
    }
}
