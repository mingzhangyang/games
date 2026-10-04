import {
    cssTokens, declarationValue, hasImportantPriority, normalizeFragment, parseStylesheet,
} from './model.mjs';

const STATEMENTS = new Set(['charset', 'import', 'namespace', 'layer']);
const GROUPS = new Set(['media', 'supports', 'container', 'scope', 'starting-style', 'document']);
const DECLARATIONS = new Set(['font-face', 'property', 'page', 'counter-style', 'font-feature-values',
    'font-palette-values', 'color-profile', 'viewport', 'view-transition']);
const KEYFRAMES = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes', '-o-keyframes']);
const SPECIAL = new Set(['charset', 'import', 'namespace', ...DECLARATIONS, ...KEYFRAMES, 'document']);

// Historical P0 tuples deliberately retain their old formatting. This adapter
// is NOT a semantic identity: the ordered canonical model is checked separately.
const legacyNormalize = value => value.replace(/\s+/g, ' ').trim();
const legacyValue = node => legacyNormalize(cssTokens(declarationValue(node))
    .map(token => token[0] === 'comment' ? ' ' : token[1]).join(''));

function migrationDeclaration(node) {
    const value = declarationValue(node);
    return {
        property: node.prop.startsWith('--') ? node.prop : node.prop.toLowerCase(),
        value: normalizeFragment(value),
        important: hasImportantPriority(value),
    };
}

export function parseCssText(source, file) {
    const { ast, model } = parseStylesheet(source, file);
    const result = {
        file, rules: [], declarations: [], atRules: [], layerStatements: [],
        layerBlocks: [], layerNames: new Set(), keyframes: [], model,
    };
    const recordSpecial = (context, name, params) => {
        result.specialAtRules ||= [];
        result.specialAtRules.push([file, context.join(' / '), name, params]);
    };
    const layers = params => params.split(',').forEach(part => {
        if (part.trim()) result.layerNames.add(part.trim().split('.')[0]);
    });
    function declarations(node, selector, context, layer, atRule) {
        if (node.nodes?.some(child => !['decl', 'comment'].includes(child.type))) {
            throw new Error(file + ': nested declarations/rules require an explicit policy upgrade');
        }
        return (node.nodes || []).filter(child => child.type === 'decl').map(child => ({
            property: child.prop.toLowerCase(), value: legacyValue(child),
            selector, context: [...context], layer, atRule,
        }));
    }
    function migrationDeclarations(node) {
        return (node.nodes || []).filter(child => child.type === 'decl').map(migrationDeclaration);
    }
    function walk(parent, context = [], layer = null, inKeyframes = false) {
        for (const node of parent.nodes || []) {
            if (node.type === 'comment') continue;
            if (node.type === 'rule') {
                if (inKeyframes) continue; // P0 excludes frame declarations; canonical model retains them.
                const selector = legacyNormalize(node.selector);
                const values = declarations(node, selector, context, layer, '');
                result.rules.push({
                    selector,
                    context: [...context],
                    layer,
                    declarations: values,
                    migrationDeclarations: migrationDeclarations(node),
                });
                result.declarations.push(...values);
                continue;
            }
            if (node.type !== 'atrule') throw new Error(file + ': declaration outside a supported rule');
            const name = node.name.toLowerCase();
            const params = legacyNormalize(node.params);
            result.atRules.push({ name, params, context: [...context], layer });
            if (!node.nodes) {
                if (!STATEMENTS.has(name)) throw new Error(file + ': unsupported statement @' + name);
                if (name === 'layer') {
                    if (layer || context.length) throw new Error(file + ': nested or conditional @layer order');
                    result.layerStatements.push(params);
                    layers(params);
                }
                if (SPECIAL.has(name)) recordSpecial(context, name, params);
                continue;
            }
            if (name === 'layer') {
                result.layerBlocks.push(params);
                layers(params);
                const ownLayer = params.split(',')[0].trim() || '<anonymous>';
                walk(node, context, layer ? layer + '.' + ownLayer : ownLayer, inKeyframes);
            } else if (KEYFRAMES.has(name)) {
                result.keyframes.push({ name, params, context: [...context], layer });
                walk(node, context, layer, true);
                recordSpecial(context, name, params);
            } else if (DECLARATIONS.has(name)) {
                recordSpecial(context, name, params);
                result.declarations.push(...declarations(node, '', context, layer, name));
            } else if (GROUPS.has(name)) {
                if (SPECIAL.has(name)) recordSpecial(context, name, params);
                walk(node, [...context, '@' + name + (node.params ? ' ' + node.params : '')], layer, inKeyframes);
            } else {
                throw new Error(file + ': unsupported block @' + name);
            }
        }
    }
    walk(ast);
    return result;
}
