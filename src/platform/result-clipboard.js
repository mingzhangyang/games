// Only report success when a real clipboard write or legacy fallback succeeds.
export async function copyResultText(text) {
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Permission denied or unavailable: attempt the legacy selection API.
    }
    if (typeof document === 'undefined') return false;
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0;left:-999px;top:-999px;';
    try {
        document.body.appendChild(area);
        area.select();
        return document.execCommand('copy') === true;
    } catch {
        return false;
    } finally {
        area.remove();
    }
}
