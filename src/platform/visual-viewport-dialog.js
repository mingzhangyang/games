/**
 * Keep a native modal dialog in the *visual* viewport while a mobile software
 * keyboard is present. CSS 100dvh and the browser's default dialog centering
 * can still use the layout viewport on Safari, leaving the editor obscured.
 *
 * This owns geometry only during keyboard occlusion. When focus/keyboard goes
 * away, native <dialog> positioning is restored (including prior inline CSS).
 * No window-wide scroll lock, viewport-meta mutation or polling.
 */
const OWNED_STYLES = [
    'position', 'top', 'left', 'right', 'bottom',
    'margin', 'transform', 'max-height', 'max-width',
];

export function bindDialogToVisualViewport(dialog) {
    const viewport = window.visualViewport;
    if (!viewport) return { start() {}, stop() {} };

    let listening = false;
    let frame = 0;
    let original = null;
    let lastGeometry = '';

    function restore() {
        if (!original) return;
        for (const [property, value] of original) {
            if (value) dialog.style.setProperty(property, value);
            else dialog.style.removeProperty(property);
        }
        original = null;
        lastGeometry = '';
    }

    function apply() {
        frame = 0;
        if (!listening || !dialog.open) {
            restore();
            return;
        }
        const active = document.activeElement;
        const editing = dialog.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName || '');
        // Address-bar collapse is far smaller than an open virtual keyboard.
        if (!editing || !Number.isFinite(viewport.height) || !Number.isFinite(viewport.width)
            || viewport.height >= window.innerHeight - 100) {
            restore();
            return;
        }
        if (!original) {
            original = OWNED_STYLES.map(property => [property, dialog.style.getPropertyValue(property)]);
        }

        const props = {
            position: 'fixed',
            top: Math.round(viewport.offsetTop + viewport.height / 2) + 'px',
            left: Math.round(viewport.offsetLeft + viewport.width / 2) + 'px',
            right: 'auto',
            bottom: 'auto',
            margin: '0',
            transform: 'translate(-50%, -50%)',
            'max-height': Math.max(1, Math.floor(Math.min(720, viewport.height - 16))) + 'px',
            'max-width': Math.max(1, Math.floor(Math.min(420, viewport.width - 24, window.innerWidth * 0.92))) + 'px',
        };
        const geometry = JSON.stringify(props);
        if (geometry === lastGeometry) return;
        lastGeometry = geometry;
        for (const [property, value] of Object.entries(props)) {
            dialog.style.setProperty(property, value);
        }
        // A compact modal scrolls internally; never scroll the game canvas or
        // change the page body's position when its nickname field is focused.
        active.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }

    function schedule() {
        if (listening && !frame) frame = requestAnimationFrame(apply);
    }

    function start() {
        if (listening) return;
        listening = true;
        viewport.addEventListener('resize', schedule);
        viewport.addEventListener('scroll', schedule);
        window.addEventListener('resize', schedule);
        dialog.addEventListener('focusin', schedule);
        dialog.addEventListener('focusout', schedule);
        schedule();
    }

    function stop() {
        if (!listening) return;
        listening = false;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        viewport.removeEventListener('resize', schedule);
        viewport.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        dialog.removeEventListener('focusin', schedule);
        dialog.removeEventListener('focusout', schedule);
        restore();
    }

    return { start, stop };
}
