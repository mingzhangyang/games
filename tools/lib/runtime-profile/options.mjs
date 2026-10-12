import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from '../registry.mjs';
import { validateScenarioCoverage } from './scenarios.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const PRESETS = {
    quick: { warmup: 400, menu: 1000, active: 1500, paused: 1000, resume: 1000, memoryCycles: 0 },
    baseline: { warmup: 2000, menu: 5000, active: 15000, paused: 5000, resume: 10000, memoryCycles: 0 },
    deep: { warmup: 2000, menu: 5000, active: 20000, paused: 5000, resume: 10000, memoryCycles: 5 },
};
export const VIEWPORTS = {
    mobile: game => game.id === 'tank-battle' || game.id === 'tower-defense'
        ? { width: 839, height: 360, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: true }
        : { width: 390, height: 664, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    desktop: () => ({ width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }),
    small: () => ({ width: 320, height: 454, deviceScaleFactor: 2, isMobile: true, hasTouch: true }),
};
const flag = (argv, name) => argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
const assertInt = (text, label, lo, hi) => {
    const number = Number(text);
    if (!Number.isInteger(number) || number < lo || number > hi) throw new Error(`${label} must be an integer ${lo}..${hi}`);
    return number;
};

export function parseArgs(argv, games = registry.all()) {
    if (argv.includes('--help')) return { help: true };
    const known = new Set(['--all', '--help']);
    for (const arg of argv) {
        if (known.has(arg)) continue;
        if (!/^--(games|viewports|preset|repeat|out|port|source)=.+$/.test(arg)) throw new Error(`unknown option: ${arg}`);
    }
    if (argv.includes('--all') === Boolean(flag(argv, 'games'))) throw new Error('choose exactly one of --all or --games=id,...');
    const all = validateScenarioCoverage(games);
    const ids = flag(argv, 'games')?.split(',') || all;
    if (!ids.length || ids.some(id => !all.includes(id)) || new Set(ids).size !== ids.length) {
        throw new Error(`invalid or duplicated --games: ${ids.join(',')}`);
    }
    const viewports = (flag(argv, 'viewports') || 'mobile,desktop').split(',');
    if (!viewports.length || viewports.some(v => !VIEWPORTS[v]) || new Set(viewports).size !== viewports.length) {
        throw new Error(`invalid or duplicated --viewports: ${viewports.join(',')}`);
    }
    const preset = flag(argv, 'preset') || 'baseline';
    if (!PRESETS[preset]) throw new Error(`unknown preset: ${preset}`);
    const source = flag(argv, 'source') || 'dist';
    if (!['dist', 'source'].includes(source)) throw new Error('--source must be dist or source');
    const out = resolve(ROOT, flag(argv, 'out') || '.tmp-perf/pr136');
    // path.relative keeps the containment check separator-agnostic (Windows paths use backslashes).
    const rel = relative(ROOT, out);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('--out must be a subdirectory of the repository');
    return {
        games: ids, viewports, preset, repeat: assertInt(flag(argv, 'repeat') || '3', '--repeat', 1, 10),
        port: assertInt(flag(argv, 'port') || '18936', '--port', 1024, 65535),
        out, source,
    };
}

