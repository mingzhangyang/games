import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { verifyDedupeAdoption } from './dedupe-adoption.mjs';
import { mappedStylesheetPaths, mappingDestinations, mappingSources } from './migration-record.mjs';
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

function declarationValueText(value) {
    return Array.isArray(value) ? value.map(token => token[1]).join('') : value;
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

function verifyDedupePartition(mapping, sourceRule, destinationRules, errors) {
    const actualDeclarations = destinationEntries(destinationRules).map(entry => entry.declaration);
    if (!sameDeclarationMultiset(actualDeclarations, sourceRule.declarations)) {
        errors.push(mapping.id + ': dedupe destination declarations must exactly match every source rule.');
    }
    for (const destination of destinationRules) {
        if (!destination.layer) errors.push(mapping.id + ': dedupe destination must be explicitly layered.');
    }
    return destinationAssignments(sourceRule, destinationRules);
}

function validDeclarationSnapshot(declaration) {
    return declaration && !Array.isArray(declaration)
        && typeof declaration === 'object'
        && typeof declaration.property === 'string'
        && declaration.property.length > 0
        && Array.isArray(declaration.value)
        && typeof declaration.important === 'boolean';
}

function validRuleRef(ref, { requireDeclarations = false } = {}) {
    return ref && typeof ref.path === 'string' && ref.path.startsWith('css/')
        && Object.hasOwn(ref, 'layer') && (ref.layer === null || typeof ref.layer === 'string')
        && typeof ref.context === 'string' && typeof ref.selector === 'string'
        && /^[0-9a-f]{64}$/.test(ref.contextDigest || '')
        && /^[0-9a-f]{64}$/.test(ref.selectorDigest || '')
        && /^[0-9a-f]{64}$/.test(ref.declarationDigest || '')
        && Number.isInteger(ref.occurrence) && ref.occurrence > 0
        && (!requireDeclarations || (
            Array.isArray(ref.declarations)
            && ref.declarations.every(validDeclarationSnapshot)
        ));
}

function isRetirement(mapping) {
    return mapping?.kind === 'retire';
}

function isDeduplication(mapping) {
    return mapping?.kind === 'dedupe';
}

const RESET_UNIVERSAL_SELECTORS = new Set(['*', '*, *::before, *::after']);

const ACCESSIBILITY_CONTEXT = '@media (prefers-reduced-motion: reduce)';
const ACCESSIBILITY_PROPERTIES = new Set([
    'animation', 'animation-duration', 'animation-iteration-count',
    'scroll-behavior', 'transition', 'transition-duration',
]);

function verifyAccessibilityMappingInvariant(mapping, errors) {
    if (!(mapping.destinations || []).some(destination => destination?.layer === 'accessibility')) return true;

    let valid = true;
    if (mapping.source.layer !== null) {
        errors.push(mapping.id + ': accessibility contract v3 only migrates unlayered P0 reduced-motion rules.');
        valid = false;
    }
    if (mapping.source.context !== ACCESSIBILITY_CONTEXT
        || (mapping.destinations || []).some(destination => destination?.context !== ACCESSIBILITY_CONTEXT)) {
        errors.push(mapping.id + ': accessibility layer is limited to prefers-reduced-motion: reduce rules.');
        valid = false;
    }
    if ((mapping.source.declarations || []).some(declaration => !declaration.important)) {
        errors.push(mapping.id + ': accessibility layer accepts !important reduced-motion declarations only.');
        valid = false;
    }
    if ((mapping.source.declarations || []).some(declaration => !ACCESSIBILITY_PROPERTIES.has(declaration.property))) {
        errors.push(mapping.id + ': accessibility layer contains an unreviewed motion property.');
        valid = false;
    }
    if ((mapping.destinations || []).some(destination => destination?.layer !== 'accessibility')) {
        errors.push(mapping.id + ': an accessibility migration must keep the whole source rule in accessibility.');
        valid = false;
    }
    return valid;
}

function verifyResetMappingInvariant(mapping, errors) {
    // A layered reset source cannot escape into a higher cascade layer,
    // just as a newly created reset destination must satisfy reset policy.
    if (mapping.source?.layer !== 'reset'
        && !(mapping.destinations || []).some(destination => destination?.layer === 'reset')) return true;

    let valid = true;
    if (mapping.source.context !== ''
        || (mapping.destinations || []).some(destination => destination?.context !== '')) {
        errors.push(mapping.id + ': reset layer is limited to top-level rules; conditional/nested resets require a separate contract.');
        valid = false;
    }
    if (!RESET_UNIVERSAL_SELECTORS.has(mapping.source.selector)
        || (mapping.destinations || []).some(destination => destination?.selector !== mapping.source.selector)) {
        errors.push(mapping.id + ': reset layer is limited to reviewed universal selectors (* or *, *::before, *::after).');
        valid = false;
    }
    if ((mapping.source.declarations || []).some(declaration => declaration.important)) {
        errors.push(mapping.id + ': reset layer accepts normal declarations only; !important reset/accessibility rules require a separate contract.');
        valid = false;
    }
    if ((mapping.destinations || []).some(destination => destination?.layer !== 'reset')) {
        errors.push(mapping.id + ': a reset migration must keep the whole rule in reset; split-layer reset mappings are not reviewed.');
        valid = false;
    }
    return valid;
}

function verifyDedupeResetMappingInvariant(mapping, errors) {
    const sources = mapping.sources || [];
    // Reset ownership is symmetric: source rules may not escape this policy
    // merely because the destination was moved into another allowed layer.
    if (mapping.destination?.layer !== 'reset'
        && !sources.some(source => source?.layer === 'reset')) return true;

    let valid = true;
    if (mapping.destination.context !== '' || sources.some(source => source?.context !== '')) {
        errors.push(mapping.id + ': reset deduplication is limited to top-level rules; conditional/nested resets require a separate contract.');
        valid = false;
    }
    if (!['*', '.game-reset, .game-reset *'].includes(mapping.destination.selector)
        || sources.some(source => source?.selector !== '*')) {
        errors.push(mapping.id + ': reset deduplication is limited to reviewed universal * rules or the explicit .game-reset scope.');
        valid = false;
    }
    if (mapping.destination.selector === '.game-reset, .game-reset *'
        && (mapping.adoption?.surface !== 'root-class'
            || (mapping.adoption.consumers || []).some(consumer => consumer.rootClass !== 'game-reset'))) {
        errors.push(mapping.id + ': scoped reset deduplication requires root-class adoption evidence for .game-reset.');
        valid = false;
    }
    if (mapping.destination.layer !== 'reset' || sources.some(source => source?.layer !== 'reset')) {
        errors.push(mapping.id + ': reset deduplication must keep every universal rule in reset.');
        valid = false;
    }
    if (sources.some(source => (source?.declarations || []).some(declaration => declaration.important))) {
        errors.push(mapping.id + ': reset deduplication accepts normal declarations only.');
        valid = false;
    }
    if (sources.some(source => (source?.declarations || []).some(declaration => declaration.property.startsWith('--')))) {
        errors.push(mapping.id + ': reset deduplication does not accept custom-property declarations.');
        valid = false;
    }
    return valid;
}

function verifyDedupeMappingShape(mapping, allowedLayers, errors) {
    let valid = true;
    if (!Array.isArray(mapping.sources) || mapping.sources.length < 2) {
        errors.push(mapping.id + ': dedupe mappings require at least two source rules.');
        return false;
    }
    if (!validRuleRef(mapping.destination)) {
        errors.push(mapping.id + ': dedupe mappings require one complete stable destination reference.');
        valid = false;
    }
    if (mapping.destination?.layer !== null && mapping.destination?.layer !== undefined
        && !allowedLayers.has(mapping.destination.layer)) {
        errors.push(mapping.id + ': destination layer ' + mapping.destination.layer + ' is not reviewed.');
        valid = false;
    }
    if (!mapping.destination?.layer) {
        errors.push(mapping.id + ': dedupe destinations must be explicitly layered.');
        valid = false;
    }
    if (typeof mapping.reason !== 'string' || !mapping.reason.trim()) {
        errors.push(mapping.id + ': dedupe mappings require a non-empty reason.');
        valid = false;
    }
    if (typeof mapping.reuseExistingDestination !== 'boolean') {
        errors.push(mapping.id + ': dedupe mappings must explicitly declare reuseExistingDestination.');
        valid = false;
    }

    const firstSource = mapping.sources[0] || {};
    for (const source of mapping.sources) {
        if (!validRuleRef(source, { requireDeclarations: true })) {
            errors.push(mapping.id + ': every dedupe source must be a complete stable rule reference with a declaration snapshot.');
            valid = false;
            continue;
        }
        if (source.layer !== null && source.layer !== undefined && !allowedLayers.has(source.layer)) {
            errors.push(mapping.id + ': source layer ' + source.layer + ' is not reviewed.');
            valid = false;
        }
        if (declarationDigest(source.declarations) !== source.declarationDigest) {
            errors.push(mapping.id + ': source declarationDigest does not match its declaration snapshot.');
            valid = false;
        }
        if (firstSource && (source.context !== firstSource.context
            || source.contextDigest !== firstSource.contextDigest
            || source.declarationDigest !== firstSource.declarationDigest
            || jsonKey(source.declarations) !== jsonKey(firstSource.declarations))) {
            errors.push(mapping.id + ': dedupe sources must share one context and one exact declaration snapshot.');
            valid = false;
        }
    }
    if (validRuleRef(mapping.destination)) {
        if (mapping.destination.context !== firstSource.context
            || mapping.destination.contextDigest !== firstSource.contextDigest
            || mapping.destination.declarationDigest !== firstSource.declarationDigest) {
            errors.push(mapping.id + ': dedupe destination must preserve source context and declarations.');
            valid = false;
        }
    }
    if (validRuleRef(mapping.destination) && mapping.destination.selector !== firstSource.selector
        && (!mapping.adoption || typeof mapping.adoption.surface !== 'string'
            || !Array.isArray(mapping.adoption.consumers))) {
        errors.push(mapping.id + ': dedupe selector changes require explicit per-source adoption evidence.');
        valid = false;
    }
    for (const priority of PRIORITIES) {
        if (!Array.isArray(mapping.conflicts?.[priority])) {
            errors.push(mapping.id + ': conflicts.' + priority + ' must be an explicit array, even when empty.');
            valid = false;
        }
    }
    if (!verifyDedupeResetMappingInvariant(mapping, errors)) valid = false;
    return valid;
}

function verifyMappingShape(mapping, allowedLayers, errors) {
    let valid = true;
    const kind = mapping.kind || 'migrate';
    if (!['migrate', 'retire', 'dedupe'].includes(kind)) {
        errors.push(mapping.id + ': kind must be "migrate", "retire", or "dedupe".');
        valid = false;
    }
    if (isDeduplication(mapping)) return verifyDedupeMappingShape(mapping, allowedLayers, errors);
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
    if (!verifyResetMappingInvariant(mapping, errors)) valid = false;
    if (!verifyAccessibilityMappingInvariant(mapping, errors)) valid = false;
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
    htmlSources = new Map(),
    allowedLayers, layerOrder, baseState, externalRuleChanges = { base: [], current: [] },
    guardedCssPaths = new Set(), errors,
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
        // Adoption is a continuing invariant of the append-only dedupe ledger,
        // not a one-time proof. Recheck current HTML and linked stylesheets even
        // after a mapping has entered the comparison base.
        if (isDeduplication(mapping)) {
            verifyDedupeAdoption(
                mapping, mapping.sources, mapping.destination, coactivePages(stylesheetLinks), htmlSources, errors,
            );
        }
        for (const source of mappingSources(mapping)) {
            if (source?.layer === null) {
                const sourceTuple = tupleKey(source?.path, source?.context, source?.selector);
                subtractTuple(expectedDebt, sourceTuple, errors, mapping.id);
            }
        }
    }

    const usedSources = new Set();
    const usedDestinations = new Set();
    const newMappingsByPath = new Map();
    const pendingConflictReviews = [];
    const transactionExternalBase = [...(externalRuleChanges.base || [])];
    const transactionExternalCurrent = [...(externalRuleChanges.current || [])];
    const importantDeclarationDelta = { removed: [], added: [] };

    for (const mapping of mappings.values()) {
        if (baseMappings.has(mapping.id) || !validMappings.has(mapping.id)) continue;

        const sources = mappingSources(mapping);
        const destinations = mappingDestinations(mapping);
        for (const source of sources) {
            const sourceKey = canonicalRefKey(source);
            if (usedSources.has(sourceKey)) {
                errors.push(mapping.id + ': source rule is claimed by more than one migration in this transaction.');
            } else {
                usedSources.add(sourceKey);
            }
        }

        const currentDestinationRules = [];
        for (const destination of destinations) {
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

        const paths = mappedStylesheetPaths([mapping]);
        for (const path of paths) {
            if (!newMappingsByPath.has(path)) newMappingsByPath.set(path, []);
            newMappingsByPath.get(path).push(mapping);
        }

        const sourceRules = [];
        for (const source of sources) {
            const baseCatalog = baseCatalogs.get(source?.path) || [];
            const sourceRule = findRule(baseCatalog, source, true);
            if (!sourceRule) {
                errors.push(mapping.id + ': source rule was not present in the declared layer in the comparison base.');
                continue;
            }
            verifyRefDiagnostics(source, sourceRule, errors, mapping.id + ' source');
            if (jsonKey(sourceRule.declarations) !== jsonKey(source.declarations)) {
                errors.push(mapping.id + ': source declaration snapshot does not match the comparison base.');
            }
            sourceRules.push(sourceRule);
        }

        if (!isRetirement(mapping)) {
            for (const sourceRule of sourceRules) {
                for (const declaration of sourceRule.declarations) {
                    if (declaration.important) {
                        importantDeclarationDelta.removed.push([
                            sourceRule.path, sourceRule.context, sourceRule.selector,
                            declaration.property, declarationValueText(declaration.value),
                        ]);
                    }
                }
            }
            if (!(isDeduplication(mapping) && mapping.reuseExistingDestination)) {
                for (const destinationRule of currentDestinationRules) {
                    for (const declaration of destinationRule.declarations) {
                        if (declaration.important) {
                            importantDeclarationDelta.added.push([
                                destinationRule.path, destinationRule.context, destinationRule.selector,
                                declaration.property, declarationValueText(declaration.value),
                            ]);
                        }
                    }
                }
            }
        }

        if (isRetirement(mapping)) continue;

        if (isDeduplication(mapping)) {
            const destination = destinations[0];
            const currentDestination = currentDestinationRules[0];
            if (mapping.reuseExistingDestination) {
                const baseDestination = findRule(baseCatalogs.get(destination?.path) || [], destination, true);
                if (!baseDestination) {
                    errors.push(mapping.id + ': reuseExistingDestination requires the destination to exist in the comparison base.');
                } else {
                    verifyRefDiagnostics(destination, baseDestination, errors, mapping.id + ' comparison-base destination');
                    transactionExternalBase.push(baseDestination);
                    if (currentDestination) transactionExternalCurrent.push(currentDestination);
                }
            } else if (findRule(baseCatalogs.get(destination?.path) || [], destination, true)) {
                errors.push(mapping.id + ': a new dedupe destination must not already exist in the comparison base.');
            }
            for (const source of sources) {
                const currentSource = findRule(currentCatalogs.get(source?.path) || [], source, true);
                if (currentSource) {
                    errors.push(mapping.id + ': dedupe source rule still exists in the current stylesheet: ' + jsonKey(source) + '.');
                }
            }
            if (sourceRules.length === sources.length
                && currentDestinationRules.length === destinations.length) {
                for (const sourceRule of sourceRules) {
                    const assignments = verifyDedupePartition(mapping, sourceRule, currentDestinationRules, errors);
                    pendingConflictReviews.push({ mapping, sourceRule, currentDestinationRules, assignments });
                }
            }
            continue;
        }

        const sourceRule = sourceRules[0];
        if (sourceRule && currentDestinationRules.length === destinations.length) {
            const assignments = verifyPartition(mapping, sourceRule, currentDestinationRules, errors);
            pendingConflictReviews.push({ mapping, sourceRule, currentDestinationRules, assignments });
        }
    }

    compareCounts(countsFromCurrentUnlayered(currentCatalogs), expectedDebt, errors,
        'unlayered rule debt must equal immutable P0 minus registered migrations');

    const mappedCssPaths = mappedStylesheetPaths(mappings.values());
    if (mappings.size) mappedCssPaths.add('css/tokens.css');
    const externallyReviewedPaths = new Set([
        ...(externalRuleChanges.base || []).map(rule => rule.path),
        ...(externalRuleChanges.current || []).map(rule => rule.path),
    ]);
    const reviewedChangedPaths = new Set([
        ...mappedCssPaths,
        ...externallyReviewedPaths,
        ...guardedCssPaths,
    ]);

    // Remove only newly declared source/destination occurrences, plus rule occurrences
    // consumed/produced by an independently verified family-extraction transaction, then pair every
    // remaining base rule with its unchanged current counterpart. This makes the
    // AST—not JSON array order—the source of truth for physical cascade position.
    const residualCurrentEntries = new Map();
    const allPaths = new Set([...baseCatalogs.keys(), ...currentCatalogs.keys()]);
    for (const path of allPaths) {
        const pathMappings = newMappingsByPath.get(path) || [];
        const baseCatalog = baseCatalogs.get(path) || [];
        const currentCatalog = currentCatalogs.get(path) || [];
        const sourceRefs = pathMappings
            .flatMap(mapping => mappingSources(mapping).filter(item => item?.path === path));
        const destinationRefs = pathMappings
            .flatMap(mapping => mappingDestinations(mapping).filter(item => item?.path === path));
        const externalBaseRefs = transactionExternalBase.filter(rule => rule.path === path);
        const externalCurrentRefs = transactionExternalCurrent.filter(rule => rule.path === path);
        const baseResidual = filterCatalog(filterCatalog(baseCatalog, sourceRefs, true), externalBaseRefs, true);
        const currentResidual = filterCatalog(filterCatalog(currentCatalog, destinationRefs, true), externalCurrentRefs, true);
        const residualMatches = jsonKey(stableRuleRows(baseResidual)) === jsonKey(stableRuleRows(currentResidual));
        if (!residualMatches && reviewedChangedPaths.has(path)) {
            errors.push(path + ': rule changes beyond the registered migration/family transactions were detected against the comparison base.');
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

        if (reviewedChangedPaths.has(path)) {
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

    const dedupeComputedById = new Map();
    for (const pending of pendingConflictReviews) {
        const { mapping, sourceRule, currentDestinationRules } = pending;
        let computed;
        if (isDeduplication(mapping)) {
            if (!dedupeComputedById.has(mapping.id)) {
                const aggregate = { normal: [], important: [] };
                const seen = { normal: new Set(), important: new Set() };
                for (const candidate of pendingConflictReviews.filter(item => item.mapping.id === mapping.id)) {
                    const candidateComputed = analyzeExactConflicts(
                        mapping, candidate.sourceRule, candidate.currentDestinationRules,
                        baseCatalogs, stylesheetLinks, layerOrder, projectedLayers,
                    );
                    for (const priority of PRIORITIES) {
                        for (const row of candidateComputed[priority]) {
                            const key = jsonKey(row);
                            if (!seen[priority].has(key)) {
                                seen[priority].add(key);
                                aggregate[priority].push(row);
                            }
                        }
                    }
                }
                dedupeComputedById.set(mapping.id, aggregate);
            }
            computed = dedupeComputedById.get(mapping.id);
        } else {
            computed = analyzeExactConflicts(
                mapping, sourceRule, currentDestinationRules, baseCatalogs,
                stylesheetLinks, layerOrder, projectedLayers,
            );
        }
        verifyConflictReview(mapping, computed, errors);
    }

    const newMappings = [...mappings.values()].filter(mapping => !baseMappings.has(mapping.id));
    const newRuleDelta = newMappings.reduce((delta, mapping) => {
        if (isDeduplication(mapping)) {
            return delta + (mapping.reuseExistingDestination ? 0 : 1) - mappingSources(mapping).length;
        }
        if (isRetirement(mapping)) return delta - 1;
        return delta + mappingDestinations(mapping).length - 1;
    }, 0);

    return {
        mappedCssPaths,
        newMigrationCount: [...mappings.keys()].filter(id => !baseMappings.has(id)).length,
        newRuleDelta,
        importantDeclarationDelta,
    };
}
