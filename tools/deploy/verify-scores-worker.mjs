#!/usr/bin/env node
/**
 * Read-only live release gate. A successful Wrangler deploy alone does not
 * guarantee the public hostname serves the new Worker yet.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCORE_URL = 'https://game-scores.orangely.workers.dev';
export const CANARY_KEYS = [
    'tetris', // The upgraded Worker must remain compatible with existing clients.
    'carrot-pull',
    'tank-battle',
    'needle-awn-endless',
    'firefly-signal-first-light',
    'shadow-loom-rabbit',
    'math-rain-1',
    'math-rain-6',
];

export async function verifyScoresWorker(fetchImpl = fetch) {
    for (const game of CANARY_KEYS) {
        const url = SCORE_URL + '/scores?game=' + encodeURIComponent(game);
        const response = await fetchImpl(url, {
            headers: { Origin: 'https://games.orangely.xyz' },
            signal: globalThis.AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            throw new Error('Scoreboard ' + game + ': HTTP ' + response.status);
        }
        const rows = await response.json();
        if (!Array.isArray(rows)) {
            throw new Error('Scoreboard ' + game + ': expected an array');
        }
    }
}

export async function waitForScoresWorker({
    verify = verifyScoresWorker,
    attempts = 8,
    delayMs = 2500,
    sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)),
} = {}) {
    for (let i = 0; i < attempts; i++) {
        try {
            await verify();
            return;
        } catch (error) {
            if (i === attempts - 1) throw error;
            console.warn('Scores Worker not ready (' + (i + 1) + '/' + attempts + '): ' + error.message);
            await sleep(delayMs);
        }
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await waitForScoresWorker();
        console.log('Scores Worker ready: all ' + CANARY_KEYS.length + ' live boards readable');
    } catch (error) {
        console.error('Site release blocked: scores Worker is not ready:', error);
        process.exitCode = 1;
    }
}
