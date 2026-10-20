#!/usr/bin/env node
// Keep game entrypoints from regressing into monoliths after architectural extraction.
import { statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgets = {
    'src/games/tower-defense/index.js': 30 * 1024,
    'src/games/tower-defense/runtime.js': 45 * 1024,
    'src/games/tower-defense/render/scene-renderer.js': 45 * 1024,
    'src/games/sword-flight/index.js': 30 * 1024,
    'src/games/sword-flight/runtime.js': 30 * 1024,
    'src/games/sword-flight/render/world.js': 48 * 1024,
    'src/games/gravity-slingshot/index.js': 16 * 1024,
    'src/games/gravity-slingshot/runtime.js': 56 * 1024,
    'src/games/bond-forge/index.js': 16 * 1024,
    'src/games/bond-forge/runtime.js': 76 * 1024,
    'src/games/needle-awn/index.js': 16 * 1024,
    'src/games/needle-awn/runtime.js': 66 * 1024,
    'src/games/ripple-duet/index.js': 16 * 1024,
    'src/games/ripple-duet/runtime.js': 60 * 1024,
    'src/games/hoop-shot/index.js': 16 * 1024,
    'src/games/hoop-shot/runtime.js': 60 * 1024,
    'src/games/carrot-pull/index.js': 16 * 1024,
    'src/games/carrot-pull/runtime.js': 32 * 1024,
    'src/games/lumen/index.js': 16 * 1024,
    // Lumen 2026-10 拆分：runtime 只剩状态机与编排，画法 / DOM 各自成模块
    'src/games/lumen/runtime.js': 16 * 1024,
    'src/games/lumen/render/pieces.js': 14 * 1024,
    'src/games/lumen/render/board.js': 8 * 1024,
    'src/games/lumen/ui/view.js': 12 * 1024,
    'src/games/circuit/index.js': 16 * 1024,
    'src/games/circuit/runtime.js': 60 * 1024,
    'src/games/circuit/model/levels.js': 24 * 1024,
    'src/games/tetris/index.js': 16 * 1024,
    'src/games/tetris/runtime.js': 64 * 1024,
};
let failed = 0;
for (const [file, max] of Object.entries(budgets)) {
    const path = join(ROOT, file);
    if (!existsSync(path)) {
        console.error('✗ missing ' + file);
        failed++;
        continue;
    }
    const size = statSync(path).size;
    const ok = size <= max;
    console.log(`${ok ? '✓' : '✗'} ${file}: ${size} / ${max} bytes`);
    if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
