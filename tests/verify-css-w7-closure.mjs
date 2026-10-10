#!/usr/bin/env node
// W7 audit-only closure: reviewed high-return families and no silent coverage downgrade.
// CSS baselines and historical migration transactions are deliberately not rewritten here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCssText } from './lib/css/baseline-adapter.mjs';
import { buildCssDuplicationAudit } from './lib/css/duplication-audit.mjs';
import { discover } from './verify-all.mjs';
import { registry } from './lib/registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const review = JSON.parse(read('tests/css-w7-reviewed-families.json'));
const audit = buildCssDuplicationAudit();

function verifyReviewedFamilies(snapshot, decisions) {
    assert.equal(decisions.schemaVersion, 1, 'W7 decision schema changed without review');
    assert.equal(decisions.minimumRemovableDeclarationCopies, 15,
        'W7 threshold must not be raised to conceal candidates');
    assert.equal(decisions.duplicationDigest, snapshot.classificationDigest,
        'W7 duplication digest drift: refresh decisions only after reviewing the family delta');

    const allGroups = [...snapshot.exactGroups, ...snapshot.structuralGroups];
    const groupsById = new Map(allGroups.map(group => [group.id, group]));
    assert.equal(groupsById.size, allGroups.length, 'duplicate audit family identifiers must be unique');

    const candidates = allGroups
        .filter(group => group.removableDeclarationCopies >= decisions.minimumRemovableDeclarationCopies)
        .map(group => group.id).sort();
    const reviewed = decisions.reviewedFamilies.map(entry => entry.familyId).sort();
    assert.deepEqual(reviewed, candidates,
        'W7 high-return review decision coverage changed: no omission, duplicate or unreviewed family allowed');

    for (const entry of decisions.reviewedFamilies) {
        const group = groupsById.get(entry.familyId);
        assert.ok(group, 'missing reviewed CSS family: ' + entry.familyId);
        assert.equal(entry.selectorFamily, group.selectorFamily, entry.familyId + ': selector drift');
        assert.equal(entry.kind, entry.familyId.split('-')[0], entry.familyId + ': kind drift');
        assert.equal(entry.removableDeclarationCopies, group.removableDeclarationCopies,
            entry.familyId + ': declaration savings drift');
        assert.deepEqual([...entry.paths].sort(), group.paths,
            entry.familyId + ': participant path drift');
        assert.ok(['follow-up-candidate', 'defer', 'retain'].includes(entry.disposition),
            entry.familyId + ': missing disposition');
        assert.ok(typeof entry.reason === 'string' && entry.reason.length >= 80,
            entry.familyId + ': give an explicit semantic/cascade reason, not a count-only decision');
    }
    return candidates.length;
}

const candidateCount = verifyReviewedFamilies(audit, review);

// Mutation probes: guard itself must fail on omitted decisions, stale membership and dishonest digests.
const copy = value => JSON.parse(JSON.stringify(value));
const withoutOne = copy(review);
withoutOne.reviewedFamilies.pop();
assert.throws(() => verifyReviewedFamilies(audit, withoutOne), /high-return review decision coverage/);
const wrongPath = copy(review);
wrongPath.reviewedFamilies[0].paths[0] = 'css/not-a-participant.css';
assert.throws(() => verifyReviewedFamilies(audit, wrongPath), /participant path drift/);
const wrongDigest = copy(review);
wrongDigest.duplicationDigest = 'not-the-current-audit';
assert.throws(() => verifyReviewedFamilies(audit, wrongDigest), /duplication digest drift/);

// All current registered games must participate in the full HTML/CSS activation baseline.
// Do not substitute a manually shortened per-game fixture for registry membership.
const htmlBaseline = JSON.parse(read('tests/css-layer-p0-baseline.json'));
const expectedHtml = ['index.html', 'public/404.html', ...registry.all().map(game => game.href)].sort();
const observedHtml = htmlBaseline.htmlFiles.map(entry => entry.path).sort();
assert.deepEqual(observedHtml, expectedHtml,
    'P0 HTML activation coverage does not equal home + 404 + every registry game');

// Reuse the full verification runner's actual test discovery rather than a second
// filename filter; this includes fg-audit, placeholder-leak-check, and future tests.
// verify-all.mjs runs its suite only when it is the CLI entrypoint.
const GAP_ASSIGNMENT = /\bknownGaps?\s*(?::|=)/;
function findSilentGaps(suite, sourceOf) {
    return suite.filter(({ script }) => GAP_ASSIGNMENT.test(sourceOf(script)))
        .map(({ script }) => script);
}
const discoveredSuite = discover();
assert.ok(discoveredSuite.some(({ script }) => script === 'tests/verify-css-w7-closure.mjs'),
    'W7 guard must itself be discoverable by the full verification runner');
assert.deepEqual(findSilentGaps(discoveredSuite, read), [],
    'auto-discovered verifier introduced a knownGap downgrade; review and register it separately');

// Every discovered script, including non verify-/smoke- names, must be scanned.
// Build the negative fixture in two pieces so the scanning test is not itself a hit.
const injectedGap = ['const known', 'Gap = true;'].join('');
for (const { script } of discoveredSuite) {
    assert.deepEqual(findSilentGaps(discoveredSuite, path => path === script ? injectedGap : ''), [script],
        script + ': a verifier must not silently escape the downgrade scan');
}
const injectedGapMap = ['const known', 'Gaps: {}'].join('');
assert.deepEqual(findSilentGaps([{ script: 'tests/fixture.mjs' }], () => injectedGapMap),
    ['tests/fixture.mjs'], 'plural knownGaps assignments must also be detected');

// Reuse the PostCSS-backed CSS contract parser: inspect every rule and every
// media/layer/selector-list occurrence, rather than the first regex match.
const TOAST_CLASS = /(^|[^a-zA-Z0-9_-])\.game-toast(?![a-zA-Z0-9_-])/;
function findToastWhiteSpace(cssText) {
    const rules = parseCssText(cssText, 'css/layout.css').rules
        .filter(({ selector }) => TOAST_CLASS.test(selector));
    assert.ok(rules.length, 'shared .game-toast contract disappeared');
    return rules.flatMap(rule => rule.migrationDeclarations
        .filter(({ property }) => property.toLowerCase() === 'white-space')
        .map(() => rule.selector + ' (' + (rule.layer || 'unlayered') + ')'));
}
assert.deepEqual(findToastWhiteSpace(read('css/layout.css')), [],
    'shared .game-toast must not impose white-space, including media/layer and selector lists');

// Mutation probes: later declarations, selector lists and modifier rules must all
// fail while similarly named classes must not trigger a false positive.
const cleanToast = '@layer layout { .game-toast { pointer-events: none; } }';
const lookalikeToast = cleanToast
    + ' @media (width <= 480px) { .game-toast-copy { white-space: nowrap; } }';
assert.deepEqual(findToastWhiteSpace(lookalikeToast), [],
    'lookalike classes must not be treated as .game-toast');
for (const mutation of [
    '@media (width <= 480px) { .game-toast { white-space: nowrap; } }',
    '@layer components { .other, .game-toast { white-space: pre; } }',
    '@layer layout { .game-toast.is-on { white-space: nowrap; } }',
]) {
    assert.ok(findToastWhiteSpace(cleanToast + '\n' + mutation).length > 0,
        'toast selector or media/layer mutation escaped the AST guard: ' + mutation);
}

console.log('PASS W7 CSS closure: ' + candidateCount + ' reviewed high-return families, '
    + registry.all().length + ' registered games in P0 activation, '
    + 'no silent known-gap downgrade; mutation probes reject drift');
