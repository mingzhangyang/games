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

export async function installImageFailureHook(page, signatures) {
    await page.evaluateOnNewDocument((blockedSignatures) => {
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'src');
        if (!descriptor?.set) throw new Error('HTMLImageElement.src setter unavailable');

        const matches = (value) => {
            let name = '';
            try {
                const url = new URL(String(value), window.location.href);
                name = decodeURIComponent(url.pathname.split('/').pop() || '');
            } catch {
                return false;
            }
            return blockedSignatures.some(({ stem, ext }) =>
                name === `${stem}${ext}`
                || (name.startsWith(`${stem}-`) && name.endsWith(ext)));
        };

        Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
            configurable: descriptor.configurable,
            enumerable: descriptor.enumerable,
            get: descriptor.get,
            set(value) {
                if (!matches(value)) {
                    descriptor.set.call(this, value);
                    return;
                }
                window.__testBlockedArtUrls = window.__testBlockedArtUrls || [];
                window.__testBlockedArtUrls.push(String(value));
                window.queueMicrotask(() => this.dispatchEvent(new window.Event('error')));
            },
        });
    }, signatures);
}
