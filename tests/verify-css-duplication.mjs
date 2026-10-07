#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCssDuplicationAudit, renderCssDuplicationMarkdown } from './lib/css/duplication-audit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = JSON.parse(readFileSync(join(ROOT, 'tests/css-duplication-audit-contract.json'), 'utf8'));
const audit = buildCssDuplicationAudit();
const allowed = new Set(CONTRACT.classifications);

assert.equal(audit.engine, CONTRACT.engine, 'duplication audit engine changed without a contract review');
assert.equal(audit.ordinaryRuleCount, CONTRACT.expectedOrdinaryRuleCount,
    'ordinary CSS rule population changed; update the upstream CSS contract before the duplication audit');
assert.equal(Object.values(audit.categoryCounts).reduce((sum, count) => sum + count, 0), audit.ordinaryRuleCount,
    'duplication classes must cover every ordinary CSS rule exactly once');
assert.equal(new Set(audit.rules.map(rule => rule.id)).size, audit.rules.length,
    'duplication audit rule identities must be unique');
assert.ok(audit.rules.every(rule => allowed.has(rule.classification)),
    'duplication audit emitted a classification outside the reviewed taxonomy');
assert.ok(audit.rules.every(rule => !(rule.localReason && rule.classification !== 'intentional-local')),
    'hard-local stage/canvas/overlay/theme contracts must never be promoted automatically');
for (const group of [...audit.exactGroups, ...audit.structuralGroups]) {
    assert.ok(group.pathCount >= CONTRACT.minimumCrossFileCount,
        group.id + ': duplicate families must span multiple CSS files');
}
for (const group of audit.structuralGroups) {
    const members = group.members.map(member => audit.rules.find(rule => rule.id === member.id));
    assert.ok(members.every(Boolean), group.id + ': missing structural family member');
}

if (CONTRACT.baseline) {
    assert.deepEqual(audit.categoryCounts, CONTRACT.baseline.categoryCounts,
        'duplication classification counts changed; review the family delta instead of silently rebaselining');
    assert.equal(audit.classificationDigest, CONTRACT.baseline.classificationDigest,
        'duplication family membership changed; inspect the generated report before updating the contract');
    assert.equal(audit.exactGroups.length, CONTRACT.baseline.exactFamilyCount,
        'exact duplicate family count changed');
    assert.equal(audit.structuralGroups.length, CONTRACT.baseline.structuralFamilyCount,
        'structural duplicate family count changed');
}

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(audit, null, 2));
} else if (process.argv.includes('--markdown')) {
    console.log(renderCssDuplicationMarkdown(audit));
} else {
    console.log(renderCssDuplicationMarkdown(audit, 12));
}
