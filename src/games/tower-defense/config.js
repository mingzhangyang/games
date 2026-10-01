/**
 * Tower Defense's data and geometry contract.
 *
 * This module is deliberately DOM-free.  Runtime, renderer and input code
 * consume the same immutable values so a refactor cannot accidentally create
 * a second set of gameplay constants.
 */

export const W = 800;
export const H = 600;
export const COLS = 20;
export const ROWS = 15;
export const CELL = 40;

export const SELL_RATIO = 0.7;
export const MAX_PARTICLES = 160;
export const MAX_FLOATERS = 40;

// Early-call stacking: each layer raises enemy HP and bounty until the wave
// chain is cleared.
export const STACK_HP_PER = 0.08;
export const STACK_GOLD_PER = 0.08;
export const STACK_MAX = 6;

export const TARGET_PRIORITIES = Object.freeze([
    'first', 'strong', 'weak', 'close', 'healer', 'last'
]);

export const ENEMY_TYPES = Object.freeze({
    normal: {
        hp: 34, speed: 55, gold: 6, dmg: 1, r: 9, sides: 8,
        color: '#ff6b7a', icon: 'N'
    },
    fast: {
        hp: 20, speed: 98, gold: 5, dmg: 1, r: 7, sides: 3,
        color: '#ffd34d', icon: 'F'
    },
    tank: {
        hp: 135, speed: 33, gold: 14, dmg: 2, r: 12, sides: 6,
        color: '#a78bfa', icon: 'T'
    },
    swarm: {
        hp: 16, speed: 108, gold: 3, dmg: 1, r: 6.5, sides: 4,
        color: '#34d399', icon: 'S'
    },
    shield: {
        hp: 75, speed: 48, gold: 10, dmg: 1, r: 10, sides: 7,
        color: '#38bdf8', icon: 'SH', maxShield: 50
    },
    healer: {
        hp: 90, speed: 44, gold: 16, dmg: 1, r: 11, sides: 6,
        color: '#86efac', icon: 'H', healer: { radius: 90, hps: 14 }
    },
    armor: {
        hp: 170, speed: 40, gold: 18, dmg: 2, r: 12, sides: 5,
        color: '#cbd5e1', icon: 'A', armor: 0.6
    },
    flyer: {
        hp: 60, speed: 88, gold: 11, dmg: 1, r: 8.5, sides: 3,
        color: '#f0abfc', icon: 'FL', flying: true
    },
    splitter: {
        hp: 120, speed: 52, gold: 15, dmg: 1, r: 10.5, sides: 4,
        color: '#fdba74', icon: 'SP', split: { type: 'swarm', count: 3 }
    },
    attacker: {
        hp: 200, speed: 38, gold: 22, dmg: 2, r: 12, sides: 6,
        color: '#fb7185', icon: 'SG',
        attacker: { range: 130, dps: 16, rate: 0.9 }
    },
    boss: {
        hp: 950, speed: 25, gold: 90, dmg: 4, r: 17, sides: 5,
        color: '#ff5a3c', icon: 'B'
    },
    overlord: {
        hp: 1600, speed: 22, gold: 200, dmg: 6, r: 20, sides: 8,
        color: '#e11d48', icon: 'Ω', armor: 0.4,
        healer: { radius: 110, hps: 22 }
    }
});

export const TOWER_TYPES = Object.freeze({
    pulse: {
        icon: 'P', color: '#40d8ff', cost: 50,
        levels: [
            { dmg: 9, range: 105, rate: 2.2 },
            { dmg: 16, range: 115, rate: 2.6, cost: 40 },
            { dmg: 28, range: 125, rate: 3.0, cost: 65 },
            { dmg: 48, range: 140, rate: 3.6, cost: 110, crit: 0.35, critMul: 2.5, perkName: 'Hyper Cannon (Crit)' }
        ]
    },
    frost: {
        icon: 'F', color: '#7dd3fc', cost: 70,
        levels: [
            { dmg: 4, range: 95, rate: 1.1, slow: 0.42, slowDur: 1.3 },
            { dmg: 7, range: 105, rate: 1.3, slow: 0.52, slowDur: 1.6, cost: 55 },
            { dmg: 11, range: 115, rate: 1.5, slow: 0.62, slowDur: 2.0, cost: 90 },
            { dmg: 18, range: 130, rate: 1.8, slow: 0.72, slowDur: 2.4, cost: 140, blizzard: true, perkName: 'Blizzard Cryo (Freeze)' }
        ]
    },
    cannon: {
        icon: 'C', color: '#ff9f43', cost: 100,
        levels: [
            { dmg: 24, range: 110, rate: 0.75, splash: 55 },
            { dmg: 40, range: 120, rate: 0.85, splash: 62, cost: 80 },
            { dmg: 66, range: 130, rate: 0.95, splash: 70, cost: 130 },
            { dmg: 105, range: 145, rate: 1.1, splash: 80, cost: 200, napalm: true, perkName: 'Napalm Nova (Fire Zone)' }
        ]
    },
    tesla: {
        icon: 'T', color: '#c084fc', cost: 140,
        levels: [
            { dmg: 15, range: 100, rate: 1.3, chain: 3 },
            { dmg: 25, range: 110, rate: 1.5, chain: 4, cost: 110 },
            { dmg: 40, range: 120, rate: 1.7, chain: 5, cost: 170 },
            { dmg: 65, range: 135, rate: 2.0, chain: 7, cost: 250, shock: true, perkName: 'Overcharge Storm (Shock)' }
        ]
    }
});

export function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}

export function formatNumber(value) {
    return Number(value).toLocaleString('en-US');
}
