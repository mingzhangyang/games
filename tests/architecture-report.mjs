#!/usr/bin/env node
import {
    compareDebt,
    loadDebtBaseline,
    RATCHET_CATEGORIES,
    scanArchitectureDebt,
    STRICT_ZERO_CATEGORIES,
} from './lib/architecture-debt.mjs';

const baseline = loadDebtBaseline();
const current = scanArchitectureDebt();
const categories = [
    ...RATCHET_CATEGORIES,
    'oversized-composition-entries',
    ...STRICT_ZERO_CATEGORIES,
];

console.log('Architecture v2 debt report');
console.log(`baseline: ${baseline.generatedFrom || 'unknown'}`);
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
    if (!result.added.length && !result.removed.length && result.current.length) {
        console.log('  top:');
        for (const item of result.current.slice(0, 8)) console.log(`    • ${item}`);
    }
}

console.log('\nstrict-zero categories must remain empty; ratchet categories may only decrease.');
