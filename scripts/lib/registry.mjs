// games.config.json 读取器（Node 侧唯一入口）。
// 校验器 / 迁移脚本一律从这里拿页面清单，禁止再各自维护一份字符串数组。
// 用法：
//   import { registry } from './lib/registry.mjs';
//   registry.all();                  // 全部游戏（按配置顺序）
//   registry.withCap('drawer');      // 具备某能力的游戏
//   registry.byId('sword-flight');   // 单个，找不到抛错
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let cache = null;
function load() {
    if (cache) return cache;
    cache = JSON.parse(readFileSync(join(ROOT, 'games.config.json'), 'utf8'));
    return cache;
}

export const registry = {
    get config() { return load(); },
    /** 全部游戏，按配置顺序 */
    all() { return load().games; },
    /** 具备某个 cap 的游戏 */
    withCap(cap) { return load().games.filter(g => (g.caps || []).includes(cap)); },
    /** 按 id 取单个，找不到直接抛错（宁可红不可静默） */
    byId(id) {
        const g = load().games.find(g => g.id === id);
        if (!g) throw new Error(`games.config.json 里没有 id="${id}"`);
        return g;
    },
    /** 站点级字段 */
    site() { return load().site; },
    /** href 文件名集合（校验器拼 URL 用） */
    hrefs() { return load().games.map(g => g.href); },
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    // node scripts/lib/registry.mjs [cap] —— 调试用
    const cap = process.argv[2];
    const list = cap ? registry.withCap(cap) : registry.all();
    console.log(list.map(g => g.id).join('\n'));
}
