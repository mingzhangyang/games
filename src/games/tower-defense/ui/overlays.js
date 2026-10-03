/** DOM-facing overlays and language panels for Tower Defense. */
import { ICONS } from '../../../platform/icons.js';
import { updateMoreGames } from '../../../platform/more-games.js';
import {
    loadTowerDefenseBest,
    loadTowerDefenseClear,
    loadTowerDefenseGlobalBest,
} from '../storage.js';
import { LEVELS } from '../levels.js';
import { Sfx } from '../audio.js';
import { TOWER_TYPES, formatNumber } from '../config.js';

export function applyArtBindings(game) {
    const hero = game.el['start-hero'];
    if (hero) {
        const heroArt = game.art.get('ui.startHero');
        const production = !!heroArt;
        hero.dataset.art = production ? 'production' : 'fallback';
        hero.classList.toggle('td-hero--production', production);
        if (production) hero.style.backgroundImage = `url("${heroArt.src}")`;
        else hero.style.removeProperty('background-image');
    }
    document.documentElement.dataset.tdArt = game.artStatus;
    window.__TD_ART__ = {
        status: game.artStatus,
        loaded: game.art.loadedCount,
        failed: game.art.failedKeys,
        keys: game.art.keyStatus
    };
}

export function updateRotationPrompt(game) {
    const prompt = game.el['rotate-prompt'];
    if (!prompt) return;
    const portrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    const shouldPrompt = portrait && window.innerWidth < 900;
    prompt.classList.toggle('is-active', shouldPrompt);
    prompt.setAttribute('aria-hidden', shouldPrompt ? 'false' : 'true');
}

export function toggleTacticalPanel(game) {
    const panel = game.el.tacticalPanel;
    if (!panel) return;
    const open = panel.classList.contains('hidden');
    if (open) {
        panel.classList.remove('hidden');
        game.renderTacticalPanel();
    } else {
        game.closeTacticalPanel();
    }
}

export function closeTacticalPanel(game) {
    if (game.el.tacticalPanel) game.el.tacticalPanel.classList.add('hidden');
    if (game.el.statsToggle) {
        game.el.statsToggle.setAttribute('aria-expanded', 'false');
    }
}

export function renderTacticalPanel(game) {
    if (game.el.statsToggle) game.el.statsToggle.setAttribute('aria-expanded', 'true');
    // The panel owns the single #tdStatsPanels node; re-running the language
    // pass is enough to keep it current without cloning any statistics DOM.
    game.updateSideSkills();
    game.updateSideTowers();
    game.updateSideShortcuts();
    game.updateSideRecords();
}

export function applyLanguage(game) {
    const t = game.TEXT;
    document.documentElement.lang = game.lang;
    document.title = game.lang === 'zh'
        ? '霓虹塔防 — 策略塔防游戏'
        : 'Neon Tower Defense — Strategy TD';
    if (game.el['btn-play']) game.el['btn-play'].innerHTML = `${ICONS.play}<span>${t.levelStart.replace('▶ ', '')}</span>`;
    if (game.el['btn-menu']) game.el['btn-menu'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;
    if (game.el['btn-menu2']) game.el['btn-menu2'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;
    if (game.el['btn-again']) game.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;
    if (game.el['btn-copy']) game.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;
    if (game.el['lb-title']) game.el['lb-title'].textContent = `LEADERBOARD · ${t.leaderboard}`;
    if (game.el['best-line']) {
        const best = loadTowerDefenseBest(game.level.id);
        game.el['best-line'].textContent = best ? `${t.best}: ${formatNumber(best)}` : '';
    }
    if (game.el['range-btn']) {
    }
    if (game.el['pause-btn']) {
    }
    if (game.el['mute-btn']) {
    }
    if (game.el.statsToggle) {
        game.el.statsToggle.innerHTML = ICONS.stats;
        game.el.statsToggle.title = t.stats;
        game.el.statsToggle.setAttribute('aria-label', t.stats);
    }
    if (game.el['btn-home']) {
    }
    if (game.el['skill-emp']) {
    }
    if (game.el['skill-boost']) {
    }

    if (game.el.tacticalTitle) game.el.tacticalTitle.textContent = t.tacticalOverview;
    if (game.el.tacticalClose) {
        game.el.tacticalClose.setAttribute('aria-label', t.closeTactical);
    }

    // 侧栏
    if (game.el['side-howto-title']) game.el['side-howto-title'].textContent = `01 · ${t.sideHowTo}`;
    if (game.el['side-skills-title']) game.el['side-skills-title'].textContent = `02 · ${t.sideSkillsTitle}`;
    game.updateSideSkills();
    if (game.el['side-towers-title']) game.el['side-towers-title'].textContent = `03 · ${t.towerLegend}`;
    game.updateSideTowers();
    if (game.el['side-shortcuts-title']) game.el['side-shortcuts-title'].textContent = `04 · ${t.sideShortcutsTitle}`;
    game.updateSideShortcuts();
    if (game.el['side-records-title']) game.el['side-records-title'].textContent = `05 · ${t.sideRecords}`;
    game.updateSideRecords();

    game.renderPanel();
    game.renderWaveButton();
    game.updateSkillButtons();
    game.renderLevelCards();
    updateMoreGames(game.lang);
}

export function updateSideSkills(game) {
    const box = game.el['side-skills'];
    if (!box) return;
    const t = game.TEXT;
    const skills = [
        ['EMP · ' + t.emp, t.empDesc],
        ['OD · ' + t.overdrive, t.overdriveDesc]
    ];
    box.textContent = '';
    skills.forEach(([name, desc]) => {
        const item = document.createElement('div');
        item.className = 'td-side-skill-item';
        const nameEl = document.createElement('b');
        nameEl.textContent = name;
        const descEl = document.createElement('span');
        descEl.textContent = desc;
        item.append(nameEl, descEl);
        box.appendChild(item);
    });
}

export function unlockedCount(game) {
    let count = 1;
    for (let i = 0; i < LEVELS.length - 1; i++) {
        if (loadTowerDefenseClear(LEVELS[i].id)) count = i + 2;
        else break;
    }
    return Math.min(LEVELS.length, count);
}

export function isLevelUnlocked(game, level) {
    return LEVELS.indexOf(level) < game.unlockedCount();
}

export function levelThreats(game, level) {
    const m = level.modifiers || {};
    const list = [];
    if (m.regen) list.push('threatHealer');
    if (m.armored) list.push('threatArmor');
    if (m.flyers) list.push('threatFlyer');
    if (m.splitters) list.push('threatSplitter');
    // 攻城兵随 armored 解锁但更晚，只在长波次关卡提示
    if (m.armored && level.waves >= 30) list.push('threatAttacker');
    if (level.id === 'singularity') list.push('threatOverlord');
    return list;
}

export function renderLevelCards(game) {
    const box = game.el['level-cards'];
    if (!box) return;
    const t = game.TEXT;
    const unlocked = game.unlockedCount();
    box.textContent = '';

    LEVELS.forEach((level, idx) => {
        const name = t.levels[level.id] || { name: level.id, tag: '', desc: '' };
        const isUnlocked = idx < unlocked;
        const best = loadTowerDefenseBest(level.id);
        const cleared = loadTowerDefenseClear(level.id);

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `td-level-card${isUnlocked ? '' : ' locked'}${idx === LEVELS.indexOf(game.level) ? ' active' : ''}`;
        card.dataset.level = level.id;
        if (!isUnlocked) card.disabled = true;

        const head = document.createElement('div');
        head.className = 'td-level-head';
        const nameEl = document.createElement('b');
        nameEl.className = 'td-level-name';
        nameEl.textContent = `${idx + 1}. ${name.name}`;
        const tagEl = document.createElement('span');
        tagEl.className = 'td-level-tag';
        tagEl.textContent = cleared ? `✓ ${name.tag}` : name.tag;
        head.append(nameEl, tagEl);

        const descEl = document.createElement('p');
        descEl.className = 'td-level-desc';
        descEl.textContent = isUnlocked
            ? name.desc
            : t.levelLockHint.replace('{name}', name.name);

        const stats = document.createElement('div');
        stats.className = 'td-level-stats';
        [`W · ${t.levelWaves.replace('{n}', level.waves)}`,
            `CR · ${t.levelGold.replace('{n}', level.gold)}`,
            `HP · ${t.levelLives.replace('{n}', level.lives)}`].forEach(txt => {
            const chip = document.createElement('span');
            chip.className = 'td-level-chip';
            chip.textContent = txt;
            stats.appendChild(chip);
        });

        card.append(head, descEl, stats);

        // 机制提示：这关新增了什么威胁
        const threats = game.levelThreats(level);
        if (isUnlocked && threats.length) {
            const row = document.createElement('div');
            row.className = 'td-level-threats';
            const lbl = document.createElement('span');
            lbl.className = 'td-level-threats-lbl';
            lbl.textContent = `${t.enemyTeaches}:`;
            row.appendChild(lbl);
            threats.forEach(key => {
                const chip = document.createElement('span');
                chip.className = 'td-level-threat-chip';
                chip.textContent = t[key];
                row.appendChild(chip);
            });
            card.appendChild(row);
        }

        if (best) {
            const bestEl = document.createElement('span');
            bestEl.className = 'td-level-best';
            bestEl.textContent = `BEST · ${t.levelBest} ${formatNumber(best)}`;
            card.appendChild(bestEl);
        } else if (!isUnlocked) {
            const lockEl = document.createElement('span');
            lockEl.className = 'td-level-best locked';
            lockEl.textContent = `LOCKED · ${t.levelLocked}`;
            card.appendChild(lockEl);
        }

        card.addEventListener('click', () => {
            if (!isUnlocked) return;
            Sfx.click();
            game.level = level;
            game.resetRun();
            game.renderLevelCards();
            game.renderBriefing();
        });
        box.appendChild(card);
    });

    game.renderBriefing();
}

export function renderBriefing(game) {
    const box = game.el['level-brief'];
    if (!box) return;
    const t = game.TEXT;
    const level = game.level;
    const name = t.levels[level.id] || { name: level.id, tag: '', desc: '' };
    box.textContent = '';

    const title = document.createElement('div');
    title.className = 'td-brief-title';
    title.textContent = `${name.name} · ${name.tag}`;
    const desc = document.createElement('p');
    desc.className = 'td-brief-desc';
    desc.textContent = name.desc;
    box.append(title, desc);

    if (game.el['brief-waves']) {
        game.el['brief-waves'].textContent = String(level.waves);
    }
    if (game.el['brief-gold']) {
        game.el['brief-gold'].textContent = String(level.gold);
    }
    if (game.el['brief-lives']) {
        game.el['brief-lives'].textContent = String(level.lives);
    }
}

export function updateSideTowers(game) {
    const box = game.el['side-towers'];
    if (!box) return;
    const t = game.TEXT;
    const zh = game.lang === 'zh';
    const defs = [
        [TOWER_TYPES.pulse.icon, t.pulse, t.pulseDesc,
            'Lv4: ' + (zh ? '超导脉冲 (35%暴击 2.5×伤害)' : 'Hyper Cannon (35% Crit 2.5×)'),
            zh ? '物理 · 被装甲减免' : 'Physical · reduced by armor'],
        [TOWER_TYPES.frost.icon, t.frost, t.frostDesc,
            'Lv4: ' + (zh ? '绝对零度 (72%减速 + 急冻寒潮)' : 'Blizzard Cryo (72% Slow + Freeze)'),
            zh ? '能量 · 无视装甲' : 'Energy · ignores armor'],
        [TOWER_TYPES.cannon.icon, t.cannon, t.cannonDesc,
            'Lv4: ' + (zh ? '超新星迫击炮 (持续火海地面DOT)' : 'Napalm Nova (Lingering Fire Zone)'),
            zh ? '溅射物理 / 火海破甲' : 'Splash physical / napalm pierces armor'],
        [TOWER_TYPES.tesla.icon, t.tesla, t.teslaDesc,
            'Lv4: ' + (zh ? '超能雷暴 (7跳连锁 + 感电+20%易伤)' : 'Overcharge Storm (7 Chains + Shock)'),
            zh ? '能量 · 装甲兵的克星' : 'Energy · the armor answer']
    ];
    box.textContent = '';
    defs.forEach(([icon, name, desc, perk, channel]) => {
        const row = document.createElement('div');
        row.className = 'td-side-tower';
        const nameEl = document.createElement('b');
        nameEl.textContent = `${icon} ${name}`;
        const descEl = document.createElement('span');
        descEl.textContent = desc;
        const chEl = document.createElement('span');
        chEl.className = 'td-side-channel';
        chEl.textContent = channel;
        const perkEl = document.createElement('span');
        perkEl.className = 'td-perk';
        perkEl.textContent = `AWAKENING · ${perk}`;
        row.append(nameEl, descEl, chEl, perkEl);
        box.appendChild(row);
    });
}

export function updateSideShortcuts(game) {
    const box = game.el['side-shortcuts'];
    if (!box) return;
    const shortcuts = [
        ['Space', game.lang === 'zh' ? '发波 / 提前迎击' : 'Wave / Early Call'],
        ['1 - 4', game.lang === 'zh' ? '建造脉冲/冰霜/加农/电磁' : 'Build Tower 1-4'],
        ['U / S', game.lang === 'zh' ? '升级 / 出售所选塔' : 'Upgrade / Sell Tower'],
        ['T', game.lang === 'zh' ? '切换集火策略 (首位/强敌/残血)' : 'Cycle Target Priority'],
        ['Q / E', game.lang === 'zh' ? '释放 EMP / 战术超频' : 'Cast EMP / Overdrive'],
        ['R', game.lang === 'zh' ? '显示/隐藏全屏射程覆盖' : 'Toggle Range Circles'],
        ['P / Esc', game.lang === 'zh' ? '暂停 / 取消选择' : 'Pause / Deselect']
    ];
    box.textContent = '';
    shortcuts.forEach(([key, desc]) => {
        const row = document.createElement('div');
        row.className = 'td-side-shortcut-row game-side-kbd-row';
        const descEl = document.createElement('span');
        descEl.textContent = desc;
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        row.append(descEl, kbd);
        box.appendChild(row);
    });
}

export function updateSideRecords(game) {
    const box = game.el['side-records'];
    if (!box) return;
    const best = loadTowerDefenseGlobalBest();
    const rows = [
        [`BEST`, best ? formatNumber(best) : '—'],
        [`KILLS`, formatNumber(game.totalKills || 0)]
    ];
    box.textContent = '';
    rows.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'td-side-row game-side-row';
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        const valueEl = document.createElement('b');
        valueEl.textContent = value;
        row.append(labelEl, valueEl);
        box.appendChild(row);
    });
}
