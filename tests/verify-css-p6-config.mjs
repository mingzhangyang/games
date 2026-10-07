#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfigFromFile } from 'vite';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const CONFIG = resolve(ROOT, 'vite.config.js');
const RETIRED_PLUGIN = join(ROOT, 'tools/lib/shared-css-first.mjs');

function flattenPlugins(plugins) {
    return (plugins || [])
        .flat(Infinity)
        .filter(Boolean)
        .map(plugin => plugin.name || '<anonymous>');
}

function nonPluginSignature(config) {
    const copy = { ...config };
    delete copy.plugins;
    return JSON.parse(JSON.stringify(copy));
}

async function load(formerCanaryEnv) {
    const previous = process.env.CSS_LAYER_CANARY;
    if (formerCanaryEnv === undefined) delete process.env.CSS_LAYER_CANARY;
    else process.env.CSS_LAYER_CANARY = formerCanaryEnv;

    try {
        const loaded = await loadConfigFromFile(
            { command: 'build', mode: 'production' },
            CONFIG,
            ROOT,
        );
        assert.ok(loaded?.config, 'vite.config.js must load for the P6 retirement contract');
        return loaded.config;
    } finally {
        if (previous === undefined) delete process.env.CSS_LAYER_CANARY;
        else process.env.CSS_LAYER_CANARY = previous;
    }
}

assert.equal(
    existsSync(RETIRED_PLUGIN),
    false,
    'P6 must delete tools/lib/shared-css-first.mjs rather than leave a dormant compatibility plugin',
);

const viteSource = readFileSync(CONFIG, 'utf8');
for (const fragment of ['shared-css-first', 'createSharedCssFirstPlugin', 'CSS_LAYER_CANARY']) {
    assert.equal(
        viteSource.includes(fragment),
        false,
        'P6 vite.config.js must not retain retired compatibility plumbing: ' + fragment,
    );
}

const normal = await load(undefined);
const formerCanary = await load('1');
const normalPlugins = flattenPlugins(normal.plugins);
const formerCanaryPlugins = flattenPlugins(formerCanary.plugins);

assert.equal(
    normalPlugins.includes('shared-css-first'),
    false,
    'production config must not contain the retired shared-css-first plugin',
);
assert.deepEqual(
    formerCanaryPlugins,
    normalPlugins,
    'the former CSS_LAYER_CANARY environment variable must no longer alter the production plugin graph',
);
assert.deepEqual(
    nonPluginSignature(formerCanary),
    nonPluginSignature(normal),
    'the former CSS_LAYER_CANARY environment variable must no longer alter non-plugin Vite configuration',
);

console.log('PASS CSS P6 config contract: shared-css-first and its canary switch are fully retired');
