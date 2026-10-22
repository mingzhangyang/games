/**
 * One generated action, one gameplay handler, two responsive presentations.
 * The popover contains command proxies, never another game-state owner.
 */
import { getLang } from './site-settings.js';

const bindings = new WeakMap();
const MORE = { en: 'More actions', zh: '\u66f4\u591a\u64cd\u4f5c' };
const available = button => !button.disabled && !button.closest('[hidden], .hidden')
    && button.getAttribute('aria-disabled') !== 'true'
    && button.style.display !== 'none' && button.style.visibility !== 'hidden';
const rendered = button => button && button.getBoundingClientRect().width > 0
    && getComputedStyle(button).visibility !== 'hidden';

export function bindTopbarOverflow(header) {
    if (!header) return null;
    if (bindings.has(header)) return bindings.get(header);
    const more = header.querySelector('[data-topbar-more]');
    const menu = more && document.getElementById(more.getAttribute('popovertarget'));
    // Progressive enhancement: without native popovers the original actions remain.
    if (!menu || typeof menu.showPopover !== 'function') return null;
    const mobile = window.matchMedia('(max-width: 480px)');
    const entries = [...menu.querySelectorAll('[data-topbar-proxy]')].map(item => {
        const source = document.getElementById(item.dataset.topbarProxy);
        if (!source || !header.contains(source) || source === item) {
            throw new Error('Missing canonical topbar action: ' + item.dataset.topbarProxy);
        }
        return { item, source, label: item.querySelector('[data-topbar-menu-label]') };
    });
    const isOpen = () => menu.matches(':popover-open');
    const items = () => entries.filter(({ item }) => !item.hidden && !item.disabled).map(e => e.item);
    let disposed = false;
    let openingFocus = 'first';
    let lastSource = null;
    let swallowEscapeUp = false;

    function restoreFocus() {
        const target = rendered(more) ? more
            : [lastSource, ...entries.map(e => e.source), header.querySelector('[data-chrome="sound"]')]
                .find(button => button && available(button) && rendered(button));
        target?.focus({ preventScroll: true });
    }

    function close(restore = true) {
        if (!isOpen()) return;
        menu.hidePopover();
        more.setAttribute('aria-expanded', 'false');
        if (restore) restoreFocus();
    }

    function position() {
        if (!isOpen()) return;
        const rect = more.getBoundingClientRect();
        const box = menu.getBoundingClientRect();
        const viewport = window.visualViewport;
        const x = viewport?.offsetLeft || 0;
        const y = viewport?.offsetTop || 0;
        const width = viewport?.width || window.innerWidth;
        const height = viewport?.height || window.innerHeight;
        menu.style.setProperty('--topbar-menu-x', Math.max(x + 8,
            Math.min(rect.right - box.width, x + width - box.width - 8)) + 'px');
        menu.style.setProperty('--topbar-menu-y', Math.max(y + 8,
            Math.min(rect.bottom + 8, y + height - box.height - 8)) + 'px');
    }

    function sync() {
        const label = MORE[getLang()] || MORE.en;
        more.title = label;
        more.setAttribute('aria-label', label);
        for (const { source, item, label: text } of entries) {
            const enabled = available(source);
            item.hidden = !enabled;
            item.disabled = !enabled;
            const name = source.getAttribute('aria-label') || source.title || source.textContent.trim();
            text.textContent = name;
            item.title = name;
            item.setAttribute('aria-label', name);
            const pressed = source.getAttribute('aria-pressed');
            item.setAttribute('role', pressed === null ? 'menuitem' : 'menuitemcheckbox');
            if (pressed === null) item.removeAttribute('aria-checked');
            else item.setAttribute('aria-checked', pressed);
            for (const attr of ['aria-haspopup', 'aria-controls']) {
                if (source.hasAttribute(attr)) item.setAttribute(attr, source.getAttribute(attr));
                else item.removeAttribute(attr);
            }
        }
        const enabled = items();
        const ownedFocus = document.activeElement === more || menu.contains(document.activeElement);
        more.hidden = enabled.length === 0;
        if (!mobile.matches || !enabled.length) {
            close();
            if (ownedFocus && (document.activeElement === document.body || !rendered(document.activeElement))) restoreFocus();
        }
        else if (isOpen()) {
            if (menu.contains(document.activeElement) && !enabled.includes(document.activeElement)) {
                enabled[0].focus({ preventScroll: true });
            }
            position();
        }
    }

    function beforeToggle(event) {
        if (event.newState === 'open') {
            sync();
            if (!mobile.matches || more.hidden) event.preventDefault();
        }
    }

    function onToggle() {
        // Toggle events are queued/coalesced. Read actual state, not an older event.
        const open = isOpen();
        more.setAttribute('aria-expanded', String(open));
        if (open) {
            position();
            const enabled = items();
            // Do not pull focus back from an item the user has already reached.
            if (!menu.contains(document.activeElement)) {
                (openingFocus === 'last' ? enabled.at(-1) : enabled[0])?.focus({ preventScroll: true });
            }
            openingFocus = 'first';
        } else if (menu.contains(document.activeElement) || document.activeElement === document.body) {
            // A forwarded command may already have opened a dialog/drawer. Never
            // steal that surface's focus in this delayed close notification.
            restoreFocus();
        }
    }

    function onClick(event) {
        const item = event.target.closest('[data-topbar-proxy]');
        const entry = entries.find(e => e.item === item);
        event.stopPropagation();
        if (!entry || !available(entry.source)) return;
        lastSource = entry.source;
        // Restore first: drawer/dialog code captures a VISIBLE return target.
        close();
        entry.source.click();
        sync();
    }

    function onKey(event) {
        if (event.type === 'keyup' && event.key === 'Escape' && swallowEscapeUp) {
            swallowEscapeUp = false;
            event.stopImmediatePropagation();
            return;
        }
        const fromMore = more.contains(event.target);
        const fromMenu = menu.contains(event.target);
        if (!isOpen() && (!fromMore || !['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key))) return;
        // Capture before document/window gameplay hotkeys. Keep native button
        // Enter/Space activation, but do not let it also play/pause the game.
        event.stopImmediatePropagation();
        if (event.type !== 'keydown') return;
        if (event.key === 'Escape' && isOpen()) {
            swallowEscapeUp = true;
            event.preventDefault();
            close();
        } else if (event.key === 'Tab' && isOpen()) {
            // The browser continues sequential navigation from the invoker.
            close();
        } else if (fromMore && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            openingFocus = event.key === 'ArrowUp' ? 'last' : 'first';
            if (!isOpen()) menu.showPopover();
            else (openingFocus === 'last' ? items().at(-1) : items()[0])?.focus();
        } else if (fromMenu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const enabled = items();
            const current = enabled.indexOf(document.activeElement);
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
            enabled[index]?.focus({ preventScroll: true });
        } else if (fromMenu && event.key.length === 1 && event.key !== ' '
            && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const enabled = items();
            const start = enabled.indexOf(document.activeElement) + 1;
            const ordered = [...enabled.slice(start), ...enabled.slice(0, start)];
            ordered.find(item => item.textContent.trim().toLocaleLowerCase()
                .startsWith(event.key.toLocaleLowerCase()))?.focus({ preventScroll: true });
        }
    }

    const onResize = () => {
        const ownedFocus = more === document.activeElement || menu.contains(document.activeElement);
        if (!mobile.matches) {
            close(false);
            if (ownedFocus) restoreFocus();
        } else position();
    };
    const observer = new MutationObserver(() => { if (!disposed) sync(); });
    for (const { source } of entries) observer.observe(source, {
        attributes: true, attributeFilter: ['class', 'hidden', 'disabled', 'style',
            'title', 'aria-label', 'aria-pressed', 'aria-disabled', 'aria-haspopup', 'aria-controls'],
        childList: true, characterData: true, subtree: true,
    });
    menu.addEventListener('beforetoggle', beforeToggle);
    menu.addEventListener('toggle', onToggle);
    menu.addEventListener('click', onClick);
    for (const type of ['keydown', 'keyup', 'keypress']) window.addEventListener(type, onKey, true);
    mobile.addEventListener('change', onResize);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    window.addEventListener('site-settings:changed', sync);
    header.dataset.topbarOverflowReady = '';
    sync();
    const api = { sync, close, disconnect() {
        disposed = true;
        close();
        observer.disconnect();
        menu.removeEventListener('beforetoggle', beforeToggle);
        menu.removeEventListener('toggle', onToggle);
        menu.removeEventListener('click', onClick);
        for (const type of ['keydown', 'keyup', 'keypress']) window.removeEventListener(type, onKey, true);
        mobile.removeEventListener('change', onResize);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', position, true);
        window.visualViewport?.removeEventListener('resize', position);
        window.visualViewport?.removeEventListener('scroll', position);
        window.removeEventListener('site-settings:changed', sync);
        delete header.dataset.topbarOverflowReady;
        more.hidden = true;
        bindings.delete(header);
    } };
    bindings.set(header, api);
    return api;
}
