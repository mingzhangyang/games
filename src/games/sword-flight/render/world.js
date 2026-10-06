/** Canvas sizing and world/entity rendering. */
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../config.js';

export function resizeCanvas(game) {
    // The logical world stays 480×640, but portrait mobile intentionally lets the
    // CSS stage become taller than that ratio. Size the backing buffer from the
    // rendered box on both axes so the browser never has to upscale a short bitmap.
    // Separate transforms preserve logical coordinates while matching the CSS mapping.
    const canvas = game.canvas;
    const ctx = game.ctx;
    if (!canvas || !ctx) return;

    const stage = canvas.parentElement;
    const cssW = stage?.clientWidth || canvas.clientWidth || CANVAS_WIDTH;
    const cssH = stage?.clientHeight || canvas.clientHeight || CANVAS_HEIGHT;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelW = Math.max(1, Math.round(cssW * dpr));
    const pixelH = Math.max(1, Math.round(cssH * dpr));
    const scaleX = pixelW / CANVAS_WIDTH;
    const scaleY = pixelH / CANVAS_HEIGHT;

    if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
    }
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    game.dpr = dpr;
}

export function initBackgrounds(game) {
    // 九天星辰 (Twinkling Stars in Sky Dome)
    game.stars = [];
    for (let i = 0; i < 42; i++) {
        game.stars.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * CANVAS_HEIGHT,
            size: 0.8 + Math.random() * 1.8,
            alpha: 0.35 + Math.random() * 0.65,
            twinkleSpeed: 0.02 + Math.random() * 0.04,
            twinklePhase: Math.random() * Math.PI * 2,
            speedFactor: 0.06 + Math.random() * 0.1
        });
    }

    // 山峰轮廓点生成
    game.mountains = [
        game.generateMountainLayer(CANVAS_HEIGHT * 0.45, 120, 0.25),
        game.generateMountainLayer(CANVAS_HEIGHT * 0.60, 90, 0.45),
        game.generateMountainLayer(CANVAS_HEIGHT * 0.78, 60, 0.70)
    ];

    // 灵气浮云
    game.clouds = [];
    for (let i = 0; i < 16; i++) {
        game.clouds.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * CANVAS_HEIGHT * 1.5,
            radius: 45 + Math.random() * 60,
            speedFactor: 0.3 + Math.random() * 0.6,
            opacity: 0.18 + Math.random() * 0.28
        });
    }

    // 悬浮仙岛 (具有悬泉飞瀑、苍劲古松与重檐仙阁)
    game.floatingIslands = [
        { x: 95, y: -200, width: 110, height: 52, speedFactor: 0.35, hasWaterfall: true, hasPine: true },
        { x: 345, y: -750, width: 135, height: 64, speedFactor: 0.35, hasWaterfall: true, hasPine: true },
        { x: 210, y: -1350, width: 115, height: 55, speedFactor: 0.35, hasWaterfall: false, hasPine: true }
    ];

    // 飘落仙桃灵瓣 / 灵光微粒
    game.petals = [];
    for (let i = 0; i < 24; i++) {
        game.petals.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * CANVAS_HEIGHT,
            speedX: (Math.random() - 0.5) * 1.5,
            speedY: 1.5 + Math.random() * 2,
            size: 2 + Math.random() * 3,
            angle: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.05
        });
    }

}

export function generateMountainLayer(game, baseY, variance, speedFactor) {
    const points = [];
    const segCount = 18;
    const segWidth = (CANVAS_WIDTH + 100) / segCount;
    for (let i = 0; i <= segCount + 2; i++) {
        points.push({
            x: (i - 1) * segWidth,
            y: baseY + (Math.sin(i * 1.2) * 0.6 + Math.cos(i * 0.8) * 0.4) * variance
        });
    }
    return { points, speedFactor, baseY };

}

export function render(game) {
    const ctx = game.ctx;
    ctx.save();

    // 震屏位移
    if (game.screenShakes > 0) {
        const shakeX = (Math.random() - 0.5) * game.screenShakes;
        const shakeY = (Math.random() - 0.5) * game.screenShakes;
        ctx.translate(shakeX, shakeY);
        game.screenShakes *= 0.88;
        if (game.screenShakes < 0.5) game.screenShakes = 0;
    }

    // 1. 绘制天境穹顶与远景渐变
    game.renderSkyDome(ctx);

    // 2. 绘制多重视差山峰
    game.renderMountains(ctx);

    // 3. 绘制灵气浮云
    game.renderClouds(ctx);

    // 4. 绘制悬浮仙岛
    game.renderFloatingIslands(ctx);

    // 5. 绘制仙环
    game.renderRings(ctx);

    // 6. 绘制灵石与仙露
    game.renderSpiritStones(ctx);

    // 7. 绘制悬浮绝壁与巨剑残骸
    game.renderHazards(ctx);

    // 8. 绘制九天玄雷
    game.renderThunders(ctx);

    // 9. 绘制幽冥魔禽
    game.renderFiendBirds(ctx);

    // 10. 绘制玩家飞剑与剑仙主体
    game.renderPlayer(ctx);

    // 11. 绘制伴生飞剑阵列
    game.renderSatelliteSwords(ctx);

    // 12. 绘制灵华花瓣与粒子
    game.renderParticles(ctx);

    ctx.restore();

}

export function renderSkyDome(game, ctx) {
    // 根据不同关卡定制的天际配色 (天顶墨色、天心霞光、云海交际、高光神韵)
    const palettes = [
        ['#020816', '#061a30', '#0a2d4b', '#38bdf8'], // 1. 青峦破晓
        ['#12071a', '#361026', '#6b2014', '#fbbf24'], // 2. 暮霞落日
        ['#040714', '#0d182b', '#1e2c4a', '#818cf8'], // 3. 剑冢古道
        ['#010e17', '#032638', '#07485e', '#34d399'], // 4. 极光碧霄
        ['#040313', '#110c2c', '#201140', '#c084fc'], // 5. 星河浩瀚
        ['#080415', '#1a0932', '#3e1578', '#a855f7'], // 6. 劫雷云海
        ['#170505', '#330c0a', '#6b182a', '#f97316'], // 7. 炽焰焚天
        ['#020206', '#090514', '#170923', '#64748b'], // 8. 九幽罡风
        ['#061022', '#122547', '#254b85', '#fef08a']  // 9. 登仙九霄
    ];
    const p = palettes[game.currentStageIndex % palettes.length];
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, p[0]);
    grad.addColorStop(0.55, p[1]);
    grad.addColorStop(1, p[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. 九天星辰流转 (Twinkling Celestial Stars)
    if (game.stars) {
        ctx.save();
        const now = Date.now() * 0.003;
        game.stars.forEach((st) => {
            const twinkle = Math.sin(now * st.twinkleSpeed * 50 + st.twinklePhase) * 0.35 + 0.65;
            ctx.fillStyle = `rgba(255, 255, 255, ${st.alpha * twinkle})`;
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    // 2. 苍穹晨曦/皓月神光 (Celestial Sun/Moon Aura)
    ctx.save();
    const sunX = CANVAS_WIDTH * 0.78;
    const sunY = -20;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 340);
    sunGlow.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
    sunGlow.addColorStop(0.3, 'rgba(251, 191, 36, 0.12)');
    sunGlow.addColorStop(0.7, `${p[3]}18`);
    sunGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 3. 丁达尔神光破云而下 (Tyndall God-Rays Streaming Down)
    const rayAngle = 0.22;
    ctx.save();
    ctx.translate(sunX, sunY);
    ctx.rotate(rayAngle);
    for (let i = -3; i <= 3; i++) {
        const rayW = 35 + Math.abs(i) * 10;
        const rayGrad = ctx.createLinearGradient(0, 0, 0, 520);
        rayGrad.addColorStop(0, 'rgba(254, 240, 138, 0.08)');
        rayGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.03)');
        rayGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(i * 45 - rayW / 2, 0);
        ctx.lineTo(i * 65 - rayW, 550);
        ctx.lineTo(i * 65 + rayW, 550);
        ctx.lineTo(i * 45 + rayW / 2, 0);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    ctx.restore();

}

export function renderMountains(game, ctx) {
    // 青绿与水墨金碧层级 (3层视差山海：远山如黛、中景险峰、近景墨峦)
    const mountainConfigs = [
        {
            fill: 'rgba(5, 22, 42, 0.52)',
            stroke: 'rgba(56, 189, 248, 0.3)',
            strokeWidth: 1.2,
            mistColor: 'rgba(12, 38, 68, 0.38)'
        },
        {
            fill: 'rgba(8, 32, 58, 0.78)',
            stroke: 'rgba(251, 191, 36, 0.45)', // 金碧皴法勾金山脊
            strokeWidth: 1.6,
            mistColor: 'rgba(16, 50, 85, 0.52)'
        },
        {
            fill: 'rgba(10, 42, 75, 0.96)',
            stroke: 'rgba(56, 189, 248, 0.65)',
            strokeWidth: 2,
            mistColor: 'rgba(18, 62, 105, 0.68)'
        }
    ];

    game.mountains.forEach((m, idx) => {
        const cfg = mountainConfigs[idx] || mountainConfigs[0];
        ctx.save();

        // 山峦主体
        ctx.fillStyle = cfg.fill;
        ctx.beginPath();
        ctx.moveTo(-40, CANVAS_HEIGHT);
        m.points.forEach((pt, i) => {
            const py = pt.y + Math.sin((game.scrollOffset * m.speedFactor * 0.02) + i) * 6;
            if (i === 0) ctx.lineTo(pt.x, py);
            else ctx.lineTo(pt.x, py);
        });
        ctx.lineTo(CANVAS_WIDTH + 40, CANVAS_HEIGHT);
        ctx.closePath();
        ctx.fill();

        // 金碧勾金山脊线 (Golden Mountain Ridge Highlights)
        ctx.strokeStyle = cfg.stroke;
        ctx.lineWidth = cfg.strokeWidth;
        ctx.beginPath();
        m.points.forEach((pt, i) => {
            const py = pt.y + Math.sin((game.scrollOffset * m.speedFactor * 0.02) + i) * 6;
            if (i === 0) ctx.moveTo(pt.x, py);
            else ctx.lineTo(pt.x, py);
        });
        ctx.stroke();

        // 山腰白霭烟岚 (Valley Mist Ribbon)
        const mistY = m.baseY + 25;
        const mistGrad = ctx.createLinearGradient(0, mistY - 18, 0, mistY + 32);
        mistGrad.addColorStop(0, 'transparent');
        mistGrad.addColorStop(0.5, cfg.mistColor);
        mistGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = mistGrad;
        ctx.fillRect(0, mistY - 18, CANVAS_WIDTH, 50);

        ctx.restore();
    });

}

export function renderClouds(game, ctx) {
    ctx.save();
    game.clouds.forEach((c) => {
        // 国风如意祥云 (多瓣祥云头 + 金边晨曦流光)
        ctx.save();
        ctx.translate(c.x, c.y);

        const r = c.radius;
        // 祥云主晕
        const cloudGrad = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
        cloudGrad.addColorStop(0, `rgba(240, 249, 255, ${c.opacity * 1.15})`);
        cloudGrad.addColorStop(0.5, `rgba(186, 230, 253, ${c.opacity * 0.75})`);
        cloudGrad.addColorStop(0.85, `rgba(125, 211, 252, ${c.opacity * 0.35})`);
        cloudGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = cloudGrad;

        // 绘制由数个祥云如意瓣组合成的云团
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
        ctx.arc(-r * 0.45, r * 0.15, r * 0.55, 0, Math.PI * 2);
        ctx.arc(r * 0.45, r * 0.15, r * 0.55, 0, Math.PI * 2);
        ctx.arc(-r * 0.25, -r * 0.35, r * 0.45, 0, Math.PI * 2);
        ctx.arc(r * 0.25, -r * 0.35, r * 0.45, 0, Math.PI * 2);
        ctx.fill();

        // 祥云金边朝阳流光 (Golden Cloud Crest Rim)
        ctx.strokeStyle = `rgba(254, 240, 138, ${c.opacity * 0.65})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, -r * 0.15, r * 0.6, -Math.PI * 0.85, -Math.PI * 0.15);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(-r * 0.35, -r * 0.25, r * 0.35, -Math.PI * 0.9, -Math.PI * 0.2);
        ctx.stroke();

        ctx.restore();
    });
    ctx.restore();

}

export function renderFloatingIslands(game, ctx) {
    game.floatingIslands.forEach((isl) => {
        const iy = isl.y + (game.scrollOffset * isl.speedFactor) % (CANVAS_HEIGHT + 600) - 300;
        ctx.save();
        ctx.translate(isl.x, iy);

        const w = isl.width;
        const h = isl.height;

        // 1. 悬泉瀑布飞流直下 (Cascading Waterfall)
        if (isl.hasWaterfall) {
            const wfGrad = ctx.createLinearGradient(0, 0, 0, h + 38);
            wfGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            wfGrad.addColorStop(0.3, 'rgba(125, 211, 252, 0.75)');
            wfGrad.addColorStop(0.8, 'rgba(56, 189, 248, 0.35)');
            wfGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = wfGrad;

            ctx.beginPath();
            ctx.moveTo(-w * 0.22, 2);
            ctx.lineTo(-w * 0.15, 2);
            ctx.lineTo(-w * 0.13, h + 38);
            ctx.lineTo(-w * 0.24, h + 38);
            ctx.closePath();
            ctx.fill();

            // 瀑布跌落水汽云团
            ctx.fillStyle = 'rgba(224, 242, 254, 0.35)';
            ctx.beginPath();
            ctx.arc(-w * 0.18, h + 34, 6.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. 仙岛奇岩绝壁岩体 (Craggy Ancient Rock Base)
        ctx.fillStyle = '#0a1d33';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.quadraticCurveTo(-w * 0.35, -h * 0.3, 0, -h * 0.35);
        ctx.quadraticCurveTo(w * 0.35, -h * 0.3, w / 2, 0);
        // 嶙峋岩壁与底部尖岩
        ctx.lineTo(w * 0.35, h * 0.35);
        ctx.lineTo(w * 0.15, h * 0.75);
        ctx.lineTo(0, h);
        ctx.lineTo(-w * 0.2, h * 0.65);
        ctx.lineTo(-w * 0.38, h * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 岛岩青绿苔原与灵矿石纹 (Mineral Veins)
        ctx.fillStyle = '#0f766e'; // 翡翠青苔
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.quadraticCurveTo(-w * 0.25, -h * 0.35, 0, -h * 0.35);
        ctx.quadraticCurveTo(w * 0.25, -h * 0.35, w / 2, 0);
        ctx.lineTo(w * 0.45, 4);
        ctx.quadraticCurveTo(0, 6, -w * 0.45, 4);
        ctx.closePath();
        ctx.fill();

        // 倒垂悬岩仙藤 (Hanging Roots & Vines)
        ctx.strokeStyle = '#065f46';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.1, h * 0.5); ctx.lineTo(-w * 0.12, h * 0.85);
        ctx.moveTo(w * 0.1, h * 0.45); ctx.lineTo(w * 0.08, h * 0.75);
        ctx.stroke();

        // 3. 绝壁迎客仙松 (Ancient Cliff Pine)
        if (isl.hasPine) {
            ctx.save();
            ctx.translate(-w * 0.32, -h * 0.28);
            // 苍劲松干
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(-14, -8, -20, -6);
            ctx.stroke();
            // 墨翠松针云团
            ctx.fillStyle = '#064e3b';
            ctx.beginPath();
            ctx.arc(-18, -10, 6, 0, Math.PI * 2);
            ctx.arc(-24, -6, 5, 0, Math.PI * 2);
            ctx.arc(-14, -6, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 4. 凌霄仙阁与飞檐琉璃 (Classical Xianxia Lingxiao Pavilion)
        ctx.save();
        ctx.translate(w * 0.08, -h * 0.35);

        // 朱红廊柱与台基
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-10, -12, 3, 12); // 左柱
        ctx.fillRect(7, -12, 3, 12);  // 右柱
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-12, 0, 24, 2.5); // 玉石基座

        // 阁楼中堂与明瓦
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-6, -10, 12, 8);

        // 下层重檐飞角 (Lower Eaves)
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.moveTo(-16, -11);
        ctx.quadraticCurveTo(0, -14, 16, -11);
        ctx.lineTo(13, -14);
        ctx.lineTo(-13, -14);
        ctx.closePath();
        ctx.fill();
        // 翘角飞檐
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-16, -11); ctx.lineTo(-18, -14);
        ctx.moveTo(16, -11); ctx.lineTo(18, -14);
        ctx.stroke();

        // 上层宝顶飞檐 (Upper Imperial Gold Roof)
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(-14, -18);
        ctx.lineTo(0, -26);
        ctx.lineTo(14, -18);
        ctx.quadraticCurveTo(0, -20, -14, -18);
        ctx.closePath();
        ctx.fill();

        // 顶端避火宝珠 / 仙葫芦
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, -27, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        ctx.restore();
    });

}

export function renderRings(game, ctx) {
    const anim = Date.now() * 0.003;
    game.rings.forEach((r) => {
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.angle);

        const scalePulse = 1 + Math.sin(r.pulse) * 0.05;
        ctx.scale(scalePulse, scalePulse);

        // 仙环外圈五行罡芒
        ctx.strokeStyle = r.passed ? 'rgba(56, 189, 248, 0.4)' : 'rgba(251, 191, 36, 0.95)';
        ctx.lineWidth = r.passed ? 2.5 : 5;
        ctx.shadowColor = r.passed ? '#38bdf8' : '#fbbf24';
        ctx.shadowBlur = r.passed ? 6 : 18;

        // 仙环外金轮
        ctx.beginPath();
        ctx.ellipse(0, 0, r.rx, r.ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 环身八方乾坤符印星位 (Rotating Celestial Runic Nodes)
        if (!r.passed) {
            ctx.save();
            ctx.shadowBlur = 0;
            const nodeCount = 8;
            for (let i = 0; i < nodeCount; i++) {
                const na = (i / nodeCount) * Math.PI * 2 + anim;
                const nx = Math.cos(na) * r.rx;
                const ny = Math.sin(na) * r.ry;
                ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#fef08a';
                ctx.beginPath();
                ctx.arc(nx, ny, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }

            // 环内太极云涡与流光星璇
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, r.rx * 0.72, r.ry * 0.72, 0, 0, Math.PI * 2);
            ctx.stroke();

            // 核心聚灵清光 (Inner Ethereal Portal Sheen)
            const coreGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, r.rx * 0.65);
            coreGrad.addColorStop(0, 'rgba(254, 240, 138, 0.35)');
            coreGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.15)');
            coreGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.ellipse(0, 0, r.rx * 0.7, r.ry * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    });

}

export function renderSpiritStones(game, ctx) {
    const anim = Date.now() * 0.004;
    game.spiritStones.forEach((s) => {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);

        const sz = s.size;
        // 灵石晶莹辉光
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 14;

        // 顶部高光晶面
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -sz);
        ctx.lineTo(sz * 0.6, 0);
        ctx.lineTo(0, sz * 0.3);
        ctx.lineTo(-sz * 0.6, 0);
        ctx.closePath();
        ctx.fill();

        // 侧翼暖金晶面 (Left Facet)
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(0, -sz);
        ctx.lineTo(-sz * 0.6, 0);
        ctx.lineTo(0, sz);
        ctx.closePath();
        ctx.fill();

        // 侧翼暗金折射晶面 (Right Facet)
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.moveTo(0, -sz);
        ctx.lineTo(sz * 0.6, 0);
        ctx.lineTo(0, sz);
        ctx.closePath();
        ctx.fill();

        // 晶棱金线勾勒
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -sz); ctx.lineTo(0, sz);
        ctx.moveTo(-sz * 0.6, 0); ctx.lineTo(sz * 0.6, 0);
        ctx.stroke();

        // 环绕灵石翩跹起舞的灵气光屑 (Orbiting Spiritual Motes)
        ctx.shadowBlur = 4;
        for (let i = 0; i < 3; i++) {
            const ma = anim * 2 + (i * Math.PI * 2) / 3;
            const mx = Math.cos(ma) * (sz * 1.5);
            const my = Math.sin(ma) * (sz * 0.8);
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(mx, my, 1.4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    });

}

export function renderHazards(game, ctx) {
    game.hazards.forEach((h) => {
        if (h.broken) return;
        ctx.save();
        ctx.translate(h.x, h.y);

        if (h.type === 'cliff') {
            // 浮空断崖：险峻断层石体与朱砂镇岳古篆
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 10;

            // 崖体基岩
            ctx.fillStyle = '#061324';
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-h.width / 2, -h.height / 2 + 4);
            ctx.lineTo(-h.width * 0.2, -h.height / 2 - 4);
            ctx.lineTo(h.width * 0.3, -h.height / 2);
            ctx.lineTo(h.width / 2, -h.height / 2 + 6);
            ctx.lineTo(h.width / 2 - 4, h.height / 2 - 2);
            ctx.lineTo(-h.width * 0.1, h.height / 2 + 4);
            ctx.lineTo(-h.width / 2 + 2, h.height / 2 - 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 绝壁裂隙与灵石矿脉
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-h.width * 0.35, -h.height * 0.2);
            ctx.lineTo(-h.width * 0.1, 0);
            ctx.lineTo(h.width * 0.25, -h.height * 0.15);
            ctx.stroke();

            // 崖心镇山古符 (Glowing Red/Cyan Sealing Talisman)
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.4;
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.strokeRect(-8, -10, 16, 20);
            ctx.moveTo(-5, -6); ctx.lineTo(5, -6);
            ctx.moveTo(0, -6); ctx.lineTo(0, 6);
            ctx.stroke();
        } else {
            // 太古残剑：青铜古剑断刃，煞气升腾
            const hw = h.width / 2;
            const hh = h.height / 2;
            ctx.shadowColor = '#94a3b8';
            ctx.shadowBlur = 12;

            // 斑驳古剑刃身 (Weathered Ancient Blade)
            const bladeGrad = ctx.createLinearGradient(-hw, 0, hw, 0);
            bladeGrad.addColorStop(0, '#1e293b');
            bladeGrad.addColorStop(0.5, '#475569');
            bladeGrad.addColorStop(1, '#0f172a');
            ctx.fillStyle = bladeGrad;
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.8;

            ctx.beginPath();
            ctx.moveTo(0, -hh); // 断剑尖
            ctx.lineTo(hw * 0.5, hh * 0.6);
            ctx.lineTo(hw * 0.8, hh * 0.6); // 剑格翼
            ctx.lineTo(hw * 0.25, hh);
            ctx.lineTo(-hw * 0.25, hh);
            ctx.lineTo(-hw * 0.8, hh * 0.6);
            ctx.lineTo(-hw * 0.5, hh * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 剑脊血槽与裂纹煞气 (Blade Fractures & Residual Sparks)
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -hh * 0.8);
            ctx.lineTo(0, hh * 0.7);
            ctx.moveTo(-hw * 0.2, -hh * 0.2);
            ctx.lineTo(hw * 0.2, 0);
            ctx.stroke();
        }

        ctx.restore();
    });

}

export function renderThunders(game, ctx) {
    game.thunders.forEach((th) => {
        ctx.save();
        ctx.translate(th.x, th.y);

        // 劫云雷霆外圈紫煞流涡 (Swirling Storm Vortex)
        const r = th.radius;
        const grad = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
        grad.addColorStop(0, 'rgba(233, 213, 255, 0.75)');
        grad.addColorStop(0.35, 'rgba(168, 85, 247, 0.55)');
        grad.addColorStop(0.7, 'rgba(107, 33, 168, 0.35)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // 雷核灵珠 (Thunder Core Orb)
        ctx.shadowColor = '#c084fc';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        // 跃动分叉紫电银弧 (Branching Lightning Bolts)
        if (!th.discharged && Math.random() < 0.75) {
            ctx.strokeStyle = '#f5d0fe';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            const lAng = Math.random() * Math.PI * 2;
            const lx1 = Math.cos(lAng) * (r * 0.3);
            const ly1 = Math.sin(lAng) * (r * 0.3);
            const lx2 = Math.cos(lAng + 0.3) * (r * 0.7);
            const ly2 = Math.sin(lAng + 0.3) * (r * 0.7);
            const lx3 = Math.cos(lAng - 0.2) * (r * 0.95);
            const ly3 = Math.sin(lAng - 0.2) * (r * 0.95);

            ctx.moveTo(0, 0);
            ctx.lineTo(lx1, ly1);
            ctx.lineTo(lx2, ly2);
            ctx.lineTo(lx3, ly3);
            ctx.stroke();
        }

        ctx.restore();
    });

}

export function renderFiendBirds(game, ctx) {
    game.fiendBirds.forEach((b) => {
        if (b.slain) return;
        ctx.save();
        ctx.translate(b.x, b.y);

        // 离火魔禽金赤羽翼
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 12;

        const wingSpread = Math.sin(b.wingAngle) * 16;
        // 双翼与主羽 (Wing Feathers)
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(24, wingSpread);
        ctx.lineTo(16, wingSpread + 8);
        ctx.lineTo(0, 8);
        ctx.lineTo(-16, wingSpread + 8);
        ctx.lineTo(-24, wingSpread);
        ctx.closePath();
        ctx.fill();

        // 金羽亮面 (Golden Primary Feathers)
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(16, wingSpread + 2);
        ctx.lineTo(0, 4);
        ctx.lineTo(-16, wingSpread + 2);
        ctx.closePath();
        ctx.fill();

        // 头部与金睛利喙 (Head & Glowing Eyes)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, -12, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(1.5, -13, 1, 0, Math.PI * 2);
        ctx.arc(-1.5, -13, 1, 0, Math.PI * 2);
        ctx.fill();

        // 灵动飘拂之凤尾翎羽 (Streaming Phoenix Tail Plumes)
        const tailWave = Math.sin(b.wingAngle * 1.5) * 4;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-3, 8); ctx.quadraticCurveTo(-6, 18, -4 + tailWave, 26);
        ctx.moveTo(0, 8); ctx.quadraticCurveTo(0, 20, tailWave, 28);
        ctx.moveTo(3, 8); ctx.quadraticCurveTo(6, 18, 4 + tailWave, 26);
        ctx.stroke();

        ctx.restore();
    });

}

export function renderPlayer(game, ctx) {
    const p = game.player;

    // 无敌闪烁
    if (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer * 18) % 2 === 0) {
        return;
    }

    const isDashing = p.dashTimer > 0;
    const now = Date.now();
    const animTime = now * 0.005;
    const windFlutter = Math.sin(animTime * 3) * 1.8;
    const swayTilt = p.tilt || 0;

    // 1. 剑气尾迹 (Ribbon Trail)
    if (p.trailHistory.length > 2) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p.trailHistory[0].x, p.trailHistory[0].y);
        for (let i = 1; i < p.trailHistory.length; i++) {
            ctx.lineTo(p.trailHistory[i].x, p.trailHistory[i].y);
        }
        ctx.strokeStyle = isDashing ? 'rgba(255, 255, 255, 0.9)' : 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = isDashing ? 14 : 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = isDashing ? 20 : 12;
        ctx.stroke();
        ctx.restore();
    }

    // 2. 赤霞双流苏飘带 (Flowing Ribbon from Sword Pommel)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p.ribbonNodes[0].x, p.ribbonNodes[0].y);
    for (let i = 1; i < p.ribbonNodes.length; i++) {
        ctx.lineTo(p.ribbonNodes[i].x, p.ribbonNodes[i].y);
    }
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 6;
    ctx.stroke();

    // 金丝副穗
    ctx.beginPath();
    ctx.moveTo(p.ribbonNodes[0].x + 2, p.ribbonNodes[0].y);
    for (let i = 1; i < p.ribbonNodes.length; i++) {
        ctx.lineTo(p.ribbonNodes[i].x + 3, p.ribbonNodes[i].y + 2);
    }
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 3. 剑仙与飞剑姿态变换 (局部坐标系，剑尖朝向 -Y，人首朝向 -Y)
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    // ── A. 飞剑底层灵气光晕 (Sword Aura Underfoot) ──
    ctx.save();
    ctx.shadowColor = isDashing ? '#ffffff' : '#38bdf8';
    ctx.shadowBlur = isDashing ? 28 : 16;

    // 飞剑外沿灵芒刃气
    const swordGlowGrad = ctx.createLinearGradient(0, -46, 0, 30);
    swordGlowGrad.addColorStop(0, '#ffffff');
    swordGlowGrad.addColorStop(0.3, isDashing ? '#fef08a' : '#7dd3fc');
    swordGlowGrad.addColorStop(0.8, '#0284c7');
    swordGlowGrad.addColorStop(1, 'rgba(2, 132, 199, 0.4)');

    ctx.fillStyle = swordGlowGrad;
    ctx.beginPath();
    ctx.moveTo(0, -44); // 剑尖
    ctx.lineTo(8.5, 12); // 右刃宽处
    ctx.lineTo(7, 20);  // 刃根
    ctx.lineTo(0, 24);  // 剑脊末端
    ctx.lineTo(-7, 20); // 左刃根
    ctx.lineTo(-8.5, 12);// 左刃宽处
    ctx.closePath();
    ctx.fill();

    // 飞剑内层钢刃剑胎 (Beveled 3D Blade)
    // 右半刃高光
    ctx.fillStyle = isDashing ? '#ffffff' : '#e0f2fe';
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(6.5, 12);
    ctx.lineTo(5.5, 19);
    ctx.lineTo(0, 22);
    ctx.closePath();
    ctx.fill();

    // 左半刃青芒阴影
    ctx.fillStyle = isDashing ? '#fef9c3' : '#bae6fd';
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(0, 22);
    ctx.lineTo(-5.5, 19);
    ctx.lineTo(-6.5, 12);
    ctx.closePath();
    ctx.fill();

    // 剑脊中轴线与通灵血槽
    ctx.strokeStyle = isDashing ? '#fbbf24' : '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(0, 20);
    ctx.stroke();

    // 剑身云纹灵符微雕 (Pulsing runes)
    const runeAlpha = 0.4 + Math.sin(animTime * 4) * 0.3;
    ctx.strokeStyle = `rgba(251, 191, 36, ${runeAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, -18); ctx.lineTo(0, -15); ctx.lineTo(2, -18);
    ctx.moveTo(-2.5, -2); ctx.lineTo(0, 1); ctx.lineTo(2.5, -2);
    ctx.stroke();

    // 剑格 (鎏金龙凤剑护手)
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 17);
    ctx.quadraticCurveTo(8, 16, 12, 19);
    ctx.lineTo(11, 22);
    ctx.quadraticCurveTo(4, 21, 0, 23);
    ctx.quadraticCurveTo(-4, 21, -11, 22);
    ctx.lineTo(-12, 19);
    ctx.quadraticCurveTo(-8, 16, 0, 17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 护手中心聚灵青玉
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(0, 20, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // 剑柄与缠绳
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-2.5, 23, 5, 12);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-2.5, 25); ctx.lineTo(2.5, 27);
    ctx.moveTo(-2.5, 28); ctx.lineTo(2.5, 30);
    ctx.moveTo(-2.5, 31); ctx.lineTo(2.5, 33);
    ctx.stroke();

    // 剑首 (金环宝珠)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 36, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 36, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ── B. 剑仙角色：足踏飞剑，仙风道骨 (Character Standing on Sword) ──
    ctx.save();

    // 1. 双足踏剑接触面之聚灵光纹 (Foot contact aura on blade)
    ctx.fillStyle = isDashing ? 'rgba(255, 255, 255, 0.7)' : 'rgba(56, 189, 248, 0.55)';
    ctx.beginPath();
    ctx.ellipse(3.8, 10, 3.5, 2, 0, 0, Math.PI * 2); // 右足
    ctx.ellipse(-3.8, 14, 3.5, 2, 0, 0, Math.PI * 2); // 左足
    ctx.fill();

    // 2. 仙靴脚履 (Immortal Boots planted firmly on blade)
    ctx.fillStyle = '#0f172a';
    // 右脚前踏
    ctx.beginPath();
    ctx.moveTo(2.2, 7);
    ctx.lineTo(5.2, 7);
    ctx.lineTo(5.5, 11);
    ctx.lineTo(2.0, 11);
    ctx.closePath();
    ctx.fill();
    // 左脚后踏
    ctx.beginPath();
    ctx.moveTo(-5.5, 11);
    ctx.lineTo(-2.2, 11);
    ctx.lineTo(-2.0, 15);
    ctx.lineTo(-5.2, 15);
    ctx.closePath();
    ctx.fill();

    // 靴缘银边
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(2, 11); ctx.lineTo(5.5, 11);
    ctx.moveTo(-5.5, 15); ctx.lineTo(-2, 15);
    ctx.stroke();

    // 3. 仙袍后摆衣袂翻飞 (Fluttering Robe Tails trailing in wind)
    const tailOffset = -swayTilt * 6 + windFlutter;
    // 白玉内袍下摆
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(6 + tailOffset * 0.3, 10, 5 + tailOffset, 20);
    ctx.lineTo(0, 14);
    ctx.lineTo(-5 + tailOffset, 20);
    ctx.quadraticCurveTo(-6 + tailOffset * 0.3, 10, 0, 0);
    ctx.closePath();
    ctx.fill();

    // 青墨外袍披帛与流云摆
    ctx.fillStyle = '#0369a1';
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(-8 + tailOffset * 0.5, 8, -10 + tailOffset * 1.1, 24);
    ctx.lineTo(-4 + tailOffset * 0.8, 16);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(8 + tailOffset * 0.5, 8, 9 + tailOffset * 0.9, 22);
    ctx.lineTo(4 + tailOffset * 0.7, 15);
    ctx.closePath();
    ctx.fill();

    // 4. 身躯躯干与白衣道袍 (Torso & Cultivator Robes)
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-6.5, -9);  // 左肩
    ctx.lineTo(6.5, -9);   // 右肩
    ctx.lineTo(4.5, 1);    // 右腰
    ctx.lineTo(-4.5, 1);   // 左腰
    ctx.closePath();
    ctx.fill();

    // 道袍交领与青云纹滚边 (Collar & lapels)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-5, -9);
    ctx.lineTo(1, -2);
    ctx.lineTo(4.5, 1);
    ctx.stroke();

    // 5. 束腰金丝锦带与龙纹玉佩 (Waist Sash & Jade Pendant)
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-4.5, -1, 9, 2.8);

    // 悬挂墨玉佩 (Hanging Jade Pendant)
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(-2, 3.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-2, 1.8);
    ctx.lineTo(-2, 5.5);
    ctx.stroke();

    // 6. 左臂：负手御风，广袖飘摇 (Left Arm: Poised back, wide sleeve)
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-6.5, -9);
    ctx.quadraticCurveTo(-11 + tailOffset * 0.4, -4, -13 + tailOffset * 0.7, 6);
    ctx.lineTo(-7, 3);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6.5, -9);
    ctx.lineTo(-13 + tailOffset * 0.7, 6);
    ctx.stroke();

    // 7. 右臂：手掐剑诀，凌空导引 (Right Arm: Sword Finger gesture leading flight)
    // 右广袖
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(6.5, -9);
    ctx.lineTo(8.5, -16);
    ctx.lineTo(5.5, -18);
    ctx.lineTo(4.5, -9);
    ctx.closePath();
    ctx.fill();

    // 前伸小臂与手腕
    ctx.fillStyle = '#fed7aa'; // 肤色
    ctx.beginPath();
    ctx.moveTo(6.5, -16);
    ctx.lineTo(6.5, -23);
    ctx.lineTo(5.0, -23);
    ctx.lineTo(5.0, -16);
    ctx.closePath();
    ctx.fill();

    // 经典手掐剑诀 (双指并拢如剑，直指前方)
    ctx.strokeStyle = '#fed7aa';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(5.8, -23);
    ctx.lineTo(5.8, -27); // 食指中指并拢剑诀
    ctx.stroke();

    // 指尖凝聚之凌霄剑芒 (Pulsing Sword Qi at Fingertip)
    ctx.save();
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = isDashing ? 14 : 8;
    ctx.fillStyle = isDashing ? '#ffffff' : '#7dd3fc';
    ctx.beginPath();
    ctx.arc(5.8, -27.5, isDashing ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5.8, -27.5, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 8. 束发玉冠与飘扬墨发 (Head, Jade Crown & Streaming Hair)
    // 头部
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -13, 4.2, 0, Math.PI * 2);
    ctx.fill();

    // 墨发流云 (Cascading Black Hair flowing back)
    const hairOffset = -swayTilt * 4 + windFlutter * 1.2;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(-3.5, -15);
    ctx.quadraticCurveTo(0, -11, 3.5, -15);
    ctx.quadraticCurveTo(2 + hairOffset * 0.3, -4, 2.5 + hairOffset, 7);
    ctx.lineTo(-2.5 + hairOffset, 7);
    ctx.quadraticCurveTo(-2 + hairOffset * 0.3, -4, -3.5, -15);
    ctx.closePath();
    ctx.fill();

    // 束发道髻与金冠簪花
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.arc(0, -17.5, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 白玉发簪与金冠
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-3, -19.5, 6, 2.5);
    ctx.strokeStyle = '#e2e8f0'; // 白玉簪
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-5, -18.2);
    ctx.lineTo(5, -18.2);
    ctx.stroke();

    // 飘拂红绫发带 (Scarlet Hair Ribbon trailing in wind)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-1.5, -17);
    ctx.quadraticCurveTo(-4 + hairOffset * 0.6, -10, -5 + hairOffset * 1.3, 2);
    ctx.moveTo(1.5, -17);
    ctx.quadraticCurveTo(3 + hairOffset * 0.6, -10, 4 + hairOffset * 1.3, 1);
    ctx.stroke();

    ctx.restore(); // 结束剑仙角色绘制

    // ── C. 破空疾刺罡气罩 (Dash Piercing Sonic Cone) ──
    if (isDashing) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(0, -56);
        ctx.lineTo(20, 24);
        ctx.lineTo(0, 16);
        ctx.lineTo(-20, 24);
        ctx.closePath();
        ctx.stroke();

        // 破空真气波纹
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -20, 28, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();
        ctx.restore();
    }

    // ── D. 境界飞升异象 (Breakthrough Visuals) ──
    // 筑基期 (Realm 1+): 足下真气涟漪
    if (p.realmIndex >= 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 12, 16, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // 结丹期 (Realm 2+): 步步金莲 (Golden Lotus Aura)
    if (p.realmIndex >= 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        const lotusRot = animTime * 1.5;
        for (let i = 0; i < 6; i++) {
            const a = lotusRot + (i * Math.PI) / 3;
            const lx = Math.cos(a) * 22;
            const ly = Math.sin(a) * 12 + 8;
            ctx.beginPath();
            ctx.arc(lx, ly, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(254, 240, 138, 0.6)';
            ctx.fill();
        }
        ctx.restore();
    }

    // 元婴及以上 (Realm 3+): 背后悬浮旋转太极仙轮 (Divine Spirit Wheel)
    if (p.realmIndex >= 3) {
        ctx.save();
        ctx.translate(0, -6);
        ctx.rotate(animTime * 0.8);
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore();

}

export function renderSatelliteSwords(game, ctx) {
    game.satelliteSwords.forEach((sw) => {
        ctx.save();
        ctx.translate(sw.x, sw.y);
        ctx.rotate(game.swordArrayAngle + Math.PI / 2);

        // 伴生灵剑剑芒
        ctx.shadowColor = sw.activeSlash ? '#fbbf24' : '#38bdf8';
        ctx.shadowBlur = sw.activeSlash ? 18 : 10;

        // 伴生灵剑剑体 (Miniature Divine Sword)
        ctx.fillStyle = sw.activeSlash ? '#ffffff' : '#e0f2fe';
        ctx.beginPath();
        ctx.moveTo(0, -20); // 剑尖
        ctx.lineTo(4.5, 8);  // 右刃
        ctx.lineTo(3.5, 14); // 护手
        ctx.lineTo(0, 16);   // 剑首
        ctx.lineTo(-3.5, 14);// 护手
        ctx.lineTo(-4.5, 8); // 左刃
        ctx.closePath();
        ctx.fill();

        // 灵光剑脊
        ctx.strokeStyle = sw.activeSlash ? '#fbbf24' : '#0284c7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(0, 14);
        ctx.stroke();

        // 鎏金剑格
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-5, 12, 10, 2.5);

        ctx.restore();
    });

}
