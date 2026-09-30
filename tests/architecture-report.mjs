#!/usr/bin/env node
import {
    compareBaselineGrowth,
    compareDebt,
    loadDebtBaseline,
    RATCHET_CATEGORIES,
    scanArchitectureDebt,
    STRICT_ZERO_CATEGORIES,
} from './lib/architecture-debt.mjs';

const baseline = loadDebtBaseline();
const current = scanArchitectureDebt();
const baselineGuard = compareBaselineGrowth(baseline);
const categories = [
    ...RATCHET_CATEGORIES,
    'oversized-composition-entries',
    ...STRICT_ZERO_CATEGORIES,
];

console.log('Architecture v2 debt report');
console.log(`baseline: ${baseline.generatedFrom || 'unknown'}`);
console.log(`baseline integrity: ${baselineGuard.source}${baselineGuard.issues.length ? ` — ${baselineGuard.issues.join(', ')}` : ' — ok'}`);
for (const category of categories) {
    const result = compareDebt(current, baseline, category);
    const mode = baseline.categories?.[category]?.mode || 'ratchet';
    const delta = result.delta > 0 ? `+${result.delta}` : String(result.delta);
    console.log(`\n${category} [${mode}]`);
    console.log(`  current: ${result.current.length}  baseline: ${result.baseline.length}  delta: ${delta}`);
    if (result.added.length) {
        console.log('  new:');
        for (const item of result.added.slice(0, 12)) console.log(`    + ${item}`);
        if (result.added.length > 12) console.log(`    … ${result.added.length - 12} more`);
    }
    if (result.removed.length) {
        console.log('  removed:');
        for (const item of result.removed.slice(0, 12)) console.log(`    - ${item}`);
        if (result.removed.length > 12) console.log(`    … ${result.removed.length - 12} more`);
    }
    if (result.current.length) {
        console.log('  top:');
        for (const item of result.current.slice(0, 8)) console.log(`    • ${item}`);
    }
    if (category === 'legacy-shell-pages' && current['legacy-shell-page-details']?.length) {
        console.log('  details:');
        for (const item of current['legacy-shell-page-details']) console.log(`    • ${item}`);
    }
}

console.log('\nDocumented exceptions / allowlist');
const exceptions = baseline.exceptions || {};
for (const [group, entries] of Object.entries(exceptions)) {
    console.log(`  ${group}:`);
    for (const [key, reason] of Object.entries(entries || {})) console.log(`    • ${key}: ${reason}`);
}
if (!Object.keys(exceptions).length) console.log('  none');

console.log('\nstrict-zero categories must remain empty; ratchet categories may only decrease.');
