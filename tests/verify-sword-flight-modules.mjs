#!/usr/bin/env node
// Static contract for the Sword Flight module split: layered imports, no cycles,
// and a compatibility shim that does not regain ownership of the game.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = join(ROOT, 'src', 'games', 'sword-flight');
const failures = [];
const check = (condition, label, detail = '') => {
    if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`${condition ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
};

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
});
const files = walk(PACKAGE).filter(file => extname(file) === '.js');
const fileSet = new Set(files);
const importPattern = /(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?(['"])([^'"]+)\1\s*;?/gm;

const resolveLocal = (fromFile, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const base = resolve(dirname(fromFile), specifier);
    const candidates = extname(base) ? [base] : [`${base}.js`, join(base, 'index.js')];
    return candidates.find(file => fileSet.has(file)) || null;
};

const graph = new Map(files.map(file => [file, []]));
for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
        const target = resolveLocal(file, match[2]);
        if (target) graph.get(file).push(target);
    }
}

const states = new Map();
const stack = [];
const cycles = [];
const visit = file => {
    const state = states.get(file);
    if (state === 'visiting') {
        const start = stack.indexOf(file);
        cycles.push([...stack.slice(start), file].map(path => relative(PACKAGE, path)).join(' → '));
        return;
    }
    if (state === 'visited') return;
    states.set(file, 'visiting');
    stack.push(file);
    graph.get(file).forEach(visit);
    stack.pop();
    states.set(file, 'visited');
};
files.forEach(visit);

const rankOf = file => {
    const path = relative(PACKAGE, file).replace(/\\/g, '/');
    if (path === 'config.js' || path === 'audio.js' || path === 'i18n.js') return 0;
    if (path.startsWith('model/')) return 1;
    if (path.startsWith('systems/')) return 2;
    if (path.startsWith('render/')) return 3;
    if (path.startsWith('input/')) return 4;
    if (path.startsWith('ui/')) return 5;
    if (path === 'runtime.js') return 6;
    if (path === 'index.js') return 7;
    return null;
};

const upwardEdges = [];
for (const [from, targets] of graph) {
    const fromRank = rankOf(from);
    for (const target of targets) {
        const toRank = rankOf(target);
        if (fromRank !== null && toRank !== null && toRank > fromRank) {
            upwardEdges.push(`${relative(PACKAGE, from)} → ${relative(PACKAGE, target)}`);
        }
    }
}

check(files.length >= 18, 'Sword Flight package contains the split modules', `${files.length} JS files`);
check(cycles.length === 0, 'module graph has no cycles', cycles.join(' | '));
check(upwardEdges.length === 0, 'module dependencies flow from assembly to lower layers', upwardEdges.join(' | '));

const entry = readFileSync(join(ROOT, 'js', 'sword-flight.js'), 'utf8').trim();
const isThinShim = source => /^\/\/ Compatibility entry[^\r\n]*\r?\nimport ['"]\.\.\/src\/games\/sword-flight\/index\.js['"];?$/.test(source.trim());
check(isThinShim(entry),
    'legacy sword-flight entry is a thin compatibility shim');
check(!isThinShim(entry.replace('\nimport', '\nwindow.game = {};\nimport')),
    'shim guard rejects inserted game logic before the import');
check(!isThinShim(`${entry}\nwindow.game = {};`),
    'shim guard rejects inserted game logic after the import');
const composition = readFileSync(join(PACKAGE, 'index.js'), 'utf8');
check(!/from ['"]\.\/(?:systems\/|render\/(?:world|effects)\.js|input\/|ui\/)/.test(composition),
    'composition root does not import gameplay/render/input/menu implementation directly');
check(composition.includes("from './runtime.js'") && composition.includes("from './render/hud.js'"),
    'composition root only assembles runtime and chrome setter');

if (failures.length) {
    console.error(`\nFAIL ${failures.length} 项:`);
    failures.forEach(failure => console.error(`  ✗ ${failure}`));
    process.exit(1);
}
console.log('\nverify-sword-flight-modules 全部通过 ✅');
