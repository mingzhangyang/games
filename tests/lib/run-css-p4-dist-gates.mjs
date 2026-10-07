#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const RUNNER = 'tests/lib/run-smoke-dist.mjs';
const GATES = [
    'tests/verify-css-p3a.mjs',
    'tests/verify-css-p3b.mjs',
    'tests/verify-css-p3c.mjs',
    'tests/verify-css-p3d.mjs',
    'tests/verify-css-p3e.mjs',
    'tests/verify-desktop-frame.mjs',
    'tests/verify-stats-drawer.mjs',
    'tests/verify-immersive.mjs',
    'tests/verify-start-menus.mjs',
    'tests/verify-theme.mjs',
    'tests/verify-chrome.mjs',
    'tests/smoke-index.mjs',
    'tests/smoke-carrot-pull.mjs',
    'tests/smoke-needle-awn.mjs',
    'tests/smoke-tower-defense.mjs',
    'tests/smoke-sword-flight.mjs',
];

for (const gate of GATES) {
    console.log(`\n=== P4 built-output gate: ${gate} ===`);
    const result = spawnSync(process.execPath, [RUNNER, gate], {
        cwd: ROOT,
        env: process.env,
        stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}

console.log('\nPASS CSS P4 built-output gate set');
