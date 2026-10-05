import assert from 'node:assert/strict';

import { parseCssText } from './lib/css/baseline-adapter.mjs';
import { deriveRetirementDebtExpectations } from './lib/css/debt-contract.mjs';
import { indexRuleOccurrences } from './lib/css/migration-contract.mjs';

const parsed = parseCssText(
    '.retired{--accent:red;color:blue !important}.keep{display:none !important}',
    'css/debt.css',
);
const source = indexRuleOccurrences(parsed, 'css/debt.css')[0];
const baseline = {
    cssFiles: [{
        path: 'css/debt.css',
        customPropertyDefinitions: 1,
    }],
    debt: {
        importantDeclarations: [
            ['css/debt.css', '', '.retired', 'color', 'blue !important'],
            ['css/debt.css', '', '.keep', 'display', 'none !important'],
        ],
    },
};

const result = deriveRetirementDebtExpectations(baseline, [source]);
assert.deepEqual(result.errors, []);
assert.equal(result.customPropertyDefinitions.get('css/debt.css'), 0);
assert.deepEqual(result.importantDeclarations, [
    ['css/debt.css', '', '.keep', 'display', 'none !important'],
]);

const unrelated = deriveRetirementDebtExpectations(baseline, [{
    ...source,
    declarations: [{
        property: 'border',
        value: [['ident-token', 'none'], ['whitespace-token', ' '], ['delim-token', '!'], ['ident-token', 'important']],
        important: true,
    }],
}]);
assert.ok(unrelated.errors.some(error => /does not resolve to immutable P0 debt/.test(error)));

const customOverflow = deriveRetirementDebtExpectations({
    cssFiles: [{ path: 'css/debt.css', customPropertyDefinitions: 0 }],
    debt: { importantDeclarations: [] },
}, [{
    ...source,
    declarations: [{
        property: '--accent',
        value: [['ident-token', 'red']],
        important: false,
    }],
}]);
assert.ok(customOverflow.errors.some(error => /exceeds immutable P0 inventory/.test(error)));

console.log('PASS CSS retirement debt expectations');
