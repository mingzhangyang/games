/** Collision handling, combat actions, and score-producing interactions. */
import { getLang } from '../../../platform/site-settings.js';
import { storageSet } from '../../../platform/safe-storage.js';
import { I18N } from '../i18n.js';
import { SFX } from '../audio.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, STORAGE_KEYS } from '../config.js';

export function triggerDash(game) {
    if (!game.isPlaying || game.isPaused) return;
    if (game.player.qi < 25 || game.player.dashTimer > 0) return;
    game.player.qi -= 25;
    game.player.dashTimer = 0.35; // 0.35s 冲刺无敌
    game.player.invincibleTimer = 0.45;
    SFX.playDash();
    game.screenShakes = 8;

    // 产生音爆环和冲击剑气粒子
    game.spawnShockwave(game.player.x, game.player.y, 40, '#38bdf8');
    game.showToast(I18N[getLang() === 'zh' ? 'zh' : 'en'].toastDash);

    // 斩击周围直接障碍
    game.cleaveNearbyHazards(80);

}

export function triggerSwordArray(game) {
    if (!game.isPlaying || game.isPaused) return;
    if (game.satelliteSwords.length === 0) return;
    SFX.playArrayWave();
    game.screenShakes = 4;

    // 飞剑散开成弧形向前方疾斩
    game.satelliteSwords.forEach((sw) => {
        sw.activeSlash = true;
        sw.slashTimer = 0.4;
    });

    // 产生月牙剑气
    game.spawnSwordWave(game.player.x, game.player.y - 20);
    game.cleaveNearbyHazards(120);

}

export function triggerUltimate(game) {
    if (!game.isPlaying || game.isPaused) return;
    if (game.player.ultEnergy < 100) return;
    game.player.ultEnergy = 0;
    SFX.playUltimate();
    game.screenShakes = 16;
    game.hitStopFrames = 12;

    game.showToast(I18N[getLang() === 'zh' ? 'zh' : 'en'].toastUlt);

    // 绽放百丈青莲与漫天剑雨
    game.spawnLotusAscension(game.player.x, game.player.y);

    // 净化全屏障碍与魔禽
    game.hazards.forEach((h) => {
        if (!h.broken) {
            h.broken = true;
            game.score += 200;
            game.spawnShatterParticles(h.x, h.y, '#38bdf8');
        }
    });
    game.fiendBirds.forEach((b) => {
        if (!b.slain) {
            b.slain = true;
            game.score += 300;
            game.spawnShatterParticles(b.x, b.y, '#fbbf24');
        }
    });
    game.thunders.forEach((th) => {
        th.discharged = true;
        game.score += 150;
    });

    // 奖励真气全满
    game.player.qi = game.player.maxQi;

}

export function cleaveNearbyHazards(game, range) {
    game.hazards.forEach((h) => {
        if (h.broken) return;
        const dist = Math.hypot(game.player.x - h.x, game.player.y - h.y);
        if (dist < range + Math.max(h.width, h.height) / 2) {
            h.broken = true;
            game.score += 150 * game.combo;
            game.player.ultEnergy = Math.min(100, game.player.ultEnergy + 15);
            SFX.playSlashHit();
            game.spawnShatterParticles(h.x, h.y, '#38bdf8');
        }
    });

    game.fiendBirds.forEach((b) => {
        if (b.slain) return;
        const dist = Math.hypot(game.player.x - b.x, game.player.y - b.y);
        if (dist < range + 30) {
            b.slain = true;
            game.score += 200 * game.combo;
            game.player.ultEnergy = Math.min(100, game.player.ultEnergy + 20);
            SFX.playSlashHit();
            game.spawnShatterParticles(b.x, b.y, '#fbbf24');
        }
    });

}

export function updateEntities(game, dt, traveled) {
    // 1. 仙环判定
    for (let i = game.rings.length - 1; i >= 0; i--) {
        const r = game.rings[i];
        r.y += traveled;
        r.pulse += dt * 3;

        // 穿环碰撞判定
        if (!r.passed && !r.missed) {
            const distY = Math.abs(game.player.y - r.y);
            const distX = Math.abs(game.player.x - r.x);
            if (distY < 18 && distX < r.rx + 10) {
                r.passed = true;
                game.handleRingThreaded(r);
            } else if (r.y > game.player.y + 30) {
                r.missed = true;
                // 漏环重置合鸣连击
                if (game.combo > 1) {
                    game.combo = 1;
                    game.updateHUD();
                }
            }
        }

        if (r.y > CANVAS_HEIGHT + 100) {
            game.rings.splice(i, 1);
        }
    }

    // 2. 灵石收集判定 (具有灵气磁吸效果)
    for (let i = game.spiritStones.length - 1; i >= 0; i--) {
        const s = game.spiritStones[i];
        s.y += traveled;
        s.rotation += dt * 2;

        // 磁吸
        const dx = game.player.x - s.x;
        const dy = game.player.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 100) {
            s.x += (dx / dist) * 8;
            s.y += (dy / dist) * 8;
        }

        if (dist < 28) {
            game.score += s.value * game.combo;
            game.player.ultEnergy = Math.min(100, game.player.ultEnergy + 5);
            SFX.playGem();
            game.spawnSparkle(s.x, s.y, '#fef08a');
            game.spiritStones.splice(i, 1);
        } else if (s.y > CANVAS_HEIGHT + 50) {
            game.spiritStones.splice(i, 1);
        }
    }

    // 3. 障碍与绝壁
    for (let i = game.hazards.length - 1; i >= 0; i--) {
        const h = game.hazards[i];
        h.y += traveled;

        if (!h.broken) {
            // 碰撞检测
            const withinX = Math.abs(game.player.x - h.x) < (h.width / 2 + 14);
            const withinY = Math.abs(game.player.y - h.y) < (h.height / 2 + 16);

            if (withinX && withinY) {
                if (game.player.dashTimer > 0 || game.player.invincibleTimer > 0) {
                    // 破空斩断
                    h.broken = true;
                    game.score += 250 * game.combo;
                    game.player.ultEnergy = Math.min(100, game.player.ultEnergy + 15);
                    SFX.playSlashHit();
                    game.spawnShatterParticles(h.x, h.y, '#38bdf8');
                } else {
                    // 玩家受伤
                    game.handlePlayerHit();
                    h.broken = true;
                    // 致命一击已结算：停止本轮实体结算，免得无敌帧继续给已结束的一局加分
                    if (!game.isPlaying) return;
                }
            }
        }

        if (h.y > CANVAS_HEIGHT + 100) {
            game.hazards.splice(i, 1);
        }
    }

    // 4. 玄雷云
    for (let i = game.thunders.length - 1; i >= 0; i--) {
        const th = game.thunders[i];
        th.y += traveled;
        th.chargeTime += dt;

        const dist = Math.hypot(game.player.x - th.x, game.player.y - th.y);
        if (!th.discharged && dist < th.radius + 18) {
            if (game.player.dashTimer > 0) {
                // 以剑引雷！
                th.discharged = true;
                game.score += 300 * game.combo;
                game.player.ultEnergy = Math.min(100, game.player.ultEnergy + 25);
                SFX.playThunderAbsorb();
                game.showToast(I18N[getLang() === 'zh' ? 'zh' : 'en'].toastThunder);
                game.spawnLightningEffect(th.x, th.y, game.player.x, game.player.y);
            } else if (game.player.invincibleTimer <= 0) {
                game.handlePlayerHit();
                th.discharged = true;
                // 致命一击已结算：停止本轮实体结算，免得无敌帧继续给已结束的一局加分
                if (!game.isPlaying) return;
            }
        }

        if (th.y > CANVAS_HEIGHT + 80) {
            game.thunders.splice(i, 1);
        }
    }

    // 5. 幽冥魔禽
    for (let i = game.fiendBirds.length - 1; i >= 0; i--) {
        const b = game.fiendBirds[i];
        b.x += b.vx;
        b.y += traveled + b.vy;
        b.wingAngle += dt * 10;

        if (b.x < 30 || b.x > CANVAS_WIDTH - 30) b.vx *= -1;

        if (!b.slain) {
            const dist = Math.hypot(game.player.x - b.x, game.player.y - b.y);
            if (dist < 32) {
                if (game.player.dashTimer > 0 || game.player.invincibleTimer > 0) {
                    b.slain = true;
                    game.score += 200 * game.combo;
                    SFX.playSlashHit();
                    game.spawnShatterParticles(b.x, b.y, '#f59e0b');
                } else {
                    game.handlePlayerHit();
                    b.slain = true;
                    // 致命一击已结算：停止本轮实体结算，免得无敌帧继续给已结束的一局加分
                    if (!game.isPlaying) return;
                }
            }
        }

        if (b.y > CANVAS_HEIGHT + 60) {
            game.fiendBirds.splice(i, 1);
        }
    }

    // 6. 粒子系统更新
    for (let i = game.particles.length - 1; i >= 0; i--) {
        const p = game.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= dt * p.fade;
        p.size = Math.max(0, p.size - dt * p.shrink);
        if (p.alpha <= 0 || p.size <= 0) {
            game.particles.splice(i, 1);
        }
    }

    // 7. 云彩、星辰与花瓣漂浮
    if (game.stars) {
        game.stars.forEach((st) => {
            st.y += traveled * st.speedFactor;
            if (st.y > CANVAS_HEIGHT + 10) {
                st.y = -10;
                st.x = Math.random() * CANVAS_WIDTH;
            }
        });
    }

    game.clouds.forEach((c) => {
        c.y += traveled * c.speedFactor;
        if (c.y > CANVAS_HEIGHT + c.radius) {
            c.y = -c.radius;
            c.x = Math.random() * CANVAS_WIDTH;
        }
    });

    game.petals.forEach((pt) => {
        pt.x += pt.speedX;
        pt.y += pt.speedY + traveled * 0.4;
        pt.angle += pt.rotSpeed;
        if (pt.y > CANVAS_HEIGHT + 20) {
            pt.y = -20;
            pt.x = Math.random() * CANVAS_WIDTH;
        }
    });

}

export function handleRingThreaded(game, ring) {
    game.ringsThreaded++;
    game.combo++;
    if (game.combo > game.maxComboThisRun) game.maxComboThisRun = game.combo;
    if (game.combo > game.maxComboRecord) {
        game.maxComboRecord = game.combo;
        storageSet(STORAGE_KEYS.MAX_COMBO, game.maxComboRecord.toString());
    }

    const ringScore = 100 * game.combo * (game.dailyModifiers?.ringScoreMultiplier ?? 1);
    game.score += ringScore;
    game.player.qi = Math.min(game.player.maxQi, game.player.qi + 18);
    game.player.ultEnergy = Math.min(100, game.player.ultEnergy + 8);

    SFX.playRingChime(game.combo);
    game.spawnRingBurst(ring.x, ring.y);

}

export function handlePlayerHit(game) {
    if (game.mode === 'zen') return; // 清修模式无损
    SFX.playHurt();
    game.player.lives--;
    game.player.invincibleTimer = 1.2; // 1.2s 无敌受击保护
    game.screenShakes = 14;
    game.combo = 1;
    game.showToast(I18N[getLang() === 'zh' ? 'zh' : 'en'].toastHurt);

    if (game.player.lives <= 0) {
        game.handleGameOver();
    }

}
