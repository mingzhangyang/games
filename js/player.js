/**
 * 统一玩家身份 — 全站共享的排行榜昵称
 * 所有游戏读写同一个 localStorage 键 player_name；
 * 首次使用时自动从旧的游戏专属键迁移（tetris/pm/hs_username）。
 */

const GLOBAL_KEY = 'player_name';
const LEGACY_KEYS = ['tetris_username', 'pm_username', 'hs_username'];

function read(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // 存储不可用时静默降级
    }
}

function sanitize(raw) {
    return String(raw ?? '')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
        .trim()
        .slice(0, 20);
}

/**
 * 读取玩家名；不存在时尝试从旧键迁移；都没有返回 null
 */
export function getPlayerName() {
    const current = sanitize(read(GLOBAL_KEY));
    if (current) return current;
    for (const key of LEGACY_KEYS) {
        const legacy = sanitize(read(key));
        if (legacy) {
            write(GLOBAL_KEY, legacy);
            return legacy;
        }
    }
    return null;
}

/**
 * 读取玩家名，不存在则生成 Anonymous+随机数 并持久化
 */
export function ensurePlayerName() {
    let name = getPlayerName();
    if (!name) {
        name = 'Anonymous' + Math.floor(1000 + Math.random() * 9000);
        setPlayerName(name);
    }
    return name;
}

/**
 * 设置玩家名（清理控制字符、限长 20），全站生效
 */
export function setPlayerName(raw) {
    const name = sanitize(raw) || ('Anonymous' + Math.floor(1000 + Math.random() * 9000));
    write(GLOBAL_KEY, name);
    return name;
}
