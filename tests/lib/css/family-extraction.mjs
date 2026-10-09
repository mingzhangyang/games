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

function uniqueRule(parsed, selector, layer, errors, label, context = '') {
    const matches = (parsed?.rules || []).filter(rule =>
        rule.selector === selector
        && (rule.layer || null) === (layer || null)
        && (rule.context || []).join(' / ') === context);
    if (matches.length !== 1) {
        errors.push(label + ': expected exactly one ' + selector + ' rule in layer '
            + (layer || '<unlayered>') + ', found ' + matches.length + '.');
        return null;
    }
    return matches[0];
}

function uniqueCatalogRule(catalog, selector, layer, errors, label, context = '') {
    const matches = (catalog || []).filter(rule =>
        rule.selector === selector
        && (rule.layer || null) === (layer || null)
        && rule.context === context);
    if (matches.length !== 1) {
        errors.push(label + ': expected exactly one indexed ' + selector + ' rule in layer '
            + (layer || '<unlayered>') + ', found ' + matches.length + '.');
        return null;
    }
    return matches[0];
}

function uniqueRuleByDeclarations(parsed, selector, layer, declarations, errors, label) {
    const wanted = canonical(declarations);
    const matches = (parsed?.rules || []).filter(rule =>
        rule.selector === selector
        && (rule.layer || null) === (layer || null)
        && (rule.context || []).length === 0
        && canonical(rule.migrationDeclarations || []) === wanted);
    if (matches.length !== 1) {
        errors.push(label + ': expected exactly one ' + selector
            + ' rule with the reviewed residual declarations in layer '
            + (layer || '<unlayered>') + ', found ' + matches.length + '.');
        return null;
    }
    return matches[0];
}

function uniqueCatalogRuleByDeclarations(catalog, selector, layer, declarations, errors, label) {
    const wanted = canonical(declarations);
    const matches = (catalog || []).filter(rule =>
        rule.selector === selector
        && (rule.layer || null) === (layer || null)
        && rule.context === ''
        && canonical(rule.declarations || []) === wanted);
    if (matches.length !== 1) {
        errors.push(label + ': expected exactly one indexed ' + selector
            + ' rule with the reviewed declarations in layer '
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
// W4a media rules use the same exact-family ownership contract as their defaults.
const REVIEWED_COMPONENT_CONTEXTS = new Set(['', '@media (width <= 480px)']);
const REVIEWED_THEME_CONVERGENCE_PROPERTIES = new Set([
    'color', 'background', 'background-color', 'border', 'border-color',
    'box-shadow', 'filter', 'opacity',
]);
// Visual geometry/typography a reviewed participant may give up so that the shared
// family's size wins. Layout/behaviour properties (display, position, width, …) stay
// protected: convergence may restyle a standard surface, never re-lay it out.
const REVIEWED_GEOMETRY_CONVERGENCE_PROPERTIES = new Set([
    'font-size', 'font-weight', 'font-family', 'padding', 'border-radius', 'transition', 'backdrop-filter',
    // Visual dimensions/spacing (leaderboard-v2): sizes and gaps of a standard surface.
    'max-width', 'min-height', 'max-height', 'height', 'gap',
    'letter-spacing', 'line-height', 'margin-top', 'margin-bottom',
]);
const REVIEWED_PARTICIPANT_CONVERGENCE_PROPERTIES = new Set([
    ...REVIEWED_THEME_CONVERGENCE_PROPERTIES, ...REVIEWED_GEOMETRY_CONVERGENCE_PROPERTIES,
]);
// Layout/behaviour properties stay protected by default. A participant may only give
// them up through participantLayoutConvergence, which names the exact properties and
// carries a written reason, so every re-layout is an explicit reviewed decision.
const REVIEWED_LAYOUT_CONVERGENCE_PROPERTIES = new Set([
    'display', 'flex-direction', 'flex', 'flex-shrink', 'align-items', 'justify-content', 'width',
    'text-align', 'text-transform', 'outline', 'scrollbar-width', 'grid-template-columns',
]);

function componentLocalSelector(prefix, component) {
    return '.' + prefix + '-' + (component.localSuffixByParticipant?.[prefix] || component.suffix)
        + (component.localSelectorSuffix || '');
}

function componentSharedSelector(component) {
    const classSelector = component.sharedClassSpecificity === 'zero'
        ? ':where(.' + component.sharedClass + ')'
        : '.' + component.sharedClass;
    return classSelector + (component.sharedSelectorSuffix || '');
}

export function expectedResidual(
    baseRule, sharedRule, errors, label,
    inheritedEquivalentProperties = [], convergedThemeProperties = [],
    participantConvergedProperties = [], participantLayoutProperties = [],
    participantResidualRewrites = [],
) {
    const base = [...(baseRule.migrationDeclarations || [])];
    const shared = sharedRule.migrationDeclarations || [];
    const residual = [...base];
    const inheritedEquivalent = new Set(inheritedEquivalentProperties);
    const convergedTheme = new Set(convergedThemeProperties);
    const participantConverged = new Set([...participantConvergedProperties, ...participantLayoutProperties]);

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

    const handledChains = new Set();
    for (const declaration of shared) {
        const sameProperty = base.filter(item =>
            item.property === declaration.property && item.important === declaration.important);
        const exactKey = declarationKey(declaration);
        const exactIndex = residual.findIndex(item => declarationKey(item) === exactKey);

        // A repeated property on either side is an ordered fallback chain. Moving only part
        // of it would leave the rest as an unlayered residual that outranks the layered
        // shared rule, and a longer shared chain would consume the source value and then
        // introduce a new winning one, so the two ordered chains must match exactly.
        const sharedChain = shared.filter(item =>
            item.property === declaration.property && item.important === declaration.important);
        if (sameProperty.length > 1 || sharedChain.length > 1) {
            const chainKey = declaration.property + '\0' + declaration.important;
            if (handledChains.has(chainKey)) continue;
            handledChains.add(chainKey);
            if (canonical(sharedChain) !== canonical(sameProperty)) {
                errors.push(label + ': family extraction may not break the fallback chain for '
                    + declaration.property + '; the shared rule must carry the whole ordered chain.');
                continue;
            }
            for (const item of sameProperty) {
                residual.splice(residual.findIndex(entry => declarationKey(entry) === declarationKey(item)), 1);
            }
            continue;
        }

        if (convergedTheme.has(declaration.property)) {
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
            // A reviewed participant convergence may adopt the shared value for a
            // property the page never wrote (e.g. the shared title margin).
            if (participantConverged.has(declaration.property)) continue;
            errors.push(label + ': shared property ' + declaration.property
                + ' did not exist in the local source; family extraction may not invent geometry/behavior.');
            continue;
        }
        if (exactIndex >= 0) residual.splice(exactIndex, 1);
    }

    // Reviewed per-participant convergence: the page gives up its own value (or a
    // page-only declaration) for these properties so the shared family wins.
    for (const [properties, reviewed, kind] of [
        [participantConvergedProperties, REVIEWED_PARTICIPANT_CONVERGENCE_PROPERTIES, 'participant convergence'],
        [participantLayoutProperties, REVIEWED_LAYOUT_CONVERGENCE_PROPERTIES, 'participant layout convergence'],
    ]) {
        for (const property of properties) {
            if (!reviewed.has(property)) {
                errors.push(label + ': ' + kind + ' property ' + property + ' is not reviewed.');
                continue;
            }
            if (!base.some(item => item.property === property)
                && !shared.some(item => item.property === property)) {
                errors.push(label + ': ' + kind + ' property ' + property
                    + ' is stale because neither the local source nor the shared rule writes it.');
                continue;
            }
            for (let index = residual.length - 1; index >= 0; index--) {
                if (residual[index].property === property) residual.splice(index, 1);
            }
        }
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

    // An unlayered background shorthand resets background-clip, hiding layered
    // gradient text. Permit only a reviewed image-only title gradient to change
    // from background to background-image; preserve its exact original value.
    for (const rewrite of participantResidualRewrites) {
        if (rewrite.from !== 'background' || rewrite.to !== 'background-image') {
            errors.push(label + ': unsupported residual property rewrite.');
            continue;
        }
        const indices = residual.flatMap((declaration, index) =>
            declaration.property === rewrite.from ? [index] : []);
        if (indices.length !== 1 || residual.some(item => item.property === rewrite.to)) {
            errors.push(label + ': residual title background is missing, ambiguous or already rewritten.');
            continue;
        }
        const declaration = residual[indices[0]];
        const rawValue = Array.isArray(declaration.value)
            ? migrationValueText(declaration.value)
            : String(declaration.value || '');
        const value = rawValue.trim();
        if (declaration.important
            || !/^(?:linear-gradient\(|var\(--[a-z]{2}-title-bg\)$)/.test(value)) {
            errors.push(label + ': background-image rewrite requires a non-important gradient-only title value.');
            continue;
        }
        residual[indices[0]] = { ...declaration, property: 'background-image' };
    }
    return residual;
}

// A participant that an earlier transaction of the same family already adopted keeps
// receiving the unchanged shared rule; a later transaction may only delete the page's
// remaining residual declarations for reviewed properties. Nothing is compared with the
// shared rule again, and a listed property the residual does not write is stale.
export function expectedConvergedResidual(
    baseRule, errors, label, participantConvergedProperties = [], participantLayoutProperties = [],
) {
    const base = [...(baseRule.migrationDeclarations || [])];
    const residual = [...base];
    for (const [properties, reviewed, kind] of [
        [participantConvergedProperties, REVIEWED_PARTICIPANT_CONVERGENCE_PROPERTIES, 'participant convergence'],
        [participantLayoutProperties, REVIEWED_LAYOUT_CONVERGENCE_PROPERTIES, 'participant layout convergence'],
    ]) {
        for (const property of properties) {
            if (!reviewed.has(property)) {
                errors.push(label + ': ' + kind + ' property ' + property + ' is not reviewed.');
                continue;
            }
            if (!base.some(item => item.property === property)) {
                errors.push(label + ': ' + kind + ' property ' + property
                    + ' is stale because the already-adopted residual never wrote it.');
                continue;
            }
            for (let index = residual.length - 1; index >= 0; index--) {
                if (residual[index].property === property) residual.splice(index, 1);
            }
        }
    }
    if (residual.length === base.length) {
        errors.push(label + ': already-adopted participant converges nothing; drop it from this transaction.');
    }
    return residual;
}

function classTokens(value) {
    return new Set(String(value || '').split(/\s+/).filter(Boolean));
}

function hasAdoptionAnchor(extraction, component) {
    return (extraction.components || []).some(candidate =>
        candidate !== component
        && !candidate.localSelectorSuffix
        && !candidate.sharedSelectorSuffix
        && candidate.requiresAdoption !== false
        && candidate.suffix === component.suffix
        && candidate.sharedClass === component.sharedClass
        && candidate.surface === component.surface
        && (component.participants || []).every(prefix =>
            (candidate.localSuffixByParticipant?.[prefix] || candidate.suffix)
                === (component.localSuffixByParticipant?.[prefix] || component.suffix))
        // The anchor re-validates adoption for every participant it lists, so a state
        // component may cover a subset (e.g. a page whose hover is retired instead).
        && (component.participants || []).every(prefix => (candidate.participants || []).includes(prefix)));
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

function literalRuntimeHtmlClasses(source) {
    // Literal class attributes inside runtime HTML fragments also require shared adoption.
    // Ripple Duet builds level chips through innerHTML instead of className assignments.
    const classes = [];
    const pattern = /\bclass\s*=\s*(['"])([^'"]*)\1/g;
    for (const match of source.matchAll(pattern)) classes.push(match[2]);
    return classes;
}

function literalClassNameAssignments(source) {
    const assignments = [];
    const pattern = /className\s*=\s*(['"`])([^'"`]*)\1/g;
    for (const match of source.matchAll(pattern)) assignments.push(match[2]);
    return assignments;
}

function verifyRuntimeAdoption(root, file, localClass, sharedClass, errors, label) {
    const source = readFileSync(join(root, file), 'utf8');
    const localAssignments = [...literalClassNameAssignments(source), ...literalRuntimeHtmlClasses(source)]
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
        if (component.requiresAdoption === false) {
            if (!hasAdoptionAnchor(extraction, component)) {
                errors.push(label + ': skipped adoption state requires a validated unsuffixed component '
                    + 'with the same local/shared classes, surface, and participants.');
            }
            continue;
        }
        for (const prefix of component.participants || []) {
            const game = games[prefix];
            if (!game?.css || !game?.html || !game?.runtime) {
                errors.push(label + ': incomplete game metadata for ' + prefix + '.');
                continue;
            }
            const localClass = prefix + '-' + (component.localSuffixByParticipant?.[prefix] || component.suffix);
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
        const sharedClassSpecificity = component.sharedClassSpecificity || 'normal';
        const context = component.context || '';
        if (component.context !== undefined && !REVIEWED_COMPONENT_CONTEXTS.has(component.context)) {
            fail('component context is not a reviewed extraction media query.');
        }
        if (!REVIEWED_SELECTOR_SUFFIXES.has(localSelectorSuffix)
            || !REVIEWED_SELECTOR_SUFFIXES.has(sharedSelectorSuffix)) {
            fail('component selector suffixes must be reviewed pseudo-classes.');
        }
        if (localSelectorSuffix !== sharedSelectorSuffix) {
            fail('local and shared selector suffixes must match.');
        }
        if (!['normal', 'zero'].includes(sharedClassSpecificity)) {
            fail('sharedClassSpecificity must be "normal" or "zero".');
        }
        if (sharedClassSpecificity === 'zero' && !sharedSelectorSuffix) {
            fail('zero shared-class specificity is only valid for a state selector.');
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
            const suffixKey = component.suffix + localSelectorSuffix + '\0' + context;
            if (suffixes.has(suffixKey)) {
                fail('duplicate component suffix ' + suffixKey + '.');
            } else {
                suffixes.add(suffixKey);
            }
        }

        if (typeof component.sharedClass !== 'string' || !component.sharedClass) {
            fail('every component requires a non-empty sharedClass.');
        } else {
            const sharedKey = componentSharedSelector(component) + '\0' + context;
            if (sharedClasses.has(sharedKey)) {
                fail('duplicate sharedClass selector ' + sharedKey + '.');
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

        // An alias preserves each existing DOM class while one semantic family owns CSS.
        if (component.localSuffixByParticipant !== undefined) {
            const map = component.localSuffixByParticipant;
            if (!map || typeof map !== 'object' || Array.isArray(map)) {
                fail('localSuffixByParticipant must be an object keyed by participant prefix.');
            } else {
                for (const [prefix, suffix] of Object.entries(map)) {
                    if (!participants.has(prefix)) {
                        fail('local suffix override references non-participant ' + prefix + '.');
                    }
                    if (typeof suffix !== 'string' || !/^[a-z][a-z0-9-]*$/.test(suffix)
                        || suffix === component.suffix) {
                        fail('local suffix override for ' + prefix
                            + ' must be a different kebab-case class suffix.');
                    }
                }
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

        if (component.requiresAdoption === false && !hasAdoptionAnchor(extraction, component)) {
            fail('requiresAdoption:false state requires a validated unsuffixed component '
                + 'with the same local/shared classes and surface that covers its participants.');
        }

        const participantConverged = component.participantConvergedProperties || {};
        if (!participantConverged || typeof participantConverged !== 'object' || Array.isArray(participantConverged)) {
            fail('component .' + component.sharedClass + ' participantConvergedProperties must be an object.');
        } else {
            for (const [prefix, properties] of Object.entries(participantConverged)) {
                if (!participants.has(prefix)) {
                    fail('component .' + component.sharedClass
                        + ' participant convergence references non-participant ' + prefix + '.');
                }
                if (!Array.isArray(properties) || !properties.length
                    || new Set(properties).size !== properties.length
                    || properties.some(property => !REVIEWED_PARTICIPANT_CONVERGENCE_PROPERTIES.has(property))) {
                    fail('component .' + component.sharedClass + ' participant convergence for ' + prefix
                        + ' must be a non-empty, duplicate-free list of reviewed theme/geometry properties.');
                }
            }
        }

        const layoutConverged = component.participantLayoutConvergence || {};
        if (!layoutConverged || typeof layoutConverged !== 'object' || Array.isArray(layoutConverged)) {
            fail('component .' + component.sharedClass + ' participantLayoutConvergence must be an object.');
        } else {
            for (const [prefix, entry] of Object.entries(layoutConverged)) {
                if (!participants.has(prefix)) {
                    fail('component .' + component.sharedClass
                        + ' layout convergence references non-participant ' + prefix + '.');
                }
                const properties = entry?.properties;
                if (!Array.isArray(properties) || !properties.length
                    || new Set(properties).size !== properties.length
                    || properties.some(property => !REVIEWED_LAYOUT_CONVERGENCE_PROPERTIES.has(property))) {
                    fail('component .' + component.sharedClass + ' layout convergence for ' + prefix
                        + ' must be a non-empty, duplicate-free list of reviewed layout properties.');
                }
                if (typeof entry?.reason !== 'string' || !entry.reason.trim()) {
                    fail('component .' + component.sharedClass + ' layout convergence for ' + prefix
                        + ' requires a reason.');
                }
            }
        }

        // Strict, title-only semantic equivalence for gradient backgrounds.
        const rewrites = component.participantResidualRewrites || {};
        if (!rewrites || typeof rewrites !== 'object' || Array.isArray(rewrites)) {
            fail('participantResidualRewrites must be an object keyed by participant prefix.');
        } else {
            for (const [prefix, entries] of Object.entries(rewrites)) {
                if (!participants.has(prefix)) {
                    fail('residual rewrite references non-participant ' + prefix + '.');
                }
                if (component.suffix !== 'title' || component.sharedClass !== 'game-start-title'
                    || (component.context || '') !== '' || component.localSelectorSuffix) {
                    fail('residual property rewrites are only reviewed for default game-start-title.');
                }
                if (!Array.isArray(entries) || entries.length !== 1
                    || entries[0]?.from !== 'background'
                    || entries[0]?.to !== 'background-image'
                    || typeof entries[0]?.reason !== 'string' || !entries[0].reason.trim()) {
                    fail('residual rewrite must be reviewed background to background-image with a reason.');
                }
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

    if (extraction.extends !== undefined
        && (typeof extraction.extends !== 'string' || !extraction.extends || extraction.extends === extraction.id)) {
        fail('extends must name another family extraction id.');
    }

    const retiredCustomProperties = extraction.retiredCustomProperties || {};
    if (!retiredCustomProperties || typeof retiredCustomProperties !== 'object'
        || Array.isArray(retiredCustomProperties)) {
        fail('retiredCustomProperties must be an object keyed by game prefix.');
    } else {
        const seenRetired = new Set();
        for (const [prefix, retirement] of Object.entries(retiredCustomProperties)) {
            if (!extraction.games?.[prefix]) {
                fail('retired custom properties reference unknown game prefix ' + prefix + '.');
                continue;
            }
            if (!retirement || typeof retirement !== 'object' || Array.isArray(retirement)) {
                fail('retired custom properties for ' + prefix + ' must be an object.');
                continue;
            }
            const properties = retirement.properties;
            if (!Array.isArray(properties) || !properties.length) {
                fail('retired custom properties for ' + prefix + ' require a non-empty properties array.');
                continue;
            }
            if (!Number.isInteger(retirement.expectedRemovedDefinitions)
                || retirement.expectedRemovedDefinitions <= 0) {
                fail('retired custom properties for ' + prefix
                    + ' require a positive expectedRemovedDefinitions integer.');
            }
            for (const property of properties) {
                if (typeof property !== 'string' || !property.startsWith('--')) {
                    fail('retired custom property for ' + prefix + ' must start with --.');
                } else if (seenRetired.has(property)) {
                    fail('retired custom property ' + property + ' is claimed more than once.');
                } else {
                    seenRetired.add(property);
                }
            }
        }
    }

    const selectorPrunes = extraction.reviewedSelectorPrunes || [];
    if (!Array.isArray(selectorPrunes)) {
        fail('reviewedSelectorPrunes must be an array.');
    } else {
        const pruneKeys = new Set();
        for (const prune of selectorPrunes) {
            if (!prune || typeof prune !== 'object' || Array.isArray(prune)) {
                fail('every reviewed selector prune must be an object.');
                continue;
            }
            if (!extraction.games?.[prune.prefix]?.css) {
                fail('reviewed selector prune references unknown game prefix ' + prune.prefix + '.');
            }
            if (typeof prune.baseSelector !== 'string' || !prune.baseSelector.trim()
                || typeof prune.currentSelector !== 'string' || !prune.currentSelector.trim()) {
                fail('reviewed selector prune requires non-empty baseSelector/currentSelector.');
                continue;
            }
            const baseParts = prune.baseSelector.split(',').map(part => part.trim()).filter(Boolean);
            const currentParts = prune.currentSelector.split(',').map(part => part.trim()).filter(Boolean);
            if (currentParts.length >= baseParts.length
                || currentParts.some(part => !baseParts.includes(part))) {
                fail('reviewed selector prune must remove selectors without adding or rewriting survivors.');
            }
            if (typeof prune.reason !== 'string' || !prune.reason.trim()) {
                fail('reviewed selector prune requires a reason.');
            }
            const key = prune.prefix + '\0' + prune.baseSelector + '\0' + prune.currentSelector;
            if (pruneKeys.has(key)) fail('duplicate reviewed selector prune ' + prune.prefix + '.');
            pruneKeys.add(key);
        }
    }

    const narrowings = extraction.reviewedSelectorNarrowings || [];
    if (!Array.isArray(narrowings)) {
        fail('reviewedSelectorNarrowings must be an array.');
    } else {
        const sharedClasses = new Set((extraction.components || []).map(component => component?.sharedClass));
        const narrowingKeys = new Set();
        for (const narrowing of narrowings) {
            if (!narrowing || typeof narrowing !== 'object' || Array.isArray(narrowing)) {
                fail('every reviewed selector narrowing must be an object.');
                continue;
            }
            if (typeof narrowing.path !== 'string' || !/^css\/[\w.-]+\.css$/.test(narrowing.path)) {
                fail('reviewed selector narrowing requires a css/*.css path.');
            }
            if (narrowing.layer !== null && typeof narrowing.layer !== 'string') {
                fail('reviewed selector narrowing requires an explicit layer (string or null).');
            }
            if (!sharedClasses.has(narrowing.excludedClass)) {
                fail('reviewed selector narrowing may only exclude a sharedClass owned by this extraction.');
                continue;
            }
            if (typeof narrowing.baseSelector !== 'string' || !narrowing.baseSelector.trim()
                || typeof narrowing.currentSelector !== 'string' || !narrowing.currentSelector.trim()) {
                fail('reviewed selector narrowing requires non-empty baseSelector/currentSelector.');
                continue;
            }
            if (!isReviewedSelectorNarrowing(narrowing)) {
                fail('reviewed selector narrowing must only insert :not(.' + narrowing.excludedClass
                    + ') before trailing pseudo-classes, without adding, removing or rewriting selectors.');
            }
            if (typeof narrowing.reason !== 'string' || !narrowing.reason.trim()) {
                fail('reviewed selector narrowing requires a reason.');
            }
            const key = narrowing.path + '\0' + narrowing.baseSelector;
            if (narrowingKeys.has(key)) fail('duplicate reviewed selector narrowing ' + narrowing.path + '.');
            narrowingKeys.add(key);
        }
    }

    const declarationRetirements = extraction.reviewedDeclarationRetirements || [];
    if (!Array.isArray(declarationRetirements)) {
        fail('reviewedDeclarationRetirements must be an array.');
    } else {
        const declarationKeys = new Set();
        for (const retirement of declarationRetirements) {
            if (!retirement || typeof retirement !== 'object' || Array.isArray(retirement)) {
                fail('every reviewed declaration retirement must be an object.');
                continue;
            }
            if (!extraction.games?.[retirement.prefix]?.css) {
                fail('reviewed declaration retirement references unknown game prefix ' + retirement.prefix + '.');
            }
            if (typeof retirement.context !== 'string'
                || typeof retirement.selector !== 'string' || !retirement.selector.trim()) {
                fail('reviewed declaration retirement requires a context string and a non-empty selector.');
                continue;
            }
            if (!splitSelectorList(retirement.selector).every(part =>
                new RegExp('\\.' + retirement.prefix + '-').test(part))) {
                fail('reviewed declaration retirement may only edit ' + retirement.prefix + '-prefixed page selectors.');
            }
            const properties = retirement.properties;
            const declarationLayout = new Set(retirement.reviewedLayoutProperties || []);
            if (retirement.reviewedLayoutProperties !== undefined
                && (!Array.isArray(retirement.reviewedLayoutProperties) || !declarationLayout.size
                    || declarationLayout.size !== retirement.reviewedLayoutProperties.length
                    || [...declarationLayout].some(property => !REVIEWED_LAYOUT_CONVERGENCE_PROPERTIES.has(property))
                    || [...declarationLayout].some(property => !(properties || []).includes(property)))) {
                fail('reviewed declaration retirement reviewedLayoutProperties must be a non-empty, duplicate-free '
                    + 'list of reviewed layout properties that are also listed in properties.');
            }
            if (!Array.isArray(properties) || !properties.length || new Set(properties).size !== properties.length
                || properties.some(property => !REVIEWED_PARTICIPANT_CONVERGENCE_PROPERTIES.has(property)
                    && !declarationLayout.has(property))) {
                fail('reviewed declaration retirement properties must be a non-empty, duplicate-free list of '
                    + 'reviewed theme/geometry properties (layout properties also need reviewedLayoutProperties).');
            }
            if (typeof retirement.reason !== 'string' || !retirement.reason.trim()) {
                fail('reviewed declaration retirement requires a reason.');
            }
            const key = retirement.prefix + '\0' + retirement.context + '\0' + retirement.selector;
            if (declarationKeys.has(key)) fail('duplicate reviewed declaration retirement ' + retirement.selector + '.');
            declarationKeys.add(key);
        }
    }

    const retirements = extraction.reviewedRuleRetirements || [];
    if (!Array.isArray(retirements)) {
        fail('reviewedRuleRetirements must be an array.');
    } else {
        const retirementKeys = new Set();
        for (const retirement of retirements) {
            if (!retirement || typeof retirement !== 'object' || Array.isArray(retirement)) {
                fail('every reviewed rule retirement must be an object.');
                continue;
            }
            if (!extraction.games?.[retirement.prefix]?.css) {
                fail('reviewed rule retirement references unknown game prefix ' + retirement.prefix + '.');
            }
            if (typeof retirement.context !== 'string'
                || typeof retirement.selector !== 'string' || !retirement.selector.trim()) {
                fail('reviewed rule retirement requires a context string and a non-empty selector.');
                continue;
            }
            if (!splitSelectorList(retirement.selector).every(part =>
                new RegExp('\\.' + retirement.prefix + '-').test(part))) {
                fail('reviewed rule retirement may only remove ' + retirement.prefix + '-prefixed page selectors.');
            }
            if (typeof retirement.reason !== 'string' || !retirement.reason.trim()) {
                fail('reviewed rule retirement requires a reason.');
            }
            const layoutProperties = retirement.reviewedLayoutProperties;
            if (layoutProperties !== undefined && (!Array.isArray(layoutProperties) || !layoutProperties.length
                || new Set(layoutProperties).size !== layoutProperties.length
                || layoutProperties.some(property => !REVIEWED_LAYOUT_CONVERGENCE_PROPERTIES.has(property)))) {
                fail('reviewed rule retirement reviewedLayoutProperties must be a non-empty, duplicate-free '
                    + 'list of reviewed layout properties.');
            }
            const key = retirement.prefix + '\0' + retirement.context + '\0' + retirement.selector;
            if (retirementKeys.has(key)) fail('duplicate reviewed rule retirement ' + retirement.selector + '.');
            retirementKeys.add(key);
        }
    }
    // A family may introduce a conditional grouping boundary only when that same
    // transaction also creates concrete, verified shared rules under its context.
    // This registration never grants permission to change existing @rules.
    const atRuleAdditions = extraction.reviewedAtRuleAdditions || [];
    if (!Array.isArray(atRuleAdditions)) {
        fail('reviewedAtRuleAdditions must be an array.');
    } else {
        const contexts = new Set();
        for (const addition of atRuleAdditions) {
            if (!addition || typeof addition !== 'object' || Array.isArray(addition)
                || !REVIEWED_COMPONENT_CONTEXTS.has(addition.context) || !addition.context) {
                fail('reviewed at-rule addition must name a reviewed non-empty component media context.');
                continue;
            }
            if (contexts.has(addition.context)) {
                fail('duplicate reviewed at-rule addition for ' + addition.context + '.');
            }
            contexts.add(addition.context);
            if (extraction.extends !== undefined) {
                fail('family extensions cannot introduce new conditional group boundaries.');
            }
            if (!(extraction.components || []).some(component => component.context === addition.context)) {
                fail('reviewed at-rule addition has no shared component in ' + addition.context + '.');
            }
            if (typeof addition.reason !== 'string' || !addition.reason.trim()) {
                fail('reviewed at-rule addition requires a reason.');
            }
        }
    }
    return valid;
}

function splitSelectorList(selector) {
    return selector.split(',').map(part => part.trim()).filter(Boolean);
}

// A narrowing only excludes the extraction's own shared class from an existing
// selector: `.a .b:hover` -> `.a .b:not(.shared):hover`. Every other selector in
// the list must survive byte-for-byte, so the rule can match fewer elements but
// never new ones.
function isReviewedSelectorNarrowing({ baseSelector, currentSelector, excludedClass }) {
    const baseParts = splitSelectorList(baseSelector);
    const currentParts = splitSelectorList(currentSelector);
    if (baseParts.length !== currentParts.length) return false;
    const exclusion = ':not(.' + excludedClass + ')';
    let narrowed = 0;
    for (let index = 0; index < baseParts.length; index++) {
        const base = baseParts[index];
        const current = currentParts[index];
        if (current === base) continue;
        const [, head, tail] = base.match(/^(.*?[^\s>+~:])((?::[a-z-]+)*)$/) || [];
        if (head === undefined || base.includes(exclusion) || current !== head + exclusion + tail) return false;
        narrowed += 1;
    }
    return narrowed > 0;
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
            rows.push([games[prefix].css, component.context || '', componentLocalSelector(prefix, component)]);
        }
    }
    for (const retirement of extraction.reviewedRuleRetirements || []) {
        if (games[retirement.prefix]?.css) {
            rows.push([games[retirement.prefix].css, retirement.context, retirement.selector]);
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

export function applyReviewedSelectorPrunesToDebt(rows, extractions, errors) {
    const projected = (rows || []).map(row => [...row]);
    for (const extraction of extractions || []) {
        for (const prune of extraction.reviewedSelectorPrunes || []) {
            const path = extraction.games?.[prune.prefix]?.css;
            if (!path) continue;
            const baseTuple = [path, '', prune.baseSelector];
            const currentTuple = [path, '', prune.currentSelector];
            const baseKey = tupleKey(baseTuple);
            const matches = [];
            for (let index = 0; index < projected.length; index++) {
                if (tupleKey(projected[index]) === baseKey) matches.push(index);
            }
            if (matches.length !== 1) {
                errors.push(extraction.id + '/selector-prune/' + prune.prefix
                    + ': immutable P0 debt must contain exactly one reviewed base selector tuple; found '
                    + matches.length + '.');
                continue;
            }
            projected[matches[0]] = currentTuple;
        }
    }
    return projected;
}

export function applyReviewedSelectorNarrowingsToImportant(rows, extractions, errors) {
    const projected = (rows || []).map(row => [...row]);
    for (const extraction of extractions || []) {
        for (const narrowing of extraction.reviewedSelectorNarrowings || []) {
            let matched = 0;
            for (let index = 0; index < projected.length; index++) {
                const row = projected[index];
                if (row[0] === narrowing.path && row[2] === narrowing.baseSelector) {
                    projected[index] = [row[0], row[1], narrowing.currentSelector, ...row.slice(3)];
                    matched += 1;
                }
            }
            if (!matched) {
                errors.push(extraction.id + '/selector-narrowing/' + narrowing.path
                    + ': immutable P0 !important inventory has no declaration under the reviewed base selector.');
            }
        }
    }
    return projected;
}

function escapeRegExp(value) {
    return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function migrationValueText(value) {
    return (value || []).map(token => token[1]).join('');
}

export function verifyCurrentRetiredCustomProperties(extraction, currentParsedByPath, errors) {
    const retirements = extraction.retiredCustomProperties || {};
    for (const [prefix, retirement] of Object.entries(retirements)) {
        const label = extraction.id + '/retired-custom-properties/' + prefix;
        for (const property of retirement.properties || []) {
            const referencePattern = new RegExp(
                'var\\(\\s*' + escapeRegExp(property) + '(?:\\s*[,)]|\\s*$)',
            );
            for (const [path, parsed] of currentParsedByPath) {
                for (const rule of parsed.rules || []) {
                    for (const declaration of rule.migrationDeclarations || []) {
                        if (declaration.property === property) {
                            errors.push(label + ': ' + property
                                + ' was redefined in current CSS at ' + path + ' ' + rule.selector + '.');
                        }
                        if (referencePattern.test(migrationValueText(declaration.value))) {
                            errors.push(label + ': ' + property + ' still has a CSS consumer in '
                                + path + ' ' + rule.selector + '.');
                        }
                    }
                }
            }
        }
    }
}

export function verifyRetiredCustomProperties(
    extraction, currentParsedByPath, baseParsedByPath,
    currentCatalogs, baseCatalogs, externalRuleChanges, errors,
) {
    const retirements = extraction.retiredCustomProperties || {};
    for (const [prefix, retirement] of Object.entries(retirements)) {
        const game = extraction.games?.[prefix];
        if (!game?.css) continue;
        const label = extraction.id + '/retired-custom-properties/' + prefix;
        const properties = retirement.properties || [];
        const retired = new Set(properties);
        const baseParsed = baseParsedByPath.get(game.css);
        const currentParsed = currentParsedByPath.get(game.css);
        const baseRules = (baseParsed?.rules || []).filter(rule =>
            !rule.layer
            && (rule.context || []).length === 0
            && (rule.migrationDeclarations || []).some(declaration => retired.has(declaration.property)));
        const seenBase = new Set();
        let removedDefinitionCount = 0;

        for (const baseRule of baseRules) {
            for (const declaration of baseRule.migrationDeclarations || []) {
                if (retired.has(declaration.property)) {
                    seenBase.add(declaration.property);
                    removedDefinitionCount += 1;
                }
            }
            const expected = (baseRule.migrationDeclarations || [])
                .filter(declaration => !retired.has(declaration.property));
            const currentRule = uniqueRuleByDeclarations(
                currentParsed, baseRule.selector, null, expected, errors,
                label + '/' + baseRule.selector + '/current',
            );
            if (!currentRule) {
                errors.push(label + '/' + baseRule.selector
                    + ': theme rule changed beyond the declared custom-property retirements.');
                continue;
            }

            const baseIndexed = uniqueCatalogRuleByDeclarations(
                baseCatalogs.get(game.css), baseRule.selector, null,
                baseRule.migrationDeclarations || [], errors,
                label + '/' + baseRule.selector + '/base-index',
            );
            const currentIndexed = uniqueCatalogRuleByDeclarations(
                currentCatalogs.get(game.css), baseRule.selector, null,
                expected, errors, label + '/' + baseRule.selector + '/current-index',
            );
            if (baseIndexed) externalRuleChanges.base.push(baseIndexed);
            if (currentIndexed) externalRuleChanges.current.push(currentIndexed);
        }

        if (removedDefinitionCount !== retirement.expectedRemovedDefinitions) {
            errors.push(label + ': base contains ' + removedDefinitionCount
                + ' retired declaration occurrence(s), expected '
                + retirement.expectedRemovedDefinitions + '.');
        }

        for (const property of properties) {
            if (!seenBase.has(property)) {
                errors.push(label + ': ' + property + ' was not defined in the comparison base.');
            }
        }
    }
}

function verifyReviewedSelectorPrunes(
    extraction, currentParsedByPath, baseParsedByPath,
    currentCatalogs, baseCatalogs, externalRuleChanges, errors,
) {
    for (const prune of extraction.reviewedSelectorPrunes || []) {
        const path = extraction.games?.[prune.prefix]?.css;
        if (!path) continue;
        const label = extraction.id + '/selector-prune/' + prune.prefix;
        const baseRule = uniqueRule(
            baseParsedByPath.get(path), prune.baseSelector, null, errors, label + '/base',
        );
        const currentRule = uniqueRule(
            currentParsedByPath.get(path), prune.currentSelector, null, errors, label + '/current',
        );
        if (!baseRule || !currentRule) continue;
        if (canonical(baseRule.migrationDeclarations || [])
            !== canonical(currentRule.migrationDeclarations || [])) {
            errors.push(label + ': selector prune changed declarations.');
        }

        const baseIndexed = uniqueCatalogRule(
            baseCatalogs.get(path), prune.baseSelector, null, errors, label + '/base-index',
        );
        const currentIndexed = uniqueCatalogRule(
            currentCatalogs.get(path), prune.currentSelector, null, errors, label + '/current-index',
        );
        if (baseIndexed) externalRuleChanges.base.push(baseIndexed);
        if (currentIndexed) externalRuleChanges.current.push(currentIndexed);
    }
}

function verifyReviewedSelectorNarrowings(
    extraction, currentParsedByPath, baseParsedByPath,
    currentCatalogs, baseCatalogs, externalRuleChanges, errors,
) {
    for (const narrowing of extraction.reviewedSelectorNarrowings || []) {
        const { path, layer } = narrowing;
        const label = extraction.id + '/selector-narrowing/' + path;
        const baseRule = uniqueRule(
            baseParsedByPath.get(path), narrowing.baseSelector, layer, errors, label + '/base',
        );
        const currentRule = uniqueRule(
            currentParsedByPath.get(path), narrowing.currentSelector, layer, errors, label + '/current',
        );
        if (!baseRule || !currentRule) continue;
        if (canonical(baseRule.migrationDeclarations || [])
            !== canonical(currentRule.migrationDeclarations || [])) {
            errors.push(label + ': selector narrowing changed declarations.');
        }

        const baseIndexed = uniqueCatalogRule(
            baseCatalogs.get(path), narrowing.baseSelector, layer, errors, label + '/base-index',
        );
        const currentIndexed = uniqueCatalogRule(
            currentCatalogs.get(path), narrowing.currentSelector, layer, errors, label + '/current-index',
        );
        if (baseIndexed) externalRuleChanges.base.push(baseIndexed);
        if (currentIndexed) externalRuleChanges.current.push(currentIndexed);
    }
}

// A retired page rule must have been a pure theme/geometry skin of the extracted
// family: once the shared component owns the surface, the page copy is deleted
// outright instead of being kept as a competing unlayered residual.
export function verifyReviewedRuleRetirements(
    extraction, currentParsedByPath, baseParsedByPath, baseCatalogs, externalRuleChanges, errors,
) {
    for (const retirement of extraction.reviewedRuleRetirements || []) {
        const path = extraction.games?.[retirement.prefix]?.css;
        if (!path) continue;
        const label = extraction.id + '/rule-retirement/' + retirement.prefix + ' ' + retirement.selector
            + (retirement.context ? ' @ ' + retirement.context : '');
        const matches = parsed => (parsed?.rules || []).filter(rule =>
            rule.selector === retirement.selector && !rule.layer
            && (rule.context || []).join(' / ') === retirement.context);
        const baseRules = matches(baseParsedByPath.get(path));
        if (baseRules.length !== 1) {
            errors.push(label + ': expected exactly one unlayered base rule, found ' + baseRules.length + '.');
            continue;
        }
        if (matches(currentParsedByPath.get(path)).length) {
            errors.push(label + ': retired rule still exists in current CSS.');
        }
        const layoutProperties = new Set(retirement.reviewedLayoutProperties || []);
        const baseProperties = (baseRules[0].migrationDeclarations || []).map(declaration => declaration.property);
        const unreviewed = baseProperties.filter(property =>
            !REVIEWED_PARTICIPANT_CONVERGENCE_PROPERTIES.has(property) && !layoutProperties.has(property));
        if (unreviewed.length) {
            errors.push(label + ': retired rule carries non-theme/geometry declarations ('
                + [...new Set(unreviewed)].join(', ') + ').');
        }
        for (const property of layoutProperties) {
            if (!baseProperties.includes(property)) {
                errors.push(label + ': reviewed layout property ' + property
                    + ' is stale because the retired rule never wrote it.');
            }
        }
        const baseIndexed = (baseCatalogs.get(path) || []).filter(rule =>
            rule.selector === retirement.selector && !rule.layer && rule.context === retirement.context);
        if (baseIndexed.length === 1) externalRuleChanges.base.push(baseIndexed[0]);
        else errors.push(label + ': expected exactly one indexed base rule, found ' + baseIndexed.length + '.');
    }
}

function componentIdentity(component) {
    return [
        component.suffix, component.localSelectorSuffix || '', component.sharedClass,
        component.sharedSelectorSuffix || '', component.sharedClassSpecificity || 'normal', component.surface,
        component.context || '',
    ].join('\0');
}

// An `extends` transaction appends adoption/convergence to a family whose shared rules an
// earlier ledger entry already created. It may not create, rename or restyle shared rules:
// every component must be one the root family owns, and the shared rule must be identical
// in the comparison base and the current tree. Returns, per component identity, the
// participants that earlier entries of the same family already adopted.
export function resolveFamilyExtension(extraction, orderedExtractions, errors) {
    if (extraction.extends === undefined) return null;
    const label = extraction.id + '/extends';
    const index = orderedExtractions.indexOf(extraction);
    const prior = orderedExtractions.slice(0, Math.max(index, 0));
    const rootFamily = prior.find(candidate => candidate.id === extraction.extends);
    if (!rootFamily) {
        errors.push(label + ': extended family ' + extraction.extends + ' must be an earlier ledger entry.');
        return new Map();
    }
    if (rootFamily.extends !== undefined) {
        errors.push(label + ': extend the root family ' + rootFamily.extends + ', not another extension.');
    }
    if (rootFamily.sharedStylesheet !== extraction.sharedStylesheet || rootFamily.sharedLayer !== extraction.sharedLayer) {
        errors.push(label + ': shared stylesheet/layer must match the extended family.');
    }
    const adopted = new Map();
    for (const component of rootFamily.components || []) adopted.set(componentIdentity(component), new Set());
    for (const candidate of prior) {
        if (candidate.id !== rootFamily.id && candidate.extends !== rootFamily.id) continue;
        for (const component of candidate.components || []) {
            const set = adopted.get(componentIdentity(component));
            if (set) for (const prefix of component.participants || []) set.add(prefix);
        }
    }
    for (const component of extraction.components || []) {
        if (!adopted.has(componentIdentity(component))) {
            errors.push(label + '/' + component.sharedClass + (component.sharedSelectorSuffix || '')
                + ': extension components must match a component of ' + rootFamily.id
                + ' (same suffix, shared selector and surface).');
        }
    }
    return adopted;
}

// A page rule that stays (it owns page-only layout) may shed theme/geometry declarations
// that now duplicate or fight the shared family. Every other declaration must survive in
// order, and the rule may not disappear (that is a whole-rule retirement instead).
export function verifyReviewedDeclarationRetirements(
    extraction, currentParsedByPath, baseParsedByPath, currentCatalogs, baseCatalogs, externalRuleChanges, errors,
) {
    for (const retirement of extraction.reviewedDeclarationRetirements || []) {
        const path = extraction.games?.[retirement.prefix]?.css;
        if (!path) continue;
        const label = extraction.id + '/declaration-retirement/' + retirement.prefix + ' ' + retirement.selector
            + (retirement.context ? ' @ ' + retirement.context : '');
        const matches = parsed => (parsed?.rules || []).filter(rule =>
            rule.selector === retirement.selector && !rule.layer
            && (rule.context || []).join(' / ') === retirement.context);
        const baseRules = matches(baseParsedByPath.get(path));
        const currentRules = matches(currentParsedByPath.get(path));
        if (baseRules.length !== 1 || currentRules.length !== 1) {
            errors.push(label + ': expected exactly one unlayered base and current rule, found '
                + baseRules.length + '/' + currentRules.length + '.');
            continue;
        }
        const retired = new Set(retirement.properties || []);
        const baseDeclarations = baseRules[0].migrationDeclarations || [];
        for (const property of retired) {
            if (!baseDeclarations.some(declaration => declaration.property === property)) {
                errors.push(label + ': retired property ' + property + ' is stale because the base rule never wrote it.');
            }
        }
        const expected = baseDeclarations.filter(declaration => !retired.has(declaration.property));
        if (!expected.length) {
            errors.push(label + ': every declaration is retired; register a whole-rule retirement instead.');
        }
        if (canonical(currentRules[0].migrationDeclarations || []) !== canonical(expected)) {
            errors.push(label + ': current declarations are not exactly the base rule minus the retired properties.');
        }
        const indexed = (catalog, declarations) => (catalog || []).filter(rule =>
            rule.selector === retirement.selector && !rule.layer && rule.context === retirement.context
            && canonical(rule.declarations || []) === canonical(declarations));
        const baseIndexed = indexed(baseCatalogs.get(path), baseRules[0].migrationDeclarations || []);
        const currentIndexed = indexed(currentCatalogs.get(path), currentRules[0].migrationDeclarations || []);
        if (baseIndexed.length === 1 && currentIndexed.length === 1) {
            externalRuleChanges.base.push(baseIndexed[0]);
            externalRuleChanges.current.push(currentIndexed[0]);
        } else {
            errors.push(label + ': expected exactly one indexed base/current rule, found '
                + baseIndexed.length + '/' + currentIndexed.length + '.');
        }
    }
}

function verifyNewExtraction(root, extraction, currentParsedByPath, baseParsedByPath,
    currentCatalogs, baseCatalogs, externalRuleChanges, comparisonBase, errors, extension = null) {
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
        const context = component.context || '';
        const adoptedParticipants = extension?.get(componentIdentity(component)) || null;
        let sharedRule;
        if (extension) {
            // Referenced shared rule: it must already exist and stay byte-for-byte unchanged.
            const baseShared = uniqueRule(baseSharedCss, sharedSelector, sharedLayer, errors, label + '/base-shared', context);
            sharedRule = uniqueRule(currentSharedCss, sharedSelector, sharedLayer, errors, label, context);
            if (!baseShared || !sharedRule) continue;
            if (canonical(baseShared.migrationDeclarations || []) !== canonical(sharedRule.migrationDeclarations || [])) {
                errors.push(label + ': an extension may not change the referenced shared rule.');
            }
        } else {
            const baseSharedMatches = (baseSharedCss?.rules || []).filter(rule =>
                rule.selector === sharedSelector && (rule.context || []).join(' / ') === context);
            if (baseSharedMatches.length) {
                errors.push(label + ': shared selector already existed in the comparison base.');
            }
            sharedRule = uniqueRule(currentSharedCss, sharedSelector, sharedLayer, errors, label, context);
            if (!sharedRule) continue;
            const sharedIndexed = uniqueCatalogRule(
                currentCatalogs.get(sharedPath), sharedSelector, sharedLayer, errors, label + '/current', context,
            );
            if (sharedIndexed) externalRuleChanges.current.push(sharedIndexed);
        }

        for (const prefix of component.participants || []) {
            const game = games[prefix];
            if (!game?.css || !game?.html || !game?.runtime) {
                errors.push(label + ': incomplete game metadata for ' + prefix + '.');
                continue;
            }
            const localSelector = componentLocalSelector(prefix, component);
            const baseRule = uniqueRule(baseParsedByPath.get(game.css), localSelector, null, errors,
                label + '/' + prefix + '/base', context);
            if (!baseRule) continue;
            const baseIndexed = uniqueCatalogRule(
                baseCatalogs.get(game.css), localSelector, null, errors, label + '/' + prefix + '/base-index', context,
            );
            if (baseIndexed) externalRuleChanges.base.push(baseIndexed);

            const layoutProperties = component.participantLayoutConvergence?.[prefix]?.properties || [];
            const expected = adoptedParticipants?.has(prefix)
                ? expectedConvergedResidual(
                    baseRule, errors, label + '/' + prefix,
                    component.participantConvergedProperties?.[prefix] || [], layoutProperties,
                )
                : expectedResidual(
                    baseRule,
                    sharedRule,
                    errors,
                    label + '/' + prefix,
                    component.inheritedEquivalentProperties?.[prefix] || [],
                    component.convergedThemeProperties || [],
                    component.participantConvergedProperties?.[prefix] || [],
                    layoutProperties,
                    component.participantResidualRewrites?.[prefix] || [],
                );
            const currentMatches = (currentParsedByPath.get(game.css)?.rules || []).filter(rule =>
                rule.selector === localSelector && !rule.layer && (rule.context || []).join(' / ') === context);
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
                    label + '/' + prefix + '/current-index', context,
                );
                if (currentIndexed) externalRuleChanges.current.push(currentIndexed);
            }

        }
    }

    verifyReviewedSelectorPrunes(
        extraction, currentParsedByPath, baseParsedByPath,
        currentCatalogs, baseCatalogs, externalRuleChanges, errors,
    );
    verifyReviewedSelectorNarrowings(
        extraction, currentParsedByPath, baseParsedByPath,
        currentCatalogs, baseCatalogs, externalRuleChanges, errors,
    );
    verifyReviewedRuleRetirements(
        extraction, currentParsedByPath, baseParsedByPath, baseCatalogs, externalRuleChanges, errors,
    );
    verifyReviewedDeclarationRetirements(
        extraction, currentParsedByPath, baseParsedByPath, currentCatalogs, baseCatalogs, externalRuleChanges, errors,
    );
    verifyRetiredCustomProperties(
        extraction, currentParsedByPath, baseParsedByPath,
        currentCatalogs, baseCatalogs, externalRuleChanges, errors,
    );
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
    const removedCustomPropertyDefinitionsByPath = new Map();
    const retiredPropertyClaims = new Set();
    let totalRuleDelta = 0;
    for (const extraction of currentById.values()) {
        if (!verifyExtractionShape(extraction, errors)) continue;
        // Adoption is a persistent invariant, not a one-time transformation check.
        // Re-run it for every ledger entry so later HTML/runtime edits cannot silently
        // disconnect a page from its shared family styles after the extraction merges.
        verifyExtractionAdoption(root, extraction, errors);
        verifyCurrentRetiredCustomProperties(extraction, currentParsedByPath, errors);
        if (!Number.isInteger(extraction.expectedRuleDelta) || extraction.expectedRuleDelta >= 0) {
            errors.push(extraction.id + ': expectedRuleDelta must be a negative integer.');
            continue;
        }
        const tuples = removedTuples(extraction, errors);
        if (tuples.length !== extraction.expectedRemovedUnlayeredRules) {
            errors.push(extraction.id + ': expectedRemovedUnlayeredRules does not match component membership ('
                + extraction.expectedRemovedUnlayeredRules + ' vs ' + tuples.length + ').');
        }
        // An extension references existing shared rules, so it adds none of its own.
        const addedSharedRules = extraction.extends === undefined ? (extraction.components || []).length : 0;
        if (extraction.expectedRuleDelta !== addedSharedRules - tuples.length) {
            errors.push(extraction.id + ': expectedRuleDelta must equal new shared rules minus fully removed and retired local rules.');
        }
        totalRuleDelta += extraction.expectedRuleDelta;
        removed.push(...tuples);
        if (extraction.sharedStylesheet) cssPaths.add(extraction.sharedStylesheet);
        for (const game of Object.values(extraction.games || {})) if (game?.css) cssPaths.add(game.css);
        for (const narrowing of extraction.reviewedSelectorNarrowings || []) cssPaths.add(narrowing.path);

        for (const [prefix, retirement] of Object.entries(extraction.retiredCustomProperties || {})) {
            const path = extraction.games?.[prefix]?.css;
            if (!path) continue;
            removedCustomPropertyDefinitionsByPath.set(
                path,
                (removedCustomPropertyDefinitionsByPath.get(path) || 0)
                    + retirement.expectedRemovedDefinitions,
            );
            for (const property of retirement.properties || []) {
                const claim = path + '\0' + property;
                if (retiredPropertyClaims.has(claim)) {
                    errors.push('retired custom property is claimed by more than one family transaction: '
                        + path + ' ' + property + '.');
                } else {
                    retiredPropertyClaims.add(claim);
                }
            }
        }
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
    const orderedExtractions = [...currentById.values()];
    const extensions = new Map(orderedExtractions.map(extraction =>
        [extraction.id, resolveFamilyExtension(extraction, orderedExtractions, errors)]));
    const newExtractions = orderedExtractions.filter(extraction => !baseById.has(extraction.id));
    const newRuleDelta = newExtractions.reduce((sum, extraction) => sum + extraction.expectedRuleDelta, 0);
    const newReviewedAtRuleAdditions = newExtractions.flatMap(extraction =>
        (extraction.reviewedAtRuleAdditions || []).map(addition => ({
            ...addition, path: extraction.sharedStylesheet, extractionId: extraction.id,
        })));
    for (const extraction of newExtractions) {
        verifyNewExtraction(
            root, extraction, currentParsedByPath, baseParsedByPath,
            currentCatalogs, baseCatalogs, externalRuleChanges, comparisonBase, errors,
            extensions.get(extraction.id),
        );
    }
    // Rule population is a cross-transaction invariant: verify-css-debt
    // combines this family delta with rule/dedupe migration deltas against the
    // comparison base. A family-only whole-tree check would reject valid
    // changes containing both types of migration.
    return {
        cssPaths,
        totalRuleDelta,
        remainingUnlayeredRules: applyReviewedSelectorPrunesToDebt(
            subtractRows(baselineUnlayeredRules, removed, errors),
            [...currentById.values()],
            errors,
        ),
        removedCustomPropertyDefinitionsByPath,
        externalRuleChanges,
        extractions: [...currentById.values()],
        newExtractionIds: newExtractions.map(extraction => extraction.id),
        newReviewedAtRuleAdditions,
        newRuleDelta,
    };
}
