/** Magnetic Garden's complete deterministic rules. No clock, DOM or randomness. */
export const RULES_VERSION = 1;

export function createState(level) {
    const state = {
        magnets: level.magnets.map(magnet => ({ ...magnet })),
        seeds: level.seeds.map(seed => ({ ...seed, captured: false })),
        moves: 0,
        won: false,
    };
    state.won = isWon(state);
    return state;
}

export function isWon(state) {
    return state.seeds.length > 0 && state.seeds.every(seed => seed.captured);
}

export function stateKey(state) {
    const magnets = [...state.magnets].sort((a, b) => a.id.localeCompare(b.id));
    const seeds = [...state.seeds].sort((a, b) => a.id.localeCompare(b.id));
    return `${magnets.map(m => `${m.id}:${m.cell}:${m.polarity}`).join(',')}|${seeds.map(s => `${s.id}:${s.cell}:${+s.captured}`).join(',')}`;
}

/** [dx,dy], frozen once at the beginning of the turn; null means interference/no field. */
export function getSeedDirection(level, state, seed) {
    if (seed.captured) return null;
    const width = level.width;
    const sx = seed.cell % width;
    const sy = Math.floor(seed.cell / width);
    const blockers = new Set([...level.stones, ...state.magnets.map(m => m.cell)]);
    let nearest = Infinity;
    let choice = null;
    let count = 0;
    for (const magnet of state.magnets) {
        if (magnet.cell === null) continue;
        const mx = magnet.cell % width;
        const my = Math.floor(magnet.cell / width);
        if (sx !== mx && sy !== my) continue;
        const dx = Math.sign(mx - sx);
        const dy = Math.sign(my - sy);
        const distance = Math.abs(mx - sx) + Math.abs(my - sy);
        if (!distance) continue;
        let visible = true;
        for (let step = 1; step < distance; step++) {
            if (blockers.has(seed.cell + step * (dx + dy * width))) {
                visible = false;
                break;
            }
        }
        if (!visible || distance > nearest) continue;
        if (distance < nearest) {
            nearest = distance;
            count = 0;
        }
        count++;
        const sign = magnet.polarity === seed.polarity ? -1 : 1;
        choice = [dx * sign || 0, dy * sign || 0];
    }
    return count === 1 ? choice : null;
}

export function legalActions(level, state) {
    if (state.won) return [];
    const occupied = new Set([...state.seeds.map(s => s.cell), ...state.magnets.map(m => m.cell)]);
    const actions = [];
    for (const magnet of [...state.magnets].sort((a, b) => a.id.localeCompare(b.id))) {
        if (magnet.fixed) continue;
        actions.push({ type: 'flip', magnetId: magnet.id });
        for (const cell of level.sockets) {
            if (!occupied.has(cell)) actions.push({ type: 'move', magnetId: magnet.id, cell });
        }
    }
    return actions;
}

/** One action settles completely. Occupancy is sampled before each simultaneous microstep. */
export function applyAction(level, state, action, options = {}) {
    const invalid = reason => ({ valid: false, state, frames: [], reason });
    if (state.won) return invalid('finished');
    if (!action || !['move', 'flip'].includes(action.type)) return invalid('action');
    const selected = state.magnets.find(magnet => magnet.id === action.magnetId);
    if (!selected || selected.fixed) return invalid('magnet');
    if (action.type === 'move') {
        if (!level.sockets.includes(action.cell)) return invalid('socket');
        if (state.magnets.some(m => m.cell === action.cell) || state.seeds.some(s => s.cell === action.cell)) return invalid('occupied');
        if (level.stones.includes(action.cell) || level.pots.includes(action.cell)) return invalid('blocked');
    }
    const next = {
        magnets: state.magnets.map(magnet => magnet.id !== selected.id ? { ...magnet } : {
            ...magnet,
            ...(action.type === 'move' ? { cell: action.cell } : { polarity: magnet.polarity === 'N' ? 'S' : 'N' }),
        }),
        seeds: state.seeds.map(seed => ({ ...seed })),
        moves: state.moves + 1,
        won: false,
    };
    const directions = next.seeds.map(seed => getSeedDirection(level, next, seed));
    const active = directions.map(Boolean);
    const blockers = new Set([...level.stones, ...next.magnets.map(m => m.cell)]);
    const pots = new Set(level.pots);
    const frames = [];
    for (let step = 0; step < Math.max(level.width, level.height); step++) {
        const occupied = new Set(next.seeds.map(seed => seed.cell));
        const targets = new Map();
        const proposals = next.seeds.map((seed, index) => {
            if (!active[index]) return null;
            const [dx, dy] = directions[index];
            const x = seed.cell % level.width + dx;
            const y = Math.floor(seed.cell / level.width) + dy;
            const target = y * level.width + x;
            if (x < 0 || x >= level.width || y < 0 || y >= level.height || blockers.has(target) || occupied.has(target)) {
                active[index] = false;
                return null;
            }
            targets.set(target, (targets.get(target) || 0) + 1);
            return target;
        });
        let moved = false;
        const captured = [];
        for (let index = 0; index < next.seeds.length; index++) {
            const target = proposals[index];
            if (target === null) continue;
            if (targets.get(target) > 1) {
                active[index] = false;
                continue;
            }
            const seed = next.seeds[index];
            seed.cell = target;
            moved = true;
            if (pots.has(target)) {
                seed.captured = true;
                active[index] = false;
                captured.push(seed.id);
            }
        }
        if (!moved) break;
        if (options.frames !== false) frames.push({ seeds: next.seeds.map(seed => ({ ...seed })), captured });
    }
    next.won = isWon(next);
    return { valid: true, state: next, frames, reason: null };
}

/** Validate authored data before saving progress or attempting a proof. */
export function validateLevel(level) {
    const errors = [];
    const cells = level.width * level.height;
    if (!Number.isInteger(level.width) || !Number.isInteger(level.height) || level.width < 2 || level.width > 6 || level.height < 2 || level.height > 8) errors.push('Board must fit 6 × 8.');
    const entries = [
        ...level.stones.map(cell => ({ kind: 'stone', cell })),
        ...level.pots.map(cell => ({ kind: 'pot', cell })),
        ...level.seeds.map(seed => ({ kind: 'seed', ...seed })),
        ...level.magnets.filter(magnet => magnet.cell !== null).map(magnet => ({ kind: 'magnet', ...magnet })),
    ];
    const occupied = new Set();
    for (const entry of entries) {
        if (!Number.isInteger(entry.cell) || entry.cell < 0 || entry.cell >= cells) errors.push('Invalid cell.');
        if (occupied.has(entry.cell)) errors.push('Overlapping initial pieces.');
        occupied.add(entry.cell);
        if (['seed', 'magnet'].includes(entry.kind) && !['N', 'S'].includes(entry.polarity)) errors.push('Invalid polarity.');
    }
    if (!level.seeds.length || level.seeds.length > 4 || level.pots.length < level.seeds.length) errors.push('Need a pot for each seed.');
    if (!level.magnets.length || level.magnets.length > 3) errors.push('Need one to three magnets.');
    if (new Set(level.seeds.map(s => s.id)).size !== level.seeds.length || new Set(level.magnets.map(m => m.id)).size !== level.magnets.length) errors.push('Duplicate IDs.');
    for (const cell of level.sockets) {
        if (!Number.isInteger(cell) || cell < 0 || cell >= cells || level.stones.includes(cell) || level.pots.includes(cell)) errors.push('Invalid socket.');
    }
    if (new Set(level.sockets).size !== level.sockets.length) errors.push('Duplicate sockets.');
    if (level.magnets.some(m => m.cell !== null && !level.sockets.includes(m.cell))) errors.push('Every magnet begins on a socket.');
    return errors;
}
