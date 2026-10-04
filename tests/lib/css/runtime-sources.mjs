import { parse } from 'acorn';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseHtmlElements, htmlElementAttributes, htmlTagName, styleElementSource } from './html-inputs.mjs';

export const STYLE_REGISTRY = 'src/games/math-rain/style-sources.js';
export const STYLE_INSTALLER = 'src/games/math-rain/install-style.js';
export const SOURCE_IDS = Object.freeze({
    'error-notification': 'src/games/math-rain/core/ErrorHandler.js#ErrorHandler.addErrorStyles#1',
    'score-popup': 'src/games/math-rain/core/UIController.js#UIController.createScorePopup#1',
    mobile: 'src/games/math-rain/mobile-adapter.js#MobileAdapter.addMobileStyles#1',
    'low-end': 'src/games/math-rain/mobile-adapter.js#MobileAdapter.applyLowEndSettings#1',
    notification: 'src/games/math-rain/shop-manager.js#ShopManager.createNotificationPopup#1',
});
const INSTALLER_SHA256 = '4650a9991128e625fc639a0df36dfe58bb76198995fdc7cd52fa09176452a284';
// This existing pure scaffold renderer emits whole HTML for new-game.mjs.
// Pin its bytes instead of misclassifying its template as a live DOM injection.
const SCAFFOLD = 'src/platform/shell/render-game-shell.js';
const SCAFFOLD_SHA256 = 'd79dfc7567c624a3d33c0dcc8947f45cdbd276b4ff353bcfb17274d4f1058e55';
const parseJs = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
const string = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value
    : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : null;
const property = node => node.computed ? string(node.property) : node.property?.name;

function walk(node, parent, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parent);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => walk(child, node, visit));
        else if (value && typeof value === 'object') walk(value, node, visit);
    }
}

export function readStyleRegistry(source) {
    const ast = parseJs(source);
    const statement = ast.body[0];
    const declaration = statement?.declaration;
    const binding = declaration?.declarations?.[0];
    const init = binding?.init;
    if (ast.body.length !== 1 || statement.type !== 'ExportNamedDeclaration'
        || declaration?.kind !== 'const' || declaration.declarations.length !== 1
        || binding.id.name !== 'STYLE_SOURCES' || init?.type !== 'CallExpression'
        || init.callee.type !== 'MemberExpression' || init.callee.object.name !== 'Object'
        || property(init.callee) !== 'freeze' || init.arguments.length !== 1
        || init.arguments[0]?.type !== 'ObjectExpression') {
        throw new Error('Style registry must be a single exported frozen string dictionary');
    }
    const entries = {};
    for (const entry of init.arguments[0].properties) {
        const key = entry.computed ? null : entry.key?.name ?? string(entry.key);
        const css = string(entry.value);
        if (entry.type !== 'Property' || entry.kind !== 'init' || entry.method || entry.shorthand
            || !key || css == null || !Object.hasOwn(SOURCE_IDS, key) || Object.hasOwn(entries, key)) {
            throw new Error('Style registry contains an unknown, duplicate or executable entry');
        }
        entries[key] = css;
    }
    if (Object.keys(entries).length !== Object.keys(SOURCE_IDS).length) throw new Error('Missing registered stylesheet');
    return entries;
}

// This is an architectural syntax boundary, not a JavaScript data-flow proof.
// Browser tests independently observe actual installed styles after exercising
// the callers. Do not add alias/constant-propagation heuristics to this module.
export function auditStyleIngress(source, file = 'fixture.js') {
    const errors = [];
    const fail = message => errors.push(file + ': ' + message);
    walk(parseJs(source), null, (node, parent) => {
        if (node.type === 'MemberExpression') {
            const name = property(node);
            if (['createElement', 'createElementNS'].includes(name)) {
                const call = parent?.type === 'CallExpression' && parent.callee === node ? parent : null;
                const tag = string(call?.arguments[name === 'createElementNS' ? 1 : 0]);
                if (!call || tag == null || ['style', 'link'].includes(tag.toLowerCase())) {
                    fail('element factories must be direct calls with a literal non-stylesheet tag');
                }
            }
            if (['adoptedStyleSheets', 'styleSheets', 'sheet', 'insertRule', 'addRule', 'replaceSync',
                'CSSStyleSheet', 'DOMParser', 'createContextualFragment', 'write', 'writeln'].includes(name)) {
                fail('stylesheet/HTML injection handle .' + name + ' is outside the registered source boundary');
            }
            if (node.computed && name == null && ['document', 'window', 'globalThis'].includes(node.object?.name)
                && !(parent?.type === 'AssignmentExpression' && parent.left === node && parent.operator === '=')) {
                fail('computed global DOM access requires an explicit reviewed boundary');
            }
        }
        if (node.type === 'Identifier' && ['CSSStyleSheet', 'DOMParser'].includes(node.name)) {
            fail(node.name + ' is outside the registered source boundary');
        }
        if (node.type === 'Property' && parent?.type === 'ObjectPattern'
            && ['createElement', 'createElementNS'].includes(node.key?.name ?? string(node.key))) {
            fail('element factories cannot be destructured or aliased');
        }
        if (node.type === 'Literal' && typeof node.value === 'string'
            && /<\s*(?:style|link)(?:[\s/>])/i.test(node.value)) fail('runtime stylesheet markup is forbidden');
        if (node.type === 'TemplateElement' && /<\s*(?:style|link)(?:[\s/>])/i.test(node.value.cooked || '')) {
            fail('runtime stylesheet markup is forbidden');
        }
        if (node.type === 'ImportDeclaration' || node.type === 'ImportExpression') {
            const target = string(node.source);
            if (target && /\.css(?:[?#]|$)/i.test(target)) fail('CSS imports must be registered as page stylesheet inputs');
        }
    });
    return errors;
}

function files(root, directory) {
    return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
        const path = directory + '/' + entry.name;
        return entry.isDirectory() ? files(root, path) : [path];
    });
}

export function scanRuntimeStyleSources(root, errors) {
    const registry = readStyleRegistry(readFileSync(join(root, STYLE_REGISTRY), 'utf8'));
    const installer = readFileSync(join(root, STYLE_INSTALLER), 'utf8');
    if (createHash('sha256').update(installer).digest('hex') !== INSTALLER_SHA256) {
        errors.push('Runtime stylesheet installer changed; review insertion semantics and its independent digest.');
    }
    for (const file of ['src', 'js', 'public'].flatMap(directory => files(root, directory))) {
        if (!/\.(?:m?js)$/.test(file) || [STYLE_REGISTRY, STYLE_INSTALLER].includes(file)) continue;
        if (file === SCAFFOLD) {
            if (createHash('sha256').update(readFileSync(join(root, file))).digest('hex') !== SCAFFOLD_SHA256) {
                errors.push('HTML scaffold source changed; review its stylesheet inputs.');
            }
            continue;
        }
        try { errors.push(...auditStyleIngress(readFileSync(join(root, file), 'utf8'), file)); }
        catch (error) { errors.push(file + ': cannot audit JavaScript: ' + error.message); }
    }
    // Inline executable scripts are source inputs too; JSON-LD remains data.
    const htmlFiles = readdirSync(root).filter(file => file.endsWith('.html'))
        .concat(files(root, 'public').filter(file => file.endsWith('.html')));
    for (const file of htmlFiles) {
        const html = readFileSync(join(root, file), 'utf8');
        for (const element of parseHtmlElements(html)) {
            if (htmlTagName(element) !== 'script') continue;
            const attrs = htmlElementAttributes(element);
            if (attrs.src || (attrs.type && !['module', 'text/javascript', 'application/javascript'].includes(attrs.type))) continue;
            try { errors.push(...auditStyleIngress(styleElementSource(html, element, file), file)); }
            catch (error) { errors.push(file + ': cannot audit inline JavaScript: ' + error.message); }
        }
    }
    return Object.entries(registry).map(([key, css]) => ({ id: SOURCE_IDS[key], css }))
        .sort((a, b) => a.id.localeCompare(b.id));
}
