/** Shared dimensions and persistence keys for Sword Flight. */
export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 640;

export const STORAGE_KEYS = {
    UNLOCKED_STAGE: 'sf_unlocked_stage',
    STAGE_STARS: 'sf_stage_stars',
    ENDLESS_BEST: 'sf_endless_best',
    MAX_REALM: 'sf_max_realm',
    MAX_COMBO: 'sf_max_combo',
    DAILY_PREFIX: 'sf_daily_'
};

export const REALM_THRESHOLDS = Object.freeze([0, 1500, 4500, 10000, 20000, 40000]);
