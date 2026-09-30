import { storageGet, storageSet, storageRemove } from '../safe-storage.js';

function keyFor(id, version, slot) {
    return `game:${id}:v${version}:${slot}`;
}

function decode(raw, fallback) {
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
}

function encode(value) {
    return JSON.stringify(value);
}

/**
 * Versioned per-game storage facade.
 * Migrations are functions keyed by the source version: { 1: value => nextValue }.
 * Legacy slots may list old keys to import on first read.
 */
export function createGameStorage(gameId, {
    version = 1,
    migrations = {},
    legacy = {},
} = {}) {
    if (!gameId || !Number.isInteger(version) || version < 1) {
        throw new TypeError('createGameStorage requires a gameId and positive integer version');
    }

    const key = slot => keyFor(gameId, version, slot);

    function migrate(slot, fallback) {
        for (let source = version - 1; source >= 1; source--) {
            const oldKey = keyFor(gameId, source, slot);
            const raw = storageGet(oldKey);
            if (raw == null) continue;
            let next = decode(raw, fallback);
            for (let v = source; v < version; v++) {
                const fn = migrations[v];
                if (typeof fn === 'function') next = fn(next, { slot, from: v, to: v + 1 });
            }
            storageSet(key(slot), encode(next));
            return next;
        }

        const legacyKeys = legacy[slot] || [];
        for (const legacyKey of Array.isArray(legacyKeys) ? legacyKeys : [legacyKeys]) {
            const raw = storageGet(legacyKey);
            if (raw == null) continue;
            const value = decode(raw, raw);
            storageSet(key(slot), encode(value));
            return value;
        }
        return fallback;
    }

    return {
        gameId,
        version,
        key,
        get(slot, fallback = null) {
            const raw = storageGet(key(slot));
            return raw == null ? migrate(slot, fallback) : decode(raw, fallback);
        },
        set(slot, value) {
            storageSet(key(slot), encode(value));
            return value;
        },
        trySet(slot, value) {
            return storageSet(key(slot), encode(value));
        },
        update(slot, updater, fallback = null) {
            const next = updater(this.get(slot, fallback));
            this.set(slot, next);
            return next;
        },
        remove(slot) {
            storageRemove(key(slot));
        },
    };
}
