import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { registry } from '../registry.mjs';
import { parseCssText } from './baseline-adapter.mjs';
import { scanHtml } from './html-inputs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASELINE = JSON.parse(readFileSync(join(ROOT, 'tests/css-layer-p0-baseline.json'), 'utf8'));

const THEME_PROPERTIES = new Set([
    'accent-color', 'backdrop-filter', 'background', 'background-color', 'background-image',
    'border', 'border-block', 'border-block-color', 'border-bottom', 'border-bottom-color',
    'border-color', 'border-inline', 'border-inline-color', 'border-left', 'border-left-color',
    'border-radius', 'border-right', 'border-right-color', 'border-top', 'border-top-color',
    'box-shadow', 'caret-color', 'color', 'fill', 'filter', 'mix-blend-mode', 'opacity',
    'outline-color', 'stroke', 'text-decoration-color', 'text-shadow',
]);

const LOCAL_ROLE = /(?:^|[-_])(arena|board|canvas|overlay|playfield|scene|stage|world)(?:$|[-_])/i;
const RESPONSIVE_LOCAL_ROLE = /(?:^|[-_])(canvas|footer|hud|main|overlay|shell|sidebar|stage|topbar)(?:$|[-_])/i;

function hash(value, length = 16) {
    return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function canonical(value) {
    return JSON.stringify(value);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssPathFromHref(href, htmlPath) {
    try {
        const base = new URL(htmlPath, 'https://css-duplication.invalid/');
        const url = new URL(href, base);
        if (url.origin !== base.origin) return null;
        return decodeURIComponent(url.pathname).replace(/^\//, '');
    } catch {
        return null;
    }
}

function readHtmlLinks() {
    const linksByPage = new Map();
    const pagesByCss = new Map();
    for (const file of BASELINE.htmlFiles) {
        const html = readFileSync(join(ROOT, file.path), 'utf8');
        const links = scanHtml(file.path, html).links
            .map(([href]) => cssPathFromHref(href, file.path))
            .filter(Boolean);
        linksByPage.set(file.path, links);
        for (const cssPath of links) {
            if (!pagesByCss.has(cssPath)) pagesByCss.set(cssPath, new Set());
            pagesByCss.get(cssPath).add(file.path);
        }
    }
    return { linksByPage, pagesByCss };
}

function cssPrefixes(linksByPage) {
    const candidates = new Map();
    const byHref = new Map(registry.all().map(game => [game.href, game]));
    for (const [page, links] of linksByPage) {
        const game = byHref.get(page);
        if (!game?.prefix) continue;
        for (const cssPath of links) {
            if (!cssPath.startsWith('css/')) continue;
            if (!candidates.has(cssPath)) candidates.set(cssPath, new Set());
            candidates.get(cssPath).add(game.prefix);
        }
    }
    const prefixes = new Map();
    for (const [cssPath, values] of candidates) {
        if (values.size === 1) prefixes.set(cssPath, [...values][0]);
    }
    return prefixes;
}

function selectorFamily(selector, prefix) {
    if (!prefix) return selector;
    const pattern = new RegExp('([.#])' + escapeRegExp(prefix) + '(?=-|\\b)', 'g');
    return selector.replace(pattern, '$1game');
}

function contextKey(rule) {
    return canonical({ context: rule.migrationContext, layer: rule.layer });
}

function declarationKey(declarations) {
    return canonical(declarations);
}

function parameterizedDeclarationKey(declarations) {
    return canonical(declarations.map(declaration => ({
        property: declaration.property,
        important: declaration.important,
        value: declaration.property.startsWith('--') || THEME_PROPERTIES.has(declaration.property)
            ? '<theme-parameter>'
            : declaration.value,
    })));
}

function invariantDeclarationCount(declarations) {
    return declarations.filter(declaration =>
        !declaration.property.startsWith('--') && !THEME_PROPERTIES.has(declaration.property)).length;
}

function localReason({ selector, family, prefix, rule }) {
    if (!prefix) return null;
    const hasMediaContext = (rule.migrationContext || []).some(context => context.name === 'media');
    if (LOCAL_ROLE.test(family)) return 'game-stage-canvas-board-or-overlay';
    if (hasMediaContext && RESPONSIVE_LOCAL_ROLE.test(family)) return 'game-specific-responsive-contract';
    if ((/:root\b|\[data-theme(?:[=\]])/i.test(selector))
        && rule.migrationDeclarations.every(declaration =>
            declaration.property.startsWith('--') || THEME_PROPERTIES.has(declaration.property))) {
        return 'page-theme-surface';
    }
    return null;
}

function unique(values) {
    return [...new Set(values)];
}

function groupCandidates(rows, keyOf, predicate = () => true) {
    const groups = new Map();
    for (const row of rows) {
        if (!predicate(row)) continue;
        const key = keyOf(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return [...groups.entries()]
        .filter(([, members]) => new Set(members.map(member => member.path)).size >= 2);
}

function groupSummary(kind, key, members) {
    const declarationsPerRule = members[0].declarationCount;
    const paths = unique(members.map(member => member.path)).sort();
    const pages = unique(members.flatMap(member => member.pages)).sort();
    return {
        id: kind + '-' + hash(key, 12),
        selectorFamily: members[0].selectorFamily,
        context: members[0].context,
        layer: members[0].layer,
        memberCount: members.length,
        pathCount: paths.length,
        paths,
        pages,
        declarationsPerRule,
        removableRuleCopies: Math.max(0, members.length - 1),
        removableDeclarationCopies: Math.max(0, members.length - 1) * declarationsPerRule,
        members: members.map(member => ({
            id: member.id,
            path: member.path,
            selector: member.selector,
            pages: member.pages,
        })),
    };
}

export function buildCssDuplicationAudit() {
    const { linksByPage, pagesByCss } = readHtmlLinks();
    const prefixes = cssPrefixes(linksByPage);
    const rows = [];

    for (const cssFile of BASELINE.cssFiles) {
        const path = cssFile.path;
        const parsed = parseCssText(readFileSync(join(ROOT, path), 'utf8'), path);
        const prefix = prefixes.get(path) || null;
        const repeated = new Map();
        parsed.rules.forEach((rule, ruleIndex) => {
            const family = selectorFamily(rule.selector, prefix);
            const declarationSignature = declarationKey(rule.migrationDeclarations);
            const identityBase = canonical([
                path, rule.migrationContext, rule.migrationSelector, rule.layer, rule.migrationDeclarations,
            ]);
            const occurrence = repeated.get(identityBase) || 0;
            repeated.set(identityBase, occurrence + 1);
            const reason = localReason({ selector: rule.selector, family, prefix, rule });
            rows.push({
                id: hash(identityBase + '#' + occurrence),
                path,
                ruleIndex,
                selector: rule.selector,
                selectorFamily: family,
                context: rule.context,
                contextSignature: contextKey(rule),
                layer: rule.layer,
                prefix,
                declarations: rule.migrationDeclarations,
                declarationCount: rule.migrationDeclarations.length,
                declarationSignature,
                structuralSignature: parameterizedDeclarationKey(rule.migrationDeclarations),
                invariantDeclarationCount: invariantDeclarationCount(rule.migrationDeclarations),
                localReason: reason,
                pages: [...(pagesByCss.get(path) || [])].sort(),
                classification: null,
                familyId: null,
            });
        });
    }

    const exact = groupCandidates(
        rows,
        row => canonical([row.selectorFamily, row.contextSignature, row.declarationSignature]),
        row => !row.localReason,
    );
    const exactGroups = exact.map(([key, members]) => groupSummary('exact', key, members));
    const exactMembership = new Map();
    exactGroups.forEach((group, index) => exact[index][1]
        .forEach(member => exactMembership.set(member.id, group.id)));

    // Structural evidence must see the whole non-local family. Exact matches have
    // classification precedence, but they still prove the invariant shared by a
    // themed variant in the same family.
    const structural = groupCandidates(
        rows,
        row => canonical([row.selectorFamily, row.contextSignature, row.structuralSignature]),
        row => !row.localReason && row.invariantDeclarationCount >= 2,
    ).filter(([, members]) => new Set(members.map(member => member.declarationSignature)).size >= 2);
    const structuralGroups = structural.map(([key, members]) => groupSummary('structural', key, members));
    const structuralMembership = new Map();
    structuralGroups.forEach((group, index) => structural[index][1]
        .filter(member => !exactMembership.has(member.id))
        .forEach(member => structuralMembership.set(member.id, group.id)));

    for (const row of rows) {
        if (exactMembership.has(row.id)) {
            row.classification = 'exact-duplicate';
            row.familyId = exactMembership.get(row.id);
        } else if (structuralMembership.has(row.id)) {
            row.classification = 'structural-duplicate';
            row.familyId = structuralMembership.get(row.id);
        } else {
            row.classification = 'intentional-local';
        }
    }

    const categoryCounts = Object.fromEntries([
        'exact-duplicate', 'structural-duplicate', 'intentional-local',
    ].map(category => [category, rows.filter(row => row.classification === category).length]));
    const classificationDigest = createHash('sha256')
        .update(canonical(rows.map(row => [row.id, row.classification, row.familyId])))
        .digest('hex');

    const sortGroups = groups => groups.sort((left, right) =>
        right.removableDeclarationCopies - left.removableDeclarationCopies
        || right.memberCount - left.memberCount
        || left.id.localeCompare(right.id));

    return {
        schemaVersion: 1,
        engine: 'postcss-duplication-audit-v1',
        ordinaryRuleCount: rows.length,
        categoryCounts,
        classificationDigest,
        exactGroups: sortGroups(exactGroups),
        structuralGroups: sortGroups(structuralGroups),
        rules: rows.map(row => ({
            id: row.id,
            path: row.path,
            ruleIndex: row.ruleIndex,
            selector: row.selector,
            selectorFamily: row.selectorFamily,
            context: row.context,
            layer: row.layer,
            pages: row.pages,
            classification: row.classification,
            familyId: row.familyId,
            localReason: row.localReason,
        })),
    };
}

export function renderCssDuplicationMarkdown(audit, limit = Infinity) {
    const lines = [
        '# CSS Duplication Audit',
        '',
        '- Ordinary rules: **' + audit.ordinaryRuleCount + '**',
        '- Exact duplicate: **' + audit.categoryCounts['exact-duplicate'] + '** rules / **' + audit.exactGroups.length + '** families',
        '- Structural duplicate: **' + audit.categoryCounts['structural-duplicate'] + '** rules / **' + audit.structuralGroups.length + '** families',
        '- Intentional local: **' + audit.categoryCounts['intentional-local'] + '** rules',
        '- Classification digest: `' + audit.classificationDigest + '`',
        '',
    ];
    const section = (title, groups) => {
        lines.push('## ' + title, '');
        if (!groups.length) {
            lines.push('_None._', '');
            return;
        }
        for (const group of groups.slice(0, limit)) {
            lines.push('### ' + group.selectorFamily + ' — ' + group.id);
            lines.push('- Impact: ' + (group.pages.length ? group.pages.join(', ') : group.paths.join(', ')));
            lines.push('- Copies: ' + group.memberCount + ' rules across ' + group.pathCount
                + ' CSS files; potential removal after review: ' + group.removableRuleCopies
                + ' rules / ' + group.removableDeclarationCopies + ' declaration copies.');
            lines.push('- Context: ' + (group.context.length ? group.context.join(' / ') : '(top level)')
                + '; layer: ' + (group.layer || '(unlayered)'));
            lines.push('- Members: ' + group.members
                .map(member => '`' + member.path + '` `' + member.selector + '`').join('; '));
            lines.push('');
        }
        if (groups.length > limit) {
            lines.push('_… ' + (groups.length - limit)
                + ' more families; use --json for the complete inventory._', '');
        }
    };
    section('Exact duplicate families', audit.exactGroups);
    section('Structural duplicate families', audit.structuralGroups);
    return lines.join('\n');
}
