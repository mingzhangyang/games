import postcss from 'postcss';
import { tokenize } from '@csstools/css-tokenizer';

// PostCSS owns block/declaration parsing. CSS Syntax tokens own strings, escapes
// and priority. Neither the baseline format nor project policy lives here.
export function cssTokens(css) {
    return tokenize({ css }, { onParseError: error => { throw error; } })
        .filter(token => token[0] !== 'EOF-token');
}

export function normalizeFragment(css) {
    // Keep token boundaries: joining a/**/b into "ab" changes the selector.
    // Only whitespace tokens are normalized; string/URL/escape bytes survive.
    const tokens = cssTokens(css).filter(token => token[0] !== 'comment');
    while (tokens[0]?.[0] === 'whitespace-token') tokens.shift();
    while (tokens.at(-1)?.[0] === 'whitespace-token') tokens.pop();
    return tokens.map(token => [token[0], token[0] === 'whitespace-token' ? ' ' : token[1]]);
}

export function hasImportantPriority(value) {
    const tokens = cssTokens(value).filter(token =>
        !['whitespace-token', 'comment'].includes(token[0]));
    const last = tokens.at(-1);
    const bang = tokens.at(-2);
    return last?.[0] === 'ident-token' && last[4].value.toLowerCase() === 'important'
        && bang?.[0] === 'delim-token' && bang[4].value === '!';
}

export function declarationValue(node) {
    return (node.raws.value?.raw ?? node.value)
        + (node.important ? (node.raws.important ?? ' !important') : '');
}

export function parseStylesheet(css, file) {
    const ast = postcss.parse(css, { from: file });
    function convert(node) {
        if (node.type === 'comment') return null;
        const children = () => (node.nodes || []).map(convert).filter(Boolean);
        if (node.type === 'root') return { kind: 'root', children: children() };
        if (node.type === 'rule') {
            return { kind: 'rule', selector: normalizeFragment(node.selector), children: children() };
        }
        if (node.type === 'atrule') {
            return {
                kind: 'at-rule', form: node.nodes ? 'block' : 'statement',
                name: node.name.toLowerCase(), params: normalizeFragment(node.params),
                children: children(),
            };
        }
        if (node.type === 'decl') {
            const value = declarationValue(node);
            return {
                kind: 'declaration',
                property: node.prop.startsWith('--') ? node.prop : node.prop.toLowerCase(),
                value: normalizeFragment(value), important: hasImportantPriority(value),
            };
        }
        throw new Error(file + ': unmapped CSS node ' + node.type);
    }
    return { ast, model: convert(ast) };
}
