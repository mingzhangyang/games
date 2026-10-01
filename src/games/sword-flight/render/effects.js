/** Transient particle and ability effects. */

export function renderParticles(game, ctx) {
    // 花瓣
    game.petals.forEach((pt) => {
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.angle);
        ctx.fillStyle = 'rgba(244, 114, 182, 0.6)';
        ctx.beginPath();
        ctx.ellipse(0, 0, pt.size, pt.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 动态碎芒粒子
    game.particles.forEach((p) => {
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

}

export function spawnSparkle(game, x, y, color) {
    for (let i = 0; i < 6; i++) {
        game.particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            size: 2 + Math.random() * 2.5,
            color,
            alpha: 1,
            fade: 2.5,
            shrink: 1.2
        });
    }

}

export function spawnRingBurst(game, x, y) {
    for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2;
        const spd = 3 + Math.random() * 3;
        game.particles.push({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 3,
            color: '#fbbf24',
            alpha: 1,
            fade: 1.8,
            shrink: 1
        });
    }

}

export function spawnShatterParticles(game, x, y, color) {
    for (let i = 0; i < 18; i++) {
        game.particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            size: 2.5 + Math.random() * 3.5,
            color,
            alpha: 1,
            fade: 2.2,
            shrink: 1.5
        });
    }

}

export function spawnShockwave(game, x, y, radius, color) {
    for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        game.particles.push({
            x: x + Math.cos(ang) * radius * 0.4,
            y: y + Math.sin(ang) * radius * 0.4,
            vx: Math.cos(ang) * 6,
            vy: Math.sin(ang) * 6,
            size: 3,
            color,
            alpha: 1,
            fade: 2.8,
            shrink: 1.5
        });
    }

}

export function spawnSwordWave(game, x, y) {
    for (let i = -5; i <= 5; i++) {
        game.particles.push({
            x: x + i * 8,
            y: y - Math.abs(i) * 2,
            vx: i * 0.8,
            vy: -8,
            size: 3.5,
            color: '#38bdf8',
            alpha: 1,
            fade: 2,
            shrink: 1
        });
    }

}

export function spawnLotusAscension(game, x, y) {
    // 绽放百丈混沌青莲与万剑归宗剑气
    for (let i = 0; i < 54; i++) {
        const ang = (i / 54) * Math.PI * 2;
        const spd = 4.5 + Math.random() * 6.5;
        game.particles.push({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 3.5 + Math.random() * 4,
            color: i % 3 === 0 ? '#38bdf8' : (i % 3 === 1 ? '#fbbf24' : '#ffffff'),
            alpha: 1,
            fade: 0.85,
            shrink: 0.6
        });
    }

    // 青莲神瓣飞旋
    for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const spd = 2.5 + Math.random() * 4;
        game.petals.push({
            x,
            y,
            speedX: Math.cos(ang) * spd,
            speedY: Math.sin(ang) * spd,
            size: 4 + Math.random() * 3,
            angle: Math.random() * Math.PI * 2,
            rotSpeed: 0.1,
            ttl: 1.5
        });
    }

}

export function spawnLightningEffect(game, x1, y1, x2, y2) {
    const segs = 6;
    let cx = x1, cy = y1;
    for (let i = 1; i <= segs; i++) {
        const targetX = x1 + ((x2 - x1) * i) / segs + (Math.random() - 0.5) * 25;
        const targetY = y1 + ((y2 - y1) * i) / segs + (Math.random() - 0.5) * 25;
        game.particles.push({
            x: cx,
            y: cy,
            vx: (targetX - cx) * 0.2,
            vy: (targetY - cy) * 0.2,
            size: 3,
            color: '#e9d5ff',
            alpha: 1,
            fade: 4,
            shrink: 1
        });
        cx = targetX;
        cy = targetY;
    }

}
