import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { htmlElementAttributes, parseHtmlElements } from './html-inputs.mjs';
import { indexRuleOccurrences, readGitFile } from './migration-contract.mjs';

export const FAMILY_EXTRACTION_STATE_PATH = 'tests/css-family-extraction-state.json';

function parseState(text, label) {
    if (text === null || text === undefined) {
        return { schemaVersion: 1, contract: 'append-only-family-extraction-v1', extractions: [] };
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(label + ' is not valid JSON: ' + error.message);
    }
}

function canonical(value) {
    return JSON.stringify(value);
}

function tupleKey(tuple) {
    return canonical(tuple);
}

function uniqueRule(parsed, selector, layer, errors, label) {
    const matches = (parsed?.rules || []).filter(rule =>
        rule.selector === selector
        && (rule.layer || null) === (layer || null)
        && (rule.context || []).length === 0);
    if (matches.length !== 1) {
        errors.push(label + ': expected exactly one top-level ' + selector + ' rule in layer '
            + (layer || '<unlayered>') + ', found ' + matches.length + '.');
        return null;
    }
    return matches[0];
}

function uniqueCatalogRule(catalog, selector, layer, errors, label) {
    const matches = (catalog || []).filter(rule =>
        rule.selector === selector
        && (rule.layer || null) === (layer || null)
        && rule.context === '');
    if (matches.length !== 1) {
        errors.push(label + ': expected exactly one indexed ' + selector + ' rule in layer '
            + (layer || '<unlayered>') + ', found ' + matches.length + '.');
        return null;
    }
    return matches[0];
}

function declarationKey(declaration) {
    return canonical(declaration);
}

const REVIEWED_INHERITED_EQUIVALENT_PROPERTIES = new Set(['text-align']);

function expectedResidual(
    baseRule, sharedRule, errors, label, inheritedEquivalentProperties = [],
) {
    const base = [...(baseRule.migrationDeclarations || [])];
    const shared = sharedRule.migrationDeclarations || [];
    const residual = [...base];
    const inheritedEquivalent = new Set(inheritedEquivalentProperties);

    for (const property of inheritedEquivalent) {
        if (!REVIEWED_INHERITED_EQUIVALENT_PROPERTIES.has(property)) {
            errors.push(label + ': inherited-equivalent property ' + property + ' is not reviewed.');
        }
    }

    for (const declaration of shared) {
        const sameProperty = base.filter(item =>
            item.property === declaration.property && item.important === declaration.important);
        if (!sameProperty.length) {
            if (inheritedEquivalent.has(declaration.property)) continue;
            errors.push(label + ': shared property ' + declaration.property
                + ' did not exist in the local source; family extraction may not invent geometry/behavior.');
            continue;
        }
        const exactKey = declarationKey(declaration);
        const index = residual.findIndex(item => declarationKey(item) === exactKey);
        if (index >= 0) residual.splice(index, 1);
    }

    for (const property of inheritedEquivalent) {
        if (!shared.some(item => item.property === property)) {
            errors.push(label + ': inherited-equivalent property ' + property
                + ' is stale because the shared rule no longer writes it.');
        }
        if (base.some(item => item.property === property)) {
            errors.push(label + ': inherited-equivalent property ' + property
                + ' is unnecessary because the local source already wrote it.');
        }
    }
    return residual;
}

function classTokens(value) {
    return new Set(String(value || '').split(/\s+/).filter(Boolean));
}

function verifyHtmlAdoption(root, file, localClass, sharedClass, errors, label) {
    const html = readFileSync(join(root, file), 'utf8');
    const found = parseHtmlElements(html, file).some(element => {
        const attrs = htmlElementAttributes(element);
        const tokens = classTokens(attrs.class);
        return tokens.has(localClass) && tokens.has(sharedClass);
    });
    if (!found) {
        errors.push(label + ': ' + file + ' does not co-locate .' + localClass + ' with .' + sharedClass + '.');
    }
}

function escapeRegExp(value) {
    return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function verifyRuntimeAdoption(root, file, localClass, sharedClass, errors, label) {
    const source = readFileSync(join(root, file), 'utf8');
    const local = escapeRegExp(localClass);
    const shared = escapeRegExp(sharedClass);
    const literal = new RegExp(
        'className\\s*=\\s*([\'"])[^\'"]*\\b' + local
        + '\\b[^\'"]*\\b' + shared + '\\b',
    );
    if (!literal.test(source)) {
        errors.push(label + ': ' + file + ' does not assign .' + localClass + ' with .' + sharedClass
            + ' in the same className literal.');
    }
}

export function verifyExtractionAdoption(root, extraction, errors) {
    const games = extraction.games || {};
    for (const component of extraction.components || []) {
        const label = extraction.id + '/' + component.sharedClass;
        for (const prefix of component.participants || []) {
            const game = games[prefix];
            if (!game?.css || !game?.html || !game?.runtime) {
                errors.push(label + ': incomplete game metadata for ' + prefix + '.');
                continue;
            }
            const localClass = prefix + '-' + component.suffix;
            if (component.surface === 'html') {
                verifyHtmlAdoption(
                    root, game.html, localClass, component.sharedClass, errors, label + '/' + prefix,
                );
            } else if (component.surface === 'runtime') {
                verifyRuntimeAdoption(
                    root, game.runtime, localClass, component.sharedClass, errors, label + '/' + prefix,
                );
            } else {
                errors.push(label + ': unsupported adoption surface ' + JSON.stringify(component.surface) + '.');
            }
        }
    }
}

function stateById(state, errors, label) {
    const map = new Map();
    if (state.schemaVersion !== 1 || state.contract !== 'append-only-family-extraction-v1'
        || !Array.isArray(state.extractions)) {
        errors.push(label + ': unsupported family-extraction state shape.');
        return map;
    }
    for (const extraction of state.extractions) {
        if (!extraction?.id || typeof extraction.id !== 'string') {
            errors.push(label + ': every extraction requires a stable string id.');
            continue;
        }
        if (map.has(extraction.id)) errors.push(label + ': duplicate extraction id ' + extraction.id + '.');
        else map.set(extraction.id, extraction);
    }
    return map;
}

function removedTuples(extraction, errors) {
    const rows = [];
    const games = extraction.games || {};
    for (const component of extraction.components || []) {
        if (!component?.suffix || !component?.sharedClass
            || !['html', 'runtime'].includes(component.surface)
            || !Array.isArray(component.participants)
            || !Array.isArray(component.fullyRemoved)) {
            errors.push(extraction.id + ': invalid component entry.');
            continue;
        }
        const participants = new Set(component.participants);
        for (const [prefix, properties] of Object.entries(component.inheritedEquivalentProperties || {})) {
            if (!participants.has(prefix)) {
                errors.push(extraction.id + ': inherited-equivalent properties reference non-participant '
                    + prefix + ' for .' + component.sharedClass + '.');
            }
            if (!Array.isArray(properties) || !properties.length) {
                errors.push(extraction.id + ': inherited-equivalent properties for ' + prefix
                    + ' / .' + component.sharedClass + ' must be a non-empty array.');
            }
        }
        for (const prefix of component.fullyRemoved) {
            if (!participants.has(prefix)) {
                errors.push(extraction.id + ': .' + prefix + '-' + component.suffix
                    + ' is marked fully removed without participating in the shared component.');
                continue;
            }
            const game = games[prefix];
            if (!game?.css) {
                errors.push(extraction.id + ': missing game metadata for ' + prefix + '.');
                continue;
            }
            rows.push([game.css, '', '.' + prefix + '-' + component.suffix]);
        }
    }
    return rows;
}

function subtractRows(rows, removed, errors) {
    const counts = new Map();
    for (const row of rows || []) {
        const key = tupleKey(row);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const row of removed) {
        const key = tupleKey(row);
        const next = (counts.get(key) || 0) - 1;
        if (next < 0) {
            errors.push('family extraction source is not present in immutable P0 unlayered debt: ' + key + '.');
        } else if (next === 0) counts.delete(key);
        else counts.set(key, next);
    }
    const remaining = [];
    const wanted = new Map(counts);
    for (const row of rows || []) {
        const key = tupleKey(row);
        const count = wanted.get(key) || 0;
        if (!count) continue;
        remaining.push(row);
        if (count === 1) wanted.delete(key);
        else wanted.set(key, count - 1);
    }
    return remaining;
}

function totalRules(parsedByPath) {
    let total = 0;
    for (const parsed of parsedByPath.values()) total += (parsed.rules || []).length;
    return total;
}

function verifyNewExtraction(root, extraction, currentParsedByPath, baseParsedByPath,
    currentCatalogs, baseCatalogs, externalRuleChanges, comparisonBase, errors) {
    const baseContractText = readGitFile(root, comparisonBase, 'tests/css-duplication-audit-contract.json');
    if (baseContractText === null) {
        errors.push(extraction.id + ': cannot read comparison-base duplication contract.');
    } else {
        const baseContract = parseState(baseContractText, 'comparison-base duplication contract');
        if (baseContract?.baseline?.classificationDigest !== extraction.baseDuplicationDigest) {
            errors.push(extraction.id + ': base duplication digest does not match the reviewed extraction source.');
        }
    }

    const sharedPath = extraction.sharedStylesheet;
    const sharedLayer = extraction.sharedLayer;
    const games = extraction.games || {};
    const baseSharedCss = baseParsedByPath.get(sharedPath);
    const currentSharedCss = currentParsedByPath.get(sharedPath);
    if (!sharedPath || !currentSharedCss) {
        errors.push(extraction.id + ': shared stylesheet is missing from the current CSS inventory.');
        return;
    }

    for (const component of extraction.components || []) {
        const label = extraction.id + '/' + component.sharedClass;
        const sharedSelector = '.' + component.sharedClass;
        const baseSharedMatches = (baseSharedCss?.rules || []).filter(rule => rule.selector === sharedSelector);
        if (baseSharedMatches.length) {
            errors.push(label + ': shared selector already existed in the comparison base.');
        }
        const sharedRule = uniqueRule(currentSharedCss, sharedSelector, sharedLayer, errors, label);
        if (!sharedRule) continue;
        const sharedIndexed = uniqueCatalogRule(
            currentCatalogs.get(sharedPath), sharedSelector, sharedLayer, errors, label + '/current',
        );
        if (sharedIndexed) externalRuleChanges.current.push(sharedIndexed);

        for (const prefix of component.participants || []) {
            const game = games[prefix];
            if (!game?.css || !game?.html || !game?.runtime) {
                errors.push(label + ': incomplete game metadata for ' + prefix + '.');
                continue;
            }
            const localClass = prefix + '-' + component.suffix;
            const localSelector = '.' + localClass;
            const baseRule = uniqueRule(baseParsedByPath.get(game.css), localSelector, null, errors,
                label + '/' + prefix + '/base');
            if (!baseRule) continue;
            const baseIndexed = uniqueCatalogRule(
                baseCatalogs.get(game.css), localSelector, null, errors, label + '/' + prefix + '/base-index',
            );
            if (baseIndexed) externalRuleChanges.base.push(baseIndexed);

            const expected = expectedResidual(
                baseRule,
                sharedRule,
                errors,
                label + '/' + prefix,
                component.inheritedEquivalentProperties?.[prefix] || [],
            );
            const currentMatches = (currentParsedByPath.get(game.css)?.rules || []).filter(rule =>
                rule.selector === localSelector && !rule.layer && (rule.context || []).length === 0);
            if (!expected.length) {
                if (currentMatches.length) {
                    errors.push(label + '/' + prefix + ': fully shared local rule still exists.');
                }
            } else if (currentMatches.length !== 1) {
                errors.push(label + '/' + prefix + ': expected one residual local rule, found '
                    + currentMatches.length + '.');
            } else if (canonical(currentMatches[0].migrationDeclarations || []) !== canonical(expected)) {
                errors.push(label + '/' + prefix
                    + ': local residual declarations are not exactly source minus shared declarations.');
            }
            if (expected.length && currentMatches.length === 1) {
                const currentIndexed = uniqueCatalogRule(
                    currentCatalogs.get(game.css), localSelector, null, errors,
                    label + '/' + prefix + '/current-index',
                );
                if (currentIndexed) externalRuleChanges.current.push(currentIndexed);
            }

        }
    }
}

export function verifyFamilyExtractions({
    root, comparisonBase, currentParsedByPath, baseParsedByPath, baselineUnlayeredRules, errors,
}) {
    const current = parseState(
        readFileSync(join(root, FAMILY_EXTRACTION_STATE_PATH), 'utf8'),
        FAMILY_EXTRACTION_STATE_PATH,
    );
    const base = parseState(
        readGitFile(root, comparisonBase, FAMILY_EXTRACTION_STATE_PATH),
        'comparison-base ' + FAMILY_EXTRACTION_STATE_PATH,
    );
    const currentById = stateById(current, errors, FAMILY_EXTRACTION_STATE_PATH);
    const baseById = stateById(base, errors, 'comparison-base family extraction state');

    for (const [id, extraction] of baseById) {
        if (!currentById.has(id)) {
            errors.push('family extraction ' + id + ' was removed; the transaction ledger is append-only.');
        } else if (canonical(currentById.get(id)) !== canonical(extraction)) {
            errors.push('family extraction ' + id + ' was modified; append a new transaction instead.');
        }
    }

    const cssPaths = new Set();
    const removed = [];
    let totalRuleDelta = 0;
    for (const extraction of currentById.values()) {
        // Adoption is a persistent invariant, not a one-time transformation check.
        // Re-run it for every ledger entry so later HTML/runtime edits cannot silently
        // disconnect a page from its shared family styles after the extraction merges.
        verifyExtractionAdoption(root, extraction, errors);
        if (!Number.isInteger(extraction.expectedRuleDelta) || extraction.expectedRuleDelta >= 0) {
            errors.push(extraction.id + ': expectedRuleDelta must be a negative integer.');
            continue;
        }
        const tuples = removedTuples(extraction, errors);
        if (tuples.length !== extraction.expectedRemovedUnlayeredRules) {
            errors.push(extraction.id + ': expectedRemovedUnlayeredRules does not match component membership ('
                + extraction.expectedRemovedUnlayeredRules + ' vs ' + tuples.length + ').');
        }
        if (extraction.expectedRuleDelta !== (extraction.components || []).length - tuples.length) {
            errors.push(extraction.id + ': expectedRuleDelta must equal shared rules minus fully removed local rules.');
        }
        totalRuleDelta += extraction.expectedRuleDelta;
        removed.push(...tuples);
        if (extraction.sharedStylesheet) cssPaths.add(extraction.sharedStylesheet);
        for (const game of Object.values(extraction.games || {})) if (game?.css) cssPaths.add(game.css);
    }

    const seenRemoved = new Set();
    for (const row of removed) {
        const key = tupleKey(row);
        if (seenRemoved.has(key)) errors.push('family extraction rule is consumed more than once: ' + key + '.');
        seenRemoved.add(key);
    }

    const currentCatalogs = new Map([...currentParsedByPath]
        .map(([path, parsed]) => [path, indexRuleOccurrences(parsed, path)]));
    const baseCatalogs = new Map([...baseParsedByPath]
        .map(([path, parsed]) => [path, indexRuleOccurrences(parsed, path)]));
    const externalRuleChanges = { base: [], current: [] };
    const newExtractions = [...currentById.values()].filter(extraction => !baseById.has(extraction.id));
    for (const extraction of newExtractions) {
        verifyNewExtraction(
            root, extraction, currentParsedByPath, baseParsedByPath,
            currentCatalogs, baseCatalogs, externalRuleChanges, comparisonBase, errors,
        );
    }
    if (newExtractions.length) {
        const actualDelta = totalRules(currentParsedByPath) - totalRules(baseParsedByPath);
        const expectedDelta = newExtractions.reduce((sum, extraction) => sum + extraction.expectedRuleDelta, 0);
        if (actualDelta !== expectedDelta) {
            errors.push('family extraction transaction changed the static rule population by ' + actualDelta
                + ', expected ' + expectedDelta + '.');
        }
    }

    return {
        cssPaths,
        totalRuleDelta,
        remainingUnlayeredRules: subtractRows(baselineUnlayeredRules, removed, errors),
        externalRuleChanges,
        newExtractionIds: newExtractions.map(extraction => extraction.id),
    };
}
