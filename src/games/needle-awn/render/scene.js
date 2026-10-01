import { NEEDLE_AWN_MANIFEST } from './art.js';

const WIDTH = 480;
const HEIGHT = 640;
const TAU = Math.PI * 2;

const CHAPTERS = Object.freeze([
    { id: 'mist-gate', mistAlpha: 0.72, floorTint: '#416b78', accent: '#9fd5dd' },
    { id: 'needle-terrace', mistAlpha: 0.58, floorTint: '#536c87', accent: '#b7d9e1' },
    { id: 'awn-altar', mistAlpha: 0.46, floorTint: '#876b42', accent: '#efd18a' },
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rgba(hex, alpha) {
    const n = Number.parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function chapterFor({ mode = 'levels', level = 1, waveIndex = 0 } = {}) {
    if (mode === 'levels') return level <= 4 ? 0 : level <= 7 ? 1 : 2;
    if (mode === 'daily') return waveIndex % 3;
    if (mode === 'endless') return Math.floor(waveIndex / 3) % 3;
    return 0;
}

function makeCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    return canvas;
}

function fillInkFallback(ctx, chapterIndex, time = 0) {
    const chapter = CHAPTERS[chapterIndex] || CHAPTERS[0];
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#071d29');
    sky.addColorStop(0.56, '#102e3d');
    sky.addColorStop(1, '#18282f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = 'rgba(203, 231, 228, 0.7)';
    ctx.beginPath();
    ctx.arc(88, 88, 28, 0.9, 5.9);
    ctx.arc(100, 82, 28, 2.1, 6.2);
    ctx.fill();

    ctx.fillStyle = 'rgba(145, 190, 199, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, 310);
    ctx.quadraticCurveTo(95, 248, 182, 310);
    ctx.quadraticCurveTo(278, 225, 382, 300);
    ctx.quadraticCurveTo(438, 255, WIDTH, 314);
    ctx.lineTo(WIDTH, 470);
    ctx.lineTo(0, 470);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(214, 231, 226, 0.11)';
    for (let i = 0; i < 4; i += 1) {
        const y = 344 + i * 34 + Math.sin(time * 0.12 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(-20, y);
        ctx.bezierCurveTo(110, y - 24, 220, y + 28, 500, y - 14);
        ctx.lineTo(500, y + 24);
        ctx.bezierCurveTo(250, y + 36, 130, y - 8, -20, y + 28);
        ctx.closePath();
        ctx.fill();
    }

    ctx.fillStyle = rgba(chapter.floorTint, 0.84);
    ctx.beginPath();
    ctx.moveTo(-20, 493);
    ctx.quadraticCurveTo(240, 448, 500, 493);
    ctx.lineTo(500, 660);
    ctx.lineTo(-20, 660);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgba(chapter.accent, 0.32);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(240, 560, 220, 70, 0, 0, TAU);
    ctx.ellipse(240, 560, 132, 42, 0, 0, TAU);
    ctx.stroke();
}

export function createNeedleAwnScene({
    ctx,
    width = WIDTH,
    height = HEIGHT,
} = {}) {
    const cache = new Map();
    const fallbackCache = makeCanvas();
    const fallbackCtx = fallbackCache.getContext('2d');
    let art = null;
    let artState = 'loading';

    function invalidate() {
        cache.clear();
    }

    function setArt(nextArt, state = 'ready') {
        art = nextArt || null;
        artState = state;
        invalidate();
        if (art?.fallback && fallbackCtx) {
            fallbackCtx.clearRect(0, 0, WIDTH, HEIGHT);
            fallbackCtx.drawImage(art.fallback, 0, 0, WIDTH, HEIGHT);
        } else {
            fallbackCtx.clearRect(0, 0, WIDTH, HEIGHT);
            fillInkFallback(fallbackCtx, 0, 0);
        }
    }

    function buildCache(chapterIndex) {
        if (cache.has(chapterIndex)) return cache.get(chapterIndex);
        const chapter = CHAPTERS[chapterIndex] || CHAPTERS[0];
        const plate = makeCanvas();
        const plateCtx = plate.getContext('2d');
        const layers = art?.layers || {};
        if (layers['sky-ink']) {
            plateCtx.drawImage(layers['sky-ink'], 0, 0, WIDTH, HEIGHT);
            if (layers.mountains) plateCtx.drawImage(layers.mountains, 0, 0, WIDTH, HEIGHT);
            if (layers.mist) {
                plateCtx.globalAlpha = chapter.mistAlpha;
                plateCtx.drawImage(layers.mist, 0, 0, WIDTH, HEIGHT);
                plateCtx.globalAlpha = 1;
            }
            if (layers['arena-floor']) plateCtx.drawImage(layers['arena-floor'], 0, 0, WIDTH, HEIGHT);
            plateCtx.fillStyle = rgba(chapter.floorTint, chapterIndex === 2 ? 0.11 : 0.07);
            plateCtx.fillRect(0, 420, WIDTH, HEIGHT - 420);
        } else {
            fillInkFallback(plateCtx, chapterIndex, 0);
        }

        // Static, low-contrast compass marks establish the arena without restoring the old grid.
        plateCtx.save();
        plateCtx.globalAlpha = chapterIndex === 2 ? 0.25 : 0.18;
        plateCtx.strokeStyle = chapter.accent;
        plateCtx.lineWidth = 1.1;
        plateCtx.beginPath();
        plateCtx.ellipse(240, 552, 204, 66, 0, 0, TAU);
        plateCtx.ellipse(240, 552, 126, 39, 0, 0, TAU);
        plateCtx.moveTo(240, 492);
        plateCtx.lineTo(240, 612);
        plateCtx.moveTo(54, 552);
        plateCtx.lineTo(426, 552);
        plateCtx.stroke();
        plateCtx.restore();

        cache.set(chapterIndex, plate);
        return plate;
    }

    function metaFor(game) {
        const chapterIndex = chapterFor(game);
        return { chapterIndex, chapter: CHAPTERS[chapterIndex] || CHAPTERS[0] };
    }

    function drawBackground(targetCtx, game = {}) {
        const { chapterIndex } = metaFor(game);
        targetCtx.save();
        targetCtx.clearRect(0, 0, width, height);
        targetCtx.fillStyle = '#07151d';
        targetCtx.fillRect(0, 0, WIDTH, HEIGHT);
        if (artState === 'ready' && art?.layers?.['sky-ink']) {
            targetCtx.drawImage(buildCache(chapterIndex), 0, 0, WIDTH, HEIGHT);
        } else if (artState === 'fallback' && fallbackCache) {
            targetCtx.drawImage(fallbackCache, 0, 0, WIDTH, HEIGHT);
        } else {
            fillInkFallback(targetCtx, chapterIndex, game.timeElapsed || 0);
        }
        targetCtx.restore();
    }

    function drawForeground(targetCtx, game = {}) {
        const { chapterIndex } = metaFor(game);
        const layer = art?.layers?.foreground;
        targetCtx.save();
        if (layer && artState === 'ready') {
            targetCtx.globalAlpha = chapterIndex === 2 ? 0.86 : 0.72;
            targetCtx.drawImage(layer, 0, 0, WIDTH, HEIGHT);
        } else {
            targetCtx.globalAlpha = 0.5;
            targetCtx.fillStyle = '#06141b';
            targetCtx.beginPath();
            targetCtx.moveTo(0, 632);
            targetCtx.quadraticCurveTo(58, 594, 108, 626);
            targetCtx.quadraticCurveTo(168, 596, 230, 635);
            targetCtx.quadraticCurveTo(330, 590, 480, 628);
            targetCtx.lineTo(480, 640);
            targetCtx.lineTo(0, 640);
            targetCtx.closePath();
            targetCtx.fill();
        }
        targetCtx.restore();
    }

    function drawPlayer(targetCtx, player, time = 0) {
        drawBlade(targetCtx, player, time, true);
    }

    function drawEnemy(targetCtx, enemy, time = 0) {
        drawBlade(targetCtx, enemy, time, false);
    }

    function drawBlade(targetCtx, entity, time, isPlayer) {
        const needle = entity.stance === 'needle';
        const core = needle ? '#e9fbff' : '#fff0b3';
        const ink = needle ? '#5aa9b9' : '#c58e3e';
        const accent = needle ? '#9fe0e9' : '#f2c96f';
        const trail = needle ? '#7fc8d6' : '#dfae50';
        targetCtx.save();
        targetCtx.translate(entity.x, entity.y);
        targetCtx.rotate(entity.angle);
        const r = entity.radius;
        if (entity.isDashing) {
            targetCtx.globalAlpha = 0.34;
            targetCtx.strokeStyle = trail;
            targetCtx.lineWidth = 2;
            for (let i = 1; i <= 3; i += 1) {
                targetCtx.beginPath();
                targetCtx.moveTo(-r - i * 13, -i * 1.5);
                targetCtx.lineTo(entity.tipDistance - i * 10, -i * 1.5);
                targetCtx.stroke();
            }
        }
        targetCtx.globalAlpha = 1;
        targetCtx.fillStyle = ink;
        targetCtx.strokeStyle = rgba(core, 0.92);
        targetCtx.lineWidth = isPlayer ? 1.8 : 1.2;
        targetCtx.beginPath();
        targetCtx.moveTo(entity.tipDistance, 0);
        targetCtx.lineTo(-r * 0.9, -r * (needle ? 0.55 : 0.68));
        targetCtx.lineTo(-r * 0.36, 0);
        targetCtx.lineTo(-r * 0.9, r * (needle ? 0.55 : 0.68));
        targetCtx.closePath();
        targetCtx.fill();
        targetCtx.stroke();
        targetCtx.strokeStyle = accent;
        targetCtx.lineWidth = needle ? 1.2 : 1.4;
        targetCtx.beginPath();
        targetCtx.moveTo(-r * 0.15, 0);
        targetCtx.lineTo(entity.tipDistance - 2, 0);
        if (!needle) {
            targetCtx.moveTo(entity.tipDistance * 0.58, 0);
            targetCtx.lineTo(entity.tipDistance * 0.16, -r * 0.92);
            targetCtx.moveTo(entity.tipDistance * 0.58, 0);
            targetCtx.lineTo(entity.tipDistance * 0.16, r * 0.92);
        }
        targetCtx.stroke();
        targetCtx.fillStyle = '#ffffff';
        targetCtx.beginPath();
        targetCtx.arc(entity.tipDistance, 0, isPlayer ? 2.6 : 2.1, 0, TAU);
        targetCtx.fill();
        targetCtx.restore();
    }

    function drawBoss(targetCtx, boss, time = 0) {
        const chapter = CHAPTERS[chapterFor({ mode: 'levels', level: boss.level || 10 })] || CHAPTERS[0];
        const image = art?.bosses?.[boss.bossType];
        const localRect = NEEDLE_AWN_MANIFEST.bosses?.[boss.bossType]?.localRectLogicalPx || [-48, -48, 96, 96];
        const [localX, localY, localWidth, localHeight] = localRect;
        targetCtx.save();
        targetCtx.translate(boss.x, boss.y);
        targetCtx.rotate(boss.angle || 0);
        targetCtx.rotate(Math.sin(time * 0.7) * 0.025);
        targetCtx.globalAlpha = boss.stunTimer > 0 ? 0.98 : 0.88;
        if (image && artState === 'ready') {
            targetCtx.drawImage(image, localX, localY, localWidth, localHeight);
        } else {
            drawFallbackBoss(targetCtx, boss, chapter);
        }
        targetCtx.globalAlpha = 0.8;
        targetCtx.strokeStyle = rgba(chapter.accent, boss.stunTimer > 0 ? 0.85 : 0.38);
        targetCtx.lineWidth = boss.stunTimer > 0 ? 2.4 : 1;
        targetCtx.beginPath();
        targetCtx.arc(0, 0, boss.radius * 1.18 + Math.sin(time * 2) * 2, 0, TAU);
        targetCtx.stroke();
        targetCtx.strokeStyle = '#f9ffff';
        targetCtx.lineWidth = 1.8;
        targetCtx.beginPath();
        targetCtx.moveTo(boss.tipDistance, 0);
        targetCtx.lineTo(boss.radius * 0.7, -boss.radius * 0.72);
        targetCtx.moveTo(boss.tipDistance, 0);
        targetCtx.lineTo(boss.radius * 0.7, boss.radius * 0.72);
        targetCtx.stroke();
        targetCtx.fillStyle = '#ffffff';
        targetCtx.beginPath();
        targetCtx.arc(boss.tipDistance, 0, 2.8, 0, TAU);
        targetCtx.fill();
        targetCtx.restore();

        targetCtx.save();
        targetCtx.translate(boss.x, boss.y - boss.radius - 17);
        targetCtx.fillStyle = 'rgba(2, 10, 16, 0.8)';
        targetCtx.fillRect(-42, 0, 84, 6);
        targetCtx.fillStyle = boss.stance === 'needle' ? '#90dce8' : '#e5b457';
        targetCtx.fillRect(-42, 0, 84 * clamp(boss.hp / boss.maxHp, 0, 1), 6);
        targetCtx.strokeStyle = 'rgba(240, 249, 250, 0.42)';
        targetCtx.lineWidth = 1;
        targetCtx.strokeRect(-42, 0, 84, 6);
        targetCtx.restore();
    }

    function drawFallbackBoss(targetCtx, boss, chapter) {
        const needle = boss.stance === 'needle';
        const color = needle ? '#9ddce5' : '#e4b35a';
        targetCtx.fillStyle = rgba(color, 0.2);
        targetCtx.beginPath();
        targetCtx.arc(0, 0, boss.radius * 0.78, 0, TAU);
        targetCtx.fill();
        targetCtx.strokeStyle = color;
        targetCtx.lineWidth = 2;
        targetCtx.beginPath();
        targetCtx.arc(0, 0, boss.radius * 1.28, 0, TAU);
        targetCtx.stroke();
        for (let i = 0; i < 8; i += 1) {
            const angle = (i / 8) * TAU;
            targetCtx.beginPath();
            targetCtx.moveTo(Math.cos(angle) * boss.radius, Math.sin(angle) * boss.radius);
            targetCtx.lineTo(Math.cos(angle) * boss.radius * 1.55, Math.sin(angle) * boss.radius * 1.55);
            targetCtx.stroke();
        }
        targetCtx.strokeStyle = chapter.accent;
    }

    function drawBullet(targetCtx, bullet) {
        const needle = bullet.stance === 'needle';
        targetCtx.save();
        targetCtx.translate(bullet.x, bullet.y);
        targetCtx.rotate(bullet.angle);
        targetCtx.fillStyle = needle ? '#81c8d5' : '#e5ad4c';
        targetCtx.globalAlpha = 0.95;
        targetCtx.beginPath();
        targetCtx.moveTo(bullet.tipDistance, 0);
        targetCtx.lineTo(-bullet.radius, -bullet.radius * 0.52);
        targetCtx.lineTo(-bullet.radius, bullet.radius * 0.52);
        targetCtx.closePath();
        targetCtx.fill();
        targetCtx.strokeStyle = needle ? '#dffaff' : '#fff1b8';
        targetCtx.lineWidth = 1;
        targetCtx.stroke();
        targetCtx.restore();
    }

    function drawRicochet(targetCtx, ricochet) {
        const angle = Math.atan2(ricochet.vy, ricochet.vx);
        targetCtx.save();
        targetCtx.translate(ricochet.x, ricochet.y);
        targetCtx.rotate(angle);
        targetCtx.globalAlpha = clamp(ricochet.life * 1.8, 0.22, 1);
        targetCtx.strokeStyle = ricochet.color;
        targetCtx.lineWidth = Math.max(1.5, ricochet.radius * 0.7);
        targetCtx.beginPath();
        targetCtx.moveTo(-ricochet.radius * 3.5, 0);
        targetCtx.lineTo(ricochet.radius * 1.8, 0);
        targetCtx.stroke();
        targetCtx.fillStyle = '#fff9df';
        targetCtx.beginPath();
        targetCtx.arc(ricochet.radius * 1.7, 0, Math.max(1.5, ricochet.radius * 0.55), 0, TAU);
        targetCtx.fill();
        targetCtx.restore();
    }

    function drawHitbox(targetCtx, entity) {
        targetCtx.save();
        targetCtx.translate(entity.x, entity.y);
        targetCtx.rotate(entity.angle || 0);
        targetCtx.strokeStyle = 'rgba(255, 106, 106, 0.88)';
        targetCtx.lineWidth = 1;
        targetCtx.setLineDash([4, 4]);
        targetCtx.beginPath();
        targetCtx.arc(0, 0, entity.radius, 0, TAU);
        targetCtx.stroke();
        targetCtx.setLineDash([]);
        targetCtx.fillStyle = '#ffb2a8';
        targetCtx.beginPath();
        targetCtx.arc(entity.tipDistance, 0, 3, 0, TAU);
        targetCtx.fill();
        targetCtx.restore();
    }

    return {
        setArt,
        getArtState: () => artState,
        getChapter: metaFor,
        drawBackground,
        drawForeground,
        drawPlayer,
        drawEnemy,
        drawBoss,
        drawBullet,
        drawRicochet,
        drawHitbox,
        invalidate,
        manifest: NEEDLE_AWN_MANIFEST,
    };
}
