/** DOM controls and game-side panels for Tower Defense. */
import { ensurePlayerName, setPlayerName } from '../../../platform/player.js';
import { ICONS } from '../../../platform/icons.js';
import { Sfx } from '../audio.js';
import {
    CELL, ENEMY_TYPES, H, SELL_RATIO, STACK_HP_PER, STACK_MAX,
    TOWER_TYPES, W, clamp, formatNumber
} from '../config.js';
import { isBuildable } from '../model/level-runtime.js';
import { buildWave } from '../model/wave-runtime.js';

export function closePanel(game) {
    if (game.sellTimer) {
        clearTimeout(game.sellTimer);
        game.sellTimer = null;
    }
    game.sellConfirming = false;
    game.selectedCell = null;
    game.selectedTowerIdx = -1;
    game.preview = null;
    if (game.el.panel) game.el.panel.classList.add('hidden');
}

export function renderPanel(game) {
    const panel = game.el.panel;
    if (!panel || game.state !== 'playing' || !game.selectedCell) {
        if (panel) panel.classList.add('hidden');
        game.preview = null;
        return;
    }
    const t = game.TEXT;
    panel.textContent = '';
    panel.classList.remove('hidden');

    if (game.selectedTowerIdx >= 0 && game.towers[game.selectedTowerIdx]) {
        const tower = game.towers[game.selectedTowerIdx];
        const cfg = TOWER_TYPES[tower.type];
        const lv = cfg.levels[tower.level];
        const isMax = tower.level >= cfg.levels.length - 1;
        const next = isMax ? null : cfg.levels[tower.level + 1];

        game.preview = {
            x: tower.x, y: tower.y,
            range: lv.range,
            nextRange: next ? next.range : null,
            color: cfg.color
        };

        const prioKey = 'prio' + (tower.priority || 'first').charAt(0).toUpperCase() + (tower.priority || 'first').slice(1);
        const prioName = t[prioKey] || tower.priority;

        // 头部：塔名、等级标牌、总伤击杀、关闭按钮
        const header = document.createElement('div');
        header.className = 'td-panel-header';

        const titleRow = document.createElement('div');
        titleRow.className = 'td-panel-title-row';
        titleRow.innerHTML = `<span>${cfg.icon}</span> <b>${t[tower.type]}</b> <span class="td-lv-tag ${tower.level === 3 ? 'ult' : ''}">Lv.${tower.level + 1}</span>`;

        const mvpTag = document.createElement('span');
        mvpTag.className = 'td-mvp-tag';
        mvpTag.textContent = `DMG ${formatNumber(tower.damageDealt || 0)} · K ${tower.kills || 0}`;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'td-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => { Sfx.click(); game.closePanel(); });

        header.append(titleRow, mvpTag, closeBtn);

        // 动作网格：集火策略、升级、出售
        const inspectGrid = document.createElement('div');
        inspectGrid.className = 'td-inspect-grid';

        // 1. 集火按钮
        const prioBtn = document.createElement('button');
        prioBtn.type = 'button';
        prioBtn.className = 'td-action-card priority';
        prioBtn.innerHTML = `<span class="td-act-label">TARGET · ${t.priority} [T]</span><b class="td-act-val">${prioName}</b><span class="td-act-diff">Tap to switch</span>`;
        prioBtn.addEventListener('click', () => game.cycleTargetPriority());

        // 2. 升级按钮
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        if (next) {
            const isNextUlt = (tower.level + 1) === 3;
            upBtn.className = `td-action-card upgrade ${isNextUlt ? 'ultimate' : ''} ${next.cost > game.gold ? 'poor' : ''}`;
            upBtn.innerHTML = `<span class="td-act-label">${isNextUlt ? 'AWAKENING · ' + t.ultimate : 'UPGRADE · ' + t.upgrade + ' [U]'}</span><b class="td-act-val">${next.cost} CR</b><span class="td-act-diff">${t.dmg} ${lv.dmg}→${next.dmg} · ${t.range} ${lv.range}→${next.range}</span>`;
            upBtn.addEventListener('click', () => game.tryUpgrade());
        } else {
            upBtn.className = 'td-action-card maxed';
            upBtn.innerHTML = `<span class="td-act-label">AWAKENING · ${t.maxLevel}</span><b class="td-act-val">MAXED</b><span class="td-act-diff">${lv.perkName || ''}</span>`;
        }

        // 3. 出售按钮
        const refund = Math.round(tower.invested * SELL_RATIO);
        const sellBtn = document.createElement('button');
        sellBtn.type = 'button';
        if (game.sellConfirming) {
            sellBtn.className = 'td-action-card sell confirming';
            sellBtn.innerHTML = `<span class="td-act-label">CONFIRM · ${game.lang === 'zh' ? '确认出售?' : 'Confirm?'} [S]</span><b class="td-act-val">+${refund} CR</b><span class="td-act-diff">${game.lang === 'zh' ? '再次点击确认' : 'Tap again'}</span>`;
        } else {
            sellBtn.className = 'td-action-card sell';
            sellBtn.innerHTML = `<span class="td-act-label">CREDIT · ${t.sell} [S]</span><b class="td-act-val">+${refund}</b><span class="td-act-diff">70% refund</span>`;
        }
        sellBtn.addEventListener('click', () => game.trySell());

        inspectGrid.append(prioBtn, upBtn, sellBtn);
        panel.append(header, inspectGrid);
    } else {
        const { c, r } = game.selectedCell;
        if (!isBuildable(game.map, c, r) || game.towerAt(c, r) >= 0) {
            game.closePanel();
            return;
        }

        // 选定建造模式
        game.preview = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, range: 105, color: '#40d8ff' };

        const header = document.createElement('div');
        header.className = 'td-panel-header';
        header.innerHTML = `<div class="td-panel-title-row"><span>DEPLOY</span> <b>${game.lang === 'zh' ? '建造防御塔' : 'Build Tower'}</b></div>`;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'td-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => { Sfx.click(); game.closePanel(); });
        header.appendChild(closeBtn);

        const buildGrid = document.createElement('div');
        buildGrid.className = 'td-build-grid';

        const hotkeys = { pulse: '1', frost: '2', cannon: '3', tesla: '4' };

        for (const [type, cfg] of Object.entries(TOWER_TYPES)) {
            const lv = cfg.levels[0];
            const card = document.createElement('button');
            card.type = 'button';
            card.className = `td-build-card ${type} ${cfg.cost > game.gold ? 'poor' : ''}`;
            card.innerHTML = `
                    <span class="td-card-hotkey">[${hotkeys[type]}]</span>
                    <span class="td-card-icon">${cfg.icon}</span>
                    <span class="td-card-name">${t[type]}</span>
                    <span class="td-card-cost">${cfg.cost} CR</span>
                    <span class="td-card-stats">${lv.dmg} DMG · ${lv.range} RNG</span>
                `;
            card.addEventListener('mouseenter', () => {
                game.preview = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, range: lv.range, color: cfg.color };
            });
            card.addEventListener('mouseleave', () => {
                game.preview = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, range: 105, color: '#40d8ff' };
            });
            card.addEventListener('click', () => game.tryBuild(type));
            buildGrid.appendChild(card);
        }

        panel.append(header, buildGrid);
    }
}

export function castEmp(game) {
    if (game.state !== 'playing' || game.empCd > 0) return;
    game.empCd = 35;
    const dmg = 45 + game.wave * 6;
    for (const e of game.enemies) {
        if (e.dead) continue;
        e.stunUntil = Math.max(e.stunUntil, game.time + 2.4);
        // EMP 是能量系：无视装甲
        game.damageEnemy(e, dmg, false, null, 'energy');
        game.burst(e.x, e.y, '#40d8ff', 8);
    }
    game.effects.push({ kind: 'emp_wave', x: W / 2, y: H / 2, maxR: Math.hypot(W, H) / 2 + 60, age: 0, life: 0.65 });
    game.shake(5, 0.35);
    Sfx.emp();
    game.showToast(game.TEXT.empCast, 1500);
    game.updateSkillButtons();
}

export function castOverdrive(game) {
    if (game.state !== 'playing' || game.boostCd > 0) return;
    game.boostCd = 45;
    game.overdriveUntil = game.time + 6.0;
    game.effects.push({ kind: 'overdrive_burst', age: 0, life: 0.8 });
    game.shake(3, 0.25);
    Sfx.overdrive();
    game.showToast(game.TEXT.overdriveCast, 1500);
    game.updateSkillButtons();
}

export function updateSkillButtons(game) {
    if (game.el['skill-emp']) {
        const ready = game.empCd <= 0;
        game.el['skill-emp'].classList.toggle('ready', ready && game.state === 'playing');
        game.el['skill-emp'].classList.toggle('on-cooldown', !ready);
        if (game.el['emp-timer']) {
            game.el['emp-timer'].textContent = ready ? '' : `${Math.ceil(game.empCd)}s`;
        }
        if (game.el['emp-ring']) {
            const pct = clamp(game.empCd / 35, 0, 1);
            game.el['emp-ring'].style.strokeDashoffset = (119.38 * pct).toFixed(1);
        }
    }
    if (game.el['skill-boost']) {
        const ready = game.boostCd <= 0;
        game.el['skill-boost'].classList.toggle('ready', ready && game.state === 'playing');
        game.el['skill-boost'].classList.toggle('on-cooldown', !ready);
        if (game.el['boost-timer']) {
            game.el['boost-timer'].textContent = ready ? '' : `${Math.ceil(game.boostCd)}s`;
        }
        if (game.el['boost-ring']) {
            const pct = clamp(game.boostCd / 45, 0, 1);
            game.el['boost-ring'].style.strokeDashoffset = (119.38 * pct).toFixed(1);
        }
    }
}

export function updateHud(game) {
    if (game.el.lives) {
        game.el.lives.textContent = Math.max(0, game.lives);
        const livesStat = game.el.lives.closest('.td-stat');
        if (livesStat) {
            livesStat.classList.toggle('danger', game.lives <= 5 && game.lives > 0);
        }
    }
    if (game.el.gold) {
        const currentGoldStr = formatNumber(game.gold);
        if (game.el.gold.textContent !== currentGoldStr) {
            game.el.gold.textContent = currentGoldStr;
            game.el.gold.classList.remove('gold-bounce');
            void game.el.gold.offsetWidth;
            game.el.gold.classList.add('gold-bounce');
        }
    }
    const total = game.level ? game.level.waves : 1;
    if (game.el.wave) game.el.wave.textContent = `${Math.max(1, game.wave)}/${total}`;

    // 堆叠徽标：只在压波时出现，提示玩家当前承受的额外强度
    if (game.el['stack-badge']) {
        const badge = game.el['stack-badge'];
        if (game.stack > 0) {
            badge.classList.remove('hidden');
            badge.textContent = `×${game.stack} +${Math.round(game.stack * STACK_HP_PER * 100)}%`;
            badge.classList.remove('pulse');
            void badge.offsetWidth;
            badge.classList.add('pulse');
        } else {
            badge.classList.add('hidden');
        }
    }
}

export function renderWaveButton(game) {
    const btn = game.el['wave-btn'];
    const textEl = game.el['wave-text'];
    const previewEl = game.el['wave-preview'];
    if (!btn || !textEl) return;
    const t = game.TEXT;
    const L = game.level;

    if (game.waveState === 'idle') {
        btn.disabled = false;
        btn.classList.remove('early-call');
        const nextWave = Math.min(L.waves, game.wave + 1);
        textEl.textContent = t.startWave.replace('{n}', nextWave);

        // 下波怪物预告
        if (previewEl && game.wave < L.waves) {
            const nextCfg = buildWave(nextWave, L);
            const chips = Object.entries(nextCfg.summary)
                .sort((a, b) => b[1] - a[1])
                .map(([type, cnt]) => `${ENEMY_TYPES[type].icon}×${cnt}`)
                .slice(0, 5)
                .join(' ');
            previewEl.textContent = chips;
        } else if (previewEl) {
            previewEl.textContent = '';
        }
    } else {
        const stackCap = Math.min(STACK_MAX, L.waves - game.wave);
        if (game.wave < L.waves) {
            btn.disabled = false;
            // 还能压波 → 高亮成"有风险的加速"；已到上限 → 收敛为普通状态
            btn.classList.toggle('early-call', game.stack < stackCap);
            textEl.textContent = game.stack < stackCap
                ? t.earlyCall.replace('{n}', game.stack + 1)
                : t.waveRunning.replace('{n}', game.wave);
            const alive = game.enemies.length + game.spawnQueue.length;
            if (previewEl) previewEl.textContent = `${t.waveRunning.replace('{n}', game.wave)} · ${alive}`;
        } else {
            btn.disabled = true;
            btn.classList.remove('early-call');
            const alive = game.enemies.length + game.spawnQueue.length;
            textEl.textContent = `${t.waveRunning.replace('{n}', game.wave)} · ${alive}`;
            if (previewEl) previewEl.textContent = t.finalWave;
        }
    }
}

export function showToast(game, text, duration = 1600) {
    const toast = game.el.toast;
    if (!toast) return;
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(game.toastTimer);
    game.toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

export function bindUI(game) {
    if (game.el['btn-play']) game.el['btn-play'].addEventListener('click', () => {
        Sfx.click();
        game.startGame();
    });
    if (game.el['wave-btn']) game.el['wave-btn'].addEventListener('click', () => game.startWave());
    if (game.el['pause-btn']) game.el['pause-btn'].addEventListener('click', () => {
        if (game.state === 'playing') game.pause();
        else if (game.state === 'paused') game.resume();
    });
    if (game.el['btn-resume']) game.el['btn-resume'].addEventListener('click', () => game.resume());
    if (game.el['btn-menu']) game.el['btn-menu'].addEventListener('click', () => game.toMenu());
    if (game.el['btn-menu2']) game.el['btn-menu2'].addEventListener('click', () => game.toMenu());
    if (game.el['btn-again']) game.el['btn-again'].addEventListener('click', () => {
        Sfx.click();
        game.startGame();
    });
    if (game.el['btn-copy']) game.el['btn-copy'].addEventListener('click', () => game.copyResult());

    if (game.el.statsToggle) game.el.statsToggle.addEventListener('click', () => {
        Sfx.click();
        game.toggleTacticalPanel();
    });
    if (game.el.tacticalClose) game.el.tacticalClose.addEventListener('click', () => {
        Sfx.click();
        game.closeTacticalPanel();
    });

    // 战术技能
    if (game.el['skill-emp']) game.el['skill-emp'].addEventListener('click', () => game.castEmp());
    if (game.el['skill-boost']) game.el['skill-boost'].addEventListener('click', () => game.castOverdrive());

    // 射程透视开关
    if (game.el['range-btn']) game.el['range-btn'].addEventListener('click', () => game.toggleShowAllRanges());

    // ×1 / ×2 / ×3 倍速
    if (game.el['speed-btn']) game.el['speed-btn'].addEventListener('click', () => {
        game.speedMult = game.speedMult === 1 ? 2 : game.speedMult === 2 ? 3 : 1;
        game.el['speed-btn'].textContent = `×${game.speedMult}`;
        Sfx.click();
    });

    if (game.el['mute-btn']) game.el['mute-btn'].addEventListener('click', () => game.toggleMute());
    if (game.el['start-mute']) game.el['start-mute'].addEventListener('click', () => game.toggleMute());

    if (game.el.username) {
        game.el.username.addEventListener('change', () => {
            setPlayerName(game.el.username.value);
            game.el.username.value = ensurePlayerName();
        });
        game.el.username.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') game.el.username.blur();
        });
    }

    window.addEventListener('site-settings:changed', () => {
        game.lang = game.readLang();
        game.applyLanguage();
    });
    window.addEventListener('resize', () => game.updateRotationPrompt());
}

export function updateMuteButtons(game) {
    const icon = Sfx.muted ? ICONS.soundOff : ICONS.soundOn;
    if (game.el['mute-btn']) game.el['mute-btn'].innerHTML = icon;
    if (game.el['start-mute']) game.el['start-mute'].innerHTML = icon;
}

export function toggleMute(game) {
    const muted = Sfx.toggleMuted();
    game.updateMuteButtons();
    if (!muted) Sfx.click();
}
