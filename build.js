#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 构建配置
const GAMES = [
  { name: 'math-rain', config: 'vite.config.math-rain.js' },
  { name: 'tetris', config: 'vite.config.tetris.js' },
  { name: 'tank-battle', config: 'vite.config.tank-battle.js' }
];

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, description) {
  try {
    log(`\n🔄 ${description}...`, 'cyan');
    execSync(command, { stdio: 'inherit', cwd: __dirname });
    log(`✅ ${description} 完成`, 'green');
  } catch (error) {
    log(`❌ ${description} 失败: ${error.message}`, 'red');
    process.exit(1);
  }
}

function copyAssets() {
  log('\n📁 复制静态资源...', 'cyan');
  
  const assetDirs = ['assets', 'config'];
  
  assetDirs.forEach(dir => {
    if (existsSync(dir)) {
      const rootTarget = join('dist', dir);
      if (!existsSync(rootTarget)) {
        mkdirSync(rootTarget, { recursive: true });
      }
      copyDirectory(dir, rootTarget);

      GAMES.forEach(game => {
        const targetDir = join('dist', game.name, dir);
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }
        copyDirectory(dir, targetDir);
      });
    }
  });
  
  log('✅ 静态资源复制完成', 'green');
}

function copyDirectory(src, dest) {
  const items = readdirSync(src);
  
  items.forEach(item => {
    const srcPath = join(src, item);
    const destPath = join(dest, item);
    
    if (statSync(srcPath).isDirectory()) {
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  });
}

function generateIndexHtml() {
  log('\n📄 生成游戏索引页面...', 'cyan');
  
  const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Play lightweight browser games like Math Rain, Tetris, and Tank Battle instantly.">
    <meta name="keywords" content="web games, html5 games, mini games, math game, tetris, tank battle">
    <meta name="robots" content="index, follow">
    <meta name="author" content="Orangely">
    <link rel="canonical" id="canonical-link" href="">
    <meta property="og:title" content="Mini Games Collection">
    <meta property="og:description" content="A curated collection of single-file browser games including Math Rain, Tetris, and Tank Battle.">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Mini Games Collection">
    <meta property="og:image" content="assets/seo/og-collection.svg">
    <meta property="og:url" content="">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Mini Games Collection">
    <meta name="twitter:description" content="Classic titles rebuilt for instant HTML5 play.">
    <meta name="twitter:image" content="assets/seo/og-collection.svg">
    <title>Mini Games Collection</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            text-align: center;
        }
        h1 {
            font-size: 3em;
            margin-bottom: 2em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .lede {
            font-size: 1.05em;
            line-height: 1.6;
            opacity: 0.9;
            margin-top: -10px;
        }
        .games-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 40px;
        }
        .game-card {
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 30px;
            text-decoration: none;
            color: white;
            transition: transform 0.3s, box-shadow 0.3s;
            backdrop-filter: blur(10px);
        }
        .game-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }
        .game-icon {
            font-size: 4em;
            margin-bottom: 15px;
        }
        .game-title {
            font-size: 1.5em;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .game-desc {
            opacity: 0.8;
            line-height: 1.4;
        }
    </style>
    </style>
</head>
<body>
    <main class="container">
        <h1>🎮 Mini Games Collection</h1>
        <p class="lede">Pick a single-file HTML5 game, share the link, and play instantly on desktop or mobile.</p>
        
        <div class="games-grid">
            <a href="math-rain/math-rain.html" class="game-card">
                <div class="game-icon">🧮</div>
                <div class="game-title">Math Rain</div>
                <div class="game-desc">Answer falling equations and test your reflexes.</div>
            </a>
            
            <a href="tetris/tetris.html" class="game-card">
                <div class="game-icon">🧩</div>
                <div class="game-title">Tetris</div>
                <div class="game-desc">Modern effects meet the classic falling block challenge.</div>
            </a>
            
            <a href="tank-battle/tank-battle.html" class="game-card">
                <div class="game-icon">🚗</div>
                <div class="game-title">Tank Battle</div>
                <div class="game-desc">Retro arcade tank battles with base defense.</div>
            </a>
            

        </div>
    </main>
    <script>
        (() => {
            const currentUrl = window.location.href.split('#')[0];
            const canonical = document.getElementById('canonical-link');
            if (canonical) {
                canonical.setAttribute('href', currentUrl);
            }
            const baseUrl = new URL('.', currentUrl).href;
            const socialImage = new URL('assets/seo/og-collection.svg', baseUrl).href;

            const ogUrl = document.querySelector('meta[property="og:url"]');
            if (ogUrl) {
                ogUrl.setAttribute('content', currentUrl);
            }
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) {
                ogImage.setAttribute('content', socialImage);
            }
            const twitterImage = document.querySelector('meta[name="twitter:image"]');
            if (twitterImage) {
                twitterImage.setAttribute('content', socialImage);
            }

            const games = [
                { path: 'math-rain/math-rain.html', name: 'Math Rain', description: 'Timed arithmetic practice game.' },
                { path: 'tetris/tetris.html', name: 'Tetris', description: 'Classic puzzle game with modern polish.' },
                { path: 'tank-battle/tank-battle.html', name: 'Tank Battle', description: 'Retro arcade tank shooter.' }
            ];

            const siteData = {
                "@context": "https://schema.org",
                "@type": "WebSite",
                "name": "Mini Games Collection",
                "url": currentUrl,
                "description": "Lightweight browser games including Math Rain, Tetris, and Tank Battle.",
                "inLanguage": "en",
                "publisher": {
                    "@type": "Organization",
                    "name": "Orangely"
                }
            };

            const itemList = {
                "@context": "https://schema.org",
                "@type": "ItemList",
                "name": "Mini Games Collection",
                "itemListElement": games.map((game, index) => ({
                    "@type": "ListItem",
                    "position": index + 1,
                    "name": game.name,
                    "description": game.description,
                    "url": new URL(game.path, baseUrl).href
                }))
            };

            [siteData, itemList].forEach(data => {
                const script = document.createElement('script');
                script.type = 'application/ld+json';
                script.textContent = JSON.stringify(data);
                document.head.appendChild(script);
            });
        })();
    </script>
</body>
</html>`;
  
  // 写入到dist目录
  if (!existsSync('dist')) {
    mkdirSync('dist');
  }
  
  import('fs').then(fs => {
    fs.writeFileSync(join('dist', 'index.html'), indexContent);
    log('✅ 游戏索引页面生成完成', 'green');
  });
}

// 主构建流程
async function build() {
  log('🚀 开始构建 Mini Games Collection', 'bright');
  
  // 检查依赖
  if (!existsSync('node_modules')) {
    execCommand('npm install', '安装依赖');
  }
  
  // 清理dist目录
  execCommand('rm -rf dist', '清理构建目录');
  
  // 构建每个游戏
  for (const game of GAMES) {
    execCommand(
      `npx vite build --config ${game.config}`,
      `构建 ${game.name}`
    );
  }
  
  // 复制静态资源
  copyAssets();
  
  // 生成索引页面
  generateIndexHtml();
  
  log('\n🎉 所有游戏构建完成！', 'green');
  log('📁 构建文件位于 dist/ 目录', 'cyan');
  log('🌐 运行 npm run serve 启动预览服务器', 'yellow');
}

// 运行构建
build().catch(error => {
  log(`构建失败: ${error.message}`, 'red');
  process.exit(1);
});
