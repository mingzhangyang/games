import { createGameStorage } from '../../platform/storage/game-storage.js';
import { storageGet, storageSet } from '../../platform/safe-storage.js';

export const SILK_DEW_STORAGE_SLOTS = Object.freeze({
    PROGRESS: 'progress',
});

export const SILK_DEW_LEGACY_PROGRESS_KEY = 'sd_progress';
export const SILK_DEW_LEGACY_PROGRESS_VERSION_KEY = 'sd_progress_version';
export const SILK_DEW_LEGACY_PROGRESS_VERSION = '2';

export const SILK_DEW_STORAGE = createGameStorage('silk-dew', {
    version: 1,
    legacy: {
        [SILK_DEW_STORAGE_SLOTS.PROGRESS]: SILK_DEW_LEGACY_PROGRESS_KEY,
    },
});

function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}

function normalizeProgress(progress) {
    const out = {};
    if (!progress || typeof progress !== 'object') return out;

    for (const key of Object.keys(progress)) {
        const value = progress[key];
        if (value && typeof value === 'object') {
            out[key] = {
                stars: clamp(value.stars | 0, 0, 3),
                bestDrags: value.bestDrags | 0,
            };
        }
    }
    return out;
}

function migrateLegacyV1Progress(progress) {
    const out = {};
    if (!progress || typeof progress !== 'object') return out;

    for (const key of Object.keys(progress)) {
        const value = progress[key];
        if (value && typeof value === 'object' && (value.stars | 0) > 0) {
            // The pre-v2 scoring rules allowed star skipping and incomparable drag records.
            out[key] = { stars: 1, bestDrags: 0 };
        }
    }
    return out;
}

function readLegacyProgress() {
    const raw = storageGet(SILK_DEW_LEGACY_PROGRESS_KEY);
    if (raw == null) return { ok: true, value: {} };
    try {
        return { ok: true, value: JSON.parse(raw || '{}') };
    } catch {
        return { ok: false, value: {} };
    }
}

function persistLegacyV2Mirror(progress) {
    const raw = JSON.stringify(progress || {});
    storageSet(SILK_DEW_LEGACY_PROGRESS_KEY, raw);

    // Preserve the historical transaction boundary: the v2 marker may advance only
    // after the downgraded payload can be read back from the legacy key.
    if (storageGet(SILK_DEW_LEGACY_PROGRESS_KEY) !== raw) return false;

    storageSet(SILK_DEW_LEGACY_PROGRESS_VERSION_KEY, SILK_DEW_LEGACY_PROGRESS_VERSION);
    return storageGet(SILK_DEW_LEGACY_PROGRESS_VERSION_KEY) === SILK_DEW_LEGACY_PROGRESS_VERSION;
}

export function loadSilkDewProgress() {
    const slot = SILK_DEW_STORAGE_SLOTS.PROGRESS;
    const canonicalKey = SILK_DEW_STORAGE.key(slot);

    // Once the canonical slot exists it is authoritative; changed legacy data must
    // never be re-imported.
    if (storageGet(canonicalKey) != null) {
        return normalizeProgress(SILK_DEW_STORAGE.get(slot, {}));
    }

    const legacy = readLegacyProgress();
    if (!legacy.ok) return {};

    const legacyIsV2 =
        storageGet(SILK_DEW_LEGACY_PROGRESS_VERSION_KEY) === SILK_DEW_LEGACY_PROGRESS_VERSION;
    const progress = legacyIsV2
        ? normalizeProgress(legacy.value)
        : migrateLegacyV1Progress(legacy.value);

    // Silk Dew already had a semantic v1 -> v2 migration before GameStorage existed.
    // Complete that transaction first so rollback to the legacy runtime remains safe.
    if (!legacyIsV2 && !persistLegacyV2Mirror(progress)) {
        return progress;
    }

    SILK_DEW_STORAGE.trySet(slot, progress);
    return progress;
}

export function saveSilkDewProgress(progress) {
    return SILK_DEW_STORAGE.trySet(
        SILK_DEW_STORAGE_SLOTS.PROGRESS,
        normalizeProgress(progress),
    );
}
