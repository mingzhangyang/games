#!/usr/bin/env node
// Neon Tower Defense production-art contract: source assets, map geometry,
// runtime URL registration, and the immersive migration.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../src/games/tower-defense/levels.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_ROOT = join(ROOT, 'assets', 'tower-defense', 'production');
const manifest = JSON.parse(readFileSync(join(ART_ROOT, 'manifest.json'), 'utf8'));
const art = readFileSync(join(ROOT, 'src', 'games', 'tower-defense', 'art.js'), 'utf8');
const game = [
    readFileSync(join(ROOT, 'src', 'games', 'tower-defense', 'index.js'), 'utf8'),
    readFileSync(join(ROOT, 'src', 'games', 'tower-defense', 'runtime.js'), 'utf8'),
    readFileSync(join(ROOT, 'src', 'games', 'tower-defense', 'render', 'scene-renderer.js'), 'utf8'),
    readFileSync(join(ROOT, 'src', 'games', 'tower-defense', 'ui', 'overlays.js'), 'utf8'),
].join('\n');
const i18n = readFileSync(join(ROOT, 'src', 'games', 'tower-defense', 'i18n.js'), 'utf8');
const html = readFileSync(join(ROOT, 'tower-defense.html'), 'utf8');
const css = readFileSync(join(ROOT, 'css', 'tower-defense.css'), 'utf8');
const registryConfig = JSON.parse(readFileSync(join(ROOT, 'games.config.json'), 'utf8'));
const tdHome = registryConfig.games.find(item => item.id === 'tower-defense')?.home;
const landingCopy = JSON.stringify(tdHome || {});
const landingHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const socialPreview = readFileSync(join(ROOT, 'public', 'assets', 'seo', 'og-tower-defense.svg'), 'utf8');

const failures = [];
const passes = [];
const fail = message => failures.push(message);
const pass = message => passes.push(message);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const expectedKeys = [
    'environment.battlefield', 'environment.platform', 'environment.reactor',
    'environment.singularity', 'towers.atlas', 'enemies.atlas', 'fx.atlas', 'ui.startHero'
];
const expectedViewBoxes = {
    'environment.battlefield': '0 0 800 600',
    'environment.platform': '0 0 800 600',
    'environment.reactor': '0 0 800 600',
    'environment.singularity': '0 0 800 600',
    'towers.atlas': '0 0 256 64',
    'enemies.atlas': '0 0 768 64',
    'fx.atlas': '0 0 384 64',
    'ui.startHero': '0 0 360 180',
};

if (manifest.version !== 1 || manifest.coordinateSpace !== '800x600') fail('manifest must declare version 1 and 800x600 coordinateSpace');
else pass('manifest coordinate contract is 800×600');
if (!Number.isFinite(manifest.budgetBytes) || manifest.budgetBytes > 3 * 1024 * 1024) fail('manifest hard budget must be ≤ 3 MiB');
if (!same(Object.keys(manifest.assets || {}).sort(), [...expectedKeys].sort())) fail('manifest asset keys do not match the production contract');
else pass('manifest has the complete eight-key asset pack');

let totalBytes = 0;
for (const key of expectedKeys) {
    const entry = manifest.assets?.[key];
    if (!entry?.file || !entry.kind || !entry.fallback) {
        fail(`${key}: manifest entry needs file/kind/fallback`);
        continue;
    }
    const absolute = join(ART_ROOT, entry.file);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
        fail(`${key}: missing ${entry.file}`);
        continue;
    }
    const bytes = statSync(absolute).size;
    totalBytes += bytes;
    if (bytes === 0) fail(`${key}: empty asset`);
    const body = readFileSync(absolute, 'utf8');
    const viewBox = body.match(/viewBox="([^"]+)"/)?.[1];
    if (!body.includes('<svg') || viewBox !== expectedViewBoxes[key]) {
        fail(`${key}: expected SVG viewBox ${expectedViewBoxes[key]}, got ${viewBox || 'missing'}`);
    }
}
if (totalBytes > manifest.budgetBytes) fail(`production SVG pack is ${totalBytes} bytes; budget is ${manifest.budgetBytes}`);
else pass(`production SVG pack is ${totalBytes} bytes`);

const urlKeys = [...art.matchAll(/'([^']+)':\s*new URL\('/g)].map(match => match[1]);
if (!same([...urlKeys].sort(), [...expectedKeys].sort())) fail('literal TD_ART_URLS keys do not match manifest keys');
else pass('Vite-discoverable literal URL map matches manifest');
for (const key of expectedKeys) {
    const entry = manifest.assets[key];
    const literal = `../../../assets/tower-defense/production/${entry.file}?no-inline`;
    if (!art.includes(`new URL('${literal}', import.meta.url)`)) fail(`${key}: literal import.meta.url path is missing`);
}
if (/new URL\([^']*manifest|new URL\([^']*\.file/.test(art)) fail('runtime art URLs must not be assembled from manifest values');

const compileMap = level => {
    const map = level.map;
    const groundGrid = new Set();
    const compilePath = (waypoints, grid = null) => {
        let total = 0;
        for (let i = 0; i < waypoints.length - 1; i++) {
            const [c0, r0] = waypoints[i];
            const [c1, r1] = waypoints[i + 1];
            if (c0 !== c1 && r0 !== r1) fail(`${level.id}: diagonal waypoint segment`);
            total += Math.abs(c1 - c0) * map.cell + Math.abs(r1 - r0) * map.cell;
            let c = c0, r = r0;
            while (true) {
                if (grid && c >= 0 && c < map.cols && r >= 0 && r < map.rows) grid.add(`${c},${r}`);
                if (c === c1 && r === r1) break;
                c += Math.sign(c1 - c0);
                r += Math.sign(r1 - r0);
            }
        }
        return total;
    };
    const ground = compilePath(map.groundWaypoints, groundGrid);
    const air = compilePath(map.airWaypoints || map.groundWaypoints);
    const validWaypoint = ([c, r], index, list) => {
        const endpoint = index === 0 || index === list.length - 1;
        return (c >= 0 && c < map.cols && r >= 0 && r < map.rows)
            || (endpoint && (r === -1 || r === map.rows || c === -1 || c === map.cols));
    };
    for (const [i, point] of map.groundWaypoints.entries()) {
        if (!validWaypoint(point, i, map.groundWaypoints)) fail(`${level.id}: ground waypoint ${i} is outside the entry/exit rule`);
    }
    for (const [i, point] of (map.airWaypoints || []).entries()) {
        if (!validWaypoint(point, i, map.airWaypoints)) fail(`${level.id}: air waypoint ${i} is outside the entry/exit rule`);
    }
    return { ground, air, buildable: map.cols * map.rows - groundGrid.size, signature: map.groundWaypoints.map(p => p.join(',')).join(';') };
};

const compiled = LEVELS.map(level => [level, compileMap(level)]);
if (LEVELS.length !== 6) fail(`expected six operations, got ${LEVELS.length}`);
const signatures = compiled.map(([, result]) => result.signature);
if (new Set(signatures).size !== signatures.length) fail('ground path signatures must be unique across all six operations');
else pass('six operations have unique ground maps');
for (const [level, result] of compiled) {
    if (result.ground < 1840) fail(`${level.id}: ground path ${result.ground}px < 1840px`);
    if (result.buildable < 190) fail(`${level.id}: ${result.buildable} buildable cells < 190`);
    if (level.modifiers?.flyers && (!level.map.airWaypoints || result.air >= result.ground)) {
        fail(`${level.id}: flyer operation needs a distinct shorter air path`);
    }
}
if (compiled.every(([, result]) => result.ground >= 1840 && result.buildable >= 190)) pass('all maps satisfy the expanded battlefield thresholds');

for (const needle of [
    'createTowerDefenseArt', 'artReady', 'environment.battlefield', 'heroArt.src', 'if (!hasProductionSprite)',
    'hasProductionEnemy', 'enemySprites[e.type]', 'layout: \'immersive\'', 'new Int16Array(this.map.cols * this.map.rows)',
    'this.map.groundPath', 'this.map.airPath', 'this.map.pathGrid'
]) {
    if (!game.includes(needle)) fail(`runtime is missing ${needle}`);
}
for (const forbidden of ['createStatsDrawer', 'window.tdDrawer', 'const WAYPOINTS', 'const AIR_WAYPOINTS', 'const GROUND_PATH', 'const AIR_PATH']) {
    if (game.includes(forbidden)) fail(`legacy runtime contract remains: ${forbidden}`);
}
if (!html.includes('game-shell game-shell--immersive') || !html.includes('game-stage game-stage--immersive')) fail('immersive shell/stage classes are missing');
if (!html.includes('id="td-canvas" width="800" height="600"')) fail('HTML canvas must declare the 800×600 logical contract');
for (const forbidden of ['game-sidebar', 'tdStatsDrawer', 'game-drawer-panel', 'tdStatsDrawerBody']) {
    if (html.includes(forbidden)) fail(`legacy HTML contract remains: ${forbidden}`);
}
if (!html.includes('id="tdTacticalPanel"') || !html.includes('id="tdStatsPanels"')) fail('immersive tactical panel or single stats node is missing');
if (css.includes('--frame-shell-max')) fail('tower-defense CSS still carries the standard frame-budget shell cap');
if (!css.includes('--frame-immersive-max: 800px')) fail('tower-defense CSS does not override immersive max width to 800px');
if (!css.includes('.td-shell.game-shell--immersive #td-canvas') || !css.includes('pointer-events: auto')) fail('immersive canvas must explicitly restore pointer input inside the non-interactive scene wrapper');
const mobileMenuSelector = '.td-shell.game-shell--immersive .td-stage:has(> .game-overlay--menu:not(.hidden))';
const blockBodyAt = (source, start) => {
    if (start < 0) return '';
    const open = source.indexOf('{', start);
    if (open < 0) return '';
    let depth = 0;
    for (let index = open; index < source.length; index++) {
        if (source[index] === '{') depth++;
        if (source[index] === '}' && --depth === 0) return source.slice(open + 1, index);
    }
    return '';
};
const cssRuleBody = (selector, source = css) => blockBodyAt(source, source.indexOf(`${selector} {`));
const landscapeMediaHeader = '@media (width < 1024px) and (orientation: landscape)';
const landscapeMediaBody = blockBodyAt(css, css.indexOf(landscapeMediaHeader));
const mobileBattleSelector = '.td-shell.game-shell--immersive:has(> .td-main > .td-stage > .game-overlay--menu.hidden) .td-stage';
const mobileBattleSelectorCount = css.split(`${mobileBattleSelector} {`).length - 1;
const mobileBattleRule = cssRuleBody(mobileBattleSelector, landscapeMediaBody);
const requiredBattleDeclarations = [
    'position: fixed;', 'inset: 0;', 'width: 100vw;', 'max-width: none;',
    'height: 100dvh;', 'min-height: 0;'
];
const missingBattleDeclarations = requiredBattleDeclarations.filter(declaration => !mobileBattleRule.includes(declaration));
if (mobileBattleSelectorCount !== 1 || !landscapeMediaBody.includes(`${mobileBattleSelector} {`)) {
    fail('mobile fullscreen battle selector must exist exactly once inside the landscape media block');
} else if (!mobileBattleRule || missingBattleDeclarations.length) {
    fail(`mobile landscape battle stage must fill the viewport: ${missingBattleDeclarations.join(', ') || 'missing selector'}`);
} else if (!landscapeMediaBody) {
    fail('mobile fullscreen battle landscape media block is missing');
} else if (cssRuleBody('.td-shell.game-shell--immersive:has(> .td-main > .td-stage > .game-overlay--menu.hidden) > .td-footer', landscapeMediaBody).trim() !== 'display: none;') {
    fail('mobile fullscreen battle must hide the footer inside the same landscape media block');
} else {
    pass('mobile landscape battle expands to the full viewport without stretching the logical scene');
}

const mobileMenuRule = cssRuleBody(mobileMenuSelector);
const mobileMenuOverlayRule = cssRuleBody(`${mobileMenuSelector} > .td-overlay--menu`);
const requiredMenuStageDeclarations = [
    'display: grid;', 'height: auto;', 'min-height: 0;',
    'overflow: visible;', 'touch-action: auto;',
    'user-select: auto;', '-webkit-user-select: auto;'
];
const missingMenuStageDeclarations = requiredMenuStageDeclarations.filter(declaration => !mobileMenuRule.includes(declaration));
if (!mobileMenuRule || missingMenuStageDeclarations.length) {
    fail(`mobile immersive start menu stage rule is incomplete: ${missingMenuStageDeclarations.join(', ') || 'missing selector'}`);
} else if (!mobileMenuOverlayRule.includes('position: relative;')
    || !mobileMenuOverlayRule.includes('overflow: visible;')
    || !mobileMenuOverlayRule.includes('touch-action: auto;')) {
    fail('mobile immersive start menu overlay rule must stay in normal scrollable flow');
} else {
    pass('mobile immersive start menu flow declarations are scoped to their rules');
}
if (!i18n.includes('heroLabel:') || !game.includes("setAttribute('aria-label', t.heroLabel)")) {
    fail('start hero accessible label must be defined in game i18n and applied during applyLanguage');
}
for (const source of [landingCopy, landingHtml, socialPreview]) {
    if (source.includes('25 waves') || source.includes('25 波') || source.includes('neon grid') || source.includes('霓虹网格')) fail('landing/preview copy still advertises the retired 25-wave neon-grid contract');
}
if (!tdHome?.desc?.en.includes('six future-city operations') || !tdHome?.desc?.zh.includes('六个未来城市作战行动')) fail('registry home translations must describe the six-operation future-city contract');
if (!socialPreview.includes('six operations') || !socialPreview.includes('15–40 waves')) fail('social preview must describe the six-operation 15–40-wave contract');

if (failures.length) {
    console.error(failures.map(item => `✗ ${item}`).join('\n'));
    console.error(`\nverify-td-art：${failures.length} 项失败（${passes.length} 项通过）❌`);
    process.exit(1);
}
console.log(passes.map(item => `✓ ${item}`).join('\n'));
console.log(`verify-td-art 全部通过 ✅（${passes.length} 项断言）`);
