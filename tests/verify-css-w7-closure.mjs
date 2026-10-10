#!/usr/bin/env node
// W7 audit-only closure: reviewed high-return families and no silent coverage downgrade.
// CSS baselines and historical migration transactions are deliberately not rewritten here.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCssDuplicationAudit } from './lib/css/duplication-audit.mjs';
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

// Any new verifier-level escape from a hard failure must be explicitly reviewed.
const testFiles = readdirSync(join(ROOT, 'tests'))
    .filter(file => /^(verify|smoke)-.+\.mjs$/.test(file));
const silentGaps = testFiles.filter(file =>
    /\bknownGaps?\s*(?::|=)/.test(read('tests/' + file)));
assert.deepEqual(silentGaps, [],
    'verifier introduced a knownGap downgrade; register, justify and review it separately');

// A previous base .game-toast white-space rule broke wrapped messages in other games.
const toastRule = read('css/layout.css').match(/\.game-toast\s*\{([^}]*)\}/);
assert.ok(toastRule, 'shared .game-toast contract disappeared');
assert.doesNotMatch(toastRule[1], /\bwhite-space\s*:/,
    'shared .game-toast must not force nowrap; wrapping belongs to each page');

console.log('PASS W7 CSS closure: ' + candidateCount + ' reviewed high-return families, '
    + registry.all().length + ' registered games in P0 activation, '
    + 'no silent known-gap downgrade; mutation probes reject drift');
