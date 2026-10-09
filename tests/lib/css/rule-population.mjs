// Rule population is owned by the orchestration layer, not either migration
// verifier alone. Both family extractions and dedupe/rule migrations may change
// the rule count in the same PR; only the sum can be compared to the CSS tree.
export function verifyStaticRulePopulation({
    baseCount, currentCount, familyRuleDelta, migrationRuleDelta, errors,
}) {
    const expected = baseCount + familyRuleDelta + migrationRuleDelta;
    if (currentCount !== expected) {
        errors.push('Static ordinary rule population differs from the comparison base plus current family and rule migrations: '
            + currentCount + ' !== ' + expected + '.');
    }
}
