/** Frame scheduling and player/world movement. */
import { SFX } from '../audio.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config.js';

export function gameLoop(game, now) {
    const dt = Math.min((now - game.lastTime) / 1000, 0.1);
    game.lastTime = now;

    if (game.hitStopFrames > 0) {
        game.hitStopFrames--;
    } else if (game.isPlaying && !game.isPaused) {
        game.update(dt);
    }

    game.render();
    requestAnimationFrame((t) => game.gameLoop(t));

}

export function update(game, dt) {
    // 键盘移动支持
    let kx = 0, ky = 0;
    if (game.keys['KeyA'] || game.keys['ArrowLeft']) kx -= 1;
    if (game.keys['KeyD'] || game.keys['ArrowRight']) kx += 1;
    if (game.keys['KeyW'] || game.keys['ArrowUp']) ky -= 1;
    if (game.keys['KeyS'] || game.keys['ArrowDown']) ky += 1;

    if (kx !== 0 || ky !== 0) {
        game.player.targetX += kx * 8;
        game.player.targetY += ky * 8;
        game.player.targetX = Math.max(25, Math.min(CANVAS_WIDTH - 25, game.player.targetX));
        game.player.targetY = Math.max(45, Math.min(CANVAS_HEIGHT - 65, game.player.targetY));
    }

    // 玩家运动平滑导引与倾角物理
    const dx = game.player.targetX - game.player.x;
    const dy = game.player.targetY - game.player.y;
    game.player.vx += (dx * 10 - game.player.vx) * 0.18;
    game.player.vy += (dy * 10 - game.player.vy) * 0.18;

    game.player.x += game.player.vx * dt;
    game.player.y += game.player.vy * dt;

    // 俯冲与翱翔速度调制
    const isDashing = game.player.dashTimer > 0;
    const diveBonus = Math.max(0, (game.player.y - CANVAS_HEIGHT * 0.5) / (CANVAS_HEIGHT * 0.5)) * 4;
    game.worldSpeed = isDashing ? 14 : (game.player.baseSpeed + diveBonus);

    // 更新风声
    SFX.updateWind(game.worldSpeed / 14);

    // 剑体倾角与转向
    const targetTilt = (game.player.vx / 15) * 0.4;
    game.player.tilt += (targetTilt - game.player.tilt) * 0.2;
    game.player.angle = game.player.tilt * 0.6;

    // 剑气尾迹记录
    game.player.trailHistory.unshift({ x: game.player.x, y: game.player.y });
    if (game.player.trailHistory.length > 22) game.player.trailHistory.pop();

    // 飘带布料多节点物理
    let prevX = game.player.x;
    let prevY = game.player.y + 12;
    for (let i = 0; i < game.player.ribbonNodes.length; i++) {
        const node = game.player.ribbonNodes[i];
        const segDist = 7;
        const ndx = node.x - prevX;
        const ndy = node.y - prevY;
        const dist = Math.hypot(ndx, ndy) || 1;
        node.x = prevX + (ndx / dist) * segDist - game.player.vx * 0.04;
        node.y = prevY + (ndy / dist) * segDist + game.worldSpeed * 0.6;
        prevX = node.x;
        prevY = node.y;
    }

    // 伴生飞剑阵列公转计算
    game.swordArrayAngle += dt * 3.5;
    game.updateSatelliteSwords(dt);

    // 真气自动恢复
    if (game.player.qi < game.player.maxQi) {
        game.player.qi = Math.min(game.player.maxQi, game.player.qi + dt * 12);
    }

    // 计时器递减
    if (game.player.dashTimer > 0) game.player.dashTimer -= dt;
    if (game.player.invincibleTimer > 0) game.player.invincibleTimer -= dt;

    // 飞行里程与卷轴
    const traveled = game.worldSpeed * dt * 25;
    game.distanceSoared += Math.floor(traveled * 0.1);
    game.scrollOffset += traveled;

    // 实体生成调度
    game.updateSpawners(traveled);

    // 实体运动与碰撞判定
    game.updateEntities(dt, traveled);

    // 境界突破检测
    game.checkCultivationBreakthrough();

    // 关卡胜利检测 (九天问道)
    if (game.mode === 'stages' && game.distanceSoared >= game.stageTargetDistance) {
        game.handleStageVictory();
        return;
    }

    // 刷新 HUD
    game.updateHUD();

}
