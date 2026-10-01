import { todayKey as todayCompact } from '../../platform/daily.js';
import { storageGet, storageKeys, storageRemove, storageSet } from '../../platform/safe-storage.js';
import { buildDailyCourse, isValidDailyCourse } from './model/course.js';

const DAILY_COURSE_PREFIX = 'gd_course_';

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
