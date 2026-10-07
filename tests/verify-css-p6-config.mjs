#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import legacy from '@vitejs/plugin-legacy';
import { loadConfigFromFile } from 'vite';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const CONFIG = resolve(ROOT, 'vite.config.js');
const RETIRED_PLUGIN = join(ROOT, 'tools/lib/shared-css-first.mjs');

function flattenPluginObjects(plugins) {
    return (plugins || [])
        .flat(Infinity)
        .filter(Boolean);
}

function pluginGraphSignature(plugins) {
    return flattenPluginObjects(plugins).map(plugin => ({
        name: plugin.name || '<anonymous>',
        enforce: plugin.enforce || null,
        apply: typeof plugin.apply === 'string' ? plugin.apply : typeof plugin.apply,
        hooks: Object.keys(plugin)
            .filter(key => !['name', 'enforce', 'apply'].includes(key))
            .sort(),
    }));
}

function nonPluginSignature(config) {
    const copy = { ...config };
    delete copy.plugins;
    return JSON.parse(JSON.stringify(copy));
}

function nestedRollupPluginGraph(config) {
    const rollupOptions = config.build?.rollupOptions || {};
    const outputs = Array.isArray(rollupOptions.output)
        ? rollupOptions.output
        : rollupOptions.output
            ? [rollupOptions.output]
            : [];

    return {
        input: pluginGraphSignature(rollupOptions.plugins),
        outputs: outputs
            .map((output, index) => ({
                index,
                plugins: pluginGraphSignature(output?.plugins),
            }))
            .filter(entry => entry.plugins.length > 0),
    };
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
const normalPluginGraph = pluginGraphSignature(normal.plugins);
const formerCanaryPluginGraph = pluginGraphSignature(formerCanary.plugins);
const normalNestedRollupPlugins = nestedRollupPluginGraph(normal);
const formerCanaryNestedRollupPlugins = nestedRollupPluginGraph(formerCanary);
const reviewedLegacyPluginGraph = pluginGraphSignature(
    legacy({ targets: ['defaults', 'not IE 11'] }),
);

assert.deepEqual(
    normalPluginGraph,
    reviewedLegacyPluginGraph,
    'P6 production plugin graph must remain exactly the reviewed @vitejs/plugin-legacy graph; '
        + 'project-local build plugins, including renamed stylesheet sorters, require an explicit contract change',
);
assert.deepEqual(
    formerCanaryPluginGraph,
    normalPluginGraph,
    'the former CSS_LAYER_CANARY environment variable must no longer alter the production plugin graph',
);
assert.deepEqual(
    normalNestedRollupPlugins,
    { input: [], outputs: [] },
    'P6 production build must not define build.rollupOptions.plugins or output.plugins; '
        + 'all project-local Rollup plugins require an explicit contract change',
);
assert.deepEqual(
    formerCanaryNestedRollupPlugins,
    normalNestedRollupPlugins,
    'the former CSS_LAYER_CANARY environment variable must not introduce nested Rollup plugins',
);
assert.deepEqual(
    nonPluginSignature(formerCanary),
    nonPluginSignature(normal),
    'the former CSS_LAYER_CANARY environment variable must no longer alter non-plugin Vite configuration',
);

console.log('PASS CSS P6 config contract: shared-css-first and its canary switch are fully retired');
