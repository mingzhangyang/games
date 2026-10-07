// Helpers for smoke tests that intentionally fail production art loads.
// Vite emits assets as <name>-<hash>.<ext>, while the source server keeps the
// original nested path. Match by the canonical source basename so the same
// fallback test works against both environments without accepting unrelated failures.

export function assetSignatures(urls) {
    return [...new Set(urls)].map(source => {
        const name = decodeURIComponent(new URL(source).pathname.split('/').pop() || '');
        const dot = name.lastIndexOf('.');
        if (dot <= 0) throw new Error(`Asset URL has no extension: ${source}`);
        return { stem: name.slice(0, dot), ext: name.slice(dot) };
    });
}

export function matchesBundledAsset(requestUrl, signatures) {
    let name = '';
    try {
        name = decodeURIComponent(new URL(requestUrl).pathname.split('/').pop() || '');
    } catch {
        return false;
    }
    return signatures.some(({ stem, ext }) =>
        name === `${stem}${ext}`
        || (name.startsWith(`${stem}-`) && name.endsWith(ext)));
}

export function isExpectedBlockedDiagnostic(value, blockedUrls) {
    return blockedUrls.some(url => {
        if (value.includes(url)) return true;
        try {
            return value.includes(new URL(url).pathname);
        } catch {
            return false;
        }
    });
}
