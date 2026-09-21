// 无头浏览器路径与启动参数的唯一出处。
// 所有 puppeteer-core 脚本一律 import 这里的 CHROME_PATH / LAUNCH_ARGS，
// 换机器只需设 CHROME_BIN 环境变量，不再改几十个脚本。
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

function normaliseCandidate(value) {
    if (!value) return null;
    // WSL 中常见的 CHROME_BIN 写法是 Windows 路径；转换后才能用 existsSync。
    if (process.platform === 'linux' && /^[A-Za-z]:[\\/]/.test(value)) {
        return `/mnt/${value[0].toLowerCase()}/${value.slice(3).replaceAll('\\', '/')}`;
    }
    return value;
}

function cachedChromePaths() {
    const root = process.env.PUPPETEER_CACHE_DIR || join(homedir(), '.cache', 'puppeteer');
    const paths = [];
    for (const browser of ['chrome', 'chrome-headless-shell']) {
        const versionsDir = join(root, browser);
        if (!existsSync(versionsDir)) continue;
        for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            for (const relative of [
                ['chrome-linux64', 'chrome'],
                ['chrome-win64', 'chrome.exe'],
                ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
            ]) {
                paths.push(join(versionsDir, entry.name, ...relative));
            }
        }
    }
    return paths;
}

const systemChromePaths = process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ]
    : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : [
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            // WSL can launch this only from a host context that permits Win32 exec.
            '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
            '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        ];

const CANDIDATES = [
    normaliseCandidate(process.env.CHROME_BIN),
    normaliseCandidate(process.env.PUPPETEER_EXECUTABLE_PATH),
    ...systemChromePaths,
    ...cachedChromePaths(),
].filter(Boolean);

export const CHROME_PATH = CANDIDATES.find(existsSync);

if (!CHROME_PATH) {
    throw new Error(
        '找不到可用的 Chrome。请安装 Chrome/Chromium，或设置 CHROME_BIN（可用绝对路径）。'
    );
}

// 每个校验器使用独立临时 profile，避免和正在运行的 Chrome profile 锁冲突。
const PROFILE = mkdtempSync(join(tmpdir(), 'mini-games-puppeteer-'));

// 公共启动参数（原各脚本逐字重复的那份）。
export const LAUNCH_ARGS = [
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-sandbox',
    `--user-data-dir=${PROFILE}`,
];

export const LAUNCH_OPTS = { executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS };
