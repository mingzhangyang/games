import { LEVELS } from '../levels.js';

/**
 * Build one wave from the level's declarative curve and modifiers.
 * No DOM or game instance is needed, which keeps difficulty checks cheap and
 * makes the wave contract independent from rendering.
 */
export function buildWave(n, level) {
    const L = level || LEVELS[0];
    const mods = L.modifiers || {};
    const queue = [];
    const push = (type, count, gap) => {
        for (let i = 0; i < count; i++) queue.push({ type, gap });
    };

    const t = (n - 1) / Math.max(1, L.waves - 1);
    const hpMul = (1 + (n - 1) * L.hpBase) * Math.pow(1 + t * 0.9, L.hpExp) * 1.0;
    const spdMul = L.speed * (1 + Math.min(0.4, (n - 1) * 0.013));
    const isBossWave = n === L.waves || n % 10 === 0;

    if (n === L.waves) {
        push('normal', 8, 0.26);
        push('fast', 8, 0.28);
        push('swarm', 12, 0.15);
        push('shield', 5, 0.6);
        push('tank', 4, 1.0);
        if (mods.armored) push('armor', 5, 0.8);
        if (mods.flyers) push('flyer', 8, 0.42);
        if (mods.splitters) push('splitter', 5, 0.85);
        if (mods.regen) push('healer', 3, 1.3);
        push(L.id === 'singularity' ? 'overlord' : 'boss', L.id === 'singularity' ? 2 : 2, 2.1);
    } else if (n % 10 === 0) {
        push('normal', 7, 0.35);
        push('shield', 3, 0.7);
        push('tank', 3, 1.1);
        if (mods.armored) push('armor', 3, 0.9);
        if (mods.flyers) push('flyer', 5, 0.45);
        if (mods.regen) push('healer', 2, 1.5);
        const bossCount = n >= 30 ? 2 : 1;
        push(n >= L.waves - 10 && L.id === 'singularity' ? 'overlord' : 'boss', bossCount, 2.5);
    } else {
        push('normal', 5 + Math.floor(n * 1.0), Math.max(0.24, 0.78 - n * 0.018));
        if (n >= 3) push('fast', 2 + Math.floor((n - 2) * 1.0), 0.34);
        if (n >= 5) push('tank', Math.max(1, Math.floor((n - 3) * 0.7)), 1.2);
        if (n >= 6) push('swarm', Math.floor(4 + (n - 6) * 1.3), 0.16);
        if (n >= 8) push('shield', Math.floor(1 + (n - 8) * 0.6), 0.85);
        if (mods.regen && n >= 5) push('healer', Math.max(1, Math.floor((n - 4) * 0.28)), 1.4);
        if (mods.armored && n >= 7) push('armor', Math.max(1, Math.floor((n - 6) * 0.32)), 0.95);
        if (mods.flyers && n >= 9) push('flyer', Math.max(2, Math.floor((n - 8) * 0.5)), 0.4);
        if (mods.splitters && n >= 11) push('splitter', Math.max(1, Math.floor((n - 10) * 0.28)), 0.9);
        if (mods.armored && n >= 13) push('attacker', Math.max(1, Math.floor((n - 12) * 0.22)), 1.0);
    }

    const summary = {};
    for (const item of queue) summary[item.type] = (summary[item.type] || 0) + 1;
    return { queue, hpMul, spdMul, summary, isBossWave, bounty: L.bounty };
}
