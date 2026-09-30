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
    compareBaselineGrowth,
    loadDebtBaseline,
    ROOT,
    RATCHET_CATEGORIES,
    importedSpecifiers,
    shimCallSites,
    resolveRepositoryImport,
    isBrowserPlatformImport,
    generatedContractViolations,
    workerPlatformImports,
    archivedToolReferences,
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
const baselineGuard = compareBaselineGrowth(baseline);
ok(baselineGuard.issues.length === 0,
    `baseline integrity (${baselineGuard.source})`,
    baselineGuard.issues.join(', '));
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
ok(current['platform-shim-consumers'].every(item => /:[a-z0-9-]+#\d+$/.test(item)),
    'shim debt keys preserve stable occurrence identity');

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
ok(shimName('./i18n.js', join(ROOT, 'src/games/example/index.js')) === null,
    'shim scanner leaves local game-relative modules unclassified');

console.log('\n▶ guard regression cases');
const consumer = join(ROOT, 'js/example.js');
const original = shimCallSites("import './theme.js';", consumer);
const shifted = shimCallSites("// unrelated edit\n\nimport './theme.js';", consumer);
ok(original[0].key === shifted[0].key && original[0].line !== shifted[0].line,
    'unrelated line insertions preserve debt identity and update diagnostics');
const repeated = shimCallSites("import './theme.js'; import('./theme.js'); require('./theme.js');", consumer);
ok(new Set(repeated.map(ref => ref.key)).size === 3,
    'same-line repeated shim imports remain distinct');
const fixtureBaseline = { categories: { shim: { items: original.map(ref => ref.key) } } };
ok(compareDebt({ shim: repeated.map(ref => ref.key) }, fixtureBaseline, 'shim').added.length === 2,
    'extra call sites fail even when the shim already exists');
ok(shimCallSites("import './i18n.js';", join(ROOT, 'src/games/example/index.js')).length === 0,
    'local game modules are allowed');
const workerPath = join(ROOT, 'worker/index.js');
ok(['@js/theme.js', '@platform/theme.js', '../src/platform/theme.js', '../js/theme.js']
    .every(specifier => isBrowserPlatformImport(specifier, workerPath)), 'worker guard catches aliases and relative paths');
ok(!isBrowserPlatformImport('./rules.js', workerPath), 'worker-local modules are allowed');
ok(workerPlatformImports([workerPath], () => "import('@js/theme.js'); require('@platform/boot.js');").length === 2,
    'worker scanner catches executable dynamic alias imports');
ok(workerPlatformImports([workerPath], () => "// import('@js/theme.js')\nimport './rules.js';").length === 0,
    'worker scanner ignores comments and permits local modules');
ok(resolveRepositoryImport('../archive/migrations/x.mjs', join(ROOT, 'tools/checks/x.mjs')).startsWith('tools/archive/'),
    'relative archived tooling imports resolve to the forbidden subtree');
ok(!resolveRepositoryImport('../lib/x.mjs', join(ROOT, 'tools/checks/x.mjs')).startsWith('tools/archive/'),
    'active tooling imports remain allowed');
const toolPath = join(ROOT, 'tools/checks/example.mjs');
ok(archivedToolReferences([toolPath], () => "import('../archive/migrations/x.mjs'); require('../archive/y.mjs');").length === 2,
    'archive scanner catches executable relative imports and requires');
ok(archivedToolReferences([toolPath], () => "// import('../archive/x.mjs')\nimport '../lib/helper.mjs';").length === 0,
    'archive scanner ignores comments and allows active helpers');
ok(generatedContractViolations([join(ROOT, 'src/generated/unknown/cache.js')])
    .some(item => item.endsWith(':no-reproducibility-contract')), 'unknown generated files cannot pass with a stamp alone');
const raised = JSON.parse(JSON.stringify(baseline));
raised.categories['registry-entry-in-js'].items.push('example:js/example.js');
ok(compareBaselineGrowth(raised).issues.length > 0, 'raising the baseline is rejected');
const partialShell = compareDebt({ shell: ['minesweeper:game-main'] },
    { categories: { shell: { items: ['minesweeper:game-main', 'minesweeper:game-stage'] } } }, 'shell');
ok(partialShell.added.length === 0 && partialShell.delta === -1, 'partial shell repairs are allowed');
const regressedShell = compareDebt({ shell: ['minesweeper:game-footer'] },
    { categories: { shell: { items: ['minesweeper:game-main'] } } }, 'shell');
ok(regressedShell.added.length === 1, 'new shell class regressions are rejected');

console.log(failed ? `\n${failed} architecture boundary failure(s) ❌` : '\narchitecture boundary contract passed ✅');
process.exit(failed ? 1 : 0);
