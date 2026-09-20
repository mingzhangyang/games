// 无头浏览器路径与启动参数的唯一出处。
// 所有 puppeteer-core 脚本一律 import 这里的 CHROME_PATH / LAUNCH_ARGS，
// 换机器只需设 CHROME_BIN 环境变量，不再改 11 个脚本。
import { existsSync } from 'node:fs';

// 候选顺序：环境变量 → puppeteer 缓存（安装 npx puppeteer browsers install chrome 后出现）→ 常见系统安装位
const CANDIDATES = [
    process.env.CHROME_BIN,
    'C:\\Users\\mingz\\.cache\\puppeteer\\chrome\\win64-119.0.6045.105\\chrome-win64\\chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
].filter(Boolean);

export const CHROME_PATH = CANDIDATES.find(existsSync) || CANDIDATES[0];

// 公共启动参数（原各脚本逐字重复的那份）
export const LAUNCH_ARGS = ['--no-first-run', '--disable-gpu', '--hide-scrollbars', '--mute-audio'];

export const LAUNCH_OPTS = { executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS };
