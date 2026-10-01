/** Entity generation and pool maintenance. */
import { CANVAS_WIDTH } from '../config.js';

export const DAILY_SPAWN_DISTANCE = 2.5;

const random = game => (typeof game.random === 'function' ? game.random() : Math.random());

export function seedStageEntities(game) {
    // 仙环 (按优雅的正弦波或连环曲线分布)
    const ringSpacing = 160;
    const initialCount = 10;
    for (let i = 0; i < initialCount; i++) {
        game.spawnRing(-i * ringSpacing - 180);
    }

    // 灵石散点
    for (let i = 0; i < 15; i++) {
        game.spawnSpiritStone(-random(game) * 1200);
    }

    // 障碍绝壁
    if (game.mode !== 'zen') {
        for (let i = 0; i < 4; i++) {
            game.spawnHazard(-300 - i * 400);
        }
    }

}

export function spawnRing(game, y) {
    const amplitude = 140;
    const x = CANVAS_WIDTH / 2 + Math.sin(y * 0.005) * amplitude;
    game.rings.push({
        x,
        y,
        rx: 34,
        ry: 18,
        angle: Math.sin(y * 0.003) * 0.35,
        passed: false,
        missed: false,
        pulse: random(game) * Math.PI * 2
    });
    game.totalRingsInStage++;

}

export function spawnSpiritStone(game, y) {
    game.spiritStones.push({
        x: 50 + random(game) * (CANVAS_WIDTH - 100),
        y,
        size: 8,
        rotation: 0,
        value: 50,
        collected: false
    });

}

export function spawnHazard(game, y) {
    // 浮空绝壁 / 太古神剑 / 阵眼
    const isLeft = random(game) > 0.5;
    const width = 100 + random(game) * 80;
    const height = 45 + random(game) * 30;
    game.hazards.push({
        x: isLeft ? width / 2 : CANVAS_WIDTH - width / 2,
        y,
        width,
        height,
        broken: false,
        type: random(game) > 0.4 ? 'cliff' : 'giant-sword'
    });

}

export function spawnThunder(game, y) {
    game.thunders.push({
        x: 60 + random(game) * (CANVAS_WIDTH - 120),
        y,
        radius: 50,
        active: false,
        chargeTime: 0,
        discharged: false
    });

}

export function spawnFiendBird(game, y) {
    game.fiendBirds.push({
        x: random(game) * CANVAS_WIDTH,
        y,
        vx: (random(game) - 0.5) * 3,
        vy: 3 + random(game) * 2,
        wingAngle: 0,
        slain: false
    });

}

export function updateSatelliteSwords(game, dt) {
    const count = game.player.swordCount - 1; // 伴生飞剑数量
    while (game.satelliteSwords.length < count) {
        game.satelliteSwords.push({
            offsetAngle: (game.satelliteSwords.length * Math.PI * 2) / Math.max(1, count),
            radius: 42,
            x: game.player.x,
            y: game.player.y,
            activeSlash: false,
            slashTimer: 0
        });
    }
    while (game.satelliteSwords.length > count) {
        game.satelliteSwords.pop();
    }

    game.satelliteSwords.forEach((sw, idx) => {
        const angle = game.swordArrayAngle + (idx * Math.PI * 2) / count;
        const currentRadius = sw.activeSlash ? 90 : sw.radius;
        sw.x = game.player.x + Math.cos(angle) * currentRadius;
        sw.y = game.player.y + Math.sin(angle) * (currentRadius * 0.6);
        if (sw.slashTimer > 0) {
            sw.slashTimer -= dt;
            if (sw.slashTimer <= 0) sw.activeSlash = false;
        }
    });

}

function spawnRandomEntities(game) {
    if (random(game) < 0.05) {
        game.spawnSpiritStone(-50);
    }
    if (game.mode !== 'zen' && random(game) < 0.02) {
        game.spawnHazard(-80);
    }
    if (game.mode !== 'zen' && (game.currentStageIndex >= 3 || game.mode === 'endless')) {
        if (random(game) < 0.012) game.spawnThunder(-100);
        if (random(game) < 0.015) game.spawnFiendBird(-100);
    }
}

export function updateSpawners(game, traveled) {
    // 生成仙环
    const lastRing = game.rings[game.rings.length - 1];
    if (!lastRing || lastRing.y > 100) {
        game.spawnRing(lastRing ? lastRing.y - 180 : -100);
    }

    if (game.mode !== 'daily') {
        spawnRandomEntities(game);
        return;
    }

    // Daily random decisions are keyed to traveled distance, so 60 Hz and
    // 120 Hz displays consume the same seeded sequence for the same course.
    game.spawnDistance = (game.spawnDistance || 0) + traveled;
    while (game.spawnDistance >= DAILY_SPAWN_DISTANCE) {
        game.spawnDistance -= DAILY_SPAWN_DISTANCE;
        spawnRandomEntities(game);
    }

}
