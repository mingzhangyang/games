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
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
</head>
<body>
    <div class="container">
        <h1>🎮 Mini Games Collection</h1>
        <p>选择一个游戏开始游玩</p>
        
        <div class="games-grid">
            <a href="math-rain/math-rain.html" class="game-card">
                <div class="game-icon">🧮</div>
                <div class="game-title">Math Rain</div>
                <div class="game-desc">数字雨 - 挑战你的数学计算能力</div>
            </a>
            
            <a href="tetris/tetris.html" class="game-card">
                <div class="game-icon">🧩</div>
                <div class="game-title">Tetris</div>
                <div class="game-desc">俄罗斯方块 - 经典的益智游戏</div>
            </a>
            
            <a href="tank-battle/tank-battle.html" class="game-card">
                <div class="game-icon">🚗</div>
                <div class="game-title">Tank Battle</div>
                <div class="game-desc">坦克大战 - 策略与反应的结合</div>
            </a>
            

        </div>
    </div>
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