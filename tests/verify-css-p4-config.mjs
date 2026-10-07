#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadConfigFromFile } from 'vite';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const CONFIG = resolve(ROOT, 'vite.config.js');

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

async function load(canary) {
    const previous = process.env.CSS_LAYER_CANARY;
    if (canary) process.env.CSS_LAYER_CANARY = '1';
    else delete process.env.CSS_LAYER_CANARY;
    try {
        const loaded = await loadConfigFromFile(
            { command: 'build', mode: 'production' },
            CONFIG,
            ROOT,
        );
        assert.ok(loaded?.config, 'vite.config.js must load for the P4 contract');
        return loaded.config;
    } finally {
        if (previous === undefined) delete process.env.CSS_LAYER_CANARY;
        else process.env.CSS_LAYER_CANARY = previous;
    }
}

const normal = await load(false);
const canary = await load(true);
const normalPlugins = flattenPlugins(normal.plugins);
const canaryPlugins = flattenPlugins(canary.plugins);

assert.equal(
    normalPlugins.filter(name => name === 'shared-css-first').length,
    1,
    'normal production config must include shared-css-first exactly once',
);
assert.equal(
    canaryPlugins.includes('shared-css-first'),
    false,
    'P4 canary config must exclude shared-css-first',
);
assert.deepEqual(
    normalPlugins.filter(name => name !== 'shared-css-first'),
    canaryPlugins,
    'P4 canary may differ from normal production only by shared-css-first in the plugin graph',
);
assert.deepEqual(
    nonPluginSignature(normal),
    nonPluginSignature(canary),
    'P4 canary may not change non-plugin Vite configuration',
);

console.log('PASS CSS P4 config contract: canary removes only shared-css-first');
