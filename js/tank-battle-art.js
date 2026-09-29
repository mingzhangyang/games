// Tank Battle production art loader and renderer.
// The runtime keeps procedural fallbacks so a missing asset never disables play.
export const TANK_BATTLE_ART_URLS = {
    'terrain.ground': new URL('../assets/tank-battle/terrain/ground.svg', import.meta.url).href,
    'terrain.detail': new URL('../assets/tank-battle/terrain/ground-detail.svg', import.meta.url).href,
    'terrain.border': new URL('../assets/tank-battle/terrain/border.svg', import.meta.url).href,
    'tiles.brick': new URL('../assets/tank-battle/tiles/brick.svg', import.meta.url).href,
    'tiles.steel': new URL('../assets/tank-battle/tiles/steel.svg', import.meta.url).href,
    'tiles.boundary': new URL('../assets/tank-battle/tiles/boundary.svg', import.meta.url).href,
    'tanks.player': new URL('../assets/tank-battle/tanks/player.svg', import.meta.url).href,
    'tanks.enemy': new URL('../assets/tank-battle/tanks/enemy.svg', import.meta.url).href,
    'tanks.boss': new URL('../assets/tank-battle/tanks/boss.svg', import.meta.url).href,
    'powerups.health': new URL('../assets/tank-battle/powerups/health.svg', import.meta.url).href,
    'powerups.weapon': new URL('../assets/tank-battle/powerups/weapon.svg', import.meta.url).href,
    'powerups.shield': new URL('../assets/tank-battle/powerups/shield.svg', import.meta.url).href,
    'powerups.speed': new URL('../assets/tank-battle/powerups/speed.svg', import.meta.url).href,
    'ui.minimapFrame': new URL('../assets/tank-battle/ui/minimap-frame.svg', import.meta.url).href,
    'ui.weaponIcons': new URL('../assets/tank-battle/ui/weapon-icons.svg', import.meta.url).href,
    'ui.rotateDevice': new URL('../assets/tank-battle/ui/rotate-device.svg', import.meta.url).href,
};

const POWERUP_ASSET_KEYS = {
    health: 'powerups.health',
    weapon: 'powerups.weapon',
    shield: 'powerups.shield',
    speed: 'powerups.speed',
};

const TANK_ASSET_KEYS = {
    player: 'tanks.player',
    enemy: 'tanks.enemy',
    boss: 'tanks.boss',
};

// Authored tank SVGs face upward at direction 0. Canvas rotation is clockwise,
// matching Bullet.update(): 0=up, 1=right, 2=down, 3=left.
const TANK_DIRECTION_ROTATIONS = Object.freeze([
    0,
    Math.PI / 2,
    Math.PI,
    Math.PI * 1.5,
]);
const TANK_DIRECTION_VECTORS = Object.freeze([
    Object.freeze({ x: 0, y: -1 }),
    Object.freeze({ x: 1, y: 0 }),
    Object.freeze({ x: 0, y: 1 }),
    Object.freeze({ x: -1, y: 0 }),
]);

function normalizeDirection(direction) {
    const value = Number(direction);
    if (!Number.isFinite(value)) return 0;
    const integer = Math.trunc(value);
    return ((integer % 4) + 4) % 4;
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Tank Battle art failed to load: ' + url));
        image.src = url;
    });
}

function polygon(ctx, cx, cy, radius, sides = 6) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = -Math.PI / 2 + (Math.PI * 2 * i) / sides;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function setArtState(state) {
    const container = document.getElementById('gameContainer');
    if (container) container.dataset.tbArtState = state;
    document.dispatchEvent(new CustomEvent('tank-battle-art-state', { detail: { state } }));
}

export function createTankBattleArt() {
    const images = new Map();
    const terrainCache = {
        canvas: null,
        width: 0,
        height: 0,
    };

    const drawStaticTerrain = (ctx, width, height) => {
        ctx.fillStyle = '#2b4334';
        ctx.fillRect(0, 0, width, height);

        const ground = images.get('terrain.ground');
        if (ground) {
            const pattern = ctx.createPattern(ground, 'repeat');
            if (pattern) {
                ctx.fillStyle = pattern;
                ctx.fillRect(0, 0, width, height);
            }
        }

        const detail = images.get('terrain.detail');
        if (detail) {
            ctx.globalAlpha = 0.9;
            ctx.drawImage(detail, 0, 0, width, height);
            ctx.globalAlpha = 1;
        }

        // Deterministic field marks add depth without changing the gameplay seed.
        ctx.save();
        ctx.strokeStyle = 'rgba(208, 190, 132, 0.14)';
        ctx.lineWidth = 2;
        for (const [x, y, length] of [[82, 126, 38], [612, 124, 44], [116, 472, 42], [548, 472, 48]]) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + length, y + 8);
            ctx.stroke();
        }
        ctx.restore();
    };

    const buildTerrainCache = (width, height) => {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const cacheCtx = canvas.getContext('2d');
        if (!cacheCtx) return null;
        drawStaticTerrain(cacheCtx, width, height);
        return canvas;
    };

    const api = {
        state: 'loading',
        ready: false,
        failed: false,
        load() {
            terrainCache.canvas = null;
            terrainCache.width = 0;
            terrainCache.height = 0;
            api.ready = false;
            api.failed = false;
            images.clear();
            setArtState('loading');
            const entries = Object.entries(TANK_BATTLE_ART_URLS);
            Promise.allSettled(entries.map(async ([key, url]) => {
                const image = await loadImage(url);
                return [key, image];
            })).then(results => {
                const hasFailure = results.some(result => result.status === 'rejected');
                images.clear();
                terrainCache.canvas = null;
                terrainCache.width = 0;
                terrainCache.height = 0;

                if (hasFailure) {
                    api.failed = true;
                    api.state = 'fallback';
                    setArtState('fallback');
                    return;
                }

                results.forEach(result => {
                    const [key, image] = result.value;
                    images.set(key, image);
                });
                api.ready = true;
                api.state = 'ready';
                setArtState('ready');
            });
        },
        has(key) {
            return images.has(key);
        },
        getTerrainCacheStatus() {
            return {
                ready: Boolean(terrainCache.canvas),
                width: terrainCache.width,
                height: terrainCache.height,
            };
        },
        getTankRotation(direction) {
            return TANK_DIRECTION_ROTATIONS[normalizeDirection(direction)];
        },
        getTankDirectionVector(direction) {
            return TANK_DIRECTION_VECTORS[normalizeDirection(direction)];
        },
        drawGround(ctx, width, height) {
            if (
                !terrainCache.canvas
                || terrainCache.width !== width
                || terrainCache.height !== height
            ) {
                if (api.ready || api.failed) {
                    const cache = buildTerrainCache(width, height);
                    if (cache) {
                        terrainCache.canvas = cache;
                        terrainCache.width = width;
                        terrainCache.height = height;
                    }
                }
            }

            if (terrainCache.canvas) {
                ctx.drawImage(terrainCache.canvas, 0, 0, width, height);
                return;
            }

            // Keep the procedural fallback available while authored images load.
            drawStaticTerrain(ctx, width, height);
        },
        drawWall(ctx, wall) {
            const key = wall.type === 'steel'
                ? 'tiles.steel'
                : wall.type === 'brick' || wall.destructible
                    ? 'tiles.brick'
                    : 'tiles.boundary';
            const image = images.get(key);
            if (!image) return false;
            ctx.drawImage(image, wall.x, wall.y, wall.width, wall.height);
            return true;
        },
        drawTank(ctx, tank) {
            const key = TANK_ASSET_KEYS[tank.isBoss ? 'boss' : tank.isPlayer ? 'player' : 'enemy'];
            const image = images.get(key);
            if (!image) return false;

            ctx.save();
            ctx.translate(tank.x + tank.width / 2, tank.y + tank.height / 2);
            ctx.rotate(api.getTankRotation(tank.direction));
            ctx.drawImage(image, -tank.width / 2, -tank.height / 2, tank.width, tank.height);
            ctx.restore();
            return true;
        },
        drawPowerUp(ctx, powerUp) {
            const key = POWERUP_ASSET_KEYS[powerUp.type];
            const image = images.get(key);
            if (!image) return false;

            const bobY = powerUp.y + Math.sin(powerUp.time + powerUp.bobOffset) * 2;
            const cx = powerUp.x + powerUp.width / 2;
            const cy = bobY + powerUp.height / 2;
            const pulse = 0.92 + Math.sin(powerUp.time * 1.7 + powerUp.bobOffset) * 0.04;

            ctx.save();
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = '#07110e';
            ctx.beginPath();
            ctx.ellipse(cx, bobY + powerUp.height + 2, powerUp.width * 0.42, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            polygon(ctx, cx, cy, powerUp.width * 0.62, 6);
            ctx.fillStyle = '#1c3329';
            ctx.fill();
            ctx.strokeStyle = powerUp.getColor();
            ctx.lineWidth = 1.4;
            ctx.stroke();

            const size = powerUp.width * pulse;
            ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
            ctx.restore();
            return true;
        },
        setWeaponIcon(element, index) {
            if (!element) return;
            const slot = Math.max(0, Math.min(2, Number(index) || 0));
            const image = images.get('ui.weaponIcons');
            if (image) {
                element.style.backgroundImage = `url("${TANK_BATTLE_ART_URLS['ui.weaponIcons']}")`;
                element.style.backgroundPosition = `${slot * -22.5}px 0`;
                element.dataset.tbWeaponIcon = 'atlas';
            } else {
                element.style.backgroundImage = 'none';
                element.style.backgroundPosition = '0 0';
                element.dataset.tbWeaponIcon = 'fallback';
            }
        },
        drawMiniMapBase(ctx, width, height) {
            ctx.fillStyle = '#17251f';
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = '#557467';
            ctx.lineWidth = 1;
            ctx.strokeRect(1, 1, width - 2, height - 2);
            ctx.strokeStyle = '#d6c17b';
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(7, 10); ctx.lineTo(20, 10);
            ctx.moveTo(width - 20, 10); ctx.lineTo(width - 7, 10);
            ctx.moveTo(7, height - 10); ctx.lineTo(20, height - 10);
            ctx.moveTo(width - 20, height - 10); ctx.lineTo(width - 7, height - 10);
            ctx.stroke();
            ctx.globalAlpha = 1;
        },
        drawMiniMapFrame(ctx, width, height) {
            const image = images.get('ui.minimapFrame');
            if (!image) return false;
            ctx.drawImage(image, 0, 0, width, height);
            return true;
        },
    };

    api.load();
    return api;
}
