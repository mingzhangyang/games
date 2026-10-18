#!/usr/bin/env node
// The Vite post-bundle stamp is content-addressed, repeatable and self-contained.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { stampServiceWorker } from '../tools/build/service-worker-cache.mjs';

const dist = await mkdtemp(join(tmpdir(), 'games-sw-cache-'));
try {
    await mkdir(join(dist, 'assets/js'), { recursive: true });
    await mkdir(join(dist, 'assets/css'), { recursive: true });
    await writeFile(join(dist, 'index.html'), '<html><head><link rel="stylesheet" href="/assets/css/home-abc.css"><script type="module" src="/assets/js/home-123.js"></script></head></html>');
    await writeFile(join(dist, 'assets/js/home-123.js'), 'window.started = true;');
    await writeFile(join(dist, 'assets/css/home-abc.css'), 'body { color: red; }');
    const first = await stampServiceWorker(dist);
    const initial = await readFile(join(dist, 'sw.js'), 'utf8');
    assert(first.precache.includes('/assets/js/home-123.js'));
    assert(first.precache.includes('/assets/css/home-abc.css'));
    assert(first.precache.includes('/'));
    assert(!initial.includes('__GAMES_BUILD_ID__') && !initial.includes('__GAMES_PRECACHE__')
        && !initial.includes('__GAMES_ASSETS__'));
    assert(initial.includes('/assets/js/home-123.js'), 'current build assets are tracked');
    assert.doesNotThrow(() => new Script(initial), 'generated SW parses as valid JavaScript');
    const second = await stampServiceWorker(dist);
    assert.equal(second.buildId, first.buildId, 'identical build must not reissue a cache version');
    assert.equal(await readFile(join(dist, 'sw.js'), 'utf8'), initial, 'stable stamped output');
    await writeFile(join(dist, 'assets/css/home-abc.css'), 'body { color: blue; }');
    const third = await stampServiceWorker(dist);
    assert.notEqual(third.buildId, first.buildId, 'content changes invalidate unhashed assets');
    await rm(join(dist, 'assets/js/home-123.js'));
    await assert.rejects(() => stampServiceWorker(dist), /Missing homepage precache dependency/);
    console.log('PASS SW build stamp: deterministic ID, content invalidation, shell closure, missing assets rejected');
} finally {
    await rm(dist, { recursive: true, force: true });
}
