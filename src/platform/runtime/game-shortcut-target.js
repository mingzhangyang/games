/**
 * Route game shortcuts without stealing native button activation or text editing.
 *
 * A mouse/touch-selected experiment button keeps focus. Non-native shortcuts can
 * still operate the simulation from that console; Enter/Space stay with the
 * focused button, while links, chrome, ARIA controls and editors retain their
 * own keyboard contracts.
 */
export function shouldHandleGameShortcut(event, consoleRoot) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false;
    const target = event.target;
    if (!(target instanceof Element)) return true;
    if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return false;
    const control = target.closest('button, a, [role="button"], [role="link"]');
    if (!control) return true;
    return control.matches('button') && !!consoleRoot?.contains(control)
        && event.key !== 'Enter' && event.key !== ' ';
}
