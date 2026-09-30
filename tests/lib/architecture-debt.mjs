import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from './registry.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASELINE_PATH = join(ROOT, 'tests', 'architecture-v2-debt-baseline.json');

export const PLATFORM_SHIMS = [
    'analytics', 'boot', 'daily', 'game-chrome', 'game-drawer', 'game-frame',
    'game-sfx', 'i18n', 'icons', 'leaderboard', 'more-games', 'player',
    'safe-storage', 'site-settings', 'theme',
];

const GENERATED_ROOT = 'src/generated';
const ACTIVE_ROOTS = ['js', 'src', 'worker', 'tests', 'tools'];
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
const HTML_EXTENSIONS = new Set(['.html']);
const CONFIG_FILES = [
    'package.json', 'vite.config.js', 'wrangler.jsonc', 'eslint.config.js',
    'games.schema.json',
];
const SELF_SCAN_FILES = new Set([
    'tests/lib/architecture-debt.mjs',
    'tests/verify-architecture-boundaries.mjs',
    'tests/architecture-report.mjs',
]);

function rel(abs) {
    return relative(ROOT, abs).replaceAll('\\', '/');
}

function walk(abs, out = []) {
    if (!existsSync(abs)) return out;
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git'
            || entry.name === '.wrangler' || entry.name === 'coverage') continue;
        const path = join(abs, entry.name);
        if (entry.isDirectory()) walk(path, out);
        else if (entry.isFile()) out.push(path);
    }
    return out;
}

function activeFiles() {
    const files = [];
    for (const root of ACTIVE_ROOTS) {
        for (const path of walk(join(ROOT, root))) {
            const name = rel(path);
            if (name.startsWith('tools/archive/')) continue;
            if (SELF_SCAN_FILES.has(name)) continue;
            files.push(path);
        }
    }
    for (const name of CONFIG_FILES) {
        const path = join(ROOT, name);
        if (existsSync(path)) files.push(path);
    }
    for (const path of readdirSync(ROOT, { withFileTypes: true })) {
        if (path.isFile() && HTML_EXTENSIONS.has(extname(path.name).toLowerCase())) {
            if (!SELF_SCAN_FILES.has(path.name)) files.push(join(ROOT, path.name));
        }
    }
    return [...new Set(files)].sort();
}

function lineAt(source, index) {
    return source.slice(0, index).split('\n').length;
}

/**
 * A deliberately small lexer. Architecture checks only need import/string
 * boundaries, but they must ignore comments so documentation cannot look like
 * an executable consumer. Template literals are treated as one string because
 * none of the guarded paths are assembled inside a template in production code.
 */
function tokenize(source) {
    const tokens = [];
    let i = 0;
    let line = 1;
    while (i < source.length) {
        const ch = source[i];
        if (ch === '/' && source[i + 1] === '/') {
            i += 2;
            while (i < source.length && source[i] !== '\n') i++;
            if (i < source.length) { line++; i++; }
            continue;
        }
        if (ch === '/' && source[i + 1] === '*') {
            const end = source.indexOf('*/', i + 2);
            const stop = end < 0 ? source.length : end + 2;
            line += source.slice(i, stop).split('\n').length - 1;
            i = stop;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            const quote = ch;
            const start = i;
            const startLine = line;
            i++;
            let value = '';
            while (i < source.length) {
                if (source[i] === '\\') {
                    value += source[i + 1] || '';
                    if (source[i + 1] === '\n') line++;
                    i += 2;
                    continue;
                }
                if (source[i] === quote) {
                    i++;
                    break;
                }
                if (source[i] === '\n') line++;
                value += source[i++];
            }
            tokens.push({ type: 'string', value, index: start, line: startLine });
            continue;
        }
        if (/[A-Za-z_$]/.test(ch)) {
            const start = i++;
            while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) i++;
            tokens.push({ type: 'word', value: source.slice(start, i), index: start, line });
            continue;
        }
        if (!/\s/.test(ch)) tokens.push({ type: 'punct', value: ch, index: i, line });
        if (ch === '\n') line++;
        i++;
    }
    return tokens;
}

function shimName(specifier) {
    const value = String(specifier).replaceAll('\\', '/');
    if (value.includes('/src/platform/') || value.includes('/platform/')) return null;
    for (const name of PLATFORM_SHIMS) {
        if (value === `/js/${name}.js` || value.endsWith(`/js/${name}.js`)) return name;
        if (/^(?:\.\.\/|\.\/)/.test(value)
            && (value === `./${name}.js` || value === `../${name}.js` || value.endsWith(`/${name}.js`))) {
            return name;
        }
    }
    return null;
}

function importedSpecifiers(source) {
    const tokens = tokenize(source);
    const imports = [];
    for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== 'string') continue;
        const previous = tokens[i - 1]?.value;
        if (previous !== 'import' && previous !== 'from' && previous !== 'require') continue;
        imports.push({ specifier: token.value, line: token.line });
    }
    return imports;
}

function htmlSpecifiers(source) {
    const out = [];
    const re = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/g;
    for (const match of source.matchAll(re)) {
        out.push({ specifier: match[2], line: lineAt(source, match.index) });
    }
    return out;
}

function fileText(path) {
    try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function isJavaScript(path) {
    return JS_EXTENSIONS.has(extname(path).toLowerCase());
}

function isHtml(path) {
    return HTML_EXTENSIONS.has(extname(path).toLowerCase());
}

function sorted(values) {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function registryEntryDebt() {
    return registry.all()
        .filter(game => game.entry !== `src/games/${game.id}/index.js`)
        .map(game => `${game.id}:${game.entry}`)
        .sort();
}

function platformShimConsumers(files) {
    const consumers = [];
    for (const path of files) {
        const name = rel(path);
        if (name.startsWith('src/platform/') || PLATFORM_SHIMS.some(shim => name === `js/${shim}.js`)) continue;
        const source = fileText(path);
        const refs = isJavaScript(path) ? importedSpecifiers(source) : isHtml(path) ? htmlSpecifiers(source) : [];
        for (const ref of refs) {
            const shim = shimName(ref.specifier);
            if (shim) consumers.push(`${name}:${shim}`);
        }
    }
    return sorted(consumers);
}

function gameLocalStorage(files) {
    const findings = [];
    for (const path of files) {
        const name = rel(path);
        if (!name.startsWith('src/games/') || !isJavaScript(path)) continue;
        for (const token of tokenize(fileText(path))) {
            if (token.type === 'word' && (token.value === 'localStorage' || token.value === 'sessionStorage')) {
                findings.push(`${name}:${token.line}:${token.value}`);
            }
        }
    }
    return sorted(findings);
}

function workerPlatformImports(files) {
    const findings = [];
    for (const path of files) {
        const name = rel(path);
        if (!name.startsWith('worker/') || !isJavaScript(path)) continue;
        for (const ref of importedSpecifiers(fileText(path))) {
            if (/src\/platform|(?:^|\/)js\//.test(ref.specifier)) {
                findings.push(`${name}:${ref.specifier}`);
            }
        }
    }
    return sorted(findings);
}

function generatedContractViolations() {
    const findings = [];
    for (const path of walk(join(ROOT, GENERATED_ROOT))) {
        const name = rel(path);
        const firstLines = fileText(path).split('\n').slice(0, 5).join('\n');
        if (!firstLines.includes('// Generated by ')) findings.push(`${name}:missing-generator-stamp`);
    }
    return sorted(findings);
}

function archivedToolReferences(files) {
    const findings = [];
    for (const path of files) {
        const name = rel(path);
        const source = fileText(path);
        if (name === 'package.json') {
            const pkg = JSON.parse(source);
            for (const [script, command] of Object.entries(pkg.scripts || {})) {
                if (/tools\/archive\//.test(command)) findings.push(`${name}:script:${script}`);
            }
            continue;
        }
        if (!isJavaScript(path) && !isHtml(path)) continue;
        for (const token of tokenize(source)) {
            if (token.type === 'string' && /tools\/archive\//.test(token.value)) {
                findings.push(`${name}:${token.value}`);
            }
        }
    }
    return sorted(findings);
}

function activeScriptsReferences(files) {
    const findings = [];
    for (const path of files) {
        const name = rel(path);
        const source = fileText(path);
        if (name === 'package.json') {
            const pkg = JSON.parse(source);
            for (const [script, command] of Object.entries(pkg.scripts || {})) {
                if (/(?:^|[\s"'])scripts\//.test(command)) findings.push(`${name}:script:${script}`);
            }
            continue;
        }
        if (!isJavaScript(path) && !isHtml(path)) continue;
        for (const token of tokenize(source)) {
            if (token.type === 'string'
                && /(?:^|[\s"'/(])scripts\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+/.test(token.value)) {
                findings.push(`${name}:${token.value}`);
            }
        }
        if (isHtml(path)) {
            for (const ref of htmlSpecifiers(source)) {
                if (/(?:^|\/)scripts\//.test(ref.specifier)) findings.push(`${name}:${ref.specifier}`);
            }
        }
    }
    return sorted(findings);
}

function legacyShellPages() {
    const findings = [];
    const special = new Set(['math-rain', 'tank-battle']);
    for (const game of registry.all()) {
        if (special.has(game.id)) continue;
        const source = fileText(join(ROOT, game.href));
        const immersive = (game.layout || 'standard') === 'immersive';
        const required = immersive
            ? ['game-shell', 'game-shell--immersive', 'game-topbar', 'game-stage']
            : ['game-shell', 'game-topbar', 'game-main', 'game-stage', 'game-footer'];
        const missing = required.filter(className => !source.includes(className));
        if (missing.length) findings.push(`${game.id}:${missing.join(',')}`);
    }
    return sorted(findings);
}

function oversizedCompositionEntries() {
    const limit = 80 * 1024;
    return registry.all()
        .filter(game => existsSync(join(ROOT, game.entry)) && statSync(join(ROOT, game.entry)).size > limit)
        .map(game => `${game.id}:${game.entry}:${statSync(join(ROOT, game.entry)).size}`)
        .sort();
}

function documentationFiles() {
    const files = [join(ROOT, 'CLAUDE.md'), join(ROOT, 'README.md')];
    for (const path of walk(join(ROOT, 'docs'))) {
        const name = rel(path);
        if (!name.endsWith('.md') || name.startsWith('docs/archive/')
            || name === 'docs/architecture-v2-followup-plan.md') continue;
        files.push(path);
    }
    return files.filter(existsSync).sort();
}

function staleDocumentationPaths() {
    const findings = [];
    const legacyPath = /\bscripts\/[^\s`'"<>),;]+/g;
    for (const path of documentationFiles()) {
        const name = rel(path);
        const source = fileText(path);
        for (const [index, line] of source.split('\n').entries()) {
            if (legacyPath.test(line)) {
                findings.push(`${name}:${index + 1}:${line.trim()}`);
            }
            legacyPath.lastIndex = 0;
        }
    }
    return sorted(findings);
}

export function scanArchitectureDebt() {
    const files = activeFiles();
    return {
        'registry-entry-in-js': registryEntryDebt(),
        'platform-shim-consumers': platformShimConsumers(files),
        'game-localstorage': gameLocalStorage(files),
        'legacy-shell-pages': legacyShellPages(),
        'active-scripts-references': activeScriptsReferences(files),
        'oversized-composition-entries': oversizedCompositionEntries(),
        'src-game-shim-imports': platformShimConsumers(files)
            .filter(item => item.startsWith('src/games/')),
        'worker-platform-imports': workerPlatformImports(files),
        'archived-tool-references': archivedToolReferences(files),
        'generated-contract': generatedContractViolations(),
        'stale-documentation-paths': staleDocumentationPaths(),
    };
}

export function loadDebtBaseline() {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

export function baselineItems(baseline, category) {
    return [...(baseline.categories?.[category]?.items || [])].sort();
}

export function compareDebt(current, baseline, category) {
    const currentItems = [...(current[category] || [])].sort();
    const baselineValues = baselineItems(baseline, category);
    return {
        current: currentItems,
        baseline: baselineValues,
        added: currentItems.filter(item => !baselineValues.includes(item)),
        removed: baselineValues.filter(item => !currentItems.includes(item)),
        delta: currentItems.length - baselineValues.length,
    };
}

export const RATCHET_CATEGORIES = [
    'registry-entry-in-js',
    'platform-shim-consumers',
    'game-localstorage',
    'legacy-shell-pages',
    'active-scripts-references',
];

export const STRICT_ZERO_CATEGORIES = [
    'src-game-shim-imports',
    'worker-platform-imports',
    'archived-tool-references',
    'generated-contract',
    'stale-documentation-paths',
];
