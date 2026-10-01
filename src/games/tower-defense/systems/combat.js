/** Mutable combat systems.  The game instance is the state container. */
import { Sfx } from '../audio.js';
import { TD_ART_FRAMES } from '../art.js';
import { ENEMY_TYPES, H, MAX_FLOATERS, MAX_PARTICLES, STACK_GOLD_PER, STACK_HP_PER, STACK_MAX, TOWER_TYPES, W } from '../config.js';
import { buildWave } from '../model/wave-runtime.js';

export function burst(game, x, y, color, count) {
    for (let i = 0; i < count; i++) {
        if (game.particles.length >= MAX_PARTICLES) game.particles.shift();
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 140;
        game.particles.push({
            x, y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            life: 0.35 + Math.random() * 0.35,
            age: 0,
            size: 1.5 + Math.random() * 2.5,
            color
        });
    }
}

export function floater(game, x, y, text, color, scale = 1) {
    if (game.floaters.length >= MAX_FLOATERS) game.floaters.shift();
    game.floaters.push({ x, y, text, color, scale, age: 0, life: 0.85 });
}

export function damageEnemy(game, e, dmg, isCrit = false, killerTower = null, channel = 'physical') {
    if (e.dead) return;

    // 装甲减免：物理伤害被大幅削减，逼玩家上电磁塔或加农火海
    if (e.armor > 0 && channel === 'physical') {
        dmg = dmg * (1 - e.armor);
    }

    // 感电易伤（Tesla Lv4）
    if (game.time < e.shockUntil) {
        dmg = dmg * 1.2;
    }

    dmg = Math.max(1, Math.round(dmg));

    // 护盾抵消机制
    if (e.shield > 0) {
        if (e.shield >= dmg) {
            e.shield -= dmg;
            game.burst(e.x, e.y, '#38bdf8', 4);
            dmg = 0;
        } else {
            dmg -= e.shield;
            e.shield = 0;
            game.burst(e.x, e.y, '#38bdf8', 8);
            Sfx.shieldBreak();
        }
    }

    if (dmg > 0) {
        e.hp -= dmg;
        e.hitFlash = 0.08;
        game.effects.push({
            kind: 'impact', x: e.x, y: e.y,
            frame: channel === 'energy' ? TD_ART_FRAMES.fx.pulse : TD_ART_FRAMES.fx.damage,
            age: 0, life: 0.16
        });
        if (killerTower) killerTower.damageDealt = (killerTower.damageDealt || 0) + dmg;
        if (isCrit) {
            game.floater(e.x, e.y - 12, `CRIT ${dmg}!`, '#ffd34d', 1.25);
            game.burst(e.x, e.y, '#ffd34d', 8);
            Sfx.crit();
        }
    }

    if (e.hp <= 0) game.killEnemy(e, killerTower);
}

export function killEnemy(game, e, killerTower = null) {
    if (e.dead) return;
    e.dead = true;
    game.gold += e.gold;
    game.score += e.gold;
    game.totalKills = (game.totalKills || 0) + 1;
    if (killerTower) killerTower.kills = (killerTower.kills || 0) + 1;

    const isBig = e.type === 'boss' || e.type === 'overlord';
    game.burst(e.x, e.y, e.color, isBig ? 34 : 10);
    game.floater(e.x, e.y - 10, `+${e.gold}`, '#ffd34d');

    // 分裂：死亡裂出一群小怪，位置接在当前位置，溅射清不干净就会滚雪球
    if (e.split) {
        for (let i = 0; i < e.split.count; i++) {
            game.spawnEnemy(e.split.type, Math.max(0, e.dist - i * 14), true);
        }
        game.floaters.push({
            x: e.x, y: e.y - 22, text: game.TEXT.splitToast,
            color: '#fdba74', scale: 1, age: 0, life: 0.7
        });
    }

    if (e.type === 'tank' || isBig) {
        game.shake(isBig ? 7 : 3, 0.3);
        Sfx.bigDeath();
    }
    if (isBig) {
        game.showToast(game.TEXT.bossDefeated, 2200);
    }

    game.updateHud();
    game.renderWaveButton();
    game.updateSideRecords();
}

export function leakEnemy(game, e) {
    e.dead = true;
    game.lives -= e.dmg;
    game.coreFlash = 0.45;
    game.shake(5.5, 0.35);
    Sfx.leak();
    game.updateHud();
    if (game.lives <= 0) {
        game.endGame(false);
    }
}

export function spawnEnemy(game, type, overrideDist = 0, isSplitChild = false) {
    const cfg = ENEMY_TYPES[type];
    const hp = cfg.hp * game.hpMul * game.stackHp * (isSplitChild ? 0.55 : 1);
    const maxShield = (cfg.maxShield || 0) * game.hpMul * game.stackHp;
    const path = cfg.flying ? game.map.airPath : game.map.groundPath;
    const start = path.pointAt(overrideDist);
    const bounty = game.stackGold * (game.level ? game.level.bounty : 1);

    game.enemies.push({
        type,
        hp,
        maxHp: hp,
        shield: maxShield,
        maxShield,
        speed: cfg.speed * game.spdMul,
        gold: Math.max(1, Math.round(cfg.gold * bounty)),
        dmg: cfg.dmg,
        r: cfg.r,
        color: cfg.color,
        armor: cfg.armor || 0,
        flying: !!cfg.flying,
        healer: cfg.healer || null,
        attacker: cfg.attacker || null,
        split: cfg.split || null,
        path,
        dist: overrideDist,
        x: start.x,
        y: start.y,
        slowUntil: 0,
        slowFactor: 0,
        stunUntil: 0,
        shockUntil: 0,
        hitFlash: 0,
        healPulse: 0,
        attackCd: 0,
        dead: false
    });

    if (type === 'boss' || type === 'overlord') {
        game.showToast(type === 'overlord' ? game.TEXT.overlordIncoming : game.TEXT.bossIncoming);
        game.shake(6, 0.45);
        Sfx.bigDeath();
    }
}

export function applyStack(game) {
    game.stackHp = 1 + game.stack * STACK_HP_PER;
    game.stackGold = 1 + game.stack * STACK_GOLD_PER;
}

export function startWave(game) {
    if (game.state !== 'playing') return;
    const L = game.level;
    const stackCap = Math.min(STACK_MAX, L.waves - game.wave);

    // 战斗中再点 = 提前迎击：没有白给的金币，取而代之的是"压波"堆叠。
    // 每压一波，敌人血量与赏金同步 +8%，层数只有等全部清空才重置。
    if (game.waveState !== 'idle') {
        if (game.wave < L.waves && game.stack < stackCap) {
            game.stack++;
            game.applyStack();
            game.wave++;
            const waveCfg = buildWave(game.wave, L);
            game.spawnQueue.push(...waveCfg.queue);
            game.hpMul = waveCfg.hpMul;
            game.spdMul = waveCfg.spdMul;

            game.effects.push({ kind: 'emp_wave', x: W / 2, y: H / 2, maxR: Math.hypot(W, H) / 2 + 60, age: 0, life: 0.5 });
            game.shake(3, 0.25);
            Sfx.earlyWave();
            game.showToast(game.TEXT.stackToast
                .replace('{n}', game.stack)
                .replace('{hp}', Math.round(game.stack * STACK_HP_PER * 100))
                .replace('{g}', Math.round(game.stack * STACK_GOLD_PER * 100)), 1700);
            game.updateHud();
            game.renderWaveButton();
        } else if (game.stack >= stackCap && game.wave < L.waves) {
            game.showToast(game.TEXT.stackMax, 1500);
        }
        return;
    }

    game.wave++;
    const waveCfg = buildWave(game.wave, L);
    game.spawnQueue = waveCfg.queue;
    game.hpMul = waveCfg.hpMul;
    game.spdMul = waveCfg.spdMul;
    game.spawnTimer = 0.35;
    game.waveState = 'spawning';
    const t = game.TEXT;
    game.waveBanner = {
        text: (game.wave === L.waves) ? t.finalWave :
            waveCfg.isBossWave ? t.bossWave :
                game.lang === 'zh' ? `第 ${game.wave} 波` : `WAVE ${game.wave}`,
        sub: game.stack > 0
            ? (game.lang === 'zh' ? `堆叠 ×${game.stack} · 敌人强度 +${Math.round(game.stack * STACK_HP_PER * 100)}%` : `STACKED ×${game.stack} · +${Math.round(game.stack * STACK_HP_PER * 100)}% ENEMY POWER`)
            : '',
        isBoss: waveCfg.isBossWave,
        life: 1.5,
        age: 0
    };
    Sfx.waveStart();
    game.updateHud();
    game.renderWaveButton();
}

export function waveCleared(game) {
    const L = game.level;
    const bonus = 25 + game.wave * 3;
    game.gold += bonus;
    game.score += 40 + game.wave * 5;
    const stacked = game.stack;
    game.showToast(game.TEXT.waveCleared.replace('{n}', game.wave).replace('{g}', bonus), 2000);
    if (game.wave >= L.waves) {
        game.endGame(true);
        return;
    }
    // 清空整波才重置堆叠：这就是"压波"的风险所在
    if (stacked > 0) {
        game.stack = 0;
        game.applyStack();
    }
    game.waveState = 'idle';
    game.updateHud();
    game.renderWaveButton();
}

export function updateGame(game, dt) {
    game.time += dt;

    // 技能冷却
    if (game.empCd > 0) {
        game.empCd = Math.max(0, game.empCd - dt);
        game.updateSkillButtons();
    }
    if (game.boostCd > 0) {
        game.boostCd = Math.max(0, game.boostCd - dt);
        game.updateSkillButtons();
    }

    // 震屏衰减
    if (game.shakeDur > 0) {
        game.shakeDur -= dt;
        if (game.shakeDur <= 0) game.shakeMag = 0;
    }

    // 全息波次通告
    if (game.waveBanner) {
        game.waveBanner.age += dt;
        if (game.waveBanner.age >= game.waveBanner.life) game.waveBanner = null;
    }

    // 出怪队列
    if (game.waveState === 'spawning') {
        game.spawnTimer -= dt;
        if (game.spawnTimer <= 0 && game.spawnQueue.length) {
            const item = game.spawnQueue.shift();
            game.spawnEnemy(item.type);
            game.spawnTimer = item.gap;
            game.renderWaveButton();
        }
        if (!game.spawnQueue.length) game.waveState = 'fighting';
    }

    // 地面火海危害
    for (let i = game.groundHazards.length - 1; i >= 0; i--) {
        const g = game.groundHazards[i];
        g.age += dt;
        if (g.age >= g.duration) {
            game.groundHazards.splice(i, 1);
            continue;
        }
        const tickDmg = g.dps * dt;
        const rSq = g.r * g.r;
        for (const e of game.enemies) {
            if (e.dead) continue;
            const dx = e.x - g.x, dy = e.y - g.y;
            if (dx * dx + dy * dy <= rSq) {
                // 火海是能量系持续伤害：无视装甲，是加农塔 Lv4 的破甲答案
                e.hp -= tickDmg;
                e.hitFlash = 0.04;
                if (g.tower) g.tower.damageDealt = (g.tower.damageDealt || 0) + tickDmg;
                if (e.hp <= 0) game.killEnemy(e, g.tower);
            }
        }
        if (Math.random() < 0.25) {
            const ang = Math.random() * Math.PI * 2;
            const rad = Math.random() * g.r;
            game.particles.push({
                x: g.x + Math.cos(ang) * rad,
                y: g.y + Math.sin(ang) * rad,
                vx: (Math.random() - 0.5) * 15,
                vy: -15 - Math.random() * 20,
                life: 0.35,
                age: 0,
                size: 2,
                color: '#ff9f43'
            });
        }
    }

    // 敌人更新
    let alive = 0;
    for (const e of game.enemies) {
        if (e.dead) continue;
        alive++;

        const isStunned = game.time < e.stunUntil;
        if (!isStunned) {
            const slowed = game.time < e.slowUntil;
            const speed = e.speed * (slowed ? (1 - e.slowFactor) : 1);
            e.dist += speed * dt;
            const p = e.path.pointAt(e.dist);
            e.x = p.x;
            e.y = p.y;
        } else if (Math.random() < 0.2) {
            game.particles.push({
                x: e.x + (Math.random() - 0.5) * 12,
                y: e.y + (Math.random() - 0.5) * 12,
                vx: 0, vy: -10,
                life: 0.25, age: 0, size: 2,
                color: '#40d8ff'
            });
        }

        // 治疗兵：持续给范围内的友军（不含自己）回血，是"必须先切掉"的目标
        if (e.healer && !isStunned) {
            const hr2 = e.healer.radius * e.healer.radius;
            for (const other of game.enemies) {
                if (other === e || other.dead || other.hp >= other.maxHp) continue;
                const ox = other.x - e.x, oy = other.y - e.y;
                if (ox * ox + oy * oy <= hr2) {
                    other.hp = Math.min(other.maxHp, other.hp + e.healer.hps * dt);
                    other.healedBy = e;
                }
            }
        }

        // 攻城兵：停下来拆最近的塔
        if (e.attacker && !isStunned) {
            e.attackCd -= dt;
            if (e.attackCd <= 0) {
                const t = game.nearestTower(e, e.attacker.range);
                if (t) {
                    game.damageTower(t, e.attacker.dps / e.attacker.rate);
                    e.attackCd = 1 / e.attacker.rate;
                } else {
                    e.attackCd = 0.2;
                }
            }
        }

        if (e.hitFlash > 0) e.hitFlash -= dt;
        if (e.dist >= e.path.total - 6) {
            game.leakEnemy(e);
            alive--;
        }
    }

    if (game.enemies.some(e => e.dead)) {
        game.enemies = game.enemies.filter(e => !e.dead);
    }
    if (alive === 0 && game.waveState === 'fighting') {
        game.waveCleared();
    }

    // 防御塔更新
    const isBoosted = game.time < game.overdriveUntil;
    for (const tower of game.towers) {
        if (!tower) continue;
        tower.cooldown -= dt;
        if (tower.cooldown <= 0) {
            const fired = game.fireTower(tower);
            const rate = TOWER_TYPES[tower.type].levels[tower.level].rate * (isBoosted ? 1.5 : 1);
            tower.cooldown = fired ? 1 / rate : 0.05;
        }
        if (tower.type === 'frost') tower.angle += dt * 1.4;
    }

    // 子弹更新
    for (const p of game.projectiles) {
        const tx = p.target && !p.target.dead ? p.target.x : p.lastX;
        const ty = p.target && !p.target.dead ? p.target.y : p.lastY;
        if (p.target && !p.target.dead) {
            p.lastX = tx; p.lastY = ty;
        }
        const dx = tx - p.x, dy = ty - p.y;
        const dist = Math.hypot(dx, dy);
        const step = p.speed * dt;
        if (dist <= step + 3) {
            if (p.kind === 'shell') {
                game.explodeShell(tx, ty, p.dmg, p.splash, p.tower, p.napalm);
            } else if (p.target && !p.target.dead) {
                game.damageEnemy(p.target, p.dmg, p.isCrit, p.tower);
            }
            p.dead = true;
        } else {
            p.x += dx / dist * step;
            p.y += dy / dist * step;
        }
    }
    game.projectiles = game.projectiles.filter(p => !p.dead);

    // 粒子更新
    let w = 0;
    for (let i = 0; i < game.particles.length; i++) {
        const pt = game.particles[i];
        pt.age += dt;
        if (pt.age >= pt.life) continue;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= 0.92;
        pt.vy *= 0.92;
        game.particles[w++] = pt;
    }
    game.particles.length = w;

    // 漂浮文字更新
    w = 0;
    for (let i = 0; i < game.floaters.length; i++) {
        const f = game.floaters[i];
        f.age += dt;
        if (f.age >= f.life) continue;
        f.y -= 28 * dt;
        game.floaters[w++] = f;
    }
    game.floaters.length = w;

    // 特效更新
    w = 0;
    for (let i = 0; i < game.effects.length; i++) {
        const fx = game.effects[i];
        fx.age += dt;
        if (fx.kind === 'ring') fx.r = fx.maxR * (fx.age / fx.life);
        if (fx.kind === 'emp_wave') fx.r = fx.maxR * (fx.age / fx.life);
        if (fx.age >= fx.life) continue;
        game.effects[w++] = fx;
    }
    game.effects.length = w;

    if (game.coreFlash > 0) game.coreFlash -= dt;
}
