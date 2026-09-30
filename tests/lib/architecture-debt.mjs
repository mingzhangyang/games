import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from './registry.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASELINE_PATH = join(ROOT, 'tests', 'architecture-v2-debt-baseline.json');
const BASELINE_RELATIVE_PATH = 'tests/architecture-v2-debt-baseline.json';

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

// The first baseline is introduced by this PR, so the merge-base has no JSON
// file to compare against. Keep an immutable fingerprint for that bootstrap
// snapshot; once the file exists on main, compare future PRs with its merge
// base instead. The fingerprints are deliberately checked in here rather than
// derived from the current JSON, otherwise a PR could raise both together.
export const BOOTSTRAP_BASELINE = Object.freeze({
    'registry-entry-in-js': Object.freeze({ count: 25, sha256: '43b0ace9e98c38c103bfff58c51f6bf8eb93200d18a3686da3d9e5bab503f412' }),
    'platform-shim-consumers': Object.freeze({ count: 246, sha256: '2bd7621cb999ba3297518e3889e699ea95f5f09c1e90e8c4186c911c420cc04a' }),
    'legacy-shell-pages': Object.freeze({ count: 4, sha256: '4556ab7c3267d50001f96df9312769c875d2ae13d86689efacc3cb87a67a0c88' }),
    'legacy-shell-page-missing': Object.freeze({ count: 5, sha256: '11bd82dc762a1b5f4fab1d5d43891eff3cc49cf44469b00264817b89ed0eb158' }),
    'active-scripts-references': Object.freeze({ count: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }),
});

function rel(abs) {
    return relative(ROOT, abs).replaceAll('\\', '/');
}

function gitOutput(...args) {
    try {
        return execFileSync('git', args, {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return '';
    }
}

function mergeBaseCommit() {
    const candidates = [];
    for (const ref of [process.env.ARCHITECTURE_BASE_SHA, process.env.GITHUB_BASE_SHA]) {
        if (ref) candidates.push(ref);
    }
    if (process.env.GITHUB_BASE_REF) candidates.push(`origin/${process.env.GITHUB_BASE_REF}`);
    candidates.push('origin/main', 'main');
    for (const candidate of candidates) {
        const resolved = gitOutput('rev-parse', '--verify', candidate);
        if (!resolved) continue;
        const mergeBase = gitOutput('merge-base', 'HEAD', resolved);
        if (mergeBase) return mergeBase;
    }
    return '';
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

export function shimName(specifier, importerPath = null) {
    const raw = String(specifier).replaceAll('\\', '/');
    const value = raw.startsWith('@js/') ? `/js/${raw.slice('@js/'.length)}` : raw;
    if (value.includes('/src/platform/') || value.includes('/platform/')) return null;
    if (importerPath && /^\.\.?\//.test(raw)) {
        const resolvedTarget = relative(ROOT, resolve(dirname(importerPath), raw)).replaceAll('\\', '/');
        const match = /^js\/([^/]+)\.js$/.exec(resolvedTarget);
        return match && PLATFORM_SHIMS.includes(match[1]) ? match[1] : null;
    }
    for (const name of PLATFORM_SHIMS) {
        if (value === `/js/${name}.js` || value.endsWith(`/js/${name}.js`)) return name;
        if (/^(?:\.\.\/|\.\/)/.test(value)
            && (value === `./${name}.js` || value === `../${name}.js` || value.endsWith(`/${name}.js`))) {
            return name;
        }
    }
    return null;
}

export function importedSpecifiers(source) {
    const tokens = tokenize(source);
    const imports = [];
    for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== 'string') continue;
        const previous = tokens[i - 1]?.value;
        const isCallSpecifier = previous === '('
            && (tokens[i - 2]?.value === 'import' || tokens[i - 2]?.value === 'require');
        if (!isCallSpecifier && previous !== 'import' && previous !== 'from' && previous !== 'require') continue;
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
            const shim = shimName(ref.specifier, path);
            if (shim) consumers.push(`${name}:${ref.line}:${shim}`);
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
        if (missing.length) findings.push({ key: game.id, missing });
    }
    return findings.sort((a, b) => a.key.localeCompare(b.key));
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
    const shellPages = legacyShellPages();
    return {
        'registry-entry-in-js': registryEntryDebt(),
        'platform-shim-consumers': platformShimConsumers(files),
        'game-localstorage': gameLocalStorage(files),
        'legacy-shell-pages': shellPages.map(page => page.key),
        'legacy-shell-page-details': shellPages.map(page => `${page.key}:${page.missing.join(',')}`),
        'legacy-shell-page-missing': shellPages.flatMap(page => page.missing.map(className => `${page.key}:${className}`)),
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
    return [...(baseline.categories?.[category]?.items || [])].sort((a, b) => a.localeCompare(b));
}

function baselineFingerprint(items) {
    return createHash('sha256').update([...items].sort((a, b) => a.localeCompare(b)).join('\n')).digest('hex');
}

function loadBaselineAtMergeBase() {
    const mergeBase = mergeBaseCommit();
    if (!mergeBase) return { baseline: null, ref: null };
    const raw = gitOutput('show', `${mergeBase}:${BASELINE_RELATIVE_PATH}`);
    if (!raw) return { baseline: null, ref: mergeBase };
    try {
        return { baseline: JSON.parse(raw), ref: mergeBase };
    } catch {
        return { baseline: null, ref: mergeBase };
    }
}

function baselineMode(baseline, category) {
    return baseline.categories?.[category]?.mode || '';
}

const MODE_RANK = { warning: 0, ratchet: 1, 'strict-zero': 2 };

export function compareBaselineGrowth(baseline) {
    const base = loadBaselineAtMergeBase();
    const issues = [];
    if (base.baseline) {
        for (const category of RATCHET_CATEGORIES) {
            const previousItems = baselineItems(base.baseline, category);
            const currentItems = baselineItems(baseline, category);
            const added = currentItems.filter(item => !previousItems.includes(item));
            if (added.length) issues.push(`${category}: ${added.join(', ')}`);
            const previousRank = MODE_RANK[baselineMode(base.baseline, category)] ?? 0;
            const currentRank = MODE_RANK[baselineMode(baseline, category)] ?? 0;
            if (currentRank < previousRank) {
                issues.push(`${category}: mode weakened from ${baselineMode(base.baseline, category)} to ${baselineMode(baseline, category)}`);
            }
        }
        for (const category of STRICT_ZERO_CATEGORIES) {
            const items = baselineItems(baseline, category);
            if (items.length) issues.push(`${category}: baseline must remain empty`);
        }
        return { source: `merge-base ${base.ref}`, issues };
    }

    for (const category of RATCHET_CATEGORIES) {
        const expected = BOOTSTRAP_BASELINE[category];
        const actual = baselineItems(baseline, category);
        if (!expected) {
            issues.push(`${category}: no bootstrap ceiling is defined`);
            continue;
        }
        if (actual.length > expected.count) {
            issues.push(`${category}: ${actual.length} baseline items exceed bootstrap ceiling ${expected.count}`);
        }
        if (baselineFingerprint(actual) !== expected.sha256) {
            issues.push(`${category}: bootstrap fingerprint changed`);
        }
    }
    for (const category of STRICT_ZERO_CATEGORIES) {
        const items = baselineItems(baseline, category);
        if (items.length) issues.push(`${category}: baseline must remain empty`);
    }
    return { source: 'immutable bootstrap ceiling', issues };
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
    'legacy-shell-pages',
    'legacy-shell-page-missing',
    'active-scripts-references',
];

export const STRICT_ZERO_CATEGORIES = [
    'game-localstorage',
    'src-game-shim-imports',
    'worker-platform-imports',
    'archived-tool-references',
    'generated-contract',
    'stale-documentation-paths',
];
