// index.html 落地页脚本（P4-1 自内联 <script> 原样抽离，module 化：执行时机等价——原脚本在 body 尾同步执行，module 为 DOM 就绪后执行）
import { onReady } from './boot.js';

const i18n = {
    en: {
        pageTitle: 'Mini Games Collection',
        mainTitle: 'Mini Games Collection',
        mainDesc: 'Play instantly · No downloads · No accounts · No ads',
        sectionLabel: 'Choose a game',

        mathRainName: 'Math Rain',
        mathRainDesc: 'Catch falling equations before they hit the ground. Practice arithmetic under pressure.',
        mathRainTag: 'Educational',
        mathRainPlay: 'Play ›',

        tetrisName: 'Tetris',
        tetrisDesc: 'Modern Tetris with SRS rotation, combo system, multiple themes, and global high scores.',
        tetrisTag: 'Classic',
        tetrisPlay: 'Play ›',

        tankName: 'Tank Battle',
        tankDesc: 'Retro arcade tank shooter. Defend your base, blast enemies, and survive wave after wave.',
        tankTag: 'Arcade',
        tankPlay: 'Play ›',

        gomokuName: 'Gomoku',
        gomokuDesc: 'Five in a Row. Challenge the AI or play with a friend on the classic strategy board.',
        gomokuTag: 'Strategy',
        gomokuPlay: 'Play ›',

        planetMergeName: 'Planet Merge',
        planetMergeDesc: 'Drop planets, merge identical ones, chain combos and forge a sun. Daily challenge with a global leaderboard.',
        planetMergeTag: 'Casual',
        planetMergePlay: 'Play ›',

        wordDailyName: 'Word Daily',
        wordDailyDesc: 'One puzzle a day for the whole world — guess the English word or the Chinese idiom in 6 tries. Keep your streak!',
        wordDailyTag: 'Daily',
        wordDailyPlay: 'Play ›',

        hubTitle: '⚡ Daily Challenges',
        hubTaskWordSub: 'Guess the word in 6 tries',
        hubTaskMergeSub: 'Daily challenge — chase the high score',
        hubTaskGravitySub: 'Daily course — 5 holes, fewest launches',
        hubProfileHint: 'Leaderboard name',
        hubProfilePlaceholder: 'Your name',
        langToggle: '中文',
        hubTotalPlayed: 'plays today',
        badgeDaily: 'Daily',
        badgeNew: 'New',

        hoopShotName: 'Hoop Shot',
        hoopShotDesc: 'Flick basketball, one miss ends the run. Chain 3 makes to catch fire for double points. Global top 10!',
        hoopShotTag: 'Sports',
        hoopShotPlay: 'Play ›',

        minesweeperName: 'Minesweeper',
        minesweeperDesc: 'The classic logic puzzle. Safe first click, chording, three difficulties, global fastest clears.',
        minesweeperTag: 'Puzzle',
        minesweeperPlay: 'Play ›',

        reversiName: 'Reversi',
        reversiDesc: 'Classic Othello strategy. Outsmart a tuned AI on three levels or pass-and-play with a friend.',
        reversiTag: 'Strategy',
        reversiPlay: 'Play ›',

        tdName: 'Neon Tower Defense',
        tdDesc: 'Build pulse, frost, cannon and tesla towers on the neon grid. Survive 25 waves and top the leaderboard.',
        tdTag: 'Strategy',
        tdPlay: 'Play ›',

        gravityName: 'Gravity Slingshot',
        gravityDesc: 'Original orbital physics — slingshot your probe around planets into the wormhole. 20 holes plus a daily course.',
        gravityTag: 'Physics',
        gravityPlay: 'Play ›',

        needleAwnName: 'Pinpoint Clash',
        needleAwnDesc: 'Kinetic martial precision duel. Clash tip-to-tip, weave Silver Needle and Golden Awn stances, freeze time and awaken supreme prowess.',
        needleAwnTag: 'Action',
        needleAwnPlay: 'Play ›',

        swordFlightName: 'Sword Flight',
        swordFlightDesc: 'Soar through the Nine Heavens on a flying sword. Thread celestial rings, cleave crags, summon companion sword arrays, and ascend to immortality.',
        swordFlightTag: 'Action',
        swordFlightPlay: 'Play ›',

        minecraftName: '2D Minecraft',
        minecraftDesc: 'A 2D take on Minecraft. Mine blocks, craft tools, and build your world in the browser.',
        minecraftTag: 'Sandbox',
        minecraftPlay: 'Play ›',

        dotsName: 'Dots and Boxes',
        dotsDesc: 'Take turns drawing lines between dots. Complete a box to score a point and go again. Outsmart your opponent!',
        dotsTag: 'Multiplayer',
        dotsPlay: 'Play ›',

        stackName: 'The Stack',
        stackDesc: 'Pick-up sticks, digitized. Lift each stick without disturbing the pile — thirty sticks, three lives, one steady hand.',
        stackTag: 'Puzzle',
        stackPlay: 'Play ›',

        perk1Title: 'Instant play',
        perk1Body: 'Single-file builds load fast and cache well. No install, no login.',
        perk2Title: 'Keyboard & touch',
        perk2Body: 'Every game is tuned for laptop keyboards and mobile touch controls.',
        perk3Title: 'Bilingual',
        perk3Body: 'English and Chinese — auto-detected from your browser language.',

        footer: '© 2026 orangely.xyz'
    },
    zh: {
        pageTitle: '单页游戏合集',
        mainTitle: '单页游戏合集',
        mainDesc: '即点即玩 · 无需下载 · 无需注册 · 无广告',
        sectionLabel: '选择游戏',

        mathRainName: '数字雨',
        mathRainDesc: '在等式落地前答对它。在压力下练习算术运算。',
        mathRainTag: '益智教育',
        mathRainPlay: '开始游戏 ›',

        tetrisName: '俄罗斯方块',
        tetrisDesc: '现代俄罗斯方块，支持 SRS 旋转、连击系统、多种主题与全球排行榜。',
        tetrisTag: '经典游戏',
        tetrisPlay: '开始游戏 ›',

        tankName: '坦克大战',
        tankDesc: '复古街机坦克射击。保卫基地，消灭敌人，坚持更多回合。',
        tankTag: '街机竞技',
        tankPlay: '开始游戏 ›',

        gomokuName: '五子棋',
        gomokuDesc: '五子连珠。与 AI 对决或和朋友在经典棋盘上一较高下。',
        gomokuTag: '策略棋牌',
        gomokuPlay: '开始游戏 ›',

        planetMergeName: '星球合成',
        planetMergeDesc: '投放星球，相同合成，连锁 COMBO 造出太阳。每日挑战 + 全球排行榜，看你今天能冲多高！',
        planetMergeTag: '休闲爆款',
        planetMergePlay: '开始游戏 ›',

        wordDailyName: '每日猜词',
        wordDailyDesc: '全球每天同一道题——英文单词或中文成语，6 次机会。连胜打卡，emoji 晒图，快来挑战！',
        wordDailyTag: '每日智力',
        wordDailyPlay: '开始游戏 ›',

        hubTitle: '⚡ 今日挑战',
        hubTaskWordSub: '6 次机会猜出今天的词语',
        hubTaskMergeSub: '每日固定序列，冲击高分',
        hubTaskGravitySub: '每日赛程 5 洞，杆数越少越强',
        hubProfileHint: '全站排行榜昵称',
        hubProfilePlaceholder: '你的昵称',
        langToggle: 'English',
        hubTotalPlayed: '次今日对局',
        badgeDaily: '今日挑战',
        badgeNew: '新上线',

        hoopShotName: '街机投篮',
        hoopShotDesc: '一指甩投，一球定胜负！连中 3 球点燃火球模式分数翻倍，冲击全球前 10！',
        hoopShotTag: '运动街机',
        hoopShotPlay: '开始游戏 ›',

        minesweeperName: '扫雷',
        minesweeperDesc: '经典逻辑推理。首次点击必安全，支持快开与插旗，三档难度，冲击全球最快榜！',
        minesweeperTag: '益智经典',
        minesweeperPlay: '开始游戏 ›',

        reversiName: '黑白棋',
        reversiDesc: '经典奥赛罗策略棋。三档 AI 随你挑战，也可与好友双人同屏，冲击全球连胜榜！',
        reversiTag: '策略棋牌',
        reversiPlay: '开始游戏 ›',

        tdName: '霓虹塔防',
        tdDesc: '在霓虹网格上建造脉冲、冰霜、加农、电磁四类塔，守住 25 波进攻，冲击全球排行榜！',
        tdTag: '策略塔防',
        tdPlay: '开始游戏 ›',

        gravityName: '引力弹弓',
        gravityDesc: '原创轨道物理——拖拽弹弓发射探测器，借行星引力甩尾进虫洞。20 个手工洞口 + 每日赛程！',
        gravityTag: '物理弹道',
        gravityPlay: '开始游戏 ›',

        needleAwnName: '针尖对麦芒',
        needleAwnDesc: '极速破锋，毫厘交错！正对敌方锋芒冲刺触发【针尖对麦芒】极致弹反，双姿态流转，斩破万芒！',
        needleAwnTag: '硬核动作',
        needleAwnPlay: '开始游戏 ›',

        swordFlightName: '御剑飞行',
        swordFlightDesc: '扶摇直上九重天，踏剑破云海。穿梭玄天仙环，引雷淬剑，御剑化阵，突破境界，凝万剑归宗！',
        swordFlightTag: '国风仙侠',
        swordFlightPlay: '开始游戏 ›',

        minecraftName: '2D 我的世界',
        minecraftDesc: '浏览器中的 2D 我的世界。挖矿、合成工具、建造你的世界。',
        minecraftTag: '沙盒游戏',
        minecraftPlay: '开始游戏 ›',

        dotsName: '点格棋',
        dotsDesc: '轮流在相邻的点之间画线，围成方格得分，得分后可再画一条线，最终方格多者获胜！',
        dotsTag: '双人对战',
        dotsPlay: '开始游戏 ›',

        stackName: '挑棒',
        stackDesc: '经典挑棒游戏的数字版。逐根挑起木棒，别碰动压在上面的那些——三十根木棒，三条命，全看你的手稳不稳。',
        stackTag: '休闲益智',
        stackPlay: '开始游戏 ›',

        perk1Title: '即点即玩',
        perk1Body: '单文件构建，加载迅速，无需安装，无需登录。',
        perk2Title: '键盘 & 触控',
        perk2Body: '每款游戏均为键盘和移动端触控精心优化。',
        perk3Title: '双语支持',
        perk3Body: '英文与中文，根据浏览器语言自动切换。',

        footer: '© 2026 orangely.xyz'
    }
};

function detectLanguage() {
    let saved = null;
    try {
        saved = localStorage.getItem('site_lang');
    } catch (e) { /* ignore */ }
    if (saved === 'zh' || saved === 'en') return saved;
    const lang = navigator.language || navigator.userLanguage || 'en';
    return lang.startsWith('zh') ? 'zh' : 'en';
}

function applyLanguage(lang) {
    const t = i18n[lang];
    if (!t) return;

    document.getElementById('html-root').lang = lang;
    document.getElementById('page-title').textContent = t.pageTitle;
    document.getElementById('main-title').textContent = t.mainTitle;
    document.getElementById('main-desc').textContent = t.mainDesc;
    document.getElementById('section-label').textContent = t.sectionLabel;

    document.getElementById('math-rain-name').textContent = t.mathRainName;
    document.getElementById('math-rain-desc').textContent = t.mathRainDesc;
    document.getElementById('math-rain-tag').textContent = t.mathRainTag;
    document.getElementById('math-rain-play').textContent = t.mathRainPlay;

    document.getElementById('tetris-name').textContent = t.tetrisName;
    document.getElementById('tetris-desc').textContent = t.tetrisDesc;
    document.getElementById('tetris-tag').textContent = t.tetrisTag;
    document.getElementById('tetris-play').textContent = t.tetrisPlay;

    document.getElementById('tank-name').textContent = t.tankName;
    document.getElementById('tank-desc').textContent = t.tankDesc;
    document.getElementById('tank-tag').textContent = t.tankTag;
    document.getElementById('tank-play').textContent = t.tankPlay;

    document.getElementById('gomoku-name').textContent = t.gomokuName;
    document.getElementById('gomoku-desc').textContent = t.gomokuDesc;
    document.getElementById('gomoku-tag').textContent = t.gomokuTag;
    document.getElementById('gomoku-play').textContent = t.gomokuPlay;

    document.getElementById('planet-merge-name').textContent = t.planetMergeName;
    document.getElementById('planet-merge-desc').textContent = t.planetMergeDesc;
    document.getElementById('planet-merge-tag').textContent = t.planetMergeTag;
    document.getElementById('planet-merge-play').textContent = t.planetMergePlay;

    document.getElementById('word-daily-name').textContent = t.wordDailyName;
    document.getElementById('word-daily-desc').textContent = t.wordDailyDesc;
    document.getElementById('word-daily-tag').textContent = t.wordDailyTag;
    document.getElementById('word-daily-play').textContent = t.wordDailyPlay;

    document.getElementById('hoop-shot-name').textContent = t.hoopShotName;
    document.getElementById('hoop-shot-desc').textContent = t.hoopShotDesc;
    document.getElementById('hoop-shot-tag').textContent = t.hoopShotTag;
    document.getElementById('hoop-shot-play').textContent = t.hoopShotPlay;

    document.getElementById('minesweeper-name').textContent = t.minesweeperName;
    document.getElementById('minesweeper-desc').textContent = t.minesweeperDesc;
    document.getElementById('minesweeper-tag').textContent = t.minesweeperTag;
    document.getElementById('minesweeper-play').textContent = t.minesweeperPlay;

    document.getElementById('reversi-name').textContent = t.reversiName;
    document.getElementById('reversi-desc').textContent = t.reversiDesc;
    document.getElementById('reversi-tag').textContent = t.reversiTag;
    document.getElementById('reversi-play').textContent = t.reversiPlay;

    document.getElementById('td-name').textContent = t.tdName;
    document.getElementById('td-desc').textContent = t.tdDesc;
    document.getElementById('td-tag').textContent = t.tdTag;
    document.getElementById('td-play').textContent = t.tdPlay;

    document.getElementById('gravity-name').textContent = t.gravityName;
    document.getElementById('gravity-desc').textContent = t.gravityDesc;
    document.getElementById('gravity-tag').textContent = t.gravityTag;
    document.getElementById('gravity-play').textContent = t.gravityPlay;

    document.getElementById('needle-awn-name').textContent = t.needleAwnName;
    document.getElementById('needle-awn-desc').textContent = t.needleAwnDesc;
    document.getElementById('needle-awn-tag').textContent = t.needleAwnTag;
    document.getElementById('needle-awn-play').textContent = t.needleAwnPlay;

    document.getElementById('sword-flight-name').textContent = t.swordFlightName;
    document.getElementById('sword-flight-desc').textContent = t.swordFlightDesc;
    document.getElementById('sword-flight-tag').textContent = t.swordFlightTag;
    document.getElementById('sword-flight-play').textContent = t.swordFlightPlay;

    document.getElementById('minecraft-name').textContent = t.minecraftName;
    document.getElementById('minecraft-desc').textContent = t.minecraftDesc;
    document.getElementById('minecraft-tag').textContent = t.minecraftTag;
    document.getElementById('minecraft-play').textContent = t.minecraftPlay;

    document.getElementById('dots-name').textContent = t.dotsName;
    document.getElementById('dots-desc').textContent = t.dotsDesc;
    document.getElementById('dots-tag').textContent = t.dotsTag;
    document.getElementById('dots-play').textContent = t.dotsPlay;

    document.getElementById('stack-name').textContent = t.stackName;
    document.getElementById('stack-desc').textContent = t.stackDesc;
    document.getElementById('stack-tag').textContent = t.stackTag;
    document.getElementById('stack-play').textContent = t.stackPlay;

    document.getElementById('perk1-title').textContent = t.perk1Title;
    document.getElementById('perk1-body').textContent = t.perk1Body;
    document.getElementById('perk2-title').textContent = t.perk2Title;
    document.getElementById('perk2-body').textContent = t.perk2Body;
    document.getElementById('perk3-title').textContent = t.perk3Title;
    document.getElementById('perk3-body').textContent = t.perk3Body;

    document.getElementById('footer-text').textContent = t.footer;
    // 两颗语言钮共用同一个写入者：applyLanguage 是唯一改它们文案的地方
    document.querySelectorAll('#lang-toggle, #footer-lang-toggle')
        .forEach(btn => { btn.textContent = t.langToggle; });

    // Daily Hub 文案
    document.getElementById('hub-title').textContent = t.hubTitle;
    document.getElementById('hub-task-word-name').textContent = t.wordDailyName;
    document.getElementById('hub-task-word-sub').textContent = t.hubTaskWordSub;
    document.getElementById('hub-task-merge-name').textContent = t.planetMergeName;
    document.getElementById('hub-task-merge-sub').textContent = t.hubTaskMergeSub;
    document.getElementById('hub-task-gravity-name').textContent = t.gravityName;
    document.getElementById('hub-task-gravity-sub').textContent = t.hubTaskGravitySub;
    document.getElementById('hub-profile-hint').textContent = t.hubProfileHint;
    document.getElementById('player-name').placeholder = t.hubProfilePlaceholder;

    // 徽章
    document.querySelectorAll('.card-badge--daily').forEach(el => { el.textContent = t.badgeDaily; });
    document.querySelectorAll('.card-badge--new').forEach(el => { el.textContent = t.badgeNew; });
}

function setCanonicalAndSocialMeta() {
    const currentUrl = window.location.href.split('#')[0];
    const canonicalLink = document.getElementById('canonical-link');
    if (canonicalLink) canonicalLink.setAttribute('href', currentUrl);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', currentUrl);

    const baseUrl = new URL('.', currentUrl).href;
    const imagePath = new URL('assets/seo/og-collection.svg', baseUrl).href;
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.setAttribute('content', imagePath);
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage) twitterImage.setAttribute('content', imagePath);
}

function injectStructuredData() {
    const currentUrl = window.location.href.split('#')[0];
    const baseUrl = new URL('.', currentUrl).href;
    const games = [
        { slug: 'math-rain',   name: 'Math Rain',    description: 'Timed arithmetic practice game with falling equations.' },
        { slug: 'tetris',      name: 'Tetris',        description: 'Modernized Tetris with particles, keyboard, and mobile controls.' },
        { slug: 'tank-battle', name: 'Tank Battle',   description: 'Retro arcade tank shooter with base defense.' },
        { slug: 'gomoku',      name: 'Gomoku',        description: 'Five in a Row board game versus AI or a friend.' },
        { slug: 'planet-merge', name: 'Planet Merge', description: 'Suika-style physics merge game — drop planets, forge suns, chase combo high scores.' },
        { slug: 'word-daily', name: 'Word Daily', description: 'Daily bilingual word puzzle — guess the English word or the Chinese idiom in 6 tries.' },
        { slug: 'hoop-shot', name: 'Hoop Shot', description: 'Flick basketball arcade — one miss ends the run, chain streaks for fire mode.' },
        { slug: 'minesweeper', name: 'Minesweeper', description: 'Classic Minesweeper logic puzzle — safe first click, chording, three difficulties, global fastest clears.' },
        { slug: 'reversi', name: 'Reversi', description: 'Classic Othello strategy board game — three AI levels or pass-and-play with a friend.' },
        { slug: 'tower-defense', name: 'Neon Tower Defense', description: 'Neon-themed tower defense — four tower types, 25 escalating waves, upgrades and a global leaderboard.' },
        { slug: 'gravity-slingshot', name: 'Gravity Slingshot', description: 'Original orbital physics puzzle — slingshot your probe around planets into the wormhole, 20 holes plus a daily course.' },
        { slug: 'needle-awn', name: 'Pinpoint Clash', description: 'Original cyber-ink martial precision action duel — clash tip-to-tip, weave dual stances, freeze time and awaken the thousand-awn storm.' },
        { slug: 'sword-flight', name: 'Sword Flight', description: 'Oriental xianxia kinetic flight action — soar through nine celestial realms, summon companion sword arrays, thread spiritual rings, and ascend to immortality.' },
        { url: 'https://2d-minecraft.orangely.xyz', name: '2D Minecraft', description: 'A 2D browser take on Minecraft — mine blocks, craft tools, and build your world.' },
        { url: 'https://dots-and-boxes.orangely.xyz', name: 'Dots and Boxes', description: 'Turn-based line-drawing game. Complete boxes to score points.' },
        { url: 'https://steady-hand.orangely.xyz', name: 'The Stack', description: 'Digital pick-up sticks — lift each stick without disturbing the pile.' }
    ];

    const siteData = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        'name': 'Mini Games Collection',
        'url': currentUrl,
        'description': 'Play lightweight browser games including Math Rain, Tetris, Tank Battle, and Gomoku.',
        'inLanguage': document.documentElement.lang || 'en',
        'publisher': { '@type': 'Organization', 'name': 'Orangely' }
    };

    const itemList = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': 'Mini Games Collection',
        'itemListElement': games.map((g, i) => ({
            '@type': 'ListItem',
            'position': i + 1,
            'name': g.name,
            'description': g.description,
            'url': g.url || `${baseUrl}${g.slug}.html`
        }))
    };

    [siteData, itemList].forEach(data => {
        const s = document.createElement('script');
        s.type = 'application/ld+json';
        s.textContent = JSON.stringify(data);
        document.head.appendChild(s);
    });
}

function updateDailyHub() {
    // 与各游戏一致的 UTC+8 日期键
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const compact = iso.replace(/-/g, '');
    const ls = (k) => {
        try {
            return localStorage.getItem(k);
        } catch (e) {
            return null;
        }
    };

    const wordDone = !!(ls(`wd_daily_${iso}_en`) || ls(`wd_daily_${iso}_en_4`) || ls(`wd_daily_${iso}_en_5`) || ls(`wd_daily_${iso}_en_6`) || ls(`wd_daily_${iso}_zh`));
    const mergeDone = !!ls(`pm_daily_${compact}`);
    const gravityDone = !!ls(`gs_daily_${compact}`);
    const doneCount = (wordDone ? 1 : 0) + (mergeDone ? 1 : 0) + (gravityDone ? 1 : 0);

    const setTask = (id, done) => {
        const task = document.getElementById(id);
        if (!task) return;
        task.classList.toggle('done', done);
        const status = task.querySelector('.daily-task-status');
        if (status) status.textContent = done ? '✅' : '⚪';
    };
    setTask('hub-task-word', wordDone);
    setTask('hub-task-merge', mergeDone);
    setTask('hub-task-gravity', gravityDone);

    const progress = document.getElementById('hub-progress');
    if (progress) {
        progress.textContent = `${doneCount}/3`;
        progress.classList.toggle('all-done', doneCount === 3);
    }

    // 全站玩家昵称
    const nameInput = document.getElementById('player-name');
    if (nameInput && document.activeElement !== nameInput) {
        let name = null;
        try {
            name = localStorage.getItem('player_name');
        } catch (e) { /* ignore */ }
        if (!name) {
            for (const k of ['tetris_username', 'pm_username', 'hs_username']) {
                try {
                    name = localStorage.getItem(k);
                } catch (e) { /* ignore */ }
                if (name) break;
            }
        }
        nameInput.value = name || '';
    }

    // 今日全站战绩（统计 Worker 不可达时保持隐藏）
    fetch('https://games-analytics.orangely.workers.dev/stats?day=' + compact)
        .then(r => r.ok ? r.json() : Promise.reject(new Error('offline')))
        .then(s => {
            const el = document.getElementById('hub-total');
            const curLang = detectLanguage();
            if (el && s && s.total && s.total.p > 0) {
                el.textContent = curLang === 'zh'
                    ? ('🔥 今日已玩 ' + s.total.p + ' 次')
                    : ('🔥 ' + s.total.p + ' ' + i18n.en.hubTotalPlayed);
                el.hidden = false;
            }
        })
        .catch(() => { /* 静默 */ });
}

onReady(() => {
    const lang = detectLanguage();
    applyLanguage(lang);
    // 两颗钮共用同一个 handler，避免两份逻辑各自漂移
    const toggleLang = () => {
        const next = document.getElementById('html-root').lang === 'zh' ? 'en' : 'zh';
        try {
            localStorage.setItem('site_lang', next);
            window.dispatchEvent(new CustomEvent('site-settings:changed'));
        } catch (e) { /* ignore */ }
        applyLanguage(next);
        updateDailyHub();
    };
    document.querySelectorAll('#lang-toggle, #footer-lang-toggle')
        .forEach(btn => btn.addEventListener('click', toggleLang));
    setCanonicalAndSocialMeta();
    injectStructuredData();
    updateDailyHub();

    const nameInput = document.getElementById('player-name');
    if (nameInput) {
        nameInput.addEventListener('change', () => {
            const clean = String(nameInput.value).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 20);
            nameInput.value = clean;
            try {
                localStorage.setItem('player_name', clean);
            } catch (e) { /* ignore */ }
        });
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') nameInput.blur();
        });
    }
});
