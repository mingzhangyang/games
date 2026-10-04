import { parse } from 'acorn';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { htmlJavaScriptInputs, htmlScriptKind, resolveLocalScript } from './html-inputs.mjs';

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
export const SCAFFOLD = 'src/platform/shell/render-game-shell.js';
const SCAFFOLD_SHA256 = 'd79dfc7567c624a3d33c0dcc8947f45cdbd276b4ff353bcfb17274d4f1058e55';
const parseJs = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
const string = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value
    : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : null;
// A statically known property name, or null when a computed key hides it.
const staticKey = (key, computed) => key?.type === 'Identifier' && !computed ? key.name
    : key?.type === 'PrivateIdentifier' ? '#' + key.name
        : key?.type === 'Literal' && ['number', 'bigint'].includes(typeof key.value) ? String(key.value) : string(key);
const property = node => staticKey(node.property, node.computed);

function walk(node, ancestors, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, ancestors.at(-1) ?? null, ancestors);
    ancestors.push(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => walk(child, ancestors, visit));
        else if (value && typeof value === 'object') walk(value, ancestors, visit);
    }
    ancestors.pop();
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

export function parseAuditedJs(source, grammar = 'module') {
    if (grammar === 'handler') {
        // Event attributes are FunctionBody, not Module or Script. A wrapper
        // supplies function context; ensure input cannot escape that wrapper.
        const ast = parse('function __html_handler__(event) {\n' + source + '\n}',
            { ecmaVersion: 'latest', sourceType: 'script' });
        if (ast.body.length !== 1 || ast.body[0].type !== 'FunctionDeclaration') {
            throw new Error('Event handler must be a single function body');
        }
        return ast;
    }
    if (grammar === 'script') return parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    if (grammar === 'module') return parseJs(source);
    throw new Error('Unsupported JavaScript grammar: ' + grammar);
}

// Static and dynamic module edges. A non-literal import() cannot be placed in
// the page activation graph, so it is rejected rather than omitted.
export function moduleSpecifiers(ast) {
    const specifiers = [];
    walk(ast, [], node => {
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
            specifiers.push(node.source.value);
        }
        if (node.type === 'ImportExpression') {
            const target = string(node.source);
            if (target == null) throw new Error('import() specifier must be a string literal');
            specifiers.push(target);
        }
    });
    return specifiers;
}

// The audit below is name-based. Its invariant: every name that can reach one
// of these capabilities is statically visible where it is used. Each syntactic
// way to hide a name (computed keys, dynamic dispatch, scope objects, strings
// evaluated as code) is therefore rejected as a category, not shape by shape.
// One capability table, checked identically at every position a name can occupy.
const ELEMENT_FACTORIES = new Set(['createElement', 'createElementNS']);
const STYLESHEET_HANDLES = new Set(['adoptedStyleSheets', 'styleSheets', 'sheet', 'insertRule', 'addRule',
    'replaceSync', 'createContextualFragment', 'write', 'writeln',
    'attachShadow', 'setHTMLUnsafe', 'parseHTMLUnsafe', 'createHTMLDocument']);
// Capabilities that are also global bindings (window properties): they
// construct stylesheets/documents, evaluate strings as code, or invoke
// properties by runtime name. `.constructor` reaches Function from any function.
const GLOBAL_CAPABILITIES = new Set(['CSSStyleSheet', 'DOMParser', 'eval', 'Function', 'Reflect']);
const CAPABILITY_NAMES = new Set([...ELEMENT_FACTORIES, ...STYLESHEET_HANDLES, ...GLOBAL_CAPABILITIES, 'constructor']);
// What each name position can resolve to:
// - property names (`x.name`, `{ name: alias } = x`): any object may be the
//   window or a document, so every capability name;
// - bare identifiers: the global bindings, plus every document member inside
//   event handlers, whose scope chain includes the element, form and document.
// Timers are checked by call-site name, so renaming them is rejected too.
const RENAME_SENSITIVE = new Set([...CAPABILITY_NAMES, 'setTimeout', 'setInterval']);
// Inserting these elements activates code, a stylesheet, a nested document, or
// changes URL/stylesheet-set resolution for the rest of the page.
const ACTIVATING_TAGS = new Set(['style', 'link', 'script', 'iframe', 'frame', 'object', 'embed', 'base', 'meta']);
// Expressions that statically name a Window/Document/root element. A computed
// key on one of them may name any capability above.
const WINDOW_GLOBALS = new Set(['window', 'self', 'globalThis', 'top', 'parent', 'frames', 'opener']);
const GLOBAL_HOST_HOPS = new Set([...WINDOW_GLOBALS, 'document', 'documentElement', 'head', 'body',
    'scrollingElement', 'implementation']);
const DOCUMENT_HOPS = new Set(['document', 'ownerDocument', 'defaultView', 'contentDocument', 'contentWindow']);

// Value-preserving wrappers: an expression evaluates to one of these child
// values unchanged. Every check that asks "what is this value / where does it
// go" sees through the same wrappers, so (0, document), (c ? document : x),
// a || document, (x = document) and optional chains are never opaque.
const LOGICAL_ASSIGNMENT = new Set(['&&=', '||=', '??=']);
function passesValue(parent, child) {
    switch (parent.type) {
        case 'ChainExpression': case 'ParenthesizedExpression': case 'LogicalExpression': return true;
        case 'SequenceExpression': return parent.expressions.at(-1) === child;
        case 'ConditionalExpression': return parent.test !== child;
        case 'AssignmentExpression': return (parent.operator === '=' && parent.right === child)
            || LOGICAL_ASSIGNMENT.has(parent.operator);
        case 'AwaitExpression': return true;
        default: return false;
    }
}
function valueSources(node) {
    if (!node) return [];
    switch (node.type) {
        case 'ChainExpression': case 'ParenthesizedExpression': return valueSources(node.expression);
        case 'SequenceExpression': return valueSources(node.expressions.at(-1));
        case 'ConditionalExpression': return [...valueSources(node.consequent), ...valueSources(node.alternate)];
        case 'LogicalExpression': return [...valueSources(node.left), ...valueSources(node.right)];
        case 'AwaitExpression': return valueSources(node.argument);
        case 'AssignmentExpression':
            if (node.operator === '=') return valueSources(node.right);
            if (LOGICAL_ASSIGNMENT.has(node.operator)) return [...valueSources(node.left), ...valueSources(node.right)];
            return [node];
        default: return [node];
    }
}

function hostObject(node) {
    return valueSources(node).some(source => {
        if (source.type === 'Identifier') return WINDOW_GLOBALS.has(source.name) || source.name === 'document';
        if (source.type === 'CallExpression') {
            return valueSources(source.callee).some(callee => property(callee) === 'getRootNode');
        }
        if (source.type !== 'MemberExpression') return false;
        const name = property(source);
        return DOCUMENT_HOPS.has(name) || ((name == null || GLOBAL_HOST_HOPS.has(name)) && hostObject(source.object));
    });
}

// Identifier in a binding-reference position (not a property name or label).
function isReference(node, parent) {
    if (!parent) return true;
    if (parent.type === 'MemberExpression') return parent.object === node || parent.computed;
    if (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent.type) && parent.key === node) {
        return parent.computed || (parent.type === 'Property' && parent.shorthand);
    }
    if (['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent.type)) return false;
    if (['ImportSpecifier', 'ExportSpecifier'].includes(parent.type)) return parent.local === node;
    return parent.type !== 'MetaProperty';
}

// The member is invoked by runtime name: callee, new target, template tag, or
// receiver of call/apply/bind.
function invoked(ancestors, node) {
    let child = node;
    for (let index = ancestors.length - 1; index >= 0; index--) {
        const parent = ancestors[index];
        if (passesValue(parent, child)) { child = parent; continue; }
        if (['CallExpression', 'NewExpression'].includes(parent.type)) return parent.callee === child;
        if (parent.type === 'TaggedTemplateExpression') return parent.tag === child;
        return parent.type === 'MemberExpression' && parent.object === child
            && ['call', 'apply', 'bind'].includes(property(parent));
    }
    return false;
}

function memberOf(node, name, key) {
    return node?.type === 'MemberExpression' && node.object.type === 'Identifier' && node.object.name === name
        && property(node) === key;
}

// A runtime <script> is accepted only as a locally proven inert data block:
// `const x = createElement('script')`, immediately `x.type = '<non-JS type>'`,
// then only `x.textContent = ...` and `parent.append(x)`/`appendChild(x)`
// statements in the same statement list. Any other reference (src, setAttribute,
// aliases, closures, a later type change) fails; no data flow is inferred.
function inertScriptDataBlock(call, ancestors) {
    const [container, declaration, declarator] = ancestors.slice(-3);
    if (declarator?.type !== 'VariableDeclarator' || declarator.init !== call || declarator.id.type !== 'Identifier'
        || declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const'
        || declaration.declarations.length !== 1 || !Array.isArray(container?.body)) return false;
    const name = declarator.id.name;
    const statements = container.body;
    const index = statements.indexOf(declaration);
    const assignment = (statement, key) => statement?.type === 'ExpressionStatement'
        && statement.expression.type === 'AssignmentExpression' && statement.expression.operator === '='
        && memberOf(statement.expression.left, name, key) ? statement.expression : null;
    const typeAssignment = assignment(statements[index + 1], 'type');
    const type = string(typeAssignment?.right);
    if (type == null || htmlScriptKind({ type }) !== 'data') return false;
    const allowed = new Set([declarator.id, typeAssignment.left.object]);
    for (const statement of statements.slice(index + 2)) {
        const text = assignment(statement, 'textContent');
        if (text) allowed.add(text.left.object);
        const call = statement.type === 'ExpressionStatement' ? statement.expression : null;
        if (call?.type === 'CallExpression' && ['append', 'appendChild'].includes(property(call.callee) ?? '')
            && call.arguments.length === 1 && call.arguments[0].type === 'Identifier'
            && call.arguments[0].name === name) allowed.add(call.arguments[0]);
    }
    let inert = true;
    walk(container, [], (node, parent) => {
        if (node.type === 'Identifier' && node.name === name && isReference(node, parent) && !allowed.has(node)) {
            inert = false;
        }
    });
    return inert;
}

const javascriptUrl = value => /^javascript:/i.test(value.replace(/^[\u0000-\u0020]+/, '').replace(/[\t\n\r]/g, ''));

// This is an architectural syntax boundary, not a JavaScript data-flow proof.
// Aliasing a value through a variable is out of scope; browser tests observe
// actual installed styles. Do not add alias/constant-propagation heuristics.
export function auditStyleIngress(source, file = 'fixture.js', grammar = 'module') {
    const errors = [];
    const fail = message => errors.push(file + ': ' + message);
    const ast = parseAuditedJs(source, grammar);
    // Handler scope chains include the element, its form and the document, so
    // a bare identifier there can resolve to any document capability.
    const scopedNames = grammar === 'handler' ? CAPABILITY_NAMES : GLOBAL_CAPABILITIES;
    walk(ast, [], (node, parent, ancestors) => {
        if (node.type === 'MemberExpression') {
            const name = property(node);
            if (ELEMENT_FACTORIES.has(name)) {
                const call = parent?.type === 'CallExpression' && parent.callee === node ? parent : null;
                const tag = string(call?.arguments[name === 'createElementNS' ? 1 : 0])?.toLowerCase();
                if (!call || tag == null) fail('element factories must be direct calls with a literal tag');
                else if (ACTIVATING_TAGS.has(tag) && !(tag === 'script' && inertScriptDataBlock(call, ancestors.slice(0, -1)))) {
                    fail('runtime <' + tag + '> activates code, stylesheets or documents outside the page inventory');
                }
            } else if (CAPABILITY_NAMES.has(name)) {
                fail('capability .' + name + ' is outside the registered source boundary');
            }
            if (name == null && invoked(ancestors, node)) {
                fail('computed member invocation hides the called name; call a named method');
            }
            if (name == null && hostObject(node.object)
                && !(WINDOW_GLOBALS.has(node.object.name) && parent?.type === 'AssignmentExpression'
                    && parent.left === node && parent.operator === '=')) {
                fail('computed access on a window/document object hides the accessed name');
            }
        }
        if (node.type === 'Identifier' && scopedNames.has(node.name) && isReference(node, parent)) {
            fail(node.name + ' is outside the registered source boundary');
        }
        if (node.type === 'WithStatement') fail('with statements hide the object that names resolve against');
        if (node.type === 'ObjectPattern') {
            for (const entry of node.properties) {
                if (entry.type !== 'Property') continue;
                const key = staticKey(entry.key, entry.computed);
                if (key == null) fail('computed destructuring hides the accessed name');
                else if (RENAME_SENSITIVE.has(key)) {
                    fail('capability .' + key + ' cannot be destructured or renamed');
                }
            }
        }
        if (node.type === 'CallExpression' && valueSources(node.callee).some(callee =>
            ['setTimeout', 'setInterval'].includes(callee.type === 'Identifier' ? callee.name : property(callee) ?? ''))
            && valueSources(node.arguments[0]).some(argument =>
                ['Literal', 'TemplateLiteral', 'BinaryExpression'].includes(argument.type))) {
            fail('string timers evaluate code outside the audited source');
        }
        const text = node.type === 'Literal' && typeof node.value === 'string' ? node.value
            : node.type === 'TemplateElement' ? node.value.cooked || '' : null;
        if (text != null && /<\s*(?:style|link)(?:[\s/>])/i.test(text)) fail('runtime stylesheet markup is forbidden');
        if (text != null && javascriptUrl(text)) fail('javascript: URLs evaluate code outside the audited source');
        if (node.type === 'ImportDeclaration' || node.type === 'ImportExpression') {
            const target = string(node.source);
            if (target == null) fail('import() specifier must be a string literal for the activation graph');
            else if (/\.css(?:[?#]|$)/i.test(target)) fail('CSS imports must be registered as page stylesheet inputs');
        }
    });
    return errors;
}

export function auditHtmlStyleIngress(html, file = 'fixture.html', auditedFiles = new Set()) {
    const errors = [];
    try {
        for (const input of htmlJavaScriptInputs(html, file)) {
            try {
                if (input.url) {
                    if (!resolveLocalScript(input.url, auditedFiles)) {
                        errors.push(input.file + ': external script is outside the audited local JavaScript inventory');
                    }
                } else errors.push(...auditStyleIngress(input.source, input.file, input.grammar));
            } catch (error) { errors.push(input.file + ': cannot audit JavaScript: ' + error.message); }
        }
    } catch (error) { errors.push(file + ': cannot audit HTML execution inputs: ' + error.message); }
    return errors;
}

function files(root, directory) {
    return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
        const path = directory + '/' + entry.name;
        return entry.isDirectory() ? files(root, path) : [path];
    });
}

// Every local file a page may execute. The activation graph must stay inside it.
export function auditedJavaScriptFiles(root) {
    return new Set(['src', 'js', 'public'].flatMap(directory => files(root, directory))
        .filter(file => /\.(?:m?js)$/.test(file)));
}

export function scanRuntimeStyleSources(root, errors) {
    const registry = readStyleRegistry(readFileSync(join(root, STYLE_REGISTRY), 'utf8'));
    const installer = readFileSync(join(root, STYLE_INSTALLER), 'utf8');
    if (createHash('sha256').update(installer).digest('hex') !== INSTALLER_SHA256) {
        errors.push('Runtime stylesheet installer changed; review insertion semantics and its independent digest.');
    }
    const auditedFiles = auditedJavaScriptFiles(root);
    for (const file of auditedFiles) {
        if ([STYLE_REGISTRY, STYLE_INSTALLER].includes(file)) continue;
        if (file === SCAFFOLD) {
            if (createHash('sha256').update(readFileSync(join(root, file))).digest('hex') !== SCAFFOLD_SHA256) {
                errors.push('HTML scaffold source changed; review its stylesheet inputs.');
            }
            continue;
        }
        try { errors.push(...auditStyleIngress(readFileSync(join(root, file), 'utf8'), file)); }
        catch (error) { errors.push(file + ': cannot audit JavaScript: ' + error.message); }
    }
    // All supported HTML execution inputs share one classifier and AST audit.
    const htmlFiles = readdirSync(root).filter(file => file.endsWith('.html'))
        .concat(files(root, 'public').filter(file => file.endsWith('.html')));
    for (const file of htmlFiles) {
        const html = readFileSync(join(root, file), 'utf8');
        errors.push(...auditHtmlStyleIngress(html, file, auditedFiles));
    }
    return Object.entries(registry).map(([key, css]) => ({ id: SOURCE_IDS[key], css }))
        .sort((a, b) => a.id.localeCompare(b.id));
}
