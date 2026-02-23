function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 多语言支持
const LANGUAGES = {
    en: {
        title: 'Tetris - Cool Edition',
        themeToggle: '🌈 Theme',
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
        comboDisplay: x => `${x}x Combo!`
    },
    zh: {
        title: '俄罗斯方块 - 酷炫版',
        themeToggle: '🌈 切换主题',
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
        levelUp: 'LEVEL UP!',
        comboDisplay: x => `${x}x 连击!`
    }
};

function getUserLang() {
    const lang = navigator.language || navigator.userLanguage;
    if (lang.startsWith('zh')) return 'zh';
    return 'en';
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

// 用户名输入框逻辑
function setupUsernameInput() {
    const input = document.getElementById('usernameInput');
    let username = localStorage.getItem('tetris_username');
    // 只在第一次没有用户名时生成并存储
    if (!username) {
        username = 'Anonymous' + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('tetris_username', username);
    }
    input.value = username;
    input.addEventListener('change', function() {
        const val = normalizeUsername(input.value);
        input.value = val;
        localStorage.setItem('tetris_username', val);
    });
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const val = normalizeUsername(input.value);
            input.value = val;
            localStorage.setItem('tetris_username', val);
            input.blur();
        }
    });
}

function setLangUI() {
    document.title = TEXT.title;
    document.getElementById('themeToggle').textContent = TEXT.themeToggle;
    document.getElementById('gameOverTitle').textContent = TEXT.gameOver;
    document.getElementById('finalScoreLabel').innerHTML = TEXT.finalScore + '<span id="finalScore">0</span>';
    document.getElementById('restartBtn').textContent = TEXT.restart;
    document.getElementById('scoreLabel').textContent = TEXT.score;
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
        
        const response = await fetch('https://tetris-highest-scores.orangely.workers.dev/highscore', {
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
                scoreItem.innerHTML = `
                    <span class="score-rank">#${index + 1}</span>
                    <span class="score-name">${score.name || (currentLang === 'zh' ? '匿名' : 'Anonymous')}</span>
                    <span class="score-value">${score.score.toLocaleString()}</span>
                `;
                listElement.appendChild(scoreItem);
            });
        } else {
            listElement.innerHTML = `<div class="no-scores">${TEXT.noScores}</div>`;
        }
    } catch (error) {
        console.log('Global scores service unavailable:', error.message);
        // 显示本地分数作为备选
        showLocalScores(listElement, loadingElement);
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

window.addEventListener('DOMContentLoaded', setLangUI);
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
        this.isRainbowTheme = false;
        this.lineClearAnimations = [];
        this.glowIntensity = 0;
        
        this.colors = {
            I: '#00f0f0',
            O: '#f0f000',
            T: '#a000f0',
            S: '#00f000',
            Z: '#f00000',
            J: '#0000f0',
            L: '#f0a000'
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
        }
    }

    moveRight() {
        if (this.gameOver || this.paused) return;
        if (!this.collision(this.currentPiece, 1, 0)) {
            this.currentPiece.x++;
        }
    }

    moveDown() {
        if (this.gameOver || this.paused) return;
        if (!this.collision(this.currentPiece, 0, 1)) {
            this.currentPiece.y++;
            this.score++;
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
        // 记录 glow 拖尾路径（更长更亮）
        const tailLen = Math.max(30, tailBlocks.length); // 拖尾至少30段
        this.tailGlow = [];
        for (let i = 0; i < tailLen; i++) {
            const pos = tailBlocks[Math.floor(i * tailBlocks.length / tailLen)] || tailBlocks[tailBlocks.length-1];
            this.tailGlow.push({
                x: pos.x,
                y: pos.y,
                color: tailColor,
                alpha: 0.85 * (1 - i / tailLen) + 0.15,
                size: 28 - 18 * (i / tailLen)
            });
        }
        // ...existing code...
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
            const newLevel = Math.floor(this.lines / 10) + 1;
            if (newLevel > this.level) {
                this.level = newLevel;
                this.updateDropInterval();
                this.showLevelUp();
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
        document.getElementById('score').textContent = this.score;
        document.getElementById('level').textContent = this.level;
        document.getElementById('lines').textContent = this.lines;
        document.getElementById('combo').textContent = this.combo;
    }

    async showGameOver() {
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
        let username = localStorage.getItem('tetris_username') || 'Anonymous';
        // 本地分数记录
        let localScores = JSON.parse(localStorage.getItem('tetris_scores') || '[]');
        localScores.push({ score: this.score, time: Date.now() });
        localScores = localScores.slice(-20); // 只保留最近20条
        localStorage.setItem('tetris_scores', JSON.stringify(localScores));
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时
            
            await fetch('https://tetris-highest-scores.orangely.workers.dev/highscore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: username, score: this.score }),
                signal: controller.signal,
                mode: 'cors'
            });
            
            clearTimeout(timeoutId);
            // 更新全站最高分显示
            fetchAndDisplayGlobalScores();
        } catch (e) {
            console.log('Score upload failed, saved locally only:', e.message);
            // 即使上传失败，也更新显示（会显示本地分数）
            fetchAndDisplayGlobalScores();
        }
        this.showLeaderboard();
    }

    async showLeaderboard() {
        // 获取排行榜并显示在 Game Over overlay
        let leaderboard = [];
        let isGlobalScores = false;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时
            
            const res = await fetch('https://tetris-highest-scores.orangely.workers.dev/highscore', {
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
            // 使用本地分数
            const localScores = JSON.parse(localStorage.getItem('tetris_scores') || '[]');
            leaderboard = localScores.sort((a, b) => b.score - a.score).slice(0, 5)
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
        let localScores = JSON.parse(localStorage.getItem('tetris_scores') || '[]');
        if (localScores.length) {
            html += '<div style="margin-top:12px;font-size:15px;color:#aaa;">';
            html += currentLang === 'zh' ? '你的最近得分：' : 'Your Recent Scores:';
            html += '<ul style="margin:6px 0 0 18px;padding:0;">';
            localScores.slice(-5).reverse().forEach(item => {
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
            this.gameLoop();
            this.lockPage();
        } else {
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
        document.getElementById('themeToggle').textContent = this.isRainbowTheme
            ? (currentLang === 'zh' ? '✨ 普通主题' : '✨ Normal Theme')
            : TEXT.themeToggle;
    }

    setupControls() {
        document.addEventListener('keydown', (e) => {
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
                    this.moveDown();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.rotate();
                    break;
                case ' ':
                    e.preventDefault();
                    this.hardDrop();
                    break;
            }
        });
    }

    updateDropInterval() {
        this.dropInterval = Math.max(50, 1000 - (this.level - 1) * 100);
    }

    gameLoop(time = 0) {
        if (this.gameOver || this.paused) return;

        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));

        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        this.deltaTime = Math.min(deltaTime / 16.67, 3);

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
game.draw();

// 按钮事件绑定
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startBtn').onclick = () => game.start();
    document.getElementById('pauseBtn').onclick = () => game.togglePause();
    document.getElementById('restartBtn').onclick = () => game.restart();
    document.getElementById('restartGameBtn').onclick = () => game.restart();
    document.getElementById('themeToggle').onclick = () => game.toggleTheme();
    
    // Mobile controls
    if (document.getElementById('mobileStartBtn')) {
        document.getElementById('mobileStartBtn').onclick = () => game.start();
        document.getElementById('mobilePauseBtn').onclick = () => game.togglePause();
        document.getElementById('mobileRestartBtn').onclick = () => game.restart();
    }

    // Touch controls for mobile
    let touchStartX = null;
    let touchStartY = null;
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
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;
        const minSwipeDistance = 30;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            if (Math.abs(dx) > minSwipeDistance) {
                if (dx > 0) game.moveRight();
                else game.moveLeft();
            }
        } else {
            if (Math.abs(dy) > minSwipeDistance) {
                if (dy > 0) game.moveDown();
                else game.rotate();
            }
        }
        touchStartX = null;
        touchStartY = null;
    }, { passive: false });
    
    // Double tap for hard drop
    let lastTap = 0;
    canvas.addEventListener('touchend', function(e) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastTap < 300 && now - lastTap > 50) {
            game.hardDrop();
        }
        lastTap = now;
    }, { passive: false });
    
    // Prevent context menu on long press
    canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
});