#!/usr/bin/env node
// Keep game entrypoints from regressing into monoliths after architectural extraction.
import { statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgets = {
    'js/tower-defense.js': 134 * 1024,
    'js/sword-flight.js': 110 * 1024,
    'js/needle-awn.js': 74 * 1024,
    'js/bond-forge.js': 74 * 1024,
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
