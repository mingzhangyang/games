#!/usr/bin/env node
// Tank Battle production-art contract: authored assets, runtime wiring, fallbacks, and verification registration.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_ROOT = join(ROOT, 'assets', 'tank-battle');
const manifest = JSON.parse(readFileSync(join(ART_ROOT, 'manifest.json'), 'utf8'));
const art = readFileSync(join(ROOT, 'js', 'tank-battle-art.js'), 'utf8');
const entities = readFileSync(join(ROOT, 'js', 'tank-entities.js'), 'utf8');
const game = readFileSync(join(ROOT, 'js', 'tank-battle.js'), 'utf8');
const html = readFileSync(join(ROOT, 'tank-battle.html'), 'utf8');
const css = readFileSync(join(ROOT, 'css', 'tank-battle.css'), 'utf8');
const smoke = readFileSync(join(ROOT, 'scripts', 'smoke-tank-battle.mjs'), 'utf8');
const verifyAll = readFileSync(join(ROOT, 'scripts', 'verify-all.mjs'), 'utf8');

const failures = [];
const passes = [];
const fail = message => failures.push(message);
const pass = message => passes.push(message);

const expected = {
    'terrain.ground': ['terrain/ground.svg', '0 0 40 40'],
    'terrain.detail': ['terrain/ground-detail.svg', '0 0 800 600'],
    'terrain.border': ['terrain/border.svg', '0 0 40 40'],
    'tiles.brick': ['tiles/brick.svg', '0 0 20 20'],
    'tiles.steel': ['tiles/steel.svg', '0 0 20 20'],
    'tiles.boundary': ['tiles/boundary.svg', '0 0 20 20'],
    'tanks.player': ['tanks/player.svg', '0 0 40 40'],
    'tanks.enemy': ['tanks/enemy.svg', '0 0 40 40'],
    'tanks.boss': ['tanks/boss.svg', '0 0 48 48'],
    'powerups.health': ['powerups/health.svg', '0 0 24 24'],
    'powerups.weapon': ['powerups/weapon.svg', '0 0 24 24'],
    'powerups.shield': ['powerups/shield.svg', '0 0 24 24'],
    'powerups.speed': ['powerups/speed.svg', '0 0 24 24'],
    'ui.minimapFrame': ['ui/minimap-frame.svg', '0 0 120 90'],
    'ui.weaponIcons': ['ui/weapon-icons.svg', '0 0 96 24'],
    'ui.rotateDevice': ['ui/rotate-device.svg', '0 0 160 120'],
};

if (manifest.version !== 1 || manifest.coordinateSpace !== '800x600') {
    fail('manifest must declare version 1 and the 800x600 coordinate space');
} else {
    pass('manifest declares the 800x600 world');
}
if (!Number.isFinite(manifest.budgetBytes) || manifest.budgetBytes > 2621440) {
    fail('art budget must be at most 2.5 MiB');
}

const manifestKeys = Object.keys(manifest.assets || {}).sort();
const expectedKeys = Object.keys(expected).sort();
if (JSON.stringify(manifestKeys) !== JSON.stringify(expectedKeys)) {
    fail('manifest asset keys do not match the complete Tank Battle pack');
} else {
    pass('manifest contains terrain, walls, tanks, power-ups, and UI assets');
}

let totalBytes = 0;
for (const [key, [relative, viewBox]] of Object.entries(expected)) {
    const entry = manifest.assets?.[key];
    if (!entry || entry.file !== relative || !entry.kind || !entry.fallback) {
        fail(key + ': manifest metadata is incomplete');
        continue;
    }
    const file = join(ART_ROOT, relative);
    if (!existsSync(file) || !statSync(file).isFile()) {
        fail(key + ': missing ' + relative);
        continue;
    }
    totalBytes += statSync(file).size;
    const body = readFileSync(file, 'utf8');
    const actualViewBox = body.match(/viewBox="([^"]+)"/)?.[1];
    if (!body.includes('<svg') || actualViewBox !== viewBox) {
        fail(key + ': expected SVG viewBox ' + viewBox + ', got ' + (actualViewBox || 'missing'));
    }
    const literal = "new URL('../assets/tank-battle/" + relative + "', import.meta.url)";
    if (!art.includes(literal)) fail(key + ': runtime URL is not a literal import.meta.url reference');
}
if (totalBytes > manifest.budgetBytes) fail('art pack is ' + totalBytes + ' bytes, over budget ' + manifest.budgetBytes);
else pass('art pack is ' + totalBytes + ' bytes and within budget');
if (!existsSync(join(ART_ROOT, 'README.md')) || !existsSync(join(ART_ROOT, 'reference', 'concept-miniature-battlefield.svg'))) {
    fail('art README or concept freeze is missing');
} else {
    pass('art pack includes a documented concept freeze');
}

for (const needle of [
    'createTankBattleArt',
    'this.art.drawGround',
    'this.art.drawWall',
    'powerUp.render(this.ctx, this.art)',
    'this.player.render(this.ctx, this.art)',
    'this.renderDebugHitboxes()',
    'this.art.drawMiniMapFrame(this.miniMapCtx, 120, 90)',
    'this.updateWeaponIcons()',
    'debug-hitbox',
    ' BOSS'
]) {
    if (!game.includes(needle)) fail('runtime is missing ' + needle);
}
if (game.includes('this.renderGrid();')) fail('black grid renderer is still used as the primary scene');
if (entities.includes('fillText(this.getIcon())')) fail('emoji power-up renderer is still active');
for (const forbidden of ['❤', '🔫', '🛡', '⚡', '👑']) {
    if (game.includes(forbidden) || entities.includes(forbidden) || html.includes(forbidden)) {
        fail('legacy emoji remains: ' + forbidden);
    }
}
if (!html.includes('id="gameCanvas" width="800" height="600"')) fail('HTML canvas must keep the 800x600 logical contract');
if (!html.includes('data-tb-art-state="loading"')) fail('HTML must expose the art loading state');
if (!html.includes('rotate-device.svg') || html.includes('class="phone-frame"')) fail('authored orientation art is not wired');
if (!css.includes("background-image: url('../assets/tank-battle/ui/minimap-frame.svg')")) fail('minimap frame asset is not wired');
if (!css.includes('.rotate-device-illustration')) fail('orientation illustration styling is missing');
if (!html.includes('id="weaponHudIcon"') || !html.includes('id="vWeaponIcon"')) fail('weapon atlas targets are missing');
if (!art.includes('setWeaponIcon(element, index)')) fail('weapon icon atlas is not wired to a renderer');
if (!smoke.includes('844') || !smoke.includes('932') || !smoke.includes('production art state')) fail('smoke does not cover both landscape phone sizes and art readiness');

if (!verifyAll.includes("{ name: 'tank-battle-art', script: 'scripts/verify-tank-battle-art.mjs', args: [], needsServer: false }")) {
    fail('verify-all is missing tank-battle-art');
}
const quickNames = verifyAll.match(/const QUICK_NAMES = \[(.*?)\];/s)?.[1] || '';
if (!quickNames.split(',').some(token => token.trim().replace(/^['\"]|['\"]$/g, '') === 'tank-battle-art')) {
    fail('tank-battle-art is not included in QUICK_NAMES');
}

if (failures.length) {
    console.error(failures.map(item => '✗ ' + item).join('\n'));
    console.error('\nverify-tank-battle-art：' + failures.length + ' 项失败（' + passes.length + ' 项通过）❌');
    process.exit(1);
}
console.log(passes.map(item => '✓ ' + item).join('\n'));
console.log('verify-tank-battle-art 全部通过 ✅（' + passes.length + ' 项断言）');
