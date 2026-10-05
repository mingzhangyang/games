import { normalizeFragment } from './model.mjs';

const jsonKey = value => JSON.stringify(value);

function sameImportantDeclaration(row, source, declaration) {
    return row[0] === source.path
        && row[1] === source.context
        && row[2] === source.selector
        && row[3] === declaration.property
        && jsonKey(normalizeFragment(row[4])) === jsonKey(declaration.value);
}

export function deriveRetirementDebtExpectations(baseline, retirementSources) {
    const errors = [];
    const importantDeclarations = (baseline.debt?.importantDeclarations || []).map(row => [...row]);
    const customPropertyDefinitions = new Map(
        (baseline.cssFiles || []).map(file => [file.path, file.customPropertyDefinitions || 0]),
    );

    for (const source of retirementSources || []) {
        for (const declaration of source.declarations || []) {
            if (declaration.important) {
                const index = importantDeclarations.findIndex(row =>
                    sameImportantDeclaration(row, source, declaration));
                if (index < 0) {
                    errors.push('Retirement ' + source.path + ' ' + source.selector
                        + ': important declaration ' + declaration.property
                        + ' does not resolve to immutable P0 debt.');
                } else {
                    importantDeclarations.splice(index, 1);
                }
            }

            if (declaration.property.startsWith('--')) {
                const current = customPropertyDefinitions.get(source.path);
                if (current === undefined || current <= 0) {
                    errors.push('Retirement ' + source.path + ' ' + source.selector
                        + ': custom-property declaration ' + declaration.property
                        + ' exceeds immutable P0 inventory.');
                } else {
                    customPropertyDefinitions.set(source.path, current - 1);
                }
            }
        }
    }

    return { importantDeclarations, customPropertyDefinitions, errors };
}
