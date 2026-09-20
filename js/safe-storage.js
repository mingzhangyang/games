// 全站唯一的安全 localStorage 包装（try/catch 在此唯一实现）。
// 迁移自 11 份逐字重复的手写包装：reversi / minesweeper / tower-defense /
// gravity-slingshot / planet-merge / hoop-shot / needle-awn / sword-flight /
// word-daily / tank-battle(safeStorage*) / tetris(safeGetItem*)。
// 语义与原实现逐字对齐：读失败返回 null，写失败静默降级。
export function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

export function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // 存储不可用时静默降级
    }
}

export function storageRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        // 存储不可用时静默降级
    }
}
