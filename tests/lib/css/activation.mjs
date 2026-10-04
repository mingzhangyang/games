import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlDocumentDirectives, htmlJavaScriptInputs, resolveLocalScript, servedUrl } from './html-inputs.mjs';
import { moduleSpecifiers, parseAuditedJs, SCAFFOLD, SOURCE_IDS, STYLE_INSTALLER } from './runtime-sources.mjs';

// Pinned in code, like the ordered-model addendum: a baseline + digest update
// in the same change cannot silently re-approve a new activation.
const SNAPSHOT_PATH = 'tests/css-activation-p0-baseline.json';
const SNAPSHOT_SHA256 = '4d044e747cd9c7cdc7a38e53bfeedb2b2016ae0856a0436e4a6eb8ca71e31c1d';

// Per page, this addendum records the document directives that govern how its
// stylesheets decode/evaluate (html-inputs.mjs) and what code it executes.
// A runtime stylesheet source contributes to a page's cascade only if that page
// executes its installer. Activation is therefore part of the cascade model:
// page → executable scripts/handlers → static and literal dynamic imports.
// The graph is closed over the audited local inventory; anything it cannot
// resolve (bare/remote/data specifiers, non-JS files, non-literal import())
// fails instead of being omitted.
function resolveSpecifier(specifier, fromHref, auditedFiles) {
    if (!/^(?:\.{1,2})?\//.test(specifier)) {
        throw new Error('module specifier "' + specifier + '" is outside the audited local JavaScript inventory');
    }
    const file = resolveLocalScript(new URL(specifier, fromHref).href, auditedFiles);
    if (!file) throw new Error('module specifier "' + specifier + '" is outside the audited local JavaScript inventory');
    return file;
}

function reachableModules(root, entries, auditedFiles, label) {
    const reached = new Set();
    const queue = [...entries];
    while (queue.length) {
        const { file, grammar } = queue.shift();
        const key = file + '|' + grammar;
        if (reached.has(key)) continue;
        reached.add(key);
        let specifiers;
        try { specifiers = moduleSpecifiers(parseAuditedJs(readFileSync(join(root, file), 'utf8'), grammar)); }
        catch (error) { throw new Error(label + ' → ' + file + ': ' + error.message); }
        for (const specifier of specifiers) {
            let target;
            try { target = resolveSpecifier(specifier, servedUrl(file).href, auditedFiles); }
            catch (error) { throw new Error(label + ' → ' + file + ': ' + error.message); }
            queue.push({ file: target, grammar: 'module' });
        }
    }
    return new Set([...reached].map(key => key.split('|')[0]));
}

export function pageActivation(root, file, html, auditedFiles) {
    const scripts = [];
    const handlerImports = new Set();
    const entries = [];
    for (const input of htmlJavaScriptInputs(html, file)) {
        if (input.url) {
            const src = resolveLocalScript(input.url, auditedFiles);
            if (!src) throw new Error(input.file + ': external script is outside the audited local JavaScript inventory');
            entries.push({ file: src, grammar: input.grammar });
            scripts.push({ grammar: input.grammar, src, attributes: input.attributes });
            continue;
        }
        const imports = moduleSpecifiers(parseAuditedJs(input.source, input.grammar))
            .map(specifier => resolveSpecifier(specifier, input.baseUrl, auditedFiles));
        imports.forEach(target => entries.push({ file: target, grammar: 'module' }));
        if (input.kind === 'script') {
            scripts.push({ grammar: input.grammar, inline: true, attributes: input.attributes, imports });
        } else imports.forEach(target => handlerImports.add(target));
    }
    const reached = reachableModules(root, entries, auditedFiles, file);
    if (reached.has(SCAFFOLD)) {
        throw new Error(file + ': build-time HTML scaffold ' + SCAFFOLD + ' must not be reachable from page execution');
    }
    // The installer accepts any registry key, so reaching it makes every
    // registered source activatable on the page. No caller-key inference.
    const runtimeStyleSources = reached.has(STYLE_INSTALLER) ? Object.values(SOURCE_IDS).sort() : [];
    return {
        directives: htmlDocumentDirectives(html, file),
        scripts, handlerImports: [...handlerImports].sort(), runtimeStyleSources,
    };
}

export function observeActivation(root, htmlPaths, auditedFiles, errors) {
    const pages = {};
    for (const file of htmlPaths) {
        try { pages[file] = pageActivation(root, file, readFileSync(join(root, file), 'utf8'), auditedFiles); }
        catch (error) { errors.push('Activation graph: ' + error.message); }
    }
    return pages;
}

export function verifyActivationSnapshot(root, htmlPaths, auditedFiles, errors) {
    const text = readFileSync(join(root, SNAPSHOT_PATH), 'utf8');
    if (createHash('sha256').update(text).digest('hex') !== SNAPSHOT_SHA256) {
        errors.push('Activation P0 addendum changed; preserve history and review a separate correction.');
        return;
    }
    const baseline = JSON.parse(text).pages;
    const actual = observeActivation(root, htmlPaths, auditedFiles, errors);
    for (const file of new Set([...Object.keys(baseline), ...Object.keys(actual)])) {
        if (JSON.stringify(baseline[file]) !== JSON.stringify(actual[file])) {
            const before = baseline[file]?.runtimeStyleSources ?? [];
            const after = actual[file]?.runtimeStyleSources ?? [];
            errors.push(file + ': document directives or executable script activation differ from the immutable activation addendum'
                + (JSON.stringify(before) === JSON.stringify(after) ? ''
                    : ' (activatable runtime stylesheet sources ' + before.length + ' → ' + after.length + ')')
                + '. Changing a directive, or adding/moving a script that can install styles, needs an explicit P2 mapping.');
        }
    }
}
