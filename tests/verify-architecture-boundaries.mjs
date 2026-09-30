#!/usr/bin/env node
// Architecture v2 boundary verifier.
//
// Historical debt is allowed only while it is present in the checked-in
// baseline. New debt is a failure, and categories that have reached zero stay
// strict-zero. This keeps migration work incremental without allowing the
// repository to regress while the legacy tree is being removed.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    compareDebt,
    loadDebtBaseline,
    ROOT,
    RATCHET_CATEGORIES,
    importedSpecifiers,
    shimName,
    scanArchitectureDebt,
    STRICT_ZERO_CATEGORIES,
} from './lib/architecture-debt.mjs';
import { registry } from './lib/registry.mjs';
import { discover } from './verify-all.mjs';

let failed = 0;
const ok = (condition, label, detail = '') => {
    if (condition) {
        console.log(`✓ ${label}`);
        return;
    }
    failed++;
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
};

const baseline = loadDebtBaseline();
const current = scanArchitectureDebt();

console.log('▶ Architecture debt ratchet');
for (const category of RATCHET_CATEGORIES) {
    const result = compareDebt(current, baseline, category);
    ok(result.added.length === 0,
        `${category}: no new debt`,
        result.added.length ? result.added.join(', ') : '');
    ok(result.delta <= 0,
        `${category}: current count does not exceed baseline`,
        `${result.current.length} > ${result.baseline.length}`);
    if (result.removed.length) console.log(`  ↓ removed from baseline: ${result.removed.join(', ')}`);
}

console.log('\n▶ strict Architecture v2 boundaries');
for (const category of STRICT_ZERO_CATEGORIES) {
    ok(current[category].length === 0,
        `${category}: strict-zero`,
        current[category].join(', '));
}

console.log('\n▶ registry entry boundary');
for (const game of registry.all()) {
    const expected = `src/games/${game.id}/index.js`;
    if (game.entry === expected) {
        ok(existsSync(join(ROOT, expected)), `${game.id}: canonical package entry exists`, expected);
        continue;
    }
    const debtKey = `${game.id}:${game.entry}`;
    const baselineEntries = new Set(baseline.categories?.['registry-entry-in-js']?.items || []);
    ok(baselineEntries.has(debtKey), `${game.id}: legacy entry is explicitly baselined`, game.entry);
}

console.log('\n▶ generated source and discovery contracts');
const discovered = discover();
const self = discovered.find(step => step.name === 'verify-architecture-boundaries');
ok(Boolean(self), 'boundary verifier is auto-discovered by verify-all');
ok(self?.script === 'tests/verify-architecture-boundaries.mjs',
    'boundary verifier uses the expected discovered script path', self?.script || 'missing');
const probeImports = importedSpecifiers(`import('@js/theme.js'); require('../js/daily.js');`);
ok(probeImports.length === 2 && probeImports.every(ref => shimName(ref.specifier)),
    'shim scanner recognizes alias, dynamic import, and require specifiers');

console.log(failed ? `\n${failed} architecture boundary failure(s) ❌` : '\narchitecture boundary contract passed ✅');
process.exit(failed ? 1 : 0);
