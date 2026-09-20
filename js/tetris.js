import { getLang, setLang } from './site-settings.js';
import { updateMoreGames } from './more-games.js';
import { createSfx } from './game-sfx.js';
import { ICONS } from './icons.js';
import { bindChrome } from './game-chrome.js';
import { bindFrame } from './game-frame.js';
import { storageGet as safeGetItem, storageSet as safeSetItem } from './safe-storage.js';

// 音效：移动/旋转/锁定/消行/升级/结束
const sfx = createSfx({
    move:     { freq: 200, type: 'square', dur: 0.04, vol: 0.1 },
    rotate:   { freq: 300, slideTo: 420, type: 'triangle', dur: 0.07, vol: 0.14 },
    drop:     { type: 'noise', dur: 0.12, vol: 0.3, filterFreq: 400, filterSlideTo: 120 },
    lock:     { type: 'noise', dur: 0.08, vol: 0.18, filterFreq: 300, filterSlideTo: 100 },
    line:     { freqs: [523.25, 659.25, 783.99], delay: 0.06, type: 'sine', dur: 0.25, vol: 0.3 },
    tetris:   { freqs: [523.25, 659.25, 783.99, 1046.5], delay: 0.07, type: 'sine', dur: 0.4, vol: 0.34 },
    levelup:  { freqs: [523.25, 659.25, 783.99, 1046.5, 1318.5], delay: 0.09, type: 'triangle', dur: 0.5, vol: 0.3 },
    gameover: { freqs: [392, 329.63, 261.63, 196], delay: 0.18, type: 'sawtooth', dur: 0.45, vol: 0.22 }
});

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 隐私模式/禁用存储时 localStorage 会抛 SecurityError
function safeParseJSON(text, fallback) {
    try {
        return JSON.parse(text);
    } catch (e) {
        return fallback;
    }
}

// 多语言支持
const LANGUAGES = {
    en: {
        title: 'Tetris - Cool Edition',
        themeToggle: 'Theme',
        stats: 'Stats',
        close: 'Close',
        best: 'Best',
        lv: 'Lv',
        gameOver: 'Game Over!',
        finalScore: 'Final Score: ',
        restart: 'Restart',
        score: 'Score',
        level: 'Level',
        lines: 'Lines',
        combo: 'Combo',
        globalScoresHeader: 'Global Top 5',
        loadingScores: 'Loading...',
        noScores: 'No scores yet',
        failedToLoad: 'Failed to load scores',
        next: 'Next Piece',
        start: 'Start',
        pause: 'Pause',
        resume: 'Resume',
        levelUp: 'LEVEL UP!',
        comboDisplay: x => `${x}x Combo!`,
        home: 'Home',
        sound: 'Sound',
        moreGames: 'More games',
        hint: 'Arrows move · Space hard drop · P pause · M mute',
    },
    zh: {
        title: '俄罗斯方块 - 酷炫版',
        themeToggle: '切换主题',
        stats: '统计与排名',
        close: '关闭',
        best: '最高',
        lv: '等级',
        gameOver: '游戏结束！',
        finalScore: '最终得分: ',
        restart: '重新开始',
        score: '得分',
        level: '等级',
        lines: '消除行数',
        combo: '连击',
        globalScoresHeader: '全球前5名',
        loadingScores: '加载中...',
        noScores: '暂无分数',
        failedToLoad: '加载失败',
        next: '下一个方块',
        start: '开始游戏',
        pause: '暂停',
        resume: '继续',
        levelUp: '升级！',
        comboDisplay: x => `${x}x 连击!`,
        home: '返回主页',
        sound: '声音',
        moreGames: '更多游戏',
        hint: '方向键移动 · 空格瞬降 · P 暂停 · M 静音',
    }
};

function getUserLang() {
    // 全站统一语言设置（site_lang，含浏览器语言兜底）
    return getLang();
}

let currentLang = getUserLang();
let TEXT = LANGUAGES[currentLang] || LANGUAGES['en'];

function normalizeUsername(val) {
    const trimmed = String(val).trim().slice(0, 20);
    if (!trimmed || trimmed === 'Anonymous') {
        return 'Anonymous' + Math.floor(1000 + Math.random() * 9000);
    }
    return trimmed;
}

// 布局说明：容器不再做整体等比缩放。页面骨架与其它小游戏一致
// （css/layout.css 的 .game-shell/.game-main/.game-stage/.game-sidebar），
// 超出视口时由页面自然滚动，不再靠 transform 压缩整块界面。

// 统一玩家身份：读写全局 player_name，兼容迁移旧的 tetris_username
function getGlobalUsername() {
    let name = (safeGetItem('player_name') || '').trim();
    if (name) return name;
    name = (safeGetItem('tetris_username') || '').trim();
    if (name) {
        safeSetItem('player_name', name);
        return name;
    }
    return 'Anonymous' + Math.floor(1000 + Math.random() * 9000);
}

function saveGlobalUsername(val) {
    safeSetItem('player_name', val);
    safeSetItem('tetris_username', val);
}

// 用户名输入框逻辑
function setupUsernameInput() {
    const input = document.getElementById('usernameInput');
    let username = getGlobalUsername();
    // 只在第一次没有用户名时生成并存储
    if (!safeGetItem('tetris_username') && !safeGetItem('player_name')) {
        safeSetItem('tetris_username', username);
    }
    input.value = username;
    input.addEventListener('change', function() {
        const val = normalizeUsername(input.value);
        input.value = val;
        saveGlobalUsername(val);
    });
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const val = normalizeUsername(input.value);
            input.value = val;
            saveGlobalUsername(val);
            input.blur();
        }
    });
}

// 主题钮是纯图标钮（与顶栏其他图标钮一致）：图标走 ICONS，
// 文案只进 aria-label / title。四处会改它（初始化 / 恢复彩虹主题 / 切语言 + 点击切换），
// 统一收在这一处渲染，避免哪个分支漏掉图标或漏掉 aria-pressed。
// ⚠️ 同 updateHud：**绝不能**读模块级 `const game`。构造函数会调它，那时指针停在
// TDZ，`typeof game !== 'undefined'` 自己就抛 ReferenceError（曾如此，把 init 打断）。
// 需要知道当前主题时由调用方传进来：构造中用 this.isRainbowTheme，其余用 currentGame()。
function renderThemeToggle(rainbowOverride) {
    const el = document.getElementById('themeToggle');
    if (!el) return;
    const g = currentGame();
    const rainbow = typeof rainbowOverride === 'boolean'
        ? rainbowOverride
        : !!(g && g.isRainbowTheme);
    const label = rainbow
        ? (currentLang === 'zh' ? '普通主题' : 'Normal Theme')
        : TEXT.themeToggle;
    el.innerHTML = ICONS.theme;
    el.setAttribute('aria-pressed', rainbow ? 'true' : 'false');
    el.setAttribute('title', label);
    el.setAttribute('aria-label', label);
}

// 抽屉里两个图标钮同样只渲染图标。
// ⚠️ 这个函数被 setLangUI 调用，而 setLangUI 会在 Tetris 构造函数里被调一次，
// 那时 `const game` 还在 TDZ —— 所以这里**绝不能**碰 game（renderThemeToggle
// 之所以要收 rainbowOverride 参数，就是同一个坑）。
function renderDrawerIcons() {
    const statsBtn = document.getElementById('statsToggle');
    if (statsBtn) {
        statsBtn.innerHTML = ICONS.stats;
        statsBtn.setAttribute('title', TEXT.stats);
        statsBtn.setAttribute('aria-label', TEXT.stats);
    }
    const closeBtn = document.getElementById('statsClose');
    if (closeBtn) {
        closeBtn.innerHTML = ICONS.close;
        closeBtn.setAttribute('title', TEXT.close);
        closeBtn.setAttribute('aria-label', TEXT.close);
    }
}

// 顶栏中部 HUD：移动端首屏就要能看到分数/等级，不能等点开抽屉。
// ⚠️ 这里**只能**读传入的实例，绝不能引用模块级的 `const game`：
// updateDisplay 会在 Tetris 构造函数里（init）被调一次，那时 `const game` 还在 TDZ。
// 注意 typeof 救不了 —— 指针一旦停在 TDZ，`typeof game !== 'undefined'` 自己就抛
// ReferenceError（曾如此，报错把整个 init()/draw() 打断）。所以调用方负责把
// 实例传进来：构造中用 this，外部用 game。
function updateHud(g = currentGame()) {
    const best = getBestScore();
    const ready = !!g;
    setText('scoreHud', Number(ready ? g.score : 0).toLocaleString());
    setText('scoreHudBest', Number(best).toLocaleString());
    setText('scoreHudLevel', ready ? g.level : 1);
}

// 延迟解析当前实例。
// ⚠️ 这里**必须**用一个 var 持有者，不能写 `typeof game !== 'undefined' ? game : null`：
// 模块级 `const game` 在 TDZ 期间，`typeof game` 自己就会抛 ReferenceError
// （typeof 只对**未声明**的标识符安全，对 TDZ 中的 let/const 不安全）。
// 持有者在 new Tetris() 之后立即赋值，构造期间读到的就是 null。
var gameRef = null;

function currentGame() {
    return gameRef;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function getBestScore() {
    try {
        const local = safeParseJSON(safeGetItem('tetris_scores') || '[]', []);
        return local.reduce((max, s) => Math.max(max, Number(s.score) || 0), 0);
    } catch (e) {
        return 0;
    }
}

function setLangUI() {
    document.documentElement.lang = currentLang;
    document.title = TEXT.title;

    // 页脚操作提示（契约里 hint 不归 chrome，由各页自己的语言渲染入口写）
    const ttHint = document.getElementById('tt-hint');
    if (ttHint) ttHint.textContent = TEXT.hint;

    renderThemeToggle();
    renderDrawerIcons();
    document.getElementById('gameOverTitle').textContent = TEXT.gameOver;
    document.getElementById('finalScoreLabel').innerHTML = TEXT.finalScore + '<span id="finalScore">0</span>';
    document.getElementById('restartBtn').textContent = TEXT.restart;
    // 分数已从侧栏移到顶栏 HUD（#score 这个 id 不再存在），改由 updateHud 呈现
    setText('scoreHudLabel', TEXT.score);
    setText('scoreHudBestLabel', TEXT.best);
    setText('scoreHudLevelLabel', TEXT.lv);
    setText('statsDrawerTitle', TEXT.stats);
    document.getElementById('levelLabel').textContent = TEXT.level;
    document.getElementById('linesLabel').textContent = TEXT.lines;
    document.getElementById('comboLabel').textContent = TEXT.combo;
    document.getElementById('globalScoresHeader').textContent = TEXT.globalScoresHeader;
    document.getElementById('nextLabel').textContent = TEXT.next;
    document.getElementById('startBtn').textContent = TEXT.start;
    document.getElementById('pauseBtn').textContent = TEXT.pause;
    document.getElementById('restartGameBtn').textContent = TEXT.restart;
    document.getElementById('levelUpEffect').textContent = TEXT.levelUp;
    // 用户名 label
    document.getElementById('usernameLabel').textContent = currentLang === 'zh' ? '用户名' : 'Username';
    // 用户名输入提示
    document.getElementById('usernameTip').textContent = currentLang === 'zh' ? '如需更改用户名，请输入后回车' : 'To change username, enter and press Enter';
    
    // Mobile controls
    if (document.getElementById('mobileStartBtn')) {
        document.getElementById('mobileStartBtn').textContent = TEXT.start;
        document.getElementById('mobilePauseBtn').textContent = TEXT.pause;
        document.getElementById('mobileRestartBtn').textContent = TEXT.restart;
    }
    updateHud();
    updateMoreGames(currentLang);
}

// 获取并显示全站前5名分数
async function fetchAndDisplayGlobalScores() {
    const loadingElement = document.getElementById('loadingScores');
    const listElement = document.getElementById('globalScoresList');
    
    // Update loading text
    loadingElement.textContent = TEXT.loadingScores;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
        
        const response = await fetch('https://game-scores.orangely.workers.dev/scores?game=tetris', {
            signal: controller.signal,
            mode: 'cors'
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();

        if (data && data.length > 0) {
            const top5 = data.slice(0, 5);
            listElement.innerHTML = '';

            top5.forEach((score, index) => {
                const scoreItem = document.createElement('div');
                scoreItem.className = 'score-item';
                // 玩家名来自远程 API，必须转义防 XSS
                scoreItem.innerHTML = `
                    <span class="score-rank">#${index + 1}</span>
                    <span class="score-name">${escapeHTML(score.name || (currentLang === 'zh' ? '匿名' : 'Anonymous'))}</span>
                    <span class="score-value">${Number(score.score).toLocaleString()}</span>
                `;
                listElement.appendChild(scoreItem);
            });
            return top5;
        } else {
            listElement.innerHTML = `<div class="no-scores">${TEXT.noScores}</div>`;
        }
        return data || [];
    } catch (error) {
        console.log('Global scores service unavailable:', error.message);
        // 显示本地分数作为备选
        showLocalScores(listElement, loadingElement);
        return null;
    }
}

function showLocalScores(listElement, loadingElement) {
    try {
        const localScores = JSON.parse(localStorage.getItem('tetris_scores') || '[]');
        if (localScores.length > 0) {
            const sortedScores = localScores.sort((a, b) => b.score - a.score).slice(0, 5);
            listElement.innerHTML = '';
            
            sortedScores.forEach((score, index) => {
                const scoreItem = document.createElement('div');
                scoreItem.className = 'score-item';
                scoreItem.innerHTML = `
                    <span class="score-rank">#${index + 1}</span>
                    <span class="score-name">${currentLang === 'zh' ? '本地记录' : 'Local Record'}</span>
                    <span class="score-value">${score.score.toLocaleString()}</span>
                `;
                listElement.appendChild(scoreItem);
            });
            
            if (loadingElement) {
                loadingElement.textContent = currentLang === 'zh' ? '显示本地分数' : 'Showing local scores';
            }
        } else {
            if (loadingElement) {
                loadingElement.textContent = TEXT.noScores;
            } else {
                listElement.innerHTML = `<div class="no-scores">${TEXT.noScores}</div>`;
            }
        }
    } catch (e) {
        if (loadingElement) {
            loadingElement.textContent = TEXT.failedToLoad;
        } else {
            listElement.innerHTML = `<div class="no-scores">${TEXT.failedToLoad}</div>`;
        }
    }
}

// ── 移动端底部抽屉 ──────────────────────────────────────────────
// 桌面端侧栏常驻（.game-sidebar），移动端抽屉接管。抽屉内容在移动端才需要，
// 但为了不重复维护两份 DOM，桌面端把侧栏里的面板整体搬到当前该显示的容器里。
// ⚠️ 打开时**强制暂停**游戏：否则用户在读排行榜时方块还在掉。
// ⚠️ 锁背景滚动只用 overflow:hidden（body.drawer-locked），
//    绝不能用 body{position:fixed}——那会让整页永久滚不动（见 css/tetris.css 顶部注释）。
const drawer = {
    el: null,
    panel: null,
    panels: null,
    sidebar: null,
    body: null,
    open: false,
    pausedByDrawer: false,
    lastFocus: null,

    init() {
        this.el = document.getElementById('statsDrawer');
        this.panel = this.el && this.el.querySelector('.game-drawer-panel');
        this.body = document.getElementById('statsDrawerBody');
        this.panels = document.getElementById('statsPanels');
        this.sidebar = document.getElementById('infoPanel');
        if (!this.el || !this.body) return;

        // 标记"本页已接入抽屉"：css/layout.css 靠它决定窄屏是否隐藏侧栏
        // （判据不能在 CSS 里做 —— 搬迁节点此时已被移进抽屉，:has() 必然失配）
        document.body.classList.add('has-stats-drawer');

        const btn = document.getElementById('statsToggle');
        const closeBtn = document.getElementById('statsClose');
        if (btn) btn.addEventListener('click', () => this.toggle());
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
        // 点遮罩关闭（只在遮罩本体上，点面板内部不关）
        this.el.addEventListener('click', (e) => {
            if (e.target === this.el) this.close();
        });
        // Esc 关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.open) {
                e.stopPropagation();
                this.close();
            }
        }, true);
        // 焦点陷阱：Tab 在抽屉内循环
        this.el.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab' || !this.open) return;
            const focusables = this.panel.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });

        // 桌面/移动端切换时把面板搬到该显示的容器里
        this.place();
        const mq = window.matchMedia('(min-width: 1024px)');
        const onChange = () => {
            if (this.open && mq.matches) this.close();
            this.place();
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
    },

    // 面板 DOM 只有一个实例：桌面进侧栏、移动进抽屉
    place() {
        if (!this.panels || !this.body || !this.sidebar) return;
        const target = window.matchMedia('(min-width: 1024px)').matches
            ? this.sidebar
            : this.body;
        if (this.panels.parentElement !== target) target.appendChild(this.panels);
    },

    isDesktop() {
        return window.matchMedia('(min-width: 1024px)').matches;
    },

    toggle() {
        this.open ? this.close() : this.openDrawer();
    },

    openDrawer() {
        if (this.open || this.isDesktop()) return;
        this.open = true;
        this.lastFocus = document.activeElement;
        // 强制暂停：只有"进行中的对局"需要暂停。判据用 animationId（主循环在跑）
        // 而不是 paused —— 玩家自己暂停时 paused=true 但循环已停，此时不该再 toggle
        // （会反过来把它切成继续）。
        const g = currentGame();
        if (g && !g.gameOver && g.animationId !== null && !g.paused) {
            g.togglePause();
            this.pausedByDrawer = true;
        }
        this.el.hidden = false;
        // 先落 [hidden] 再改类，否则过渡不触发
        requestAnimationFrame(() => {
            this.el.classList.add('is-open');
            document.body.classList.add('drawer-locked');
        });
        const btn = document.getElementById('statsToggle');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        const closeBtn = document.getElementById('statsClose');
        if (closeBtn) closeBtn.focus();
    },

    close() {
        if (!this.open) return;
        this.open = false;
        this.el.classList.remove('is-open');
        document.body.classList.remove('drawer-locked');
        const btn = document.getElementById('statsToggle');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        const finish = () => {
            if (!this.open) this.el.hidden = true;
        };
        this.el.addEventListener('transitionend', finish, { once: true });
        // 兜底：reduced-motion 下没有过渡事件
        setTimeout(finish, 320);
        // 只恢复「因打开抽屉而暂停」的那一次，避免把用户自己的暂停解掉
        if (this.pausedByDrawer) {
            this.pausedByDrawer = false;
            const g2 = currentGame();
            if (g2 && g2.paused && !g2.gameOver) {
                game.togglePause();
            }
        }
        if (this.lastFocus && typeof this.lastFocus.focus === 'function') this.lastFocus.focus();
    }
};

window.addEventListener('DOMContentLoaded', () => drawer.init());
window.addEventListener('DOMContentLoaded', setLangUI);

// 顶栏语言钮（#tt-btn-lang-ui，data-chrome="lang"）由 js/game-chrome.js 接管：
// 它只负责 setLang() + 派发事件，本页据此重取 TEXT 并整页重刷。
// 本页此前根本没有语言入口（import 了 setLang 却从未调用），所以也没有这个监听器。
window.addEventListener('site-settings:changed', () => {
    currentLang = getUserLang();
    TEXT = LANGUAGES[currentLang] || LANGUAGES['en'];
    setLangUI();
});
window.addEventListener('DOMContentLoaded', setupUsernameInput);
window.addEventListener('DOMContentLoaded', fetchAndDisplayGlobalScores);

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.color = color;
        this.life = 1.0;
        this.decay = 0.02;
        this.size = Math.random() * 4 + 2;
    }

    update(dt = 1) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 0.2 * dt;
        this.life -= this.decay * dt;
        this.size *= Math.pow(0.98, dt);
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.restore();
    }
}

class LineClearAnimation {
    constructor(y, color) {
        this.y = y;
        this.color = color;
        this.progress = 0;
        this.particles = [];
        
        for (let x = 0; x < 10; x++) {
            for (let i = 0; i < 5; i++) {
                this.particles.push({
                    x: x * 40 + 20,
                    y: y * 40 + 20,
                    vx: (Math.random() - 0.5) * 10,
                    vy: (Math.random() - 0.5) * 10,
                    size: Math.random() * 6 + 2,
                    life: 1
                });
            }
        }
    }

    update(dt = 1) {
        this.progress += 0.05 * dt;
        this.particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 0.3 * dt;
            p.life -= 0.02 * dt;
            p.size *= Math.pow(0.98, dt);
        });
        return this.progress < 1;
    }

    draw(ctx) {
        if (this.progress < 0.3) {
            ctx.save();
            ctx.globalAlpha = 1 - (this.progress / 0.3);
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 20;
            ctx.shadowColor = this.color;
            ctx.fillRect(0, this.y * 40, 400, 40);
            ctx.restore();
        }
        
        ctx.save();
        this.particles.forEach(p => {
            if (p.life > 0) {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = this.color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.color;
                ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
            }
        });
        ctx.restore();
    }
}

// Standard SRS kick tables: [x_col_offset, y_row_offset] where y+ = down (canvas coords)
const SRS_KICKS_JLSTZ = {
    '0-1': [{x:0,y:0},{x:-1,y:0},{x:-1,y:-1},{x:0,y:2},{x:-1,y:2}],
    '1-2': [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:-2},{x:1,y:-2}],
    '2-3': [{x:0,y:0},{x:1,y:0},{x:1,y:-1},{x:0,y:2},{x:1,y:2}],
    '3-0': [{x:0,y:0},{x:-1,y:0},{x:-1,y:1},{x:0,y:-2},{x:-1,y:-2}],
};
const SRS_KICKS_I = {
    '0-1': [{x:0,y:0},{x:-2,y:0},{x:1,y:0},{x:-2,y:1},{x:1,y:-2}],
    '1-2': [{x:0,y:0},{x:-1,y:0},{x:2,y:0},{x:-1,y:-2},{x:2,y:1}],
    '2-3': [{x:0,y:0},{x:2,y:0},{x:-1,y:0},{x:2,y:-1},{x:-1,y:2}],
    '3-0': [{x:0,y:0},{x:1,y:0},{x:-2,y:0},{x:1,y:2},{x:-2,y:-1}],
};

class Tetris {
    constructor() {
        this.canvas = document.getElementById('tetris');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.particleCanvas = document.getElementById('particleCanvas');
        this.particleCtx = this.particleCanvas.getContext('2d');
        this.lineClearCanvas = document.getElementById('lineClearCanvas');
        this.lineClearCtx = this.lineClearCanvas.getContext('2d');
        this.nextCanvas = document.getElementById('nextPiece');
        this.nextCtx = this.nextCanvas.getContext('2d', { alpha: false });
        
        this.blockSize = 40;
        this.cols = 10;
        this.rows = 20;
        
        this.board = [];
        this.currentPiece = null;
        this.nextPiece = null;
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.combo = 0;
        this.gameOver = false;
        this.paused = false;
        this.dropCounter = 0;
        this.lastTime = 0;
        this.animationId = null;
        this.particles = [];
        this.shakeAmount = 0;
        this.lastClearTime = 0;
        this.isRainbowTheme = (function () {
            try {
                return localStorage.getItem('tetris_rainbow') === '1';
            } catch (e) {
                return false;
            }
        })();
        if (this.isRainbowTheme) {
            document.body.classList.add('rainbow-theme');
        }
        // 无论哪一支都渲染一次：否则首帧会是一个空钮（label 要等 setLangUI 才填）
        renderThemeToggle(this.isRainbowTheme);
        renderDrawerIcons();
        this.lineClearAnimations = [];
        this.glowIntensity = 0;
        
        this.colors = {
            I: '#4fd1e0',
            O: '#f6c960',
            T: '#b48ee8',
            S: '#6fcf97',
            Z: '#e06c75',
            J: '#5b8def',
            L: '#ef9f5a'
        };
        
        this.rainbowColors = [
            '#ff0000', '#ff7f00', '#ffff00', '#00ff00', 
            '#0000ff', '#4b0082', '#9400d3'
        ];
        
        this.pieces = {
            I: [[1,1,1,1]],
            O: [[1,1],[1,1]],
            T: [[0,1,0],[1,1,1]],
            S: [[0,1,1],[1,1,0]],
            Z: [[1,1,0],[0,1,1]],
            J: [[1,0,0],[1,1,1]],
            L: [[0,0,1],[1,1,1]]
        };
        
        this.init();
        this.setupControls();
        this.createStars();
        
        // 只创建一次 gridCanvas 并复用
        if (!Tetris.gridCanvas) {
            Tetris.gridCanvas = document.createElement('canvas');
            Tetris.gridCanvas.width = this.canvas.width;
            Tetris.gridCanvas.height = this.canvas.height;
            Tetris.gridCtx = Tetris.gridCanvas.getContext('2d');
            this.gridCanvas = Tetris.gridCanvas;
            this.gridCtx = Tetris.gridCtx;
            this.drawGrid();
        } else {
            this.gridCanvas = Tetris.gridCanvas;
            this.gridCtx = Tetris.gridCtx;
        }
    }

    createStars() {
        const starsContainer = document.getElementById('stars');
        for (let i = 0; i < 100; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.width = Math.random() * 3 + 'px';
            star.style.height = star.style.width;
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 100 + '%';
            star.style.animationDelay = Math.random() * 3 + 's';
            starsContainer.appendChild(star);
        }
    }

    init() {
        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.combo = 0;
        this.gameOver = false;
        this.paused = false;
        this.dropCounter = 0;
        this.lastTime = 0; // 重置时间戳，避免重启/恢复后第一帧产生异常 delta
        this.particles = [];
        this.shakeAmount = 0;
        this.lineClearAnimations = [];
        this.glowIntensity = 0;
        this.deltaTime = 1;
        this.dropInterval = 1000;
        this.updateDisplay();
        
        this.nextPiece = this.randomPiece();
        this.spawnPiece();
        
        document.getElementById('gameOverOverlay').style.display = 'none';
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            // ⚠️ 必须同时置 null：animationId 是"主循环是否在跑"的唯一判据
            // （gameLoop 每帧回写），cancel 后不置空会让它永远不为 null，
            // 抽屉的"是否需要对局暂停"判断就会失真（曾如此）。
            this.animationId = null;
        }
    }

    randomPiece() {
        const pieces = 'IOTSZJL';
        const type = pieces[Math.floor(Math.random() * pieces.length)];
        return {
            type: type,
            shape: this.pieces[type],
            x: Math.floor(this.cols / 2) - Math.floor(this.pieces[type][0].length / 2),
            y: 0,
            rotation: 0
        };
    }

    spawnPiece() {
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.randomPiece();
        this.dropCounter = 0; // 防止刚生成的方块因上一块的计时器立即下坠一格

        if (this.collision()) {
            this.gameOver = true;
            this.showGameOver();
        }

        this.drawNextPiece();
    }

    collision(piece = this.currentPiece, offsetX = 0, offsetY = 0) {
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x]) {
                    const newX = piece.x + x + offsetX;
                    const newY = piece.y + y + offsetY;
                    
                    if (newX < 0 || newX >= this.cols || newY >= this.rows) {
                        return true;
                    }
                    
                    if (newY >= 0 && this.board[newY][newX]) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    merge() {
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    const boardY = this.currentPiece.y + y;
                    const boardX = this.currentPiece.x + x;
                    if (boardY >= 0) {
                        this.board[boardY][boardX] = this.currentPiece.type;
                        
                        if (boardY === this.rows - 1 || this.board[boardY + 1][boardX]) {
                            this.createLandingParticles(
                                boardX * this.blockSize + this.blockSize / 2,
                                boardY * this.blockSize + this.blockSize / 2,
                                this.colors[this.currentPiece.type]
                            );
                        }
                    }
                }
            }
        }
    }

    rotate() {
        if (this.gameOver || this.paused) return;
        if (this.currentPiece.type === 'O') return; // O piece doesn't rotate

        const newRotation = (this.currentPiece.rotation + 1) % 4;
        const rotated = this.currentPiece.shape[0].map((_, i) =>
            this.currentPiece.shape.map(row => row[i]).reverse()
        );
        const previousShape = this.currentPiece.shape;
        const previousRotation = this.currentPiece.rotation;
        this.currentPiece.shape = rotated;
        this.currentPiece.rotation = newRotation;

        const kickKey = `${previousRotation}-${newRotation}`;
        const kicks = this.currentPiece.type === 'I'
            ? (SRS_KICKS_I[kickKey] || [{x:0,y:0}])
            : (SRS_KICKS_JLSTZ[kickKey] || [{x:0,y:0}]);

        let kicked = false;
        for (const kick of kicks) {
            if (!this.collision(this.currentPiece, kick.x, kick.y)) {
                this.currentPiece.x += kick.x;
                this.currentPiece.y += kick.y;
                kicked = true;
                break;
            }
        }
        if (!kicked) {
            this.currentPiece.shape = previousShape;
            this.currentPiece.rotation = previousRotation;
        } else {
            const centerX = (this.currentPiece.x + this.currentPiece.shape[0].length / 2) * this.blockSize;
            const centerY = (this.currentPiece.y + this.currentPiece.shape.length / 2) * this.blockSize;
            for (let i = 0; i < 5; i++) {
                this.particles.push(new Particle(centerX, centerY, this.colors[this.currentPiece.type]));
            }
        }
    }

    moveLeft() {
        if (this.gameOver || this.paused) return;
        if (!this.collision(this.currentPiece, -1, 0)) {
            this.currentPiece.x--;
            sfx.play('move');
        }
    }

    moveRight() {
        if (this.gameOver || this.paused) return;
        if (!this.collision(this.currentPiece, 1, 0)) {
            this.currentPiece.x++;
            sfx.play('move');
        }
    }

    moveDown(playerAction = false) {
        if (this.gameOver || this.paused) return;
        if (!this.collision(this.currentPiece, 0, 1)) {
            this.currentPiece.y++;
            // 只有玩家主动软降才加分，重力自然下落不计分
            if (playerAction) {
                this.score++;
            }
            this.updateDisplay();
        } else {
            this.lockPiece();
        }
    }

    hardDrop() {
        if (this.gameOver || this.paused) return;
        let dropDistance = 0;
        let tailColor = this.colors[this.currentPiece.type];
        let tailBlocks = [];
        this.tailGlow = [];
        // 记录下落路径
        while (!this.collision(this.currentPiece, 0, 1)) {
            this.currentPiece.y++;
            dropDistance++;
            // 记录每一步的所有方块坐标
            for (let y = 0; y < this.currentPiece.shape.length; y++) {
                for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                    if (this.currentPiece.shape[y][x]) {
                        tailBlocks.push({
                            x: (this.currentPiece.x + x) * this.blockSize + this.blockSize / 2,
                            y: (this.currentPiece.y + y) * this.blockSize + this.blockSize / 2
                        });
                    }
                }
            }
        }
        // 记录 glow 拖尾路径（更长更亮）；方块贴地时没有下落路径，跳过拖尾
        if (tailBlocks.length > 0) {
            const tailLen = Math.max(30, tailBlocks.length); // 拖尾至少30段
            this.tailGlow = [];
            for (let i = 0; i < tailLen; i++) {
                const pos = tailBlocks[Math.floor(i * tailBlocks.length / tailLen)];
                this.tailGlow.push({
                    x: pos.x,
                    y: pos.y,
                    color: tailColor,
                    alpha: 0.85 * (1 - i / tailLen) + 0.15,
                    size: 28 - 18 * (i / tailLen)
                });
            }
        }
        this.score += dropDistance * 2 * this.level;
        this.lockPiece();
    }

    lockPiece() {
        this.merge();
        this.clearLines();
        this.spawnPiece();
        this.updateDisplay();
        this.shakeAmount = 5;
    }

    clearLines() {
        let linesCleared = [];
        const newBoard = [];
        for (let y = this.rows - 1; y >= 0; y--) {
            if (this.board[y].every(cell => cell !== 0)) {
                linesCleared.push(y);
                const color = this.colors[this.board[y][0]];
                this.lineClearAnimations.push(new LineClearAnimation(y, color));
            } else {
                newBoard.unshift(this.board[y]);
            }
        }
        while (newBoard.length < this.rows) {
            newBoard.unshift(Array(this.cols).fill(0));
        }
        if (linesCleared.length > 0) {
            this.board = newBoard;
            this.lines += linesCleared.length;
            const currentTime = Date.now();
            if (currentTime - this.lastClearTime < 3000) {
                this.combo++;
            } else {
                this.combo = 1;
            }
            this.lastClearTime = currentTime;

            // 个性化消行提示
            if (linesCleared.length === 2) {
                this.showCustomMessage(currentLang === 'zh' ? '双行消除！Nice!' : 'Double Line Clear!');
            } else if (linesCleared.length === 3) {
                this.showCustomMessage(currentLang === 'zh' ? '三行消除！Awesome!' : 'Triple Line Clear!');
            } else if (linesCleared.length === 4) {
                this.showTetrisCelebration();
            } else if (this.combo > 1) {
                this.showCombo(this.combo);
            }

            const baseScore = [0, 100, 300, 500, 800][linesCleared.length];
            const comboMultiplier = Math.min(this.combo, 5);
            this.score += baseScore * this.level * comboMultiplier;
            sfx.play(linesCleared.length === 4 ? 'tetris' : 'line');
            const newLevel = Math.floor(this.lines / 10) + 1;
            if (newLevel > this.level) {
                this.level = newLevel;
                this.updateDropInterval();
                this.showLevelUp();
                sfx.play('levelup');
            }
        }
    }

    showCustomMessage(msg) {
        const comboDisplay = document.getElementById('comboDisplay');
        comboDisplay.textContent = msg;
        comboDisplay.style.animation = 'none';
        void comboDisplay.offsetWidth;
        comboDisplay.style.animation = 'comboAnimation 1.2s ease-out';
    }

    showTetrisCelebration() {
        const comboDisplay = document.getElementById('comboDisplay');
        comboDisplay.textContent = currentLang === 'zh' ? 'TETRIS！四行消除！🎉' : 'TETRIS! Four Lines! 🎉';
        comboDisplay.style.animation = 'none';
        void comboDisplay.offsetWidth;
        comboDisplay.style.animation = 'comboAnimation 1.6s cubic-bezier(0.68,-0.55,0.27,1.55)';
        // 粒子特效
        for (let i = 0; i < 80; i++) {
            this.particles.push(new Particle(
                Math.random() * this.canvas.width,
                Math.random() * this.canvas.height,
                this.rainbowColors[Math.floor(Math.random() * this.rainbowColors.length)]
            ));
        }
    }

    createLandingParticles(x, y, color) {
        for (let i = 0; i < 3; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    showCombo(combo) {
        const comboDisplay = document.getElementById('comboDisplay');
        comboDisplay.textContent = TEXT.comboDisplay(combo);
        comboDisplay.style.animation = 'none';
        // 强制重绘
        void comboDisplay.offsetWidth;
        comboDisplay.style.animation = 'comboAnimation 1s ease-out';
    }

    showLevelUp() {
        const levelUpEffect = document.getElementById('levelUpEffect');
        levelUpEffect.textContent = TEXT.levelUp;
        levelUpEffect.classList.add('show');
        setTimeout(() => {
            levelUpEffect.classList.remove('show');
        }, 2000);
        for (let i = 0; i < 50; i++) {
            this.particles.push(new Particle(
                Math.random() * this.canvas.width,
                Math.random() * this.canvas.height,
                this.rainbowColors[Math.floor(Math.random() * this.rainbowColors.length)]
            ));
        }
    }

    drawGrid() {
        this.gridCtx.fillStyle = '#0a0a0a';
        this.gridCtx.fillRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
        
        this.gridCtx.strokeStyle = 'rgba(102, 126, 234, 0.2)';
        this.gridCtx.lineWidth = 0.5;
        
        for (let x = 0; x <= this.cols; x++) {
            this.gridCtx.beginPath();
            this.gridCtx.moveTo(x * this.blockSize, 0);
            this.gridCtx.lineTo(x * this.blockSize, this.canvas.height);
            this.gridCtx.stroke();
        }
        
        for (let y = 0; y <= this.rows; y++) {
            this.gridCtx.beginPath();
            this.gridCtx.moveTo(0, y * this.blockSize);
            this.gridCtx.lineTo(this.canvas.width, y * this.blockSize);
            this.gridCtx.stroke();
        }
    }

    drawBlock(x, y, color, isCurrent = false) {
        const pixelX = x * this.blockSize;
        const pixelY = y * this.blockSize;
        
        // Update glow intensity for current piece
        if (isCurrent) {
            this.glowIntensity = Math.sin(Date.now() * 0.003) * 0.5 + 0.5;
        }
        
        // Main block
        this.ctx.fillStyle = color;
        this.ctx.fillRect(pixelX + 1, pixelY + 1, this.blockSize - 2, this.blockSize - 2);
        
        
        // Highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(pixelX + 1, pixelY + 1, this.blockSize - 2, 4);
        
        // Shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(pixelX + 1, pixelY + this.blockSize - 5, this.blockSize - 2, 4);
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw glow 拖尾（更亮更慢消失）
        if (this.tailGlow && this.tailGlow.length) {
            for (let i = 0; i < this.tailGlow.length; i++) {
                const glow = this.tailGlow[i];
                this.ctx.save();
                this.ctx.globalAlpha = glow.alpha;
                this.ctx.shadowBlur = 40;
                this.ctx.shadowColor = glow.color;
                this.ctx.fillStyle = glow.color;
                this.ctx.beginPath();
                this.ctx.ellipse(glow.x, glow.y, glow.size, glow.size/2, 0, 0, 2*Math.PI);
                this.ctx.fill();
                this.ctx.restore();
            }
            // 拖尾渐隐消失（更慢）
            this.tailGlow = this.tailGlow.map(g => ({...g, alpha: g.alpha * Math.pow(0.95, this.deltaTime), size: g.size * Math.pow(0.98, this.deltaTime)})).filter(g => g.alpha > 0.03 && g.size > 2);
        }

        // Apply screen shake
        if (this.shakeAmount > 0) {
            this.ctx.save();
            this.ctx.translate(
                (Math.random() - 0.5) * this.shakeAmount,
                (Math.random() - 0.5) * this.shakeAmount
            );
            this.shakeAmount *= Math.pow(0.9, this.deltaTime);
            if (this.shakeAmount < 0.1) this.shakeAmount = 0;
        }

        // Draw grid
        this.ctx.drawImage(this.gridCanvas, 0, 0);

        // Draw locked blocks
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.board[y][x]) {
                    this.drawBlock(x, y, this.colors[this.board[y][x]], false);
                }
            }
        }

        // Draw current piece with glow effect
        if (this.currentPiece) {
            for (let y = 0; y < this.currentPiece.shape.length; y++) {
                for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                    if (this.currentPiece.shape[y][x]) {
                        this.drawBlock(
                            this.currentPiece.x + x,
                            this.currentPiece.y + y,
                            this.colors[this.currentPiece.type],
                            true
                        );
                    }
                }
            }
        }

        if (this.shakeAmount > 0) {
            this.ctx.restore();
        }

        // Draw particles
        this.particleCtx.clearRect(0, 0, this.particleCanvas.width, this.particleCanvas.height);
        this.particles = this.particles.filter(particle => {
            particle.update(this.deltaTime);
            particle.draw(this.particleCtx);
            return particle.life > 0;
        });

        // Draw line clear animations
        this.lineClearCtx.clearRect(0, 0, this.lineClearCanvas.width, this.lineClearCanvas.height);
        this.lineClearAnimations = this.lineClearAnimations.filter(animation => {
            const active = animation.update(this.deltaTime);
            animation.draw(this.lineClearCtx);
            return active;
        });
    }

    drawNextPiece() {
        this.nextCtx.fillStyle = '#0a0a0a';
        this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        
        if (this.nextPiece) {
            const blockSize = Math.floor(this.blockSize / 2);
            const offsetX = (this.nextCanvas.width - this.nextPiece.shape[0].length * blockSize) / 2;
            const offsetY = (this.nextCanvas.height - this.nextPiece.shape.length * blockSize) / 2;
            
            for (let y = 0; y < this.nextPiece.shape.length; y++) {
                for (let x = 0; x < this.nextPiece.shape[y].length; x++) {
                    if (this.nextPiece.shape[y][x]) {
                        const pixelX = offsetX + x * blockSize;
                        const pixelY = offsetY + y * blockSize;
                        
                        this.nextCtx.fillStyle = this.colors[this.nextPiece.type];
                        this.nextCtx.fillRect(pixelX + 1, pixelY + 1, blockSize - 2, blockSize - 2);
                        
                        // Highlight
                        this.nextCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                        this.nextCtx.fillRect(pixelX + 1, pixelY + 1, blockSize - 2, 3);
                    }
                }
            }
        }
    }

    updateDisplay() {
        // 分数只在顶栏 HUD（#score 已随侧栏面板搬迁并弃用），
        // 等级/行数/连击仍在抽屉面板里
        setText('level', this.level);
        setText('lines', this.lines);
        setText('combo', this.combo);
        updateHud(this);
    }

    async showGameOver() {
    if (typeof window.hubTrack === 'function') window.hubTrack('tetris', 'finish');
        sfx.play('gameover');
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOverOverlay').style.display = 'flex';
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('pauseBtn').textContent = TEXT.pause;
        
        // Mobile controls
        if (document.getElementById('mobileStartBtn')) {
            document.getElementById('mobileStartBtn').disabled = false;
            document.getElementById('mobilePauseBtn').disabled = true;
            document.getElementById('mobilePauseBtn').textContent = TEXT.pause;
        }
        
        // Unlock page when game ends
        this.unlockPage();

        // 上传分数到 Cloudflare Worker
        let username = getGlobalUsername();
        // 本地分数记录
        let localScores = safeParseJSON(safeGetItem('tetris_scores'), []);
        if (!Array.isArray(localScores)) localScores = [];
        localScores.push({ score: this.score, time: Date.now() });
        localScores = localScores.slice(-20); // 只保留最近20条
        safeSetItem('tetris_scores', JSON.stringify(localScores));

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时

            await fetch('https://game-scores.orangely.workers.dev/scores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game: 'tetris', name: username, score: this.score }),
                signal: controller.signal,
                mode: 'cors'
            });

            clearTimeout(timeoutId);
        } catch (e) {
            console.log('Score upload failed, saved locally only:', e.message);
        }
        // 一次拉取全站分数：侧边面板与结算弹窗共用，避免重复请求
        const globalScores = await fetchAndDisplayGlobalScores();
        await this.showLeaderboard(globalScores);
    }

    async showLeaderboard(preloaded = null) {
        // 获取排行榜并显示在 Game Over overlay
        let leaderboard = [];
        let isGlobalScores = false;

        if (Array.isArray(preloaded)) {
            leaderboard = preloaded;
            isGlobalScores = leaderboard.length > 0;
        } else {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时

                const res = await fetch('https://game-scores.orangely.workers.dev/scores?game=tetris', {
                    signal: controller.signal,
                    mode: 'cors'
                });

                clearTimeout(timeoutId);

                if (res.ok) {
                    leaderboard = await res.json();
                    isGlobalScores = true;
                } else {
                    throw new Error(`HTTP ${res.status}`);
                }
            } catch (e) {
                console.log('Using local scores for leaderboard:', e.message);
            }
        }
        if (!isGlobalScores) {
            // 使用本地分数
            const localScores = safeParseJSON(safeGetItem('tetris_scores'), []);
            leaderboard = (Array.isArray(localScores) ? localScores : [])
                .sort((a, b) => b.score - a.score).slice(0, 5)
                .map(score => ({ name: currentLang === 'zh' ? '本地记录' : 'Local', score: score.score }));
        }
        
        let html = '<span id="finalScore">' + this.score + '</span>';
        html += '<div style="margin-top:18px;text-align:left;font-size:18px;line-height:1.5;">';
        html += isGlobalScores ? 
            (currentLang === 'zh' ? '全站最高分：' : 'Global High Scores:') :
            (currentLang === 'zh' ? '本地最高分：' : 'Local High Scores:');
        html += '<ol style="margin:8px 0 0 18px;padding:0;">';
        leaderboard.slice(0, 5).forEach((item, i) => {
            html += `<li>${currentLang === 'zh' ? '用户名' : 'Username'}: <b>${escapeHTML(item.name)}</b> ${currentLang === 'zh' ? '分数' : 'Score'}: <b>${Number(item.score)}</b></li>`;
        });
        html += '</ol></div>';
        // 展示本地分数记录
        let recentScores = safeParseJSON(safeGetItem('tetris_scores'), []);
        if (Array.isArray(recentScores) && recentScores.length) {
            html += '<div style="margin-top:12px;font-size:15px;color:#aaa;">';
            html += currentLang === 'zh' ? '你的最近得分：' : 'Your Recent Scores:';
            html += '<ul style="margin:6px 0 0 18px;padding:0;">';
            recentScores.slice(-5).reverse().forEach(item => {
                const date = new Date(item.time);
                html += `<li>${item.score} <span style='font-size:12px;color:#888;'>(${date.toLocaleDateString()} ${date.toLocaleTimeString()})</span></li>`;
            });
            html += '</ul></div>';
        }
        document.getElementById('finalScoreLabel').innerHTML = html;
    }

    start() {
        if (this.gameOver) {
            this.init();
        }
        if (typeof window.hubTrack === 'function') window.hubTrack('tetris', 'play');
        this.gameLoop();
        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        
        // Mobile controls
        if (document.getElementById('mobileStartBtn')) {
            document.getElementById('mobileStartBtn').disabled = true;
            document.getElementById('mobilePauseBtn').disabled = false;
            document.getElementById('mobilePauseBtn').textContent = TEXT.pause;
        }
        
        // Lock page on mobile when game starts
        this.lockPage();
    }

    togglePause() {
        this.paused = !this.paused;
        document.getElementById('pauseBtn').textContent = this.paused ? TEXT.resume : TEXT.pause;
        
        // Mobile controls
        if (document.getElementById('mobilePauseBtn')) {
            document.getElementById('mobilePauseBtn').textContent = this.paused ? TEXT.resume : TEXT.pause;
        }
        
        if (!this.paused) {
            this.lastTime = 0; // 恢复时同步时间戳，避免一帧巨大 delta
            this.gameLoop();
            this.lockPage();
        } else {
            // ⚠️ 暂停时必须停掉在飞的那一帧并置空 animationId。
            // gameLoop 开头虽有 `if (this.paused) return`，但它**不再排下一帧**，
            // 于是 animationId 会永远停在上一个 id 上 —— 而它是"主循环是否在跑"
            // 的唯一判据（抽屉的暂停判断就依赖它）。两者必须同时维护。
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            this.lastTime = 0;
            this.unlockPage();
        }
    }

    lockPage() {
        if (window.innerWidth <= 480) {
            document.body.classList.add('game-locked');
        }
    }

    unlockPage() {
        document.body.classList.remove('game-locked');
    }

    restart() {
        this.init();
        if (typeof window.hubTrack === 'function') window.hubTrack('tetris', 'play');
        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('pauseBtn').textContent = TEXT.pause;
        
        // Mobile controls
        if (document.getElementById('mobileStartBtn')) {
            document.getElementById('mobileStartBtn').disabled = true;
            document.getElementById('mobilePauseBtn').disabled = false;
            document.getElementById('mobilePauseBtn').textContent = TEXT.pause;
        }
        
        this.gameLoop();
        this.lockPage();
    }

    toggleTheme() {
        this.isRainbowTheme = !this.isRainbowTheme;
        document.body.classList.toggle('rainbow-theme', this.isRainbowTheme);
        try {
            localStorage.setItem('tetris_rainbow', this.isRainbowTheme ? '1' : '0');
        } catch (e) {
            // 存储不可用时仅切换当前会话主题
        }
        renderThemeToggle(this.isRainbowTheme);
    }

    setupControls() {
        document.addEventListener('keydown', (e) => {
            // 正在输入用户名时不拦截按键（方向键/空格要正常用于编辑文本）
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
            // 抽屉打开时游戏已暂停，方向键/空格不应再操作方块
            if (drawer.open) return;
            if (this.gameOver) return;
            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.moveLeft();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.moveRight();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.moveDown(true);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.rotate();
                    break;
                case ' ':
                    e.preventDefault();
                    if (e.repeat) break; // 防止按住空格连续硬降
                    this.hardDrop();
                    break;
            }
        });

        // 切换标签页时自动暂停，防止后台掉分
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && !this.gameOver && !this.paused) {
                this.togglePause();
            }
        });
    }

    updateDropInterval() {
        this.dropInterval = Math.max(50, 1000 - (this.level - 1) * 100);
    }

    gameLoop(time = 0) {
        if (this.gameOver || this.paused) return;

        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));

        // 首帧（或暂停恢复后）只同步时间戳，不产生 delta
        if (this.lastTime === 0) {
            this.lastTime = time;
            return;
        }

        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        this.deltaTime = Math.min(Math.max(deltaTime / 16.67, 0), 3);

        this.dropCounter += deltaTime;

        if (this.dropCounter > this.dropInterval) {
            this.moveDown();
            this.dropCounter = 0;
        }

        this.draw();
    }
}

// Create game instance
const game = new Tetris();
// 供延迟解析用：构造期间 gameRef 为 null，构造完成后立即可读（见 currentGame）
gameRef = game;
game.draw();

// 暴露实例，便于回归脚本与调试观察运行态（与 sword-flight 的 window.game 一致）。
// 只读用途：不要在页面逻辑里依赖它，页面内部一律用闭包里的 `game` 或 currentGame()。
window.game = game;

// 桌面端纵向预算：棋盘 400×800（1:2）由「可用高度 × 画幅比」定尺寸。
// 此前侧栏内容 1000px 高、棋盘固定 800px，1280×900 下整页 1153px，必须滚动。
// 三张画布（主/粒子/消行）后端缓冲区都固定 400×800、靠 CSS 等比缩放，
// 三者用同一组 CSS 规则，缩放后天然对齐 —— 手机上本来就是这么跑的（280/400）。
window.addEventListener('DOMContentLoaded', () => {
    bindFrame({ logicalWidth: 400 });
});

// 按钮事件绑定
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startBtn').onclick = () => game.start();
    document.getElementById('pauseBtn').onclick = () => game.togglePause();
    document.getElementById('restartBtn').onclick = () => game.restart();
    document.getElementById('restartGameBtn').onclick = () => game.restart();
    document.getElementById('themeToggle').onclick = () => game.toggleTheme();

    // 语言切换统一在首页进行（site_lang 全站生效），页面内不再提供语言按钮
    
    // Mobile controls
    if (document.getElementById('mobileStartBtn')) {
        document.getElementById('mobileStartBtn').onclick = () => game.start();
        document.getElementById('mobilePauseBtn').onclick = () => game.togglePause();
        document.getElementById('mobileRestartBtn').onclick = () => game.restart();
    }

    // 触摸手势：滑动 = 左右/下移动/旋转；双击（两次快速点按）= 硬降
    let touchStartX = null;
    let touchStartY = null;
    let lastTap = 0;
    const canvas = document.getElementById('tetris');

    // Prevent default touch behaviors to avoid page scrolling
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', function(e) {
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', function(e) {
        e.preventDefault();
        if (touchStartX === null || touchStartY === null) return;
        const now = Date.now();
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;
        const minSwipeDistance = 30;
        const isTap = Math.abs(dx) < minSwipeDistance && Math.abs(dy) < minSwipeDistance;

        if (isTap) {
            // 只有两次快速"点按"才触发硬降，滑动节奏不会误触
            if (now - lastTap < 300 && now - lastTap > 50) {
                game.hardDrop();
                lastTap = 0;
            } else {
                lastTap = now;
            }
        } else {
            lastTap = 0;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0) game.moveRight();
                else game.moveLeft();
            } else {
                if (dy > 0) game.moveDown(true);
                else game.rotate();
            }
        }
        touchStartX = null;
        touchStartY = null;
    }, { passive: false });
    
    // Prevent context menu on long press
    canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
});

/* ── 顶栏 / 页脚通用控件：Home · Sound · Lang · More ──
   槽位结构见 css/layout.css 的契约，行为统一由 js/game-chrome.js 接管。
   owns 默认只含 lang / more：静音钮在本页早就有自己的 handler（还要顺带做
   SFX 初始化之类的页面私事），chrome 再挂一个就会一次点击切换两次 = 净效果为零。
       本页的静音钮是随槽位契约新增的，页面自身没有 handler，
       所以显式把 sound 交给 chrome 接管。 */
window.addEventListener('DOMContentLoaded', () => {
    bindChrome({
        self: 'tetris.html',
        owns: ['lang', 'more', 'sound'],
        getText: () => LANGUAGES[getLang()] || LANGUAGES.en,
        labels: { pause: () => (LANGUAGES[getLang()] || {}).pause },
    });
});
