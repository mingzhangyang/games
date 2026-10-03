import { todayKey as todayCompact } from '../../platform/daily.js';
import { createGameStorage } from '../../platform/storage/game-storage.js';
import { storageGet, storageKeys, storageRemove, storageSet } from '../../platform/safe-storage.js';
import { buildDailyCourse, isValidDailyCourse } from './model/course.js';

export const GRAVITY_SLINGSHOT_STORAGE_SLOTS = Object.freeze({
    STARS: 'stars',
});

export const GRAVITY_SLINGSHOT_STORAGE = createGameStorage('gravity-slingshot', {
    version: 1,
    legacy: {
        [GRAVITY_SLINGSHOT_STORAGE_SLOTS.STARS]: 'gd_stars',
    },
});

const DAILY_COURSE_PREFIX = 'gd_course_';

export function loadGravityStars(levelCount = 0) {
    const stored = GRAVITY_SLINGSHOT_STORAGE.get(
        GRAVITY_SLINGSHOT_STORAGE_SLOTS.STARS,
        [],
    );
    const stars = Array.isArray(stored) ? stored.slice() : [];
    if (!Array.isArray(stored)) {
        GRAVITY_SLINGSHOT_STORAGE.trySet(
            GRAVITY_SLINGSHOT_STORAGE_SLOTS.STARS,
            stars,
        );
    }
    while (stars.length < levelCount) stars.push(0);
    return stars;
}

export function saveGravityStars(stars) {
    const value = Array.isArray(stars) ? stars.slice() : [];
    return GRAVITY_SLINGSHOT_STORAGE.trySet(
        GRAVITY_SLINGSHOT_STORAGE_SLOTS.STARS,
        value,
    );
}

export function loadDailyCourse(now = Date.now()) {
    const date = todayCompact(now);
    const key = `${DAILY_COURSE_PREFIX}${date}`;

    try {
        const cached = JSON.parse(storageGet(key));
        if (isValidDailyCourse(cached)) return cached;
    } catch {
        // Invalid or unavailable storage falls through to deterministic generation.
    }

    const course = buildDailyCourse(now);
    try {
        storageSet(key, JSON.stringify(course));
        for (const storedKey of storageKeys(DAILY_COURSE_PREFIX)) {
            if (storedKey !== key) storageRemove(storedKey);
        }
    } catch {
        // Storage is optional; the generated course remains playable.
    }
    return course;
}
