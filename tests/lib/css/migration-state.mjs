import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readGitFile } from './migration-contract.mjs';

export const MIGRATION_STATE_PATH = 'tests/css-layer-migration-state.json';
const RULE_MODULE_ROOT = 'tests/css-layer-migrations/rules/';

function parseJson(text, label) {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(label + ' is not valid JSON: ' + error.message);
    }
}

function validateRuleModulePath(path) {
    if (typeof path !== 'string'
        || !path.startsWith(RULE_MODULE_ROOT)
        || !path.endsWith('.json')
        || path.includes('..')
        || path.includes('\\')) {
        throw new Error('Invalid CSS migration rule module path: ' + String(path));
    }
}

export function hydrateMigrationState(manifest, readText, label = 'migration state') {
    if (!Object.hasOwn(manifest, 'migratedRuleModules')) return manifest;

    const modulePaths = manifest.migratedRuleModules;
    if (!Array.isArray(modulePaths)) {
        throw new Error(label + ': migratedRuleModules must be an array.');
    }
    if ((manifest.migratedRules || []).length) {
        throw new Error(label + ': inline migratedRules cannot coexist with migratedRuleModules.');
    }

    const seenPaths = new Set();
    const seenIds = new Set();
    const migratedRules = [];

    for (const path of modulePaths) {
        validateRuleModulePath(path);
        if (seenPaths.has(path)) throw new Error(label + ': duplicate rule module ' + path + '.');
        seenPaths.add(path);

        const text = readText(path);
        if (text === null || text === undefined) {
            throw new Error(label + ': cannot read rule module ' + path + '.');
        }
        const mapping = parseJson(text, path);
        if (!mapping?.id || typeof mapping.id !== 'string') {
            throw new Error(path + ': rule module requires a stable string id.');
        }
        const expectedPath = RULE_MODULE_ROOT + mapping.id + '.json';
        if (path !== expectedPath) {
            throw new Error(path + ': module path must match mapping id ' + mapping.id + '.');
        }
        if (seenIds.has(mapping.id)) throw new Error(label + ': duplicate mapping id ' + mapping.id + '.');
        seenIds.add(mapping.id);
        migratedRules.push(mapping);
    }

    return { ...manifest, migratedRules };
}

export function readMigrationState(root) {
    const manifest = parseJson(
        readFileSync(join(root, MIGRATION_STATE_PATH), 'utf8'),
        MIGRATION_STATE_PATH,
    );
    return hydrateMigrationState(
        manifest,
        path => readFileSync(join(root, path), 'utf8'),
        'current migration state',
    );
}

export function readMigrationStateAtGit(root, sha) {
    if (!sha) return null;
    const manifestText = readGitFile(root, sha, MIGRATION_STATE_PATH);
    if (manifestText === null) return null;
    const manifest = parseJson(manifestText, 'comparison-base ' + MIGRATION_STATE_PATH);
    return hydrateMigrationState(
        manifest,
        path => readGitFile(root, sha, path),
        'comparison-base migration state',
    );
}
