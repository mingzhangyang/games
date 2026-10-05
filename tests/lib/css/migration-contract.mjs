import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { propertiesOverlap } from './property-writes.mjs';

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
        const selectorDigest = declarationDigest(rule.migrationSelector || []);
        const contextDigest = declarationDigest(rule.migrationContext || []);
        const identity = [contextDigest, selectorDigest, rule.layer || null, digest];
        const key = jsonKey(identity);
        const occurrence = (seen.get(key) || 0) + 1;
        seen.set(key, occurrence);
        return {
            path,
            context: contextText(rule),
            selector: rule.selector,
            contextDigest,
            selectorDigest,
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
        contextDigest: rule.contextDigest,
        selectorDigest: rule.selectorDigest,
        layer: rule.layer,
        declarationDigest: rule.declarationDigest,
        occurrence: rule.occurrence,
    };
}

function canonicalRefKey(ref) {
    return jsonKey([
        ref?.path, ref?.contextDigest, ref?.selectorDigest, ref?.layer ?? null,
        ref?.declarationDigest, ref?.occurrence,
    ]);
}

function sameRef(actual, expected, includeLayer = true) {
    return actual.path === expected.path
        && actual.contextDigest === expected.contextDigest
        && actual.selectorDigest === expected.selectorDigest
        && (!includeLayer || actual.layer === (expected.layer || null))
        && actual.declarationDigest === expected.declarationDigest
        && actual.occurrence === expected.occurrence;
}

function findRule(catalog, ref, includeLayer = true) {
    return catalog.find(rule => sameRef(rule, ref, includeLayer));
}

function verifyRefDiagnostics(ref, rule, errors, label) {
    if (ref.context !== rule.context || ref.selector !== rule.selector) {
        errors.push(label + ': readable selector/context diagnostics do not match the canonical rule reference.');
    }
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

function destinationEntries(destinationRules) {
    return [...destinationRules]
        .sort((a, b) => a.sourceIndex - b.sourceIndex)
        .flatMap(rule => rule.declarations.map((declaration, declarationIndex) => ({
            declaration,
            layer: rule.layer,
            rule,
            declarationIndex,
        })));
}

function destinationAssignments(sourceRule, destinationRules) {
    const queues = new Map();
    for (const entry of destinationEntries(destinationRules)) {
        const key = declarationKey(entry.declaration);
        if (!queues.has(key)) queues.set(key, []);
        queues.get(key).push(entry);
    }
    return sourceRule.declarations.map(declaration => {
        const queue = queues.get(declarationKey(declaration)) || [];
        return queue.shift() || null;
    });
}

function declarationCounts(declarations) {
    const counts = new Map();
    for (const declaration of declarations) {
        const key = declarationKey(declaration);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

function sameDeclarationMultiset(left, right) {
    const a = declarationCounts(left);
    const b = declarationCounts(right);
    if (a.size !== b.size) return false;
    for (const [key, count] of a) if (b.get(key) !== count) return false;
    return true;
}

function comparePhysical(left, right) {
    if (left.rule.sourceIndex !== right.rule.sourceIndex) {
        return left.rule.sourceIndex - right.rule.sourceIndex;
    }
    return left.declarationIndex - right.declarationIndex;
}

function projectionKey(rule, declarationIndex) {
    return jsonKey([ruleRef(rule), declarationIndex]);
}

function layerPriority(targetLayer, peerLayer, priority, layerOrder) {
    if (!peerLayer) return priority === 'important' ? 'target-layer-wins' : 'peer-unlayered-wins';
    if (targetLayer === peerLayer) return 'same-layer';
    const targetRank = layerOrder.indexOf(targetLayer);
    const peerRank = layerOrder.indexOf(peerLayer);
    if (targetRank < 0 || peerRank < 0) return 'unreviewed-layer-relation';
    if (priority === 'important') return targetRank < peerRank ? 'target-layer-wins' : 'peer-layer-wins';
    return targetRank > peerRank ? 'target-layer-wins' : 'peer-layer-wins';
}

function layerStrength(layer, priority, layerOrder) {
    if (!layer) return priority === 'important' ? 0 : layerOrder.length + 1;
    const index = layerOrder.indexOf(layer);
    if (index < 0) return null;
    return priority === 'important' ? layerOrder.length - index : index + 1;
}

function stylesheetPosition(stylesheetLinks, page, path) {
    const positions = [];
    for (let index = 0; index < (stylesheetLinks[page] || []).length; index++) {
        if (stylesheetLinks[page][index][0] === path) positions.push(index);
    }
    return positions.length === 1 ? positions[0] : null;
}

function compareActivationOrder(left, right, page, stylesheetLinks) {
    if (left.rule.path === right.rule.path) return Math.sign(comparePhysical(left, right));
    if (!page) return null;
    const a = stylesheetPosition(stylesheetLinks, page, left.rule.path);
    const b = stylesheetPosition(stylesheetLinks, page, right.rule.path);
    if (a === null || b === null || a === b) return null;
    return Math.sign(a - b);
}

function compareCascadePrecedence(left, right, priority, page, stylesheetLinks, layerOrder) {
    const a = layerStrength(left.layer, priority, layerOrder);
    const b = layerStrength(right.layer, priority, layerOrder);
    if (a === null || b === null) return null;
    if (a !== b) return Math.sign(a - b);
    return compareActivationOrder(left, right, page, stylesheetLinks);
}

function verifyExactSelectorCascadePreservation(
    pending, baseCatalogs, projectedEntries, residualCurrentEntries,
    stylesheetLinks, layerOrder, errors,
) {
    const pagesByPath = coactivePages(stylesheetLinks);
    const seen = new Set();
    for (const { mapping, sourceRule } of pending) {
        for (let sourceIndex = 0; sourceIndex < sourceRule.declarations.length; sourceIndex++) {
            const sourceDeclaration = sourceRule.declarations[sourceIndex];
            const currentSource = projectedEntries.get(projectionKey(sourceRule, sourceIndex));
            if (!currentSource) continue;

            for (const rules of baseCatalogs.values()) {
                for (const peer of rules) {
                    if (peer.path === sourceRule.path && peer.sourceIndex === sourceRule.sourceIndex) continue;
                    if (peer.selectorDigest !== sourceRule.selectorDigest) continue;

                    for (let peerIndex = 0; peerIndex < peer.declarations.length; peerIndex++) {
                        const peerDeclaration = peer.declarations[peerIndex];
                        if (priorityOf(peerDeclaration) !== priorityOf(sourceDeclaration)
                            || !propertiesOverlap(peerDeclaration.property, sourceDeclaration.property)) continue;

                        const sourceProjection = projectionKey(sourceRule, sourceIndex);
                        const peerProjection = projectionKey(peer, peerIndex);
                        const currentPeer = projectedEntries.get(peerProjection)
                            || residualCurrentEntries.get(peerProjection);
                        if (!currentPeer) continue;

                        const pages = sourceRule.path === peer.path
                            ? [null]
                            : sharedPages(sourceRule.path, peer.path, pagesByPath);
                        for (const page of pages) {
                            const pair = [sourceProjection, peerProjection].sort().join(' <-> ')
                                + ' @ ' + (page || '<same-stylesheet>');
                            if (seen.has(pair)) continue;
                            seen.add(pair);

                            const before = compareCascadePrecedence(
                                { rule: sourceRule, layer: sourceRule.layer, declarationIndex: sourceIndex },
                                { rule: peer, layer: peer.layer, declarationIndex: peerIndex },
                                priorityOf(sourceDeclaration), page, stylesheetLinks, layerOrder,
                            );
                            const after = compareCascadePrecedence(
                                currentSource, currentPeer, priorityOf(sourceDeclaration),
                                page, stylesheetLinks, layerOrder,
                            );
                            if (before === null || after === null) {
                                errors.push(mapping.id + ': exact-selector cascade order is ambiguous for '
                                    + sourceDeclaration.property + ' / ' + peerDeclaration.property
                                    + (page ? ' on ' + page : '') + '; migration must fail closed.');
                            } else if (before !== after) {
                                errors.push(mapping.id + ': exact-selector cascade precedence changes for '
                                    + sourceDeclaration.property + ' / ' + peerDeclaration.property
                                    + (page ? ' on ' + page : '') + '.');
                            }
                        }
                    }
                }
            }
        }
    }
}

export function analyzeExactConflicts(
    mapping, sourceRule, destinationRules, baseCatalogs, stylesheetLinks, layerOrder,
    projectedLayers = new Map(),
) {
    const pagesByPath = coactivePages(stylesheetLinks);
    const result = { normal: [], important: [] };
    const assignments = destinationAssignments(sourceRule, destinationRules);
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
                if (peer.selectorDigest !== sourceRule.selectorDigest) continue;
                for (let peerIndex = 0; peerIndex < peer.declarations.length; peerIndex++) {
                    const peerDeclaration = peer.declarations[peerIndex];
                    if (!propertiesOverlap(peerDeclaration.property, declaration.property)) continue;
                    if (priorityOf(peerDeclaration) !== priority) continue;
                    const peerLayer = projectedLayers.get(projectionKey(peer, peerIndex)) ?? peer.layer;
                    result[priority].push({
                        property: declaration.property,
                        peerProperty: peerDeclaration.property,
                        targetLayer: destination.layer,
                        peerPath: peer.path,
                        peerContext: peer.context,
                        peerSourceLayer: peer.layer,
                        peerLayer,
                        layerPriority: layerPriority(destination.layer, peerLayer, priority, layerOrder),
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
    const actualDeclarations = destinationEntries(destinationRules).map(entry => entry.declaration);
    if (!sameDeclarationMultiset(actualDeclarations, sourceRule.declarations)) {
        errors.push(mapping.id + ': destination declarations must be a lossless partition of the source rule.');
    }

    const assignments = destinationAssignments(sourceRule, destinationRules);
    for (let left = 0; left < sourceRule.declarations.length; left++) {
        const leftDestination = assignments[left];
        if (!leftDestination) continue;
        for (let right = left + 1; right < sourceRule.declarations.length; right++) {
            const rightDestination = assignments[right];
            if (!rightDestination) continue;
            const leftDeclaration = sourceRule.declarations[left];
            const rightDeclaration = sourceRule.declarations[right];
            if (!propertiesOverlap(leftDeclaration.property, rightDeclaration.property)) continue;

            if (leftDestination.layer !== rightDestination.layer) {
                errors.push(mapping.id + ': overlapping properties ' + leftDeclaration.property + ' / '
                    + rightDeclaration.property + ' cannot be split across layers; preserve their intra-rule cascade.');
                continue;
            }
            if (priorityOf(leftDeclaration) === priorityOf(rightDeclaration)
                && comparePhysical(leftDestination, rightDestination) >= 0) {
                errors.push(mapping.id + ': physical destination order reverses overlapping '
                    + leftDeclaration.property + ' / ' + rightDeclaration.property
                    + ' declarations in layer ' + leftDestination.layer + '.');
            }
        }
    }

    for (const destination of destinationRules) {
        if (destination.selectorDigest !== sourceRule.selectorDigest
            || destination.contextDigest !== sourceRule.contextDigest) {
            errors.push(mapping.id + ': P2 layer migration cannot rewrite selector/context while moving a rule.');
        }
        if (!destination.layer) errors.push(mapping.id + ': every destination rule must be explicitly layered.');
    }
    return assignments;
}

function validRuleRef(ref, { requireDeclarations = false } = {}) {
    return ref && typeof ref.path === 'string' && ref.path.startsWith('css/')
        && Object.hasOwn(ref, 'layer') && (ref.layer === null || typeof ref.layer === 'string')
        && typeof ref.context === 'string' && typeof ref.selector === 'string'
        && /^[0-9a-f]{64}$/.test(ref.contextDigest || '')
        && /^[0-9a-f]{64}$/.test(ref.selectorDigest || '')
        && /^[0-9a-f]{64}$/.test(ref.declarationDigest || '')
        && Number.isInteger(ref.occurrence) && ref.occurrence > 0
        && (!requireDeclarations || Array.isArray(ref.declarations));
}

function isRetirement(mapping) {
    return mapping?.kind === 'retire';
}

function verifyMappingShape(mapping, allowedLayers, errors) {
    let valid = true;
    const kind = mapping.kind || 'migrate';
    if (!['migrate', 'retire'].includes(kind)) {
        errors.push(mapping.id + ': kind must be "migrate" or "retire".');
        valid = false;
    }
    if (!validRuleRef(mapping.source, { requireDeclarations: true })) {
        errors.push(mapping.id + ': source must be a complete stable rule reference with a declaration snapshot.');
        return false;
    }
    if (mapping.source.layer !== null && mapping.source.layer !== undefined
        && !allowedLayers.has(mapping.source.layer)) {
        errors.push(mapping.id + ': source layer ' + mapping.source.layer + ' is not reviewed.');
        valid = false;
    }
    if (declarationDigest(mapping.source.declarations) !== mapping.source.declarationDigest) {
        errors.push(mapping.id + ': source declarationDigest does not match its declaration snapshot.');
        valid = false;
    }

    if (isRetirement(mapping)) {
        if (mapping.source.layer !== null) {
            errors.push(mapping.id + ': P2-K retirement is intentionally limited to unlayered P0 rules.');
            valid = false;
        }
        if (!Array.isArray(mapping.destinations) || mapping.destinations.length) {
            errors.push(mapping.id + ': retired rules must declare an empty destinations array.');
            valid = false;
        }
        if (typeof mapping.reason !== 'string' || !mapping.reason.trim()) {
            errors.push(mapping.id + ': retired rules require a non-empty reason.');
            valid = false;
        }
        if ((mapping.source.declarations || []).some(declaration => declaration.important)) {
            errors.push(mapping.id + ': P2-K retirement does not support !important declarations.');
            valid = false;
        }
        if ((mapping.source.declarations || []).some(declaration => declaration.property.startsWith('--'))) {
            errors.push(mapping.id + ': P2-K retirement does not support custom-property declarations.');
            valid = false;
        }
        return valid;
    }

    if (!Array.isArray(mapping.destinations) || !mapping.destinations.length) {
        errors.push(mapping.id + ': at least one layered destination is required.');
        valid = false;
    }
    for (const destination of mapping.destinations || []) {
        if (!validRuleRef(destination)) {
            errors.push(mapping.id + ': every destination must be a complete stable rule reference.');
            valid = false;
            continue;
        }
        if (destination.path !== mapping.source.path) {
            errors.push(mapping.id + ': P2 layering may not move a rule between stylesheet files.');
            valid = false;
        }
        if (!allowedLayers.has(destination.layer)) {
            errors.push(mapping.id + ': destination layer ' + destination.layer + ' is not reviewed.');
            valid = false;
        }
    }
    for (const priority of PRIORITIES) {
        if (!Array.isArray(mapping.conflicts?.[priority])) {
            errors.push(mapping.id + ': conflicts.' + priority + ' must be an explicit array, even when empty.');
            valid = false;
        }
    }
    return valid;
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
        contextDigest: rule.contextDigest,
        selectorDigest: rule.selectorDigest,
        layer: rule.layer,
        declarationDigest: rule.declarationDigest,
        declarations: rule.declarations,
    }));
}

export function verifyRuleMigrations({
    baseline, state, currentParsedByPath, baseParsedByPath, stylesheetLinks,
    allowedLayers, layerOrder, baseState, errors,
}) {
    verifyMonotonicState(baseState || {}, state, errors);
    const currentCatalogs = new Map([...currentParsedByPath].map(([path, parsed]) => [path, indexRuleOccurrences(parsed, path)]));
    const baseCatalogs = new Map([...baseParsedByPath].map(([path, parsed]) => [path, indexRuleOccurrences(parsed, path)]));
    const baseMappings = mappingsById(baseState?.migratedRules || [], errors, 'base migratedRules');
    const mappings = mappingsById(state.migratedRules || [], errors, 'migratedRules');
    const expectedDebt = tupleCounts(baseline.debt?.unlayeredRules || []);
    // The append-only state is a historical ledger. Only mappings absent from the
    // comparison base form the current transaction; historical destinations may
    // legitimately be consumed by a new mapping in a later PR.
    const validMappings = new Set();
    for (const mapping of mappings.values()) {
        if (!verifyMappingShape(mapping, allowedLayers, errors)) continue;
        validMappings.add(mapping.id);
        if (mapping.source.layer === null) {
            const sourceTuple = tupleKey(mapping.source?.path, mapping.source?.context, mapping.source?.selector);
            subtractTuple(expectedDebt, sourceTuple, errors, mapping.id);
        }
    }

    const usedSources = new Set();
    const usedDestinations = new Set();
    const newMappingsByPath = new Map();
    const pendingConflictReviews = [];

    for (const mapping of mappings.values()) {
        if (baseMappings.has(mapping.id) || !validMappings.has(mapping.id)) continue;

        const sourceKey = canonicalRefKey(mapping.source);
        if (usedSources.has(sourceKey)) {
            errors.push(mapping.id + ': source rule is claimed by more than one migration in this transaction.');
        } else {
            usedSources.add(sourceKey);
        }

        const currentDestinationRules = [];
        for (const destination of mapping.destinations || []) {
            const catalog = currentCatalogs.get(destination.path) || [];
            const rule = findRule(catalog, destination, true);
            if (!rule) {
                errors.push(mapping.id + ': destination rule not found: ' + jsonKey(destination) + '.');
                continue;
            }
            verifyRefDiagnostics(destination, rule, errors, mapping.id + ' destination');
            const destinationKey = canonicalRefKey(ruleRef(rule));
            if (usedDestinations.has(destinationKey)) {
                errors.push(mapping.id + ': destination rule is claimed by more than one migration in this transaction.');
            } else {
                usedDestinations.add(destinationKey);
            }
            currentDestinationRules.push(rule);
        }

        const paths = new Set([mapping.source.path, ...(mapping.destinations || []).map(item => item.path)]);
        for (const path of paths) {
            if (!newMappingsByPath.has(path)) newMappingsByPath.set(path, []);
            newMappingsByPath.get(path).push(mapping);
        }

        const baseCatalog = baseCatalogs.get(mapping.source?.path) || [];
        const sourceRule = findRule(baseCatalog, mapping.source, true);
        if (!sourceRule) {
            errors.push(mapping.id + ': source rule was not present in the declared layer in the comparison base.');
            continue;
        }
        verifyRefDiagnostics(mapping.source, sourceRule, errors, mapping.id + ' source');
        if (jsonKey(sourceRule.declarations) !== jsonKey(mapping.source.declarations)) {
            errors.push(mapping.id + ': source declaration snapshot does not match the comparison base.');
        }
        if (isRetirement(mapping)) continue;
        if (currentDestinationRules.length === (mapping.destinations || []).length) {
            const assignments = verifyPartition(mapping, sourceRule, currentDestinationRules, errors);
            pendingConflictReviews.push({ mapping, sourceRule, currentDestinationRules, assignments });
        }
    }

    compareCounts(countsFromCurrentUnlayered(currentCatalogs), expectedDebt, errors,
        'unlayered rule debt must equal immutable P0 minus registered migrations');

    const mappedCssPaths = new Set([...mappings.values()].flatMap(mapping => [
        mapping.source?.path,
        ...(mapping.destinations || []).map(item => item.path),
    ]).filter(Boolean));
    if (mappings.size) mappedCssPaths.add('css/tokens.css');

    // Remove only newly declared source/destination occurrences, then pair every
    // remaining base rule with its unchanged current counterpart. This makes the
    // AST—not JSON array order—the source of truth for physical cascade position.
    const residualCurrentEntries = new Map();
    const allPaths = new Set([...baseCatalogs.keys(), ...currentCatalogs.keys()]);
    for (const path of allPaths) {
        const pathMappings = newMappingsByPath.get(path) || [];
        const baseCatalog = baseCatalogs.get(path) || [];
        const currentCatalog = currentCatalogs.get(path) || [];
        const sourceRefs = pathMappings.filter(mapping => mapping.source.path === path)
            .map(mapping => mapping.source);
        const destinationRefs = pathMappings
            .flatMap(mapping => (mapping.destinations || []).filter(item => item.path === path));
        const baseResidual = filterCatalog(baseCatalog, sourceRefs, true);
        const currentResidual = filterCatalog(currentCatalog, destinationRefs, true);
        const residualMatches = jsonKey(stableRuleRows(baseResidual)) === jsonKey(stableRuleRows(currentResidual));
        if (!residualMatches && mappedCssPaths.has(path)) {
            errors.push(path + ': rule changes beyond the newly registered migrations were detected against the comparison base.');
        }
        if (residualMatches) {
            for (let ruleIndex = 0; ruleIndex < baseResidual.length; ruleIndex++) {
                const baseRule = baseResidual[ruleIndex];
                const currentRule = currentResidual[ruleIndex];
                for (let declarationIndex = 0; declarationIndex < baseRule.declarations.length; declarationIndex++) {
                    residualCurrentEntries.set(projectionKey(baseRule, declarationIndex), {
                        rule: currentRule,
                        layer: currentRule.layer,
                        declarationIndex,
                        declaration: currentRule.declarations[declarationIndex],
                    });
                }
            }
        }

        if (mappedCssPaths.has(path)) {
            const baseParsed = baseParsedByPath.get(path);
            const currentParsed = currentParsedByPath.get(path);
            if (baseParsed && currentParsed) {
                if (jsonKey(baseParsed.keyframes) !== jsonKey(currentParsed.keyframes)) {
                    errors.push(path + ': keyframes changed during a rule-only P2 migration; keyframe mappings are not enabled yet.');
                }
                if (jsonKey(baseParsed.migrationAtRules || []) !== jsonKey(currentParsed.migrationAtRules || [])) {
                    errors.push(path + ': non-rule at-rule semantics changed outside the registered rule migrations.');
                }
            }
        }
    }

    const projectedEntries = new Map();
    const projectedLayers = new Map();
    for (const { sourceRule, assignments } of pendingConflictReviews) {
        assignments.forEach((destination, index) => {
            if (!destination) return;
            projectedEntries.set(projectionKey(sourceRule, index), destination);
            projectedLayers.set(projectionKey(sourceRule, index), destination.layer);
        });
    }

    verifyExactSelectorCascadePreservation(
        pendingConflictReviews, baseCatalogs, projectedEntries, residualCurrentEntries,
        stylesheetLinks, layerOrder, errors,
    );

    for (const { mapping, sourceRule, currentDestinationRules } of pendingConflictReviews) {
        verifyConflictReview(mapping,
            analyzeExactConflicts(
                mapping, sourceRule, currentDestinationRules, baseCatalogs,
                stylesheetLinks, layerOrder, projectedLayers,
            ), errors);
    }

    return {
        mappedCssPaths,
        newMigrationCount: [...mappings.keys()].filter(id => !baseMappings.has(id)).length,
    };
}
