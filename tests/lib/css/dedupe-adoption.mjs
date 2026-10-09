// Exact-selector adoption proof for reviewed cross-file CSS dedupe.
// New targets must preserve the match set on every source page and must not
// activate on pages that only load the destination stylesheet. Historical
// mappings are rechecked against current HTML on every run.
import { htmlElementAttributes, htmlTagName, htmlTokens, parseHtmlElements } from './html-inputs.mjs';

const jsonKey = value => JSON.stringify(value);

function classTokens(value) {
    // Match the HTML class microsyntax, which splits ASCII whitespace only.
    return new Set(htmlTokens(String(value || '')));
}

// A static class set is a sound selector witness only when the rewrite changes
// exactly one class token and preserves any state pseudo-class verbatim.
// Complex selectors require a separately reviewed proof, not a regex that can
// accidentally match one class inside a wider selector.
const SIMPLE_CLASS_STATE = /^\.([a-zA-Z_][a-zA-Z0-9_-]*)(?::(active|hover|focus|focus-visible|focus-within|disabled|checked))?$/;
const CLASS_NAME = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

function exactClassReplacement(sourceSelector, destinationSelector, localClass, sharedClass) {
    if (!CLASS_NAME.test(localClass || '') || !CLASS_NAME.test(sharedClass || '')) return false;
    const source = SIMPLE_CLASS_STATE.exec(sourceSelector || '');
    const destination = SIMPLE_CLASS_STATE.exec(destinationSelector || '');
    return Boolean(source && destination
        && source[1] === localClass && destination[1] === sharedClass
        && source[2] === destination[2]);
}

function sortedValues(values) {
    return [...values].sort();
}

function sameValues(left, right) {
    return jsonKey(sortedValues(left)) === jsonKey(sortedValues(right));
}


// Each source selector is a single class (and an identical pseudo-state), so
// class membership is a sound proxy for the selector's potential match set.
// For a NEW shared owner, require destination matches to equal the UNION of
// all source selectors active on that page. This rejects accidental widening
// even when every former source element also has the shared class.
//
// Reusing an existing destination differs: its other matches were already
// styled before this transaction. Reuse is separately proven against the
// comparison base, and the per-source subset checks above still apply.
function verifyNewHtmlClassDestinationMatches(mapping, sources, destination, byPath, pagesByPath, htmlSources, errors) {
    const sharedClasses = new Set(sources.map(source => byPath.get(source.path)?.sharedClass));
    if (sharedClasses.size !== 1 || !CLASS_NAME.test([...sharedClasses][0] || '')) {
        errors.push(mapping.id + ': html-class adoption must name one exact shared destination class.');
        return;
    }
    const sharedClass = [...sharedClasses][0];
    const sourcePages = new Set(sources.flatMap(source => [...(pagesByPath.get(source.path) || [])]));
    for (const page of [...sourcePages].sort()) {
        const html = htmlSources?.get?.(page);
        if (typeof html !== 'string') continue; // Already reported by per-source adoption.
        let elements;
        try {
            elements = parseHtmlElements(html, page);
        } catch {
            continue; // Already reported by per-source adoption.
        }
        const activeLocalClasses = sources
            .filter(source => pagesByPath.get(source.path)?.has(page))
            .map(source => byPath.get(source.path)?.localClass)
            .filter(name => typeof name === 'string' && CLASS_NAME.test(name));
        // The exact-selector proof must succeed first; never claim an invalid
        // complex selector is safe based on a class-only comparison.
        if (activeLocalClasses.length !== sources.filter(source =>
            pagesByPath.get(source.path)?.has(page)).length
            || sources.some(source => !exactClassReplacement(
                source.selector, destination.selector,
                byPath.get(source.path)?.localClass, byPath.get(source.path)?.sharedClass,
            ))) continue;
        let extras = 0;
        for (const element of elements) {
            const classes = classTokens(htmlElementAttributes(element).class);
            if (classes.has(sharedClass) && !activeLocalClasses.some(name => classes.has(name))) extras++;
        }
        if (extras) {
            errors.push(mapping.id + ': ' + page + ' shared destination matches ' + extras
                + ' extra element(s) outside the union of registered source selector matches.');
        }
    }
}

function verifyDedupeDestinationActivation(mapping, sources, destination, pagesByPath, errors) {
    const destinationPages = pagesByPath.get(destination.path) || new Set();
    const sourcePaths = new Set(sources.map(source => source.path));
    for (const sourcePath of sourcePaths) {
        const sourcePages = pagesByPath.get(sourcePath) || new Set();
        for (const page of sourcePages) {
            if (!destinationPages.has(page)) {
                errors.push(mapping.id + ': destination stylesheet ' + destination.path
                    + ' is not active on ' + page + ' (required by source stylesheet ' + sourcePath + ').');
            }
        }
    }
}

// Newly introduced shared rules must not silently activate on destination-only
// pages. Explicit root scoping proves that consumers lacking the opt-in class
// retain their original CSS behavior (e.g. Math Rain's opacity-based modals).
// Do not accept a selector list: an unscoped comma branch would bypass the gate.
function dedupeDestinationRootScope(mapping, sources, destination) {
    if (mapping.adoption?.surface !== 'root-class'
        || !Array.isArray(mapping.adoption.consumers)
        || !mapping.adoption.consumers.length) return null;
    const rootClass = mapping.adoption.consumers[0]?.rootClass;
    if (typeof rootClass !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(rootClass)
        || mapping.adoption.consumers.some(consumer => consumer.rootClass !== rootClass)) return null;
    const selector = sources[0]?.selector;
    if (sources.some(source => source.selector !== selector)) return null;
    if (selector === '*'
        && destination.selector === 'html.' + rootClass + ', html.' + rootClass + ' *') {
        return rootClass; // Reviewed universal reset: root element and descendants.
    }
    if (/^\.[a-zA-Z_][a-zA-Z0-9_-]*$/.test(selector)
        && destination.selector === 'html.' + rootClass + ' ' + selector) {
        return rootClass; // State class, anchored to an opted-in document root.
    }
    return null;
}

function verifyDedupeDestinationConsumers(mapping, sources, destination, pagesByPath, htmlSources, errors) {
    if (mapping.reuseExistingDestination) return; // Existing CSS cannot create new exposure.
    const sourcePages = new Set(sources.flatMap(source => [...(pagesByPath.get(source.path) || [])]));
    const destinationOnly = [...(pagesByPath.get(destination.path) || [])]
        .filter(page => !sourcePages.has(page)).sort();
    if (!destinationOnly.length) return;

    const rootClass = dedupeDestinationRootScope(mapping, sources, destination);
    if (!rootClass) {
        errors.push(mapping.id + ': new shared destination reaches destination-only consumers ('
            + destinationOnly.join(', ') + '); require a document-root-scoped selector and root-class adoption evidence.');
        return;
    }
    for (const page of destinationOnly) {
        const html = htmlSources?.get?.(page);
        if (typeof html !== 'string') {
            errors.push(mapping.id + ': destination-only consumer ' + page + ' has no current HTML evidence.');
            continue;
        }
        try {
            const roots = parseHtmlElements(html, page).filter(element => htmlTagName(element) === 'html');
            if (roots.length !== 1) {
                errors.push(mapping.id + ': destination-only consumer ' + page + ' must have exactly one document root.');
            } else if (classTokens(htmlElementAttributes(roots[0]).class).has(rootClass)) {
                errors.push(mapping.id + ': destination-only consumer ' + page
                    + ' unexpectedly opts into .' + rootClass + ' without registered source adoption.');
            }
        } catch (error) {
            errors.push(mapping.id + ': cannot inspect destination-only consumer ' + page + ': ' + error.message);
        }
    }
}

export function verifyDedupeAdoption(mapping, sources, destination, pagesByPath, htmlSources, errors) {
    const adoption = mapping.adoption;
    verifyDedupeDestinationActivation(mapping, sources, destination, pagesByPath, errors);
    verifyDedupeDestinationConsumers(mapping, sources, destination, pagesByPath, htmlSources, errors);
    if (sources.every(source => source.selector === destination.selector)) return;

    if (adoption?.surface === 'root-class' && !dedupeDestinationRootScope(mapping, sources, destination)) {
        errors.push(mapping.id + ': root-class adoption requires an exact, reviewed document-root-scoped replacement.');
    }
    if (adoption?.surface === 'body-class') {
        errors.push(mapping.id + ': body-class dedupe selector rewrites require a separate exact-equivalence contract.');
    }
    if (adoption?.surface === 'html-class') {
        const registeredPaths = new Set();
        for (const source of sources) {
            if (registeredPaths.has(source.path)) {
                errors.push(mapping.id + ': html-class adoption cannot collapse multiple source selectors from one stylesheet.');
            }
            registeredPaths.add(source.path);
            const consumer = adoption.consumers?.find(item => item?.sourcePath === source.path);
            if (!consumer || !exactClassReplacement(
                source.selector, destination.selector, consumer.localClass, consumer.sharedClass,
            )) {
                errors.push(mapping.id + ': html-class adoption requires exact class-for-class selector substitution'
                    + ' with the same pseudo-state for ' + source.path + '.');
            }
        }
    }

    const expectedPaths = new Set(sources.map(source => source.path));
    const consumers = Array.isArray(adoption?.consumers) ? adoption.consumers : [];
    const byPath = new Map();
    for (const consumer of consumers) {
        const path = consumer?.sourcePath;
        if (!expectedPaths.has(path)) {
            errors.push(mapping.id + ': adoption evidence names an unregistered source path ' + JSON.stringify(path) + '.');
            continue;
        }
        if (byPath.has(path)) {
            errors.push(mapping.id + ': adoption evidence duplicates source path ' + path + '.');
            continue;
        }
        byPath.set(path, consumer);
        const expectedPages = pagesByPath.get(path) || new Set();
        const declaredPages = new Set(Array.isArray(consumer.pages) ? consumer.pages : []);
        if (!sameValues(declaredPages, expectedPages)) {
            errors.push(mapping.id + ': adoption pages for ' + path + ' must exactly match every stylesheet consumer.');
        }
        for (const page of declaredPages) {
            const html = htmlSources?.get?.(page);
            if (typeof html !== 'string') {
                errors.push(mapping.id + ': adoption evidence has no HTML source for consumer ' + page + '.');
                continue;
            }
            let elements;
            try {
                elements = parseHtmlElements(html, page);
            } catch (error) {
                errors.push(mapping.id + ': cannot inspect adoption consumer ' + page + ': ' + error.message);
                continue;
            }
            if (adoption?.surface === 'html-class') {
                const localClass = consumer.localClass;
                const sharedClass = consumer.sharedClass;
                if (typeof localClass !== 'string' || typeof sharedClass !== 'string'
                    || !localClass || !sharedClass) {
                    errors.push(mapping.id + ': html-class adoption requires localClass and sharedClass for ' + path + '.');
                    continue;
                }
                const localElements = elements.filter(element =>
                    classTokens(htmlElementAttributes(element).class).has(localClass));
                if (!localElements.length) {
                    errors.push(mapping.id + ': ' + page + ' has no .' + localClass + ' adoption anchor.');
                    continue;
                }
                const missingShared = localElements.filter(element =>
                    !classTokens(htmlElementAttributes(element).class).has(sharedClass));
                if (missingShared.length) {
                    errors.push(mapping.id + ': ' + page + ' has ' + missingShared.length
                        + ' .' + localClass + ' element(s) without .' + sharedClass + '.');
                }
            } else if (adoption?.surface === 'body-class') {
                const bodyClass = consumer.bodyClass;
                const bodies = elements.filter(element => htmlTagName(element) === 'body');
                if (typeof bodyClass !== 'string' || !bodyClass) {
                    errors.push(mapping.id + ': body-class adoption requires bodyClass for ' + path + '.');
                } else if (bodies.length !== 1 || !classTokens(htmlElementAttributes(bodies[0]).class).has(bodyClass)) {
                    errors.push(mapping.id + ': ' + page + ' must opt into .' + bodyClass + ' on its body.');
                }
            } else if (adoption?.surface === 'root-class') {
                const rootClass = consumer.rootClass;
                const roots = elements.filter(element => htmlTagName(element) === 'html');
                if (typeof rootClass !== 'string' || !rootClass) {
                    errors.push(mapping.id + ': root-class adoption requires rootClass for ' + path + '.');
                } else if (roots.length !== 1 || !classTokens(htmlElementAttributes(roots[0]).class).has(rootClass)) {
                    errors.push(mapping.id + ': ' + page + ' must opt into .' + rootClass + ' on its document root.');
                } else if (destination.selector.startsWith('html.' + rootClass + ' ')
                    && /^\.[a-zA-Z_][a-zA-Z0-9_-]*$/.test(sources[0]?.selector || '')
                    && classTokens(htmlElementAttributes(roots[0]).class).has(sources[0].selector.slice(1))) {
                    // Old .class matched <html> too; html.root .class matches
                    // descendants only. A source class on <html> breaks equality.
                    errors.push(mapping.id + ': ' + page
                        + ' source selector matches the document root, which the scoped destination excludes.');
                }
            } else {
                errors.push(mapping.id + ': unsupported adoption surface ' + JSON.stringify(adoption?.surface) + '.');
                break;
            }
        }
    }
    for (const path of expectedPaths) {
        if (!byPath.has(path)) errors.push(mapping.id + ': adoption evidence is missing source path ' + path + '.');
    }
    if (adoption?.surface === 'html-class' && !mapping.reuseExistingDestination) {
        verifyNewHtmlClassDestinationMatches(mapping, sources, destination, byPath, pagesByPath, htmlSources, errors);
    }
}

