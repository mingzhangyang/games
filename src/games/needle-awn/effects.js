export class ParticleSystem {
    constructor() {
        this.particles = [];
        this.shockwaves = [];
        this.popups = [];
        this.screenShake = 0;
    }

    addSpark(x, y, vx, vy, color, size, life) {
        if (this.particles.length > 240) return;
        this.particles.push({
            x, y, vx, vy, color, size,
            maxLife: life,
            life: life
        });
    }

    addShockwave(x, y, color, maxRadius = 120, speed = 320) {
        this.shockwaves.push({
            x, y, color,
            radius: 5,
            maxRadius,
            speed,
            alpha: 1
        });
    }

    addPopup(text, x, y, color = '#ffffff') {
        this.popups.push({
            text, x, y, color,
            alpha: 1,
            scale: 0.7,
            life: 0.8
        });
    }

    burst(x, y, color1, color2, count = 28, speedMul = 1) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (120 + Math.random() * 260) * speedMul;
            const col = Math.random() < 0.5 ? color1 : color2;
            this.addSpark(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                col,
                2 + Math.random() * 3,
                0.3 + Math.random() * 0.4
            );
        }
    }

    shake(intensity = 8) {
        this.screenShake = Math.max(this.screenShake, intensity);
    }

    update(dt) {
        // 震屏阻尼衰减
        if (this.screenShake > 0) {
            this.screenShake = Math.max(0, this.screenShake - dt * 25);
        }

        // 粒子更新
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // 冲击波更新
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.radius += s.speed * dt;
            s.alpha = Math.max(0, 1 - s.radius / s.maxRadius);
            if (s.radius >= s.maxRadius) {
                this.shockwaves.splice(i, 1);
            }
        }

        // 文字弹出特效更新
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const pop = this.popups[i];
            pop.life -= dt;
            pop.y -= dt * 45;
            pop.scale = Math.min(1.2, pop.scale + dt * 2.5);
            pop.alpha = Math.max(0, pop.life / 0.8);
            if (pop.life <= 0) {
                this.popups.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        // 绘制冲击波
        ctx.save();
        for (const s of this.shockwaves) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.strokeStyle = s.color;
            ctx.globalAlpha = s.alpha * 0.85;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        ctx.restore();

        // 绘制火花粒子
        ctx.save();
        for (const p of this.particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 绘制书法飘字
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const pop of this.popups) {
            ctx.save();
            ctx.translate(pop.x, pop.y);
            ctx.scale(pop.scale, pop.scale);
            ctx.globalAlpha = pop.alpha;
            ctx.font = 'bold 20px "Segoe UI", "PingFang SC", system-ui, sans-serif';
            ctx.shadowColor = pop.color;
            ctx.shadowBlur = 12;
            ctx.fillStyle = pop.color;
            ctx.fillText(pop.text, 0, 0);
            ctx.restore();
        }
        ctx.restore();
    }
}

