/**
 * PR #138: test-only, controlled gameplay interactions for headless profiling.
 *
 * The "mobile" dimension is a Chromium *viewport*, not a phone:
 * Needle Awn uses keyboard inputs at both viewport sizes. Silk Dew uses a
 * genuine Puppeteer pointer hold on desktop and a clearly labeled test-only
 * DOM PointerEvent on emulated mobile, since the headless mobile pointer
 * device cancels its hold. Synthetic DOM input tests game update workload,
 * NOT touch hardware or genuine human interaction. Physical touch remains
 * covered by separate gameplay smoke tests.
 *
 * Read game state to choose input; never write game state, scores, clocks,
 * damage, difficulty, pause state or simulation objects.
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function silkAnchorSnapshot() {
    const game = window.sdGame;
    const anchor = game?.world?.ropes?.[0]?.particles?.[0];
    const rect = game?.canvas?.getBoundingClientRect();
    if (game?.state !== 'playing' || !anchor || !rect?.width || !rect?.height) {
        throw new Error('Silk Dew S1 rope anchor unavailable');
    }
    return {
        x: rect.left + anchor.x * rect.width / 480,
        y: rect.top + anchor.y * rect.height / 640,
        drags: game.world.drags,
    };
}

/** A stationary held anchor exercises S1 physics without modifying its state directly. */
function makeHeldAnchor(page, _client, mobile) {
    let active = false;
    let position = null;
    let dragCount = 0;
    let sampleStartWorldTime = null;
    let holdTicks = 0;
    const syntheticId = 31415;
    const syntheticPointer = type => page.evaluate(({ type, id, x, y }) => {
        const target = document.getElementById('sd-canvas');
        if (!target) throw new Error('Silk Dew target canvas missing');
        const event = new window.PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: id,
            pointerType: 'touch', isPrimary: true, buttons: type === 'pointerdown' ? 1 : 0,
            clientX: x, clientY: y,
        });
        target.dispatchEvent(event);
    }, { type, id: syntheticId, x: position.x, y: position.y });
    return {
        api: mobile ? 'test-only DOM PointerEvent (emulated mobile viewport)' : 'Puppeteer pointer',
        async start() {
            position = await page.evaluate(silkAnchorSnapshot);
            if (mobile) {
                await syntheticPointer('pointerdown');
            } else {
                await page.mouse.move(position.x, position.y);
                await page.mouse.down();
            }
            active = true;
            try {
                await page.waitForFunction(before =>
                    window.sdGame?.state === 'playing'
                    && !!window.sdGame?.world?.dragging
                    && window.sdGame.world.drags > before,
                { timeout: 3500 }, position.drags);
            } catch (error) {
                const evidence = await page.evaluate(() => ({
                    state: window.sdGame?.state,
                    worldState: window.sdGame?.world?.state,
                    dragCount: window.sdGame?.world?.drags,
                    dragging: window.sdGame?.isDragging,
                    pointerId: window.sdGame?.pointerId,
                }));
                const invalid = new Error('Silk Dew stationary anchor hold was not accepted: '
                    + JSON.stringify(evidence), { cause: error });
                invalid.profileEvidence = evidence;
                throw invalid;
            }
            // Capture this clock only AFTER the real game input has taken hold:
            // time accumulated before measurement must not validate a frozen sample.
            const sampleStart = await page.evaluate(() => ({
                drags: window.sdGame.world.drags,
                worldTime: window.sdGame.world.time,
            }));
            dragCount = sampleStart.drags;
            sampleStartWorldTime = sampleStart.worldTime;
        },
        async tick() {
            // An active held anchor prevents the game's built-in idle-loss rule.
            // No periodic synthetic events enter the sampled CPU/animation window.
            holdTicks++;
        },
        async inspect() {
            const evidence = await page.evaluate(() => ({
                playing: window.sdGame?.state === 'playing',
                held: !!window.sdGame?.world?.dragging,
                drags: window.sdGame?.world?.drags,
                worldTime: window.sdGame?.world?.time,
            }));
            return validateHeldAnchorProgress(sampleStartWorldTime, evidence, dragCount, holdTicks);
        },
        async stop() {
            if (!active) return;
            active = false;
            if (mobile) await syntheticPointer('pointerup');
            else await page.mouse.up();
        },
        get active() { return active; },
    };
}

/**
 * Validity is based on clock progression DURING sampling, not the absolute
 * world clock (which was already positive before the held-anchor driver ran).
 * This pure check is shared with frozen-simulation regression tests.
 */
export function validateHeldAnchorProgress(startWorldTime, evidence, dragCount, holdTicks) {
    if (!evidence?.playing || !evidence.held || !(evidence.drags >= dragCount)
        || holdTicks < 2 || !Number.isFinite(startWorldTime) || startWorldTime < 0
        || !Number.isFinite(evidence.worldTime) || evidence.worldTime <= startWorldTime) {
        const invalid = new Error('Silk Dew S1 invalid: hold inactive or world time did not advance during sampling');
        invalid.profileEvidence = { ...evidence, startWorldTime, expectedDrags: dragCount, holdTicks };
        throw invalid;
    }
    return { ...evidence, worldTimeAdvanceSeconds: evidence.worldTime - startWorldTime,
        holdTickCount: holdTicks };
}

/** A consistent and bounded movement lane, not automated gameplay success. */
export function chooseNeedleDirection(player, tick) {
    if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)) {
        throw new Error('Needle Awn player position unavailable');
    }
    if (player.y < 595) return { x: 0, y: 1 };
    if (player.x < 90) return { x: 1, y: 0 };
    if (player.x > 390) return { x: -1, y: 0 };
    return { x: Math.floor(tick / 8) % 2 === 0 ? 1 : -1, y: 0 };
}

function makeNeedleSurvival(page, _client, mobile) {
    let active = false;
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
        api: mobile ? 'Puppeteer keyboard (emulated mobile viewport)' : 'Puppeteer keyboard',
        async start() {
            lastPlayer = await playerPosition();
            active = true;
            await this.tick(0);
        },
        async tick(index) {
            const player = await playerPosition();
            travel += Math.hypot(player.x - lastPlayer.x, player.y - lastPlayer.y);
            lastPlayer = player;
            const key = keyFor(chooseNeedleDirection(player, index));
            if (heldKey !== key) {
                if (heldKey) await page.keyboard.up(heldKey);
                heldKey = key;
                await page.keyboard.down(key);
            }
            directions++;
        },
        async inspect() {
            const player = await playerPosition();
            travel += Math.hypot(player.x - lastPlayer.x, player.y - lastPlayer.y);
            const evidence = { movementDistance: Math.round(travel), directions,
                remainingLives: player.lives, elapsedGameSeconds: +player.timeElapsed.toFixed(2),
                wave: player.wave };
            if (directions < 2 || travel < 10 || !(player.timeElapsed > 0) || player.lives <= 0) {
                const invalid = new Error('Needle Awn movement was not observable in live Endless mode');
                invalid.profileEvidence = evidence;
                throw invalid;
            }
            return evidence;
        },
        async stop() {
            if (!active) return;
            active = false;
            if (heldKey) { await page.keyboard.up(heldKey); heldKey = null; }
        },
        get active() { return active; },
    };
}

/**
 * Browser input and CDP metrics run concurrently. Input is released before
 * the drawer is opened or another sample begins; failure cannot leave a key
 * or drag held. Inert input invalidates the sample.
 */
export async function sampleWithInput(page, client, scene, viewportTag, sample) {
    const spec = scene.profileInput;
    if (!spec) return { metrics: await sample(), input: null };
    const mobile = viewportTag !== 'desktop';
    const driver = spec.kind === 'held-anchor'
        ? makeHeldAnchor(page, client, mobile) : makeNeedleSurvival(page, client, mobile);
    return captureInputSample(driver, spec, sample, scene.workload);
}

/**
 * The sampler owns the full input attempt, including failures. A rejected input
 * must retain its attempted API, tick count, inspection evidence (if available),
 * and metrics if sampling had already completed. Such a row remains incomplete:
 * retaining diagnostics is not a license to publish invalid performance data.
 */
export async function captureInputSample(driver, spec, sample, workload = 'test scenario') {
    let running = false;
    let loop = null;
    let steps = 0;
    let tickError = null;
    let metrics = null;
    let evidence = null;
    let stage = 'start';
    let failure = null;
    let cleanupError = null;
    try {
        await driver.start();
        stage = 'sample';
        running = true;
        loop = (async () => {
            while (running) {
                await sleep(spec.cadenceMs);
                if (!running) break;
                try { await driver.tick(++steps); }
                catch (error) { tickError = error; running = false; }
            }
        })();
        metrics = await sample();
        running = false;
        await loop;
        if (tickError) {
            stage = 'tick';
            throw tickError;
        }
        if (steps < 1) {
            stage = 'tick';
            throw new Error('No profile input steps were delivered');
        }
        stage = 'inspect';
        evidence = await driver.inspect();
    } catch (error) {
        failure = error;
    } finally {
        running = false;
        try { if (loop) await loop; }
        catch (error) { cleanupError = error; }
        try { if (driver.active) await driver.stop(); }
        catch (error) { cleanupError ??= error; }
    }

    const input = { kind: spec.kind, workload, api: driver.api, steps,
        evidence: evidence ?? failure?.profileEvidence ?? null };
    if (failure || cleanupError) {
        const reason = failure || cleanupError;
        input.failedStage = failure ? stage : 'cleanup';
        if (tickError && tickError !== failure) input.tickError = String(tickError?.message || tickError);
        if (cleanupError && cleanupError !== reason) input.cleanupError = String(cleanupError?.message || cleanupError);
        const message = String(reason?.message || reason);
        const invalid = new Error(message, { cause: reason });
        invalid.name = 'ProfileInputAttemptError';
        invalid.profilePhase = { status: 'incomplete', metrics, input, error: message };
        throw invalid;
    }
    return { metrics, input };
}

/**
 * Preserve the failed phase on the owning run before rethrowing. This works for
 * both active and post-drawer resume, without making incomplete rows measured.
 */
export async function recordProfileInputPhase(phases, name, sample) {
    try {
        const measured = await sample();
        phases[name] = { status: 'measured', ...measured };
    } catch (error) {
        phases[name] = error?.profilePhase ?? {
            status: 'incomplete',
            metrics: null,
            error: String(error?.message || error),
        };
        throw error;
    }
}
