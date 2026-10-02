#!/usr/bin/env node
// Keep game entrypoints from regressing into monoliths after architectural extraction.
import { statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgets = {
    'js/tower-defense.js': 4 * 1024,
    'src/games/tower-defense/index.js': 30 * 1024,
    'src/games/tower-defense/runtime.js': 45 * 1024,
    'src/games/tower-defense/render/scene-renderer.js': 45 * 1024,
    'js/sword-flight.js': 4 * 1024,
    'src/games/sword-flight/index.js': 30 * 1024,
    'src/games/sword-flight/runtime.js': 30 * 1024,
    'src/games/sword-flight/render/world.js': 48 * 1024,
    'src/games/gravity-slingshot/index.js': 16 * 1024,
    'src/games/gravity-slingshot/runtime.js': 56 * 1024,
    'src/games/bond-forge/index.js': 16 * 1024,
    'src/games/bond-forge/runtime.js': 76 * 1024,
    'src/games/needle-awn/index.js': 16 * 1024,
    'src/games/needle-awn/runtime.js': 66 * 1024,
    'js/ripple-duet.js': 4 * 1024,
    'src/games/ripple-duet/index.js': 16 * 1024,
    'src/games/ripple-duet/runtime.js': 60 * 1024,
    'js/hoop-shot.js': 4 * 1024,
    'src/games/hoop-shot/index.js': 16 * 1024,
    'src/games/hoop-shot/runtime.js': 60 * 1024,
    'js/carrot-pull.js': 4 * 1024,
    'src/games/carrot-pull/index.js': 16 * 1024,
    'src/games/carrot-pull/runtime.js': 32 * 1024,
    'js/lumen.js': 4 * 1024,
    'src/games/lumen/index.js': 16 * 1024,
    'src/games/lumen/runtime.js': 48 * 1024,
    'js/tetris.js': 60 * 1024,
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
if (existsSync(join(ROOT, 'js', 'shadow-loom-silhouettes.js'))) {
    console.error('✗ generated shadow-loom cache leaked back into js/');
    failed++;
}
if (!existsSync(join(ROOT, 'src', 'generated', 'shadow-loom', 'silhouettes.js'))) {
    console.error('✗ generated shadow-loom cache missing from src/generated/');
    failed++;
}
process.exit(failed ? 1 : 0);
