/**
 * Normalize the append-only CSS rule-migration ledger at its schema boundary.
 * Legacy migrate/retire transactions have one source and a destination array;
 * dedupe transactions have a source array and a single destination. All
 * consumers must use these readers rather than assuming one ledger shape.
 */
export function mappingSources(mapping) {
    return mapping?.kind === 'dedupe'
        ? (mapping.sources || [])
        : (mapping?.source ? [mapping.source] : []);
}

export function mappingDestinations(mapping) {
    return mapping?.kind === 'dedupe'
        ? (mapping.destination ? [mapping.destination] : [])
        : (mapping?.destinations || []);
}

/** Registered CSS paths, including both sides of a dedupe and reused owners. */
export function mappedStylesheetPaths(mappings) {
    return new Set([...mappings].flatMap(mapping => [
        ...mappingSources(mapping),
        ...mappingDestinations(mapping),
    ].map(ref => ref?.path).filter(Boolean)));
}
