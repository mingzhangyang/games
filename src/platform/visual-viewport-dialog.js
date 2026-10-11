/**
 * Keep a native modal dialog in the visual viewport while a mobile software
 * keyboard is present. CSS 100dvh can remain tied to the layout viewport on
 * Safari and leave the input editor obscured.
 *
 * Idle dialogs install no viewport observers. Focusing a modal editor arms
 * the observers; focusout or keyboard dismissal disarms them. A pointer tap
 * re-arms keyboard tracking when a still-focused field opens it again.
 *
 * Restore the native dialog position, original inline CSS priorities, and all
 * listeners after editing. Never scroll or position the underlying game page.
 */
const OWNED_STYLES = [
    'position', 'top', 'left', 'right', 'bottom',
    'margin', 'transform', 'max-height', 'max-width',
];

export function bindDialogToVisualViewport(dialog) {
    const viewport = window.visualViewport;
    if (!viewport) return { start() {}, stop() {} };

    const isEditor = node => dialog.contains(node) && /^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName || '');
    let listening = false;
    let observing = false;
    let frame = 0;
    let original = null;
    let lastGeometry = '';
    let lastFocused = null;
    let hadOcclusion = false;

    function restore() {
        if (!original) return;
        for (const [property, value, priority] of original) {
            if (value) dialog.style.setProperty(property, value, priority);
            else dialog.style.removeProperty(property);
        }
        original = null;
        lastGeometry = '';
        lastFocused = null;
    }

    function observe() {
        if (observing) return;
        observing = true;
        viewport.addEventListener('resize', schedule);
        viewport.addEventListener('scroll', schedule);
        window.addEventListener('resize', schedule);
    }

    function unobserve() {
        if (!observing) return;
        observing = false;
        viewport.removeEventListener('resize', schedule);
        viewport.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
    }

    function apply() {
        frame = 0;
        if (!listening || !dialog.open) {
            unobserve();
            restore();
            return;
        }
        const active = document.activeElement;
        const editing = isEditor(active);
        const occluded = editing && Number.isFinite(viewport.height)
            && Number.isFinite(viewport.width)
            && viewport.height < window.innerHeight - 100;
        if (!occluded) {
            restore();
            // Before the first keyboard resize, keep listening so an
            // asynchronously opening keyboard is not missed. After an actual
            // occlusion closes, release the listeners even if focus stays.
            if (!editing || hadOcclusion) {
                unobserve();
                hadOcclusion = false;
            }
            return;
        }

        hadOcclusion = true;
        observe();
        if (!original) {
            original = OWNED_STYLES.map(property => [
                property, dialog.style.getPropertyValue(property),
                dialog.style.getPropertyPriority(property),
            ]);
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
        if (geometry === lastGeometry && active === lastFocused) return;
        if (geometry !== lastGeometry) {
            lastGeometry = geometry;
            for (const [property, value] of Object.entries(props)) {
                dialog.style.setProperty(property, value);
            }
        }
        lastFocused = active;

        // Scroll only the dialog. Element.scrollIntoView() can scroll the page
        // and shift the game world during a keyboard-viewport transition.
        const box = dialog.getBoundingClientRect();
        const focusBox = active.getBoundingClientRect();
        const inset = 12;
        if (focusBox.bottom > box.bottom - inset) {
            dialog.scrollTop += focusBox.bottom - (box.bottom - inset);
        } else if (focusBox.top < box.top + inset) {
            dialog.scrollTop += focusBox.top - (box.top + inset);
        }
    }

    function schedule() {
        if (listening && !frame) frame = requestAnimationFrame(apply);
    }

    function onEditorIntent(event) {
        if (!isEditor(event.target)) return;
        // Re-arm if the keyboard was dismissed without blurring the field.
        if (!observing) hadOcclusion = false;
        observe();
        schedule();
    }

    function onEditorBlur(event) {
        if (!isEditor(event.target)) return;
        // Do not leave window-wide listeners attached while the user
        // navigates elsewhere in the open modal.
        unobserve();
        hadOcclusion = false;
        schedule(); // focus has settled by the next animation frame
    }

    function start() {
        if (listening) return;
        listening = true;
        dialog.addEventListener('focusin', onEditorIntent);
        dialog.addEventListener('focusout', onEditorBlur);
        dialog.addEventListener('pointerdown', onEditorIntent);
        // Covers future autofocus inputs without depending on focusin timing.
        if (isEditor(document.activeElement)) {
            observe();
            schedule();
        }
    }

    function stop() {
        if (!listening) return;
        listening = false;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        unobserve();
        dialog.removeEventListener('focusin', onEditorIntent);
        dialog.removeEventListener('focusout', onEditorBlur);
        dialog.removeEventListener('pointerdown', onEditorIntent);
        hadOcclusion = false;
        restore();
    }

    return { start, stop };
}
