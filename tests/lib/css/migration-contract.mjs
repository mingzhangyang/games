import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PRIORITIES = new Set(['normal', 'important']);

export const declarationDigest = declarations => createHash('sha256')
    .update(JSON.stringify(declarations))
    .digest('hex');

function jsonKey(value) {
    return JSON.stringify(value);
}

function contextText(rule) {
    return rule.context.join(' / ');
}

function declarationKey(declaration) {
    return jsonKey(declaration);
}

function priorityOf(declaration) {
    return declaration.important ? 'important' : 'normal';
}

export function indexRuleOccurrences(parsed, path) {
    const seen = new Map();
    return parsed.rules.map((rule, sourceIndex) => {
        const declarations = rule.migrationDeclarations || [];
        const digest = declarationDigest(declarations);
        const identity = [contextText(rule), rule.selector, rule.layer || null, digest];
        const key = jsonKey(identity);
        const occurrence = (seen.get(key) || 0) + 1;
        seen.set(key, occurrence);
        return {
            path,
            context: identity[0],
            selector: rule.selector,
            layer: rule.layer || null,
            declarationDigest: digest,
            declarations,
            occurrence,
            sourceIndex,
        };
    });
}

function ruleRef(rule) {
    return {
        path: rule.path,
        context: rule.context,
        selector: rule.selector,
        layer: rule.layer,
        declarationDigest: rule.declarationDigest,
        occurrence: rule.occurrence,
    };
}

function sameRef(actual, expected, includeLayer = true) {
    return actual.path === expected.path
        && actual.context === expected.context
        && actual.selector === expected.selector
        && (!includeLayer || actual.layer === (expected.layer || null))
        && actual.declarationDigest === expected.declarationDigest
        && actual.occurrence === expected.occurrence;
}

function findRule(catalog, ref, includeLayer = true) {
    return catalog.find(rule => sameRef(rule, ref, includeLayer));
}

function tupleKey(path, context, selector) {
    return jsonKey([path, context, selector]);
}

function tupleCounts(rows) {
    const counts = new Map();
    for (const [path, context, selector] of rows || []) {
        const key = tupleKey(path, context, selector);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

function subtractTuple(counts, key, errors, label) {
    const next = (counts.get(key) || 0) - 1;
    if (next < 0) {
        errors.push(label + ': migration source exceeds immutable P0 rule occurrences.');
        return;
    }
    if (next === 0) counts.delete(key);
    else counts.set(key, next);
}

function countsFromCurrentUnlayered(catalogs) {
    const counts = new Map();
    for (const rules of catalogs.values()) {
        for (const rule of rules) {
            if (rule.layer) continue;
            const key = tupleKey(rule.path, rule.context, rule.selector);
            counts.set(key, (counts.get(key) || 0) + 1);
        }
    }
    return counts;
}

function compareCounts(actual, expected, errors, label) {
    for (const key of new Set([...actual.keys(), ...expected.keys()])) {
        const a = actual.get(key) || 0;
        const e = expected.get(key) || 0;
        if (a !== e) errors.push(label + ': ' + key + ' has ' + a + ' current occurrence(s), expected ' + e + '.');
    }
}

function normalizeMapping(mapping) {
    return JSON.parse(JSON.stringify(mapping));
}

function mappingsById(list, errors, label) {
    const map = new Map();
    for (const mapping of list || []) {
        if (!mapping?.id || typeof mapping.id !== 'string') {
            errors.push(label + ': every migration entry requires a stable string id.');
            continue;
        }
        if (map.has(mapping.id)) errors.push(label + ': duplicate migration id ' + mapping.id + '.');
        else map.set(mapping.id, mapping);
    }
    return map;
}

export function verifyMonotonicState(baseState, currentState, errors) {
    for (const field of ['migratedRules', 'migratedKeyframes', 'migratedRuntimeStyleSources']) {
        const base = mappingsById(baseState?.[field] || [], errors, 'base ' + field);
        const current = mappingsById(currentState?.[field] || [], errors, field);
        for (const [id, entry] of base) {
            if (!current.has(id)) {
                errors.push(field + ': previously merged migration ' + id + ' was removed; the ratchet is one-way.');
            } else if (jsonKey(normalizeMapping(current.get(id))) !== jsonKey(normalizeMapping(entry))) {
                errors.push(field + ': previously merged migration ' + id + ' was modified; append a new migration instead.');
            }
        }
    }
}

export function resolveComparisonBase(root) {
    if (process.env.ARCHITECTURE_BASE_SHA) return process.env.ARCHITECTURE_BASE_SHA;
    for (const ref of ['origin/main', 'main']) {
        try {
            return execFileSync('git', ['merge-base', 'HEAD', ref], { cwd: root, encoding: 'utf8' }).trim();
        } catch {}
    }
    try {
        return execFileSync('git', ['rev-parse', 'HEAD^1'], { cwd: root, encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
}

export function readGitFile(root, sha, path) {
    if (!sha) return null;
    try {
        return execFileSync('git', ['show', sha + ':' + path], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    } catch {
        return null;
    }
}

function coactivePages(stylesheetLinks) {
    const pagesByPath = new Map();
    for (const [page, links] of Object.entries(stylesheetLinks || {})) {
        const internal = links.map(([href]) => href).filter(href => typeof href === 'string' && href.startsWith('css/'));
        for (const path of internal) {
            if (!pagesByPath.has(path)) pagesByPath.set(path, new Set());
            pagesByPath.get(path).add(page);
        }
    }
    return pagesByPath;
}

function sharedPages(left, right, pagesByPath) {
    const a = pagesByPath.get(left) || new Set();
    const b = pagesByPath.get(right) || new Set();
    return [...a].filter(page => b.has(page)).sort();
}

function destinationAssignments(mapping, sourceRule, destinationRules) {
    const queues = new Map();
    for (let index = 0; index < destinationRules.length; index++) {
        for (const declaration of destinationRules[index].declarations) {
            const key = declarationKey(declaration);
            if (!queues.has(key)) queues.set(key, []);
            queues.get(key).push(mapping.destinations[index]);
        }
    }
    return sourceRule.declarations.map(declaration => {
        const queue = queues.get(declarationKey(declaration)) || [];
        return queue.shift() || null;
    });
}

export function analyzeExactConflicts(mapping, sourceRule, destinationRules, baseCatalogs, stylesheetLinks) {
    const pagesByPath = coactivePages(stylesheetLinks);
    const result = { normal: [], important: [] };
    const assignments = destinationAssignments(mapping, sourceRule, destinationRules);
    for (let declarationIndex = 0; declarationIndex < sourceRule.declarations.length; declarationIndex++) {
        const declaration = sourceRule.declarations[declarationIndex];
        const priority = priorityOf(declaration);
        const destination = assignments[declarationIndex];
        if (!destination) continue;
        for (const [path, rules] of baseCatalogs) {
            const pages = sharedPages(sourceRule.path, path, pagesByPath);
            if (!pages.length) continue;
            for (const peer of rules) {
                if (peer.path === sourceRule.path && peer.sourceIndex === sourceRule.sourceIndex) continue;
                if (peer.selector !== sourceRule.selector) continue;
                for (const peerDeclaration of peer.declarations) {
                    if (peerDeclaration.property !== declaration.property) continue;
                    if (priorityOf(peerDeclaration) !== priority) continue;
                    result[priority].push({
                        property: declaration.property,
                        targetLayer: destination.layer,
                        peerPath: peer.path,
                        peerContext: peer.context,
                        peerLayer: peer.layer,
                        pages,
                    });
                }
            }
        }
    }
    for (const priority of PRIORITIES) {
        result[priority].sort((a, b) => jsonKey(a).localeCompare(jsonKey(b)));
    }
    return result;
}

function verifyConflictReview(mapping, computed, errors) {
    const reviewed = mapping.conflicts || {};
    for (const priority of PRIORITIES) {
        const actual = [...(reviewed[priority] || [])].sort((a, b) => jsonKey(a).localeCompare(jsonKey(b)));
        if (jsonKey(actual) !== jsonKey(computed[priority])) {
            errors.push(mapping.id + ': ' + priority + ' exact selector/property conflict review is incomplete or stale.');
        }
    }
}

function verifyPartition(mapping, sourceRule, destinationRules, errors) {
    const flattened = destinationRules.flatMap(rule => rule.declarations);
    if (jsonKey(flattened) !== jsonKey(sourceRule.declarations)) {
        errors.push(mapping.id + ': destination declarations must be an ordered, lossless partition of the source rule.');
    }
    for (const destination of destinationRules) {
        if (destination.selector !== sourceRule.selector || destination.context !== sourceRule.context) {
            errors.push(mapping.id + ': P2 layer migration cannot rewrite selector/context while moving a rule.');
        }
        if (!destination.layer) errors.push(mapping.id + ': every destination rule must be explicitly layered.');
    }
}

function verifyMappingShape(mapping, allowedLayers, errors) {
    if (!mapping.source || !Array.isArray(mapping.source.declarations)) {
        errors.push(mapping.id + ': source must include the reviewed declaration snapshot.');
        return;
    }
    if (mapping.source.layer !== null && mapping.source.layer !== undefined
        && !allowedLayers.has(mapping.source.layer)) {
        errors.push(mapping.id + ': source layer ' + mapping.source.layer + ' is not reviewed.');
    }
    if (declarationDigest(mapping.source.declarations) !== mapping.source.declarationDigest) {
        errors.push(mapping.id + ': source declarationDigest does not match its declaration snapshot.');
    }
    if (!Array.isArray(mapping.destinations) || !mapping.destinations.length) {
        errors.push(mapping.id + ': at least one layered destination is required.');
    }
    for (const destination of mapping.destinations || []) {
        if (!allowedLayers.has(destination.layer)) errors.push(mapping.id + ': destination layer ' + destination.layer + ' is not reviewed.');
    }
    for (const priority of PRIORITIES) {
        if (!Array.isArray(mapping.conflicts?.[priority])) {
            errors.push(mapping.id + ': conflicts.' + priority + ' must be an explicit array, even when empty.');
        }
    }
}

function filterCatalog(catalog, refs, includeLayer) {
    const used = new Set();
    return catalog.filter(rule => {
        const matchIndex = refs.findIndex((ref, index) => !used.has(index) && sameRef(rule, ref, includeLayer));
        if (matchIndex < 0) return true;
        used.add(matchIndex);
        return false;
    });
}

function stableRuleRows(catalog) {
    return catalog.map(rule => ({
        context: rule.context,
        selector: rule.selector,
        layer: rule.layer,
        declarationDigest: rule.declarationDigest,
        declarations: rule.declarations,
    }));
}

export function verifyRuleMigrations({
    baseline, state, currentParsedByPath, baseParsedByPath, stylesheetLinks, allowedLayers, baseState, errors,
}) {
    verifyMonotonicState(baseState || {}, state, errors);
    const currentCatalogs = new Map([...currentParsedByPath].map(([path, parsed]) => [path, indexRuleOccurrences(parsed, path)]));
    const baseCatalogs = new Map([...baseParsedByPath].map(([path, parsed]) => [path, indexRuleOccurrences(parsed, path)]));
    const baseMappings = mappingsById(baseState?.migratedRules || [], errors, 'base migratedRules');
    const mappings = mappingsById(state.migratedRules || [], errors, 'migratedRules');
    const expectedDebt = tupleCounts(baseline.debt?.unlayeredRules || []);
    const usedDestinations = new Set();
    const newMappingsByPath = new Map();

    for (const mapping of mappings.values()) {
        verifyMappingShape(mapping, allowedLayers, errors);
        if (mapping.source?.layer === null || mapping.source?.layer === undefined) {
            const sourceTuple = tupleKey(mapping.source?.path, mapping.source?.context, mapping.source?.selector);
            subtractTuple(expectedDebt, sourceTuple, errors, mapping.id);
        }

        const currentDestinationRules = [];
        for (const destination of mapping.destinations || []) {
            const catalog = currentCatalogs.get(destination.path) || [];
            const rule = findRule(catalog, destination, true);
            if (!rule) {
                errors.push(mapping.id + ': destination rule not found: ' + jsonKey(destination) + '.');
                continue;
            }
            const destinationKey = jsonKey(ruleRef(rule));
            if (usedDestinations.has(destinationKey)) errors.push(mapping.id + ': destination rule is claimed by more than one migration.');
            usedDestinations.add(destinationKey);
            currentDestinationRules.push(rule);
        }

        if (baseMappings.has(mapping.id)) {
            if (currentDestinationRules.length === (mapping.destinations || []).length) {
                verifyPartition(mapping, { ...mapping.source, path: mapping.source.path }, currentDestinationRules, errors);
            }
            continue;
        }

        const baseCatalog = baseCatalogs.get(mapping.source?.path) || [];
        const sourceRule = findRule(baseCatalog, mapping.source, true);
        if (!sourceRule) {
            errors.push(mapping.id + ': source rule was not present in the declared layer in the comparison base.');
            continue;
        }
        if (jsonKey(sourceRule.declarations) !== jsonKey(mapping.source.declarations)) {
            errors.push(mapping.id + ': source declaration snapshot does not match the comparison base.');
        }
        if (currentDestinationRules.length === (mapping.destinations || []).length) {
            verifyPartition(mapping, sourceRule, currentDestinationRules, errors);
            verifyConflictReview(mapping,
                analyzeExactConflicts(mapping, sourceRule, currentDestinationRules, baseCatalogs, stylesheetLinks), errors);
        }
        const paths = new Set([mapping.source.path, ...(mapping.destinations || []).map(item => item.path)]);
        for (const path of paths) {
            if (!newMappingsByPath.has(path)) newMappingsByPath.set(path, []);
            newMappingsByPath.get(path).push(mapping);
        }
    }

    compareCounts(countsFromCurrentUnlayered(currentCatalogs), expectedDebt, errors,
        'unlayered rule debt must equal immutable P0 minus registered migrations');

    const mappedCssPaths = new Set([...mappings.values()].flatMap(mapping => [
        mapping.source?.path,
        ...(mapping.destinations || []).map(item => item.path),
    ]).filter(Boolean));
    if (mappings.size) mappedCssPaths.add('css/tokens.css');
    for (const path of mappedCssPaths) {
        const pathMappings = newMappingsByPath.get(path) || [];
        const baseCatalog = baseCatalogs.get(path) || [];
        const currentCatalog = currentCatalogs.get(path) || [];
        const sourceRefs = pathMappings.filter(mapping => mapping.source.path === path)
            .map(mapping => mapping.source);
        const destinationRefs = pathMappings.flatMap(mapping => (mapping.destinations || []).filter(item => item.path === path));
        const baseResidual = filterCatalog(baseCatalog, sourceRefs, true);
        const currentResidual = filterCatalog(currentCatalog, destinationRefs, true);
        if (jsonKey(stableRuleRows(baseResidual)) !== jsonKey(stableRuleRows(currentResidual))) {
            errors.push(path + ': rule changes beyond the newly registered migrations were detected against the comparison base.');
        }
        const baseParsed = baseParsedByPath.get(path);
        const currentParsed = currentParsedByPath.get(path);
        if (baseParsed && currentParsed) {
            if (jsonKey(baseParsed.keyframes) !== jsonKey(currentParsed.keyframes)) {
                errors.push(path + ': keyframes changed during a rule-only P2 migration; keyframe mappings are not enabled yet.');
            }
            if (jsonKey(baseParsed.specialAtRules || []) !== jsonKey(currentParsed.specialAtRules || [])) {
                errors.push(path + ': special at-rules changed outside the registered rule migrations.');
            }
        }
    }

    return {
        mappedCssPaths,
        newMigrationCount: [...mappings.keys()].filter(id => !baseMappings.has(id)).length,
    };
}
