import { STYLE_SOURCES } from './style-sources.js';

const ELEMENT_IDS = Object.freeze({
    'error-notification': 'error-notification-styles',
    'score-popup': 'score-popup-styles',
    notification: 'notification-styles',
});

// The only stylesheet creation boundary. Keep insertion synchronous and at the
// original call site: low-end/mobile styles must not become active early.
// Do not return the element: callers receive no writable stylesheet handle.
export function installMathRainStyle(key) {
    if (!Object.hasOwn(STYLE_SOURCES, key)) throw new Error('Unknown stylesheet: ' + key);
    const style = document.createElement('style');
    style.dataset.mathRainStyle = key;
    if (Object.hasOwn(ELEMENT_IDS, key)) style.id = ELEMENT_IDS[key];
    style.textContent = STYLE_SOURCES[key];
    document.head.appendChild(style);
}
