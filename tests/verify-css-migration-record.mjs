#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
    mappedStylesheetPaths, mappingDestinations, mappingSources,
} from './lib/css/migration-record.mjs';

const migrate = {
    id: 'legacy-split',
    source: { path: 'css/legacy.css' },
    destinations: [{ path: 'css/legacy.css' }, { path: 'css/second.css' }],
};
const retire = {
    id: 'legacy-retire', kind: 'retire',
    source: { path: 'css/retired.css' }, destinations: [],
};
const dedupe = {
    id: 'new-dedupe', kind: 'dedupe',
    sources: [{ path: 'css/first.css' }, { path: 'css/second.css' }],
    destination: { path: 'css/shared.css' },
    reuseExistingDestination: false,
    // A stale legacy-shaped field must never mask the dedupe references.
    source: { path: 'css/decoy.css' },
    destinations: [{ path: 'css/decoy2.css' }],
};
const reusedDedupe = {
    id: 'reused-dedupe', kind: 'dedupe',
    sources: [{ path: 'css/another.css' }, { path: 'css/first.css' }],
    destination: { path: 'css/shared.css' },
    reuseExistingDestination: true,
};

assert.deepEqual(mappingSources(migrate), [migrate.source]);
assert.deepEqual(mappingDestinations(migrate), migrate.destinations);
assert.deepEqual(mappingSources(retire), [retire.source]);
assert.deepEqual(mappingDestinations(retire), []);
assert.deepEqual(mappingSources(dedupe), dedupe.sources);
assert.deepEqual(mappingDestinations(dedupe), [dedupe.destination]);
assert.deepEqual([...mappedStylesheetPaths([])], []);
assert.deepEqual([...mappedStylesheetPaths([migrate])], ['css/legacy.css', 'css/second.css']);
assert.deepEqual([...mappedStylesheetPaths([retire])], ['css/retired.css']);
assert.deepEqual([...mappedStylesheetPaths([dedupe])], [
    'css/first.css', 'css/second.css', 'css/shared.css',
]);
assert.deepEqual([...mappedStylesheetPaths([reusedDedupe])], [
    'css/another.css', 'css/first.css', 'css/shared.css',
]);
assert.deepEqual([...mappedStylesheetPaths([migrate, retire, dedupe, reusedDedupe])], [
    'css/legacy.css', 'css/second.css', 'css/retired.css',
    'css/first.css', 'css/shared.css', 'css/another.css',
]);

// The layer-map guard must recognize every path of a dedupe even if this is
// the first mapping ever registered for that stylesheet. An unrelated CSS
// path is still held against the immutable baseline.
const dedupeOnlyPaths = mappedStylesheetPaths([dedupe]);
for (const path of ['css/first.css', 'css/second.css', 'css/shared.css']) {
    assert.equal(dedupeOnlyPaths.has(path), true);
}
assert.equal(dedupeOnlyPaths.has('css/unregistered.css'), false);
assert.equal(dedupeOnlyPaths.has('css/decoy.css'), false);

console.log('PASS migration record normalization, layer-map paths, mixed/historical dedupe');
