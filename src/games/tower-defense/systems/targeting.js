/** Tower placement, targeting and weapon calculations. */
import { Sfx } from '../audio.js';
import { CELL, SELL_RATIO, TARGET_PRIORITIES, TOWER_TYPES } from '../config.js';
import { isBuildable } from '../model/level-runtime.js';

export function towerAt(game, c, r) {
    if (c < 0 || c >= game.map.cols || r < 0 || r >= game.map.rows) return -1;
    return game.towerGrid[r * game.map.cols + c];
}

export function tryBuild(game, type) {
    if (!game.selectedCell || game.state !== 'playing') return;
    const { c, r } = game.selectedCell;
    if (!isBuildable(game.map, c, r) || game.towerAt(c, r) >= 0) return;
    const cfg = TOWER_TYPES[type];
    if (cfg.cost > game.gold) {
        game.showToast(game.TEXT.notEnoughGold);
        return;
    }
    const tower = {
        type, c, r,
        x: (c + 0.5) * CELL, y: (r + 0.5) * CELL,
        level: 0,
        cooldown: 0,
        invested: cfg.cost,
        angle: -Math.PI / 2,
        priority: 'first',
        damageDealt: 0,
        kills: 0,
        blizzardCount: 0,
        hp: game.towerMaxHp({ invested: cfg.cost }),
        destroyed: false,
        hurtFlash: 0
    };
    game.towers.push(tower);
    game.towerGrid[r * game.map.cols + c] = game.towers.length - 1;
    game.gold -= cfg.cost;
    game.selectedTowerIdx = game.towers.length - 1;
    Sfx.place();
    game.burst(tower.x, tower.y, cfg.color, 12);
    game.updateHud();
    game.renderPanel();
}

export function tryUpgrade(game) {
    const tower = game.towers[game.selectedTowerIdx];
    if (!tower || game.state !== 'playing') return;
    const cfg = TOWER_TYPES[tower.type];
    if (tower.level >= cfg.levels.length - 1) return;
    const nextLv = cfg.levels[tower.level + 1];
    if (nextLv.cost > game.gold) {
        game.showToast(game.TEXT.notEnoughGold);
        return;
    }
    game.gold -= nextLv.cost;
    tower.invested += nextLv.cost;
    tower.level++;
    // 升级同时加固：满血补上新增的耐久
    tower.hp = game.towerMaxHp(tower);
    Sfx.upgrade();
    game.burst(tower.x, tower.y, tower.level === 3 ? '#ffd34d' : cfg.color, tower.level === 3 ? 24 : 14);
    if (tower.level === 3) {
        game.shake(3, 0.2);
        game.floater(tower.x, tower.y - 16, `${game.TEXT.ultimate}!`, '#ffd34d', 1.3);
    }
    game.updateHud();
    game.renderPanel();
}

export function trySell(game) {
    const tower = game.towers[game.selectedTowerIdx];
    if (!tower || game.state !== 'playing') return;
    if (!game.sellConfirming) {
        game.sellConfirming = true;
        if (game.sellTimer) clearTimeout(game.sellTimer);
        game.sellTimer = setTimeout(() => {
            game.sellConfirming = false;
            game.renderPanel();
        }, 2500);
        Sfx.click();
        game.renderPanel();
        return;
    }
    if (game.sellTimer) clearTimeout(game.sellTimer);
    game.sellConfirming = false;
    const refund = Math.round(tower.invested * SELL_RATIO);
    game.gold += refund;
    game.towerGrid[tower.r * game.map.cols + tower.c] = -1;
    game.towers[game.selectedTowerIdx] = null;
    Sfx.sell();
    game.closePanel();
    game.updateHud();
}

export function cycleTargetPriority(game) {
    const tower = game.towers[game.selectedTowerIdx];
    if (!tower || game.state !== 'playing') return;
    const curIdx = TARGET_PRIORITIES.indexOf(tower.priority || 'first');
    tower.priority = TARGET_PRIORITIES[(curIdx + 1) % TARGET_PRIORITIES.length];
    Sfx.click();
    game.renderPanel();
}

export function toggleShowAllRanges(game) {
    game.showAllRanges = !game.showAllRanges;
    if (game.el['range-btn']) {
        game.el['range-btn'].classList.toggle('active', game.showAllRanges);
    }
    Sfx.click();
}

export function nearestTower(game, e, range) {
    const r2 = range * range;
    let best = null, bd = Infinity;
    for (const t of game.towers) {
        if (!t || t.destroyed) continue;
        const dx = t.x - e.x, dy = t.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && d2 < bd) { bd = d2; best = t; }
    }
    return best;
}

export function towerMaxHp(game, tower) {
    return Math.round(tower.invested * 0.6) + 60;
}

export function damageTower(game, tower, amount) {
    if (!tower || tower.destroyed) return;
    if (tower.hp === undefined) tower.hp = game.towerMaxHp(tower);
    tower.hp -= amount;
    tower.hurtFlash = 0.18;
    if (Math.random() < 0.35) {
        game.particles.push({
            x: tower.x + (Math.random() - 0.5) * 20,
            y: tower.y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 40,
            vy: -20 - Math.random() * 30,
            life: 0.35, age: 0, size: 2.4,
            color: '#ff9f43'
        });
    }
    if (tower.hp <= 0) game.destroyTower(tower);
}

export function destroyTower(game, tower) {
    tower.destroyed = true;
    game.burst(tower.x, tower.y, '#ff6b7a', 22);
    game.shake(4.5, 0.3);
    Sfx.explode();
    game.showToast(game.TEXT.towerLost, 1800);
    const idx = game.towers.indexOf(tower);
    if (idx >= 0) {
        game.towerGrid[tower.r * game.map.cols + tower.c] = -1;
        game.towers[idx] = null;
    }
    if (game.selectedTowerIdx === idx) {
        game.selectedTowerIdx = -1;
        game.closePanel();
    }
}

export function pickTarget(game, tower, range) {
    const rangeSq = range * range;
    const candidates = [];
    for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - tower.x, dy = e.y - tower.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= rangeSq) {
            // 进度按"走了全程的百分比"算：地面兵和飞行兵路径长度不同，
            // 直接用 dist 排序会把绕远路的敌人误判成"最靠前"
            candidates.push({
                e, d2, hp: e.hp,
                prog: e.dist / e.path.total
            });
        }
    }
    if (!candidates.length) return null;

    const prio = tower.priority || 'first';
    if (prio === 'first') {
        candidates.sort((a, b) => b.prog - a.prog);
    } else if (prio === 'last') {
        candidates.sort((a, b) => a.prog - b.prog);
    } else if (prio === 'strong') {
        candidates.sort((a, b) => b.hp - a.hp || b.prog - a.prog);
    } else if (prio === 'weak') {
        candidates.sort((a, b) => a.hp - b.hp || b.prog - a.prog);
    } else if (prio === 'close') {
        candidates.sort((a, b) => a.d2 - b.d2);
    } else if (prio === 'healer') {
        // 优先集火治疗兵：不切掉它，前面的伤害全被奶回来
        candidates.sort((a, b) => {
            const ah = a.e.healer ? 1 : 0;
            const bh = b.e.healer ? 1 : 0;
            return bh - ah || b.prog - a.prog;
        });
    }
    return candidates[0].e;
}

export function fireTower(game, tower) {
    const cfg = TOWER_TYPES[tower.type];
    const lv = cfg.levels[tower.level];
    const isBoosted = game.time < game.overdriveUntil;
    const range = isBoosted ? lv.range * 1.2 : lv.range;

    // 冰霜塔：全向光环攻击
    if (tower.type === 'frost') {
        let any = false;
        const rangeSq = range * range;
        const isBlizzard = lv.blizzard && ((tower.blizzardCount = (tower.blizzardCount || 0) + 1) % 4 === 0);

        for (const e of game.enemies) {
            if (e.dead) continue;
            const dx = e.x - tower.x, dy = e.y - tower.y;
            if (dx * dx + dy * dy <= rangeSq) {
                // 冰霜塔是能量系：无视装甲
                game.damageEnemy(e, lv.dmg, false, tower, 'energy');
                const expired = game.time >= e.slowUntil;
                e.slowUntil = game.time + lv.slowDur;
                e.slowFactor = expired ? lv.slow : Math.max(e.slowFactor, lv.slow);
                if (isBlizzard) {
                    e.stunUntil = Math.max(e.stunUntil, game.time + 0.8);
                }
                any = true;
            }
        }
        if (!any) return false;

        if (isBlizzard) {
            Sfx.freeze();
            game.effects.push({ kind: 'ring', x: tower.x, y: tower.y, r: 8, maxR: range * 1.15, age: 0, life: 0.55, color: '#e0f2fe' });
            game.burst(tower.x, tower.y, '#e0f2fe', 16);
        } else {
            game.effects.push({ kind: 'ring', x: tower.x, y: tower.y, r: 8, maxR: range, age: 0, life: 0.42, color: cfg.color });
        }
        return true;
    }

    const target = game.pickTarget(tower, range);
    if (!target) return false;
    tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);

    if (tower.type === 'pulse') {
        const isCrit = lv.crit && (Math.random() < lv.crit);
        const dmg = isCrit ? Math.round(lv.dmg * lv.critMul) : lv.dmg;
        game.projectiles.push({
            kind: 'bullet', x: tower.x, y: tower.y,
            target, lastX: target.x, lastY: target.y,
            speed: 460, dmg, isCrit, tower, color: cfg.color, r: isCrit ? 4.5 : 3
        });
        return true;
    }

    if (tower.type === 'cannon') {
        game.projectiles.push({
            kind: 'shell', x: tower.x, y: tower.y,
            target, lastX: target.x, lastY: target.y,
            speed: 280, dmg: lv.dmg, splash: lv.splash,
            napalm: lv.napalm, tower, color: cfg.color, r: 5
        });
        return true;
    }

    if (tower.type === 'tesla') {
        const chain = [target];
        let current = target;
        const chainRangeSq = 85 * 85;
        while (chain.length < lv.chain) {
            let next = null, nd = Infinity;
            for (const e of game.enemies) {
                if (e.dead || chain.includes(e)) continue;
                const dx = e.x - current.x, dy = e.y - current.y;
                const d2 = dx * dx + dy * dy;
                if (d2 <= chainRangeSq && d2 < nd) {
                    nd = d2;
                    next = e;
                }
            }
            if (!next) break;
            chain.push(next);
            current = next;
        }

        const pts = [{ x: tower.x, y: tower.y }];
        let dmg = lv.dmg;
        for (const e of chain) {
            pts.push({ x: e.x, y: e.y });
            if (lv.shock) e.shockUntil = game.time + 3.0;
            // 电磁塔是能量系：无视装甲，是装甲兵的正确答案
            game.damageEnemy(e, dmg, false, tower, 'energy');
            game.burst(e.x, e.y, cfg.color, 4);
            dmg = Math.round(dmg * 0.7);
        }
        game.effects.push({ kind: 'zap', pts, age: 0, life: 0.18, color: cfg.color });
        Sfx.zap();
        return true;
    }

    return false;
}

export function explodeShell(game, x, y, dmg, radius, tower, napalm) {
    const rSq = radius * radius;
    for (const e of game.enemies) {
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y;
        // 加农炮是物理系：会被装甲大幅削减
        if (dx * dx + dy * dy <= rSq) game.damageEnemy(e, dmg, false, tower, 'physical');
    }
    game.effects.push({ kind: 'ring', x, y, r: 4, maxR: radius, age: 0, life: 0.32, color: '#ff9f43' });
    game.burst(x, y, '#ff9f43', 12);
    game.shake(3.2, 0.2);
    Sfx.explode();

    // 4阶觉醒：火海地面持续伤害
    if (napalm) {
        game.groundHazards.push({
            x, y, r: radius * 0.75,
            dps: 18,
            duration: 3.5,
            age: 0,
            tower
        });
    }
}
