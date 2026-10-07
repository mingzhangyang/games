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
const REVIEWED_SELECTOR_SUFFIXES = new Set(['', ':hover', ':active', ':focus-visible', ':disabled']);
const REVIEWED_THEME_CONVERGENCE_PROPERTIES = new Set([
    'color', 'background', 'background-color', 'border', 'border-color',
    'box-shadow', 'filter', 'opacity',
]);

function componentLocalSelector(prefix, component) {
    return '.' + prefix + '-' + component.suffix + (component.localSelectorSuffix || '');
}

function componentSharedSelector(component) {
    return '.' + component.sharedClass + (component.sharedSelectorSuffix || '');
}

function expectedResidual(
    baseRule, sharedRule, errors, label,
    inheritedEquivalentProperties = [], convergedThemeProperties = [],
) {
    const base = [...(baseRule.migrationDeclarations || [])];
    const shared = sharedRule.migrationDeclarations || [];
    const residual = [...base];
    const inheritedEquivalent = new Set(inheritedEquivalentProperties);
    const convergedTheme = new Set(convergedThemeProperties);

    for (const property of inheritedEquivalent) {
        if (!REVIEWED_INHERITED_EQUIVALENT_PROPERTIES.has(property)) {
            errors.push(label + ': inherited-equivalent property ' + property + ' is not reviewed.');
        }
    }
    for (const property of convergedTheme) {
        if (!REVIEWED_THEME_CONVERGENCE_PROPERTIES.has(property)) {
            errors.push(label + ': theme convergence property ' + property + ' is not reviewed.');
        }
        if (!shared.some(item => item.property === property)) {
            errors.push(label + ': theme convergence property ' + property
                + ' is stale because the shared rule no longer writes it.');
        }
    }

    for (const declaration of shared) {
        const sameProperty = base.filter(item =>
            item.property === declaration.property && item.important === declaration.important);
        const exactKey = declarationKey(declaration);
        const exactIndex = residual.findIndex(item => declarationKey(item) === exactKey);

        if (convergedTheme.has(declaration.property)) {
            if (sameProperty.length > 1 && exactIndex < 0) {
                errors.push(label + ': theme convergence may not collapse a fallback chain for '
                    + declaration.property + '.');
                continue;
            }
            if (exactIndex >= 0) {
                residual.splice(exactIndex, 1);
            } else if (sameProperty.length === 1) {
                const propertyIndex = residual.findIndex(item =>
                    item.property === declaration.property && item.important === declaration.important);
                if (propertyIndex >= 0) residual.splice(propertyIndex, 1);
            }
            // A reviewed theme convergence may also add a theme property that the local
            // source inherited before. Geometry/typography remain protected below.
            continue;
        }

        if (!sameProperty.length) {
            if (inheritedEquivalent.has(declaration.property)) continue;
            errors.push(label + ': shared property ' + declaration.property
                + ' did not exist in the local source; family extraction may not invent geometry/behavior.');
            continue;
        }
        if (exactIndex >= 0) residual.splice(exactIndex, 1);
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
    const localElements = parseHtmlElements(html, file).filter(element => {
        const attrs = htmlElementAttributes(element);
        return classTokens(attrs.class).has(localClass);
    });
    if (!localElements.length) {
        errors.push(label + ': ' + file + ' does not contain .' + localClass + '.');
        return;
    }
    const missingShared = localElements.filter(element => {
        const attrs = htmlElementAttributes(element);
        return !classTokens(attrs.class).has(sharedClass);
    });
    if (missingShared.length) {
        errors.push(label + ': ' + file + ' has ' + missingShared.length + ' .' + localClass
            + ' element(s) without .' + sharedClass + '.');
    }
}

function literalClassNameAssignments(source) {
    const assignments = [];
    const pattern = /className\s*=\s*(['"`])([^'"`]*)\1/g;
    for (const match of source.matchAll(pattern)) assignments.push(match[2]);
    return assignments;
}

function verifyRuntimeAdoption(root, file, localClass, sharedClass, errors, label) {
    const source = readFileSync(join(root, file), 'utf8');
    const localAssignments = literalClassNameAssignments(source)
        .filter(value => classTokens(value).has(localClass));
    if (!localAssignments.length) {
        errors.push(label + ': ' + file + ' does not assign .' + localClass + ' in a className literal.');
        return;
    }
    const missingShared = localAssignments.filter(value => !classTokens(value).has(sharedClass));
    if (missingShared.length) {
        errors.push(label + ': ' + file + ' has ' + missingShared.length + ' className assignment(s) with .'
            + localClass + ' but without .' + sharedClass + '.');
    }
}

export function verifyExtractionAdoption(root, extraction, errors) {
    const games = extraction.games || {};
    for (const component of extraction.components || []) {
        const label = extraction.id + '/' + component.sharedClass;
        if (component.requiresAdoption === false) continue;
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

export function verifyExtractionShape(extraction, errors) {
    let valid = true;
    const fail = message => {
        errors.push(extraction?.id + ': ' + message);
        valid = false;
    };

    if (!extraction || typeof extraction !== 'object') {
        errors.push('family extraction entry must be an object.');
        return false;
    }
    if (!extraction.games || typeof extraction.games !== 'object' || Array.isArray(extraction.games)) {
        fail('games must be an object keyed by participant prefix.');
    }
    if (!Array.isArray(extraction.components) || !extraction.components.length) {
        fail('components must be a non-empty array.');
        return false;
    }

    const suffixes = new Set();
    const sharedClasses = new Set();
    for (const component of extraction.components) {
        if (!component || typeof component !== 'object') {
            fail('component entries must be objects.');
            continue;
        }
        const localSelectorSuffix = component.localSelectorSuffix || '';
        const sharedSelectorSuffix = component.sharedSelectorSuffix || '';
        if (!REVIEWED_SELECTOR_SUFFIXES.has(localSelectorSuffix)
            || !REVIEWED_SELECTOR_SUFFIXES.has(sharedSelectorSuffix)) {
            fail('component selector suffixes must be reviewed pseudo-classes.');
        }
        if (component.requiresAdoption !== undefined && typeof component.requiresAdoption !== 'boolean') {
            fail('requiresAdoption must be boolean when present.');
        }
        if (component.requiresAdoption === false && !localSelectorSuffix) {
            fail('requiresAdoption:false is only valid for a state selector.');
        }

        if (typeof component.suffix !== 'string' || !component.suffix) {
            fail('every component requires a non-empty suffix.');
        } else {
            const suffixKey = component.suffix + localSelectorSuffix;
            if (suffixes.has(suffixKey)) {
                fail('duplicate component suffix ' + suffixKey + '.');
            } else {
                suffixes.add(suffixKey);
            }
        }

        if (typeof component.sharedClass !== 'string' || !component.sharedClass) {
            fail('every component requires a non-empty sharedClass.');
        } else {
            const sharedKey = component.sharedClass + sharedSelectorSuffix;
            if (sharedClasses.has(sharedKey)) {
                fail('duplicate sharedClass ' + sharedKey + '.');
            } else {
                sharedClasses.add(sharedKey);
            }
        }

        const convergedThemeProperties = component.convergedThemeProperties || [];
        if (!Array.isArray(convergedThemeProperties)) {
            fail('convergedThemeProperties must be an array.');
        } else {
            const seenConverged = new Set();
            for (const property of convergedThemeProperties) {
                if (!REVIEWED_THEME_CONVERGENCE_PROPERTIES.has(property)) {
                    fail('unreviewed theme convergence property ' + property + '.');
                } else if (seenConverged.has(property)) {
                    fail('duplicate theme convergence property ' + property + '.');
                } else {
                    seenConverged.add(property);
                }
            }
        }

        if (!['html', 'runtime'].includes(component.surface)) {
            fail('component .' + (component.sharedClass || '<missing>') + ' has unsupported surface '
                + JSON.stringify(component.surface) + '.');
        }
        if (!Array.isArray(component.participants) || !component.participants.length) {
            fail('component .' + (component.sharedClass || '<missing>')
                + ' must declare at least one participant.');
            continue;
        }
        if (!Array.isArray(component.fullyRemoved)) {
            fail('component .' + (component.sharedClass || '<missing>') + ' fullyRemoved must be an array.');
            continue;
        }

        const participants = new Set();
        for (const prefix of component.participants) {
            if (typeof prefix !== 'string' || !prefix) {
                fail('component .' + component.sharedClass + ' has an invalid participant.');
                continue;
            }
            if (participants.has(prefix)) {
                fail('component .' + component.sharedClass + ' repeats participant ' + prefix + '.');
                continue;
            }
            participants.add(prefix);
            const game = extraction.games?.[prefix];
            if (!game || typeof game.css !== 'string' || !game.css
                || typeof game.html !== 'string' || !game.html
                || typeof game.runtime !== 'string' || !game.runtime) {
                fail('component .' + component.sharedClass
                    + ' participant ' + prefix + ' requires css/html/runtime metadata.');
            }
        }

        const fullyRemoved = new Set();
        for (const prefix of component.fullyRemoved) {
            if (fullyRemoved.has(prefix)) {
                fail('component .' + component.sharedClass + ' repeats fullyRemoved participant ' + prefix + '.');
                continue;
            }
            fullyRemoved.add(prefix);
            if (!participants.has(prefix)) {
                fail('component .' + component.sharedClass + ' marks non-participant ' + prefix
                    + ' as fullyRemoved.');
            }
        }

        const inherited = component.inheritedEquivalentProperties || {};
        if (!inherited || typeof inherited !== 'object' || Array.isArray(inherited)) {
            fail('component .' + component.sharedClass + ' inheritedEquivalentProperties must be an object.');
            continue;
        }
        for (const [prefix, properties] of Object.entries(inherited)) {
            if (!participants.has(prefix)) {
                fail('component .' + component.sharedClass
                    + ' inherited-equivalent properties reference non-participant ' + prefix + '.');
            }
            if (!Array.isArray(properties) || !properties.length) {
                fail('component .' + component.sharedClass
                    + ' inherited-equivalent properties for ' + prefix + ' must be a non-empty array.');
                continue;
            }
            const seenProperties = new Set();
            for (const property of properties) {
                if (typeof property !== 'string' || !property) {
                    fail('component .' + component.sharedClass
                        + ' has an invalid inherited-equivalent property for ' + prefix + '.');
                } else if (seenProperties.has(property)) {
                    fail('component .' + component.sharedClass
                        + ' repeats inherited-equivalent property ' + property + ' for ' + prefix + '.');
                } else {
                    seenProperties.add(property);
                }
            }
        }
    }
    return valid;
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
        for (const prefix of component.fullyRemoved) {
            rows.push([games[prefix].css, '', componentLocalSelector(prefix, component)]);
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
        const label = extraction.id + '/' + component.sharedClass
            + (component.sharedSelectorSuffix || '');
        const sharedSelector = componentSharedSelector(component);
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
            const localSelector = componentLocalSelector(prefix, component);
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
                component.convergedThemeProperties || [],
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
        if (!verifyExtractionShape(extraction, errors)) continue;
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
