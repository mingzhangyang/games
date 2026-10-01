/** Canvas scene renderer.  It only reads game state and paints it. */
import { TD_ART_FRAMES } from '../art.js';
import { CELL, H, W, TOWER_TYPES, clamp } from '../config.js';
import { isBuildable } from '../model/level-runtime.js';
import { enemySprites, towerBaseSprite } from './sprites.js';

export function resize(game) {
    const stage = document.querySelector('.td-stage');
    if (game.state === 'menu') {
        game.canvas.style.removeProperty('width');
        game.canvas.style.removeProperty('height');
    } else if (stage && stage.clientWidth > 0 && stage.clientHeight > 0) {
        // The immersive stage can be shorter than the logical scene on a
        // phone in landscape. Keep the full 4:3 battlefield visible and
        // center it inside the stage instead of letting CSS stretch it.
        const sceneScale = Math.min(stage.clientWidth / W, stage.clientHeight / H);
        game.canvas.style.width = `${Math.round(W * sceneScale)}px`;
        game.canvas.style.height = `${Math.round(H * sceneScale)}px`;
    }
    const rect = game.canvas.getBoundingClientRect();
    const cssW = rect.width || game.canvas.clientWidth || W;
    const cssH = rect.height || game.canvas.clientHeight || H;
    const scale = Math.min(cssW / W, cssH / H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    game.renderScale = scale * dpr;
    const pw = Math.round(W * game.renderScale);
    const ph = Math.round(H * game.renderScale);
    if (game.canvas.width !== pw || game.canvas.height !== ph) {
        game.canvas.width = pw;
        game.canvas.height = ph;
    }
    game.renderBackground(pw, ph);
    game.updateRotationPrompt();
    if (game.state === 'menu') game.drawFrame();
}
export function renderBackground(game, pw, ph) {
    game.bgCanvas.width = pw;
    game.bgCanvas.height = ph;
    const ctx = game.bgCanvas.getContext('2d');
    ctx.setTransform(game.renderScale, 0, 0, game.renderScale, 0, 0);

    const base = game.art && game.art.get('environment.battlefield');
    if (base) {
        ctx.drawImage(base, 0, 0, W, H);
    } else {
        // Reliable fallback: the game remains fully playable without art.
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0b1427');
        bg.addColorStop(0.55, '#101e32');
        bg.addColorStop(1, '#0d1828');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#20394b';
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 11; i++) {
            const bw = 28 + (i % 4) * 15;
            const bh = 26 + (i % 5) * 17;
            ctx.fillRect(i * 78 - 20, 238 - bh, bw, bh);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#172a3d';
        ctx.fillRect(0, 245, W, H - 245);
    }

    const variantKey = game.map.variant === 'singularity'
        ? 'environment.singularity'
        : game.map.variant === 'citadel' || game.map.variant === 'skyfall'
            ? 'environment.reactor'
            : game.map.variant === 'vanguard' || game.map.variant === 'juggernaut'
                ? 'environment.platform'
                : null;
    const variant = variantKey && game.art && game.art.get(variantKey);
    if (variant) ctx.drawImage(variant, 0, 0, W, H);

    // Deployment cells are matte metal plates, not a permanently glowing grid.
    for (let r = 0; r < game.map.rows; r++) {
        for (let c = 0; c < game.map.cols; c++) {
            if (game.map.pathGrid[r * game.map.cols + c]) continue;
            const x = c * CELL, y = r * CELL;
            ctx.fillStyle = (c + r) % 2 ? 'rgba(203, 232, 231, 0.025)' : 'rgba(8, 17, 30, 0.08)';
            ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
            ctx.strokeStyle = 'rgba(135, 190, 188, 0.10)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 3.5, y + 3.5, CELL - 7, CELL - 7);
            ctx.fillStyle = 'rgba(154, 222, 213, 0.24)';
            ctx.fillRect(x + 6, y + 6, 3, 3);
        }
    }

    const pathPts = game.map.groundPath.pts;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pathPts[0].x, pathPts[0].y);
    for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
    ctx.strokeStyle = '#0a1523';
    ctx.lineWidth = CELL - 5;
    ctx.stroke();
    ctx.strokeStyle = '#213b4a';
    ctx.lineWidth = CELL - 10;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(116, 223, 210, 0.42)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 13]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Track bolts and junction markers add material definition without
    // taking over the gameplay silhouette.
    for (let i = 1; i < pathPts.length - 1; i++) {
        ctx.fillStyle = 'rgba(173, 228, 219, 0.55)';
        ctx.beginPath();
        ctx.arc(pathPts[i].x, pathPts[i].y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(104, 191, 188, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pathPts[i].x, pathPts[i].y, 8, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Aerial route is a sparse beacon line and only exists in operations
    // that actually deploy flyers.
    if (game.level && game.level.modifiers && game.level.modifiers.flyers) {
        const air = game.map.airPath.pts;
        ctx.beginPath();
        ctx.moveTo(air[0].x, air[0].y);
        for (let i = 1; i < air.length; i++) ctx.lineTo(air[i].x, air[i].y);
        ctx.strokeStyle = 'rgba(213, 165, 246, 0.11)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 12]);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 1; i < air.length - 1; i++) {
            ctx.fillStyle = 'rgba(234, 192, 255, 0.42)';
            ctx.beginPath();
            ctx.arc(air[i].x, air[i].y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Facility edge labels and a restrained scan line make the arena feel
    // authored even when all optional production art is unavailable.
    ctx.fillStyle = 'rgba(174, 224, 218, 0.42)';
    ctx.font = '700 8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.letterSpacing = '0.14em';
    ctx.fillText(`${String(game.map.variant).toUpperCase()} / GRID ${game.map.cols}×${game.map.rows}`, 18, H - 14);
    ctx.fillStyle = 'rgba(235, 191, 111, 0.48)';
    ctx.fillText('CORE ACCESS', W - 88, H - 14);
}

export function drawFrame(game) {
    const ctx = game.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, game.canvas.width, game.canvas.height);

    // 静态背景层
    ctx.drawImage(game.bgCanvas, 0, 0);

    // 震屏变换
    let shakeX = 0, shakeY = 0;
    if (game.shakeDur > 0 && game.shakeMag > 0) {
        shakeX = (Math.random() - 0.5) * game.shakeMag;
        shakeY = (Math.random() - 0.5) * game.shakeMag;
    }
    ctx.setTransform(
        game.renderScale, 0, 0, game.renderScale,
        shakeX * game.renderScale, shakeY * game.renderScale
    );

    // 赛博光脉冲沿路径流动
    if (game.state === 'playing') {
        const pathTotal = game.map.groundPath.total;
        const pulseDist = (game.time * 95) % pathTotal;
        const pt1 = game.map.groundPath.pointAt(pulseDist);
        const pt2 = game.map.groundPath.pointAt((pulseDist + pathTotal * 0.5) % pathTotal);
        [pt1, pt2].forEach(p => {
            ctx.fillStyle = 'rgba(64,216,255,0.7)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // 入口动态传送门
    const entry = game.map.groundPath.pointAt(26);
    ctx.save();
    ctx.translate(entry.x, entry.y);
    ctx.rotate(game.time * 2.5);
    ctx.strokeStyle = '#ff6b7a';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 核心基地（旋转防护六角形）
    const pathPts = game.map.groundPath.pts;
    const core = pathPts[pathPts.length - 1];
    ctx.save();
    ctx.translate(core.x, Math.min(H - 24, core.y - 14));
    ctx.rotate(-game.time * 0.9);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(ang) * 16, py = Math.sin(ang) * 16;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#12204a';
    ctx.fill();
    ctx.strokeStyle = game.coreFlash > 0 ? '#ff6b7a' : '#40d8ff';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // 核心能量水晶
    ctx.rotate(game.time * 1.8);
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = game.coreFlash > 0 ? '#ff6b7a' : '#40d8ff';
    ctx.fill();
    ctx.restore();

    // 全局射程透视
    if (game.showAllRanges) {
        for (const tower of game.towers) {
            if (!tower) continue;
            const cfg = TOWER_TYPES[tower.type];
            const lv = cfg.levels[tower.level];
            ctx.beginPath();
            ctx.arc(tower.x, tower.y, lv.range, 0, Math.PI * 2);
            ctx.strokeStyle = cfg.color + '26';
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }
    }

    // 选定塔 / 空格射程预览
    if (game.preview) {
        ctx.beginPath();
        ctx.arc(game.preview.x, game.preview.y, game.preview.range, 0, Math.PI * 2);
        ctx.fillStyle = game.preview.color + '14';
        ctx.fill();
        ctx.strokeStyle = game.preview.color + '66';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 下级升级射程预览虚线
        if (game.preview.nextRange) {
            ctx.beginPath();
            ctx.arc(game.preview.x, game.preview.y, game.preview.nextRange, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffd34d88';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 选定塔的当前锁敌指示准星与激光瞄准线
        if (game.selectedTowerIdx >= 0 && game.towers[game.selectedTowerIdx]) {
            const tower = game.towers[game.selectedTowerIdx];
            const target = game.pickTarget(tower, game.preview.range);
            if (target) {
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = 'rgba(255, 107, 122, 0.65)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(tower.x, tower.y);
                ctx.lineTo(target.x, target.y);
                ctx.stroke();
                ctx.setLineDash([]);

                // 目标准星
                ctx.strokeStyle = '#ff6b7a';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.arc(target.x, target.y, target.r + 5, 0, Math.PI * 2);
                ctx.stroke();

                // 准星十字刻度
                ctx.beginPath();
                ctx.moveTo(target.x - target.r - 8, target.y); ctx.lineTo(target.x - target.r - 2, target.y);
                ctx.moveTo(target.x + target.r + 2, target.y); ctx.lineTo(target.x + target.r + 8, target.y);
                ctx.moveTo(target.x, target.y - target.r - 8); ctx.lineTo(target.x, target.y - target.r - 2);
                ctx.moveTo(target.x, target.y + target.r + 2); ctx.lineTo(target.x, target.y + target.r + 8);
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    // 地面火海危害
    for (const g of game.groundHazards) {
        const grad = ctx.createRadialGradient(g.x, g.y, g.r * 0.2, g.x, g.y, g.r);
        grad.addColorStop(0, 'rgba(255, 159, 67, 0.42)');
        grad.addColorStop(1, 'rgba(255, 107, 122, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
        ctx.fill();
    }

    // 选中格高亮
    if (game.selectedCell) {
        const { c, r } = game.selectedCell;
        ctx.strokeStyle = 'rgba(94,234,176,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 7);
        ctx.stroke();
    } else if (game.hoverCell && game.state === 'playing' && isBuildable(game.map, game.hoverCell.c, game.hoverCell.r) && game.towerAt(game.hoverCell.c, game.hoverCell.r) < 0) {
        ctx.strokeStyle = 'rgba(64,216,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(game.hoverCell.c * CELL + 3, game.hoverCell.r * CELL + 3, CELL - 6, CELL - 6, 6);
        ctx.stroke();
    }

    // 防御塔渲染
    for (const tower of game.towers) {
        if (!tower) continue;
        game.drawTower(ctx, tower);
    }
    // 敌人渲染
    for (const e of game.enemies) {
        // 飞行单位投影到地面，提示它不在路径上
        if (e.flying) {
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.ellipse(e.x, e.y + 16, e.r * 0.9, e.r * 0.38, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        const enemyFrame = TD_ART_FRAMES.enemies[e.type];
        const hasProductionEnemy = enemyFrame !== undefined && game.art && game.art.has('enemies.atlas');
        if (hasProductionEnemy) {
            const enemySize = clamp(e.r * 3.35, 22, e.type === 'overlord' ? 68 : 58);
            game.art.drawAtlas(ctx, 'enemies.atlas', enemyFrame, e.x, e.y, enemySize);
        } else {
            const sprite = enemySprites[e.type];
            if (sprite) ctx.drawImage(sprite, e.x - sprite.width / 2, e.y - sprite.height / 2);
        }

        // 治疗兵：脉动的治疗光环 + 与受疗目标的连线
        if (e.healer) {
            const pulse = 0.5 + Math.sin(game.time * 3.4) * 0.5;
            ctx.strokeStyle = `rgba(134, 239, 172, ${0.22 + pulse * 0.24})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.healer.radius, 0, Math.PI * 2);
            ctx.stroke();

            // 十字标，一眼认出是奶妈
            ctx.strokeStyle = '#dcfce7';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(e.x, e.y - e.r - 7);
            ctx.lineTo(e.x, e.y - e.r - 1);
            ctx.moveTo(e.x - 3, e.y - e.r - 4);
            ctx.lineTo(e.x + 3, e.y - e.r - 4);
            ctx.stroke();
        }

        // 装甲兵：外圈装甲板示意
        if (e.armor > 0) {
            ctx.strokeStyle = 'rgba(226, 232, 240, 0.85)';
            ctx.lineWidth = 2.6;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r + 2.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 攻城兵：炮口指向最近的目标塔
        if (e.attacker) {
            const tgt = game.nearestTower(e, e.attacker.range);
            if (tgt) {
                ctx.strokeStyle = 'rgba(251, 113, 133, 0.5)';
                ctx.lineWidth = 1.3;
                ctx.setLineDash([3, 4]);
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(tgt.x, tgt.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // 冰冻 / 眩晕电流标志
        if (game.time < e.stunUntil) {
            ctx.strokeStyle = '#40d8ff';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 护盾光环
        if (e.shield > 0) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r + 3.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 受击白闪
        if (e.hitFlash > 0) {
            ctx.globalAlpha = Math.min(1, e.hitFlash * 8);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // 血条与护盾条
        if (e.hp < e.maxHp || e.shield > 0) {
            const bw = e.r * 2.2;
            const frac = Math.max(0, e.hp / e.maxHp);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(e.x - bw / 2, e.y - e.r - 8, bw, 3.5);
            ctx.fillStyle = frac > 0.5 ? '#3fd97c' : frac > 0.25 ? '#ffd34d' : '#ff6b7a';
            ctx.fillRect(e.x - bw / 2, e.y - e.r - 8, bw * frac, 3.5);

            if (e.shield > 0 && e.maxShield > 0) {
                const sFrac = Math.max(0, e.shield / e.maxShield);
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw * sFrac, 2.5);
            }
        }
    }

    // 子弹渲染：不同武器使用不同材质语言，光效只在弹体/命中瞬间出现。
    ctx.globalCompositeOperation = 'lighter';
    for (const p of game.projectiles) {
        const tx = p.target && !p.target.dead ? p.target.x : p.lastX;
        const ty = p.target && !p.target.dead ? p.target.y : p.lastY;
        const angle = Math.atan2(ty - p.y, tx - p.x);
        if (p.kind === 'shell') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(angle);
            ctx.fillStyle = '#e6b873';
            ctx.fillRect(-5, -3, 10, 6);
            ctx.fillStyle = p.color;
            ctx.fillRect(-1, -2, 7, 4);
            ctx.restore();
        } else {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.isCrit ? 3 : 1.8;
            ctx.globalAlpha = 0.38;
            ctx.beginPath();
            ctx.moveTo(p.x - Math.cos(angle) * 12, p.y - Math.sin(angle) * 12);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = p.isCrit ? '#fff0ae' : p.color;
            ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        }
    }

    // 特效渲染
    for (const fx of game.effects) {
        const t = fx.age / fx.life;
        ctx.globalAlpha = 1 - t;
        if (fx.kind === 'impact') {
            const size = 22 + t * 12;
            if (game.art && game.art.has('fx.atlas')) {
                game.art.drawAtlas(ctx, 'fx.atlas', fx.frame, fx.x, fx.y, size, 1 - t);
            } else {
                ctx.strokeStyle = '#d7fff7';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, size * 0.4, 0, Math.PI * 2);
                ctx.stroke();
            }
        } else if (fx.kind === 'ring' || fx.kind === 'emp_wave') {
            ctx.strokeStyle = fx.kind === 'emp_wave' ? '#40d8ff' : fx.color;
            ctx.lineWidth = fx.kind === 'emp_wave' ? 4 : 2.5;
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI * 2);
            ctx.stroke();
        } else if (fx.kind === 'zap') {
            ctx.strokeStyle = fx.color;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            for (let i = 0; i < fx.pts.length - 1; i++) {
                const a = fx.pts[i], b = fx.pts[i + 1];
                ctx.moveTo(a.x, a.y);
                const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 12;
                const my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 12;
                ctx.lineTo(mx, my);
                ctx.lineTo(b.x, b.y);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // 粒子渲染
    for (const pt of game.particles) {
        const alpha = 1 - pt.age / pt.life;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 漂浮文字
    for (const f of game.floaters) {
        ctx.globalAlpha = 1 - f.age / f.life;
        ctx.fillStyle = f.color;
        const fontSz = Math.round(13 * (f.scale || 1));
        ctx.font = `800 ${fontSz}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // BOSS / 霸主 血条（当场上有 BOSS 时在顶部渲染）
    const boss = game.enemies.find(e => (e.type === 'boss' || e.type === 'overlord') && !e.dead);
    if (boss) {
        const isOverlord = boss.type === 'overlord';
        const bx = W / 2 - 130, by = 12, bw = 260, bh = 14;
        ctx.fillStyle = 'rgba(10, 14, 36, 0.85)';
        ctx.strokeStyle = isOverlord ? '#e11d48' : '#ff5a3c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 7);
        ctx.fill();
        ctx.stroke();

        const hpRatio = clamp(boss.hp / boss.maxHp, 0, 1);
        const bGrad = ctx.createLinearGradient(bx, by, bx + bw, by);
        bGrad.addColorStop(0, isOverlord ? '#e11d48' : '#ff5a3c');
        bGrad.addColorStop(1, '#ffd34d');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.roundRect(bx + 2, by + 2, (bw - 4) * hpRatio, bh - 4, 5);
        ctx.fill();

        ctx.font = '800 10px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        const tag = isOverlord ? 'OVERLORD' : 'BOSS';
        ctx.fillText(`${tag} · ${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`, W / 2, by + 11);
    }

    // 全息波次通告横幅
    if (game.waveBanner) {
        const b = game.waveBanner;
        const progress = b.age / b.life;
        const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.7 ? (1 - progress) / 0.3 : 1;
        const cy = H * 0.36;
        ctx.save();
        ctx.fillStyle = b.isBoss ? `rgba(255, 90, 60, ${alpha * 0.18})` : `rgba(64, 216, 255, ${alpha * 0.14})`;
        ctx.fillRect(0, cy - 24, W, 48);
        ctx.strokeStyle = b.isBoss ? `rgba(255, 90, 60, ${alpha * 0.65})` : `rgba(64, 216, 255, ${alpha * 0.55})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, cy - 24); ctx.lineTo(W, cy - 24);
        ctx.moveTo(0, cy + 24); ctx.lineTo(W, cy + 24);
        ctx.stroke();

        ctx.font = '900 22px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = b.isBoss ? `rgba(255, 211, 77, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
        ctx.shadowColor = b.isBoss ? '#ff5a3c' : '#40d8ff';
        ctx.shadowBlur = 14;
        ctx.fillText(b.text, W / 2, b.sub ? cy - 7 : cy);

        // 压波提示：告诉玩家这一波额外承受了多少强度
        if (b.sub) {
            ctx.font = '800 12px "Segoe UI", system-ui, sans-serif';
            ctx.fillStyle = `rgba(255, 176, 160, ${alpha})`;
            ctx.shadowBlur = 8;
            ctx.fillText(b.sub, W / 2, cy + 13);
        }
        ctx.restore();
    }

    // 核心受击全屏红光
    if (game.coreFlash > 0) {
        ctx.fillStyle = `rgba(255,60,60,${game.coreFlash * 0.5})`;
        ctx.fillRect(0, 0, W, H);
    }
}

export function drawTower(game, ctx, tower) {
    const cfg = TOWER_TYPES[tower.type];
    const cx = tower.x, cy = tower.y;

    const productionFrame = TD_ART_FRAMES.towers[tower.type];
    const hasProductionSprite = productionFrame !== undefined
            && game.art
            && game.art.has('towers.atlas');
    if (!hasProductionSprite) {
        ctx.drawImage(towerBaseSprite, tower.c * CELL, tower.r * CELL);
    }

    // 战术超频高能光环
    if (game.time < game.overdriveUntil) {
        ctx.strokeStyle = 'rgba(255, 180, 84, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 18 + Math.sin(game.time * 8) * 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    // 4阶觉醒皇冠光芒
    if (tower.level === 3) {
        ctx.strokeStyle = '#ffd34d88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 17, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tower.angle);

    if (hasProductionSprite) {
        game.art.drawAtlas(ctx, 'towers.atlas', productionFrame, 0, 0, 56);
    } else if (tower.type === 'pulse') {
        ctx.fillStyle = cfg.color;
        ctx.fillRect(0, -3.5, 16, 7);
        ctx.beginPath();
        ctx.arc(16, 0, tower.level === 3 ? 4.5 : 3.4, 0, Math.PI * 2);
        ctx.fill();
    } else if (tower.type === 'cannon') {
        ctx.fillStyle = '#1a2148';
        ctx.fillRect(-2, -6, 21, 12);
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(-2, -6, 21, 12);
        ctx.fillStyle = cfg.color;
        ctx.beginPath();
        ctx.arc(19, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
    } else if (tower.type === 'tesla') {
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 2;
        const orbR = 7 + Math.sin(game.time * 6) * 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, orbR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -orbR - 5); ctx.lineTo(0, -orbR + 1);
        ctx.moveTo(0, orbR + 5); ctx.lineTo(0, orbR - 1);
        ctx.stroke();
    } else if (tower.type === 'frost') {
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const ang = (i / 3) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * -10, Math.sin(ang) * -10);
            ctx.lineTo(Math.cos(ang) * 10, Math.sin(ang) * 10);
            ctx.stroke();
        }
    }
    ctx.restore();

    // 等级指示点
    const lv = tower.level + 1;
    for (let i = 0; i < lv; i++) {
        ctx.beginPath();
        ctx.arc(tower.x - (lv - 1) * 3.5 + i * 7, tower.y + 14, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = tower.level === 3 ? '#ffd34d' : '#ffffff';
        ctx.fill();
    }

    // 受损闪烁
    if (tower.hurtFlash > 0) {
        tower.hurtFlash -= 1 / 60;
        ctx.globalAlpha = Math.min(1, tower.hurtFlash * 5);
        ctx.fillStyle = '#ff6b7a';
        ctx.beginPath();
        ctx.roundRect(tower.c * CELL + 3, tower.r * CELL + 3, CELL - 6, CELL - 6, 8);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // 受损血条：只在掉血后出现，避免平时画面变乱
    const maxHp = game.towerMaxHp(tower);
    if (tower.hp !== undefined && tower.hp < maxHp) {
        const frac = clamp(tower.hp / maxHp, 0, 1);
        const bw = CELL - 12;
        const bx = tower.c * CELL + 6;
        const by = tower.r * CELL + CELL - 7;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(bx, by, bw, 3.5);
        ctx.fillStyle = frac > 0.5 ? '#3fd97c' : frac > 0.25 ? '#ffd34d' : '#ff6b7a';
        ctx.fillRect(bx, by, bw * frac, 3.5);
    }
}
