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
    /**
     * 断言「挂着某 cap 的页面」被调用方的手工表全覆盖。
     *
     * 背景：测试数据（gameVar / 按钮 id）和迁移参数（选择器顺序）不该进注册表，
     * 但手工表一旦用 `.filter(g => TABLE[g.id])` 静默收窄 withCap()，新游戏就会
     * 无声逃过校验 —— 表里没有它，校验器就当它不存在，全绿。漏了必须红。
     *
     * @param {string} cap        能力名
     * @param {string[]} covered  手工表的 key 集合
     * @param {string[]} exempt   明确豁免的 id（必须在调用处写明理由）
     * @param {string} label      出错信息里的表名
     */
    assertCovered({ cap, covered, exempt = [], label = '手工表' }) {
        const want = this.withCap(cap).map(g => g.id);
        const missing = want.filter(id => !covered.includes(id) && !exempt.includes(id));
        const stale = covered.filter(id => !want.includes(id));
        const ghostExempt = exempt.filter(id => !want.includes(id));
        const problems = [];
        if (missing.length) problems.push(`缺条目: ${missing.join(', ')} —— 这些页在 games.config.json 里挂了 caps:${cap}，${label} 里却没有，会被静默跳过`);
        if (stale.length) problems.push(`多余条目: ${stale.join(', ')} —— 不在 caps:${cap} 名单里（页面被删/cap 被摘/拼错）`);
        if (ghostExempt.length) problems.push(`豁免已失效: ${ghostExempt.join(', ')} —— 不在 caps:${cap} 名单里，豁免可以删了`);
        if (problems.length) {
            // 直接退出而不是 throw：校验套件是 stdio:'inherit' 串起来的，
            // 一段 Node 栈回溯只会把真正的原因挤到屏幕外。
            console.error(`✗ ${label} 与注册表 caps:${cap} 不一致`);
            for (const p of problems) console.error(`    - ${p}`);
            process.exit(1);
        }
        return want.filter(id => !exempt.includes(id));
    },
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    // node scripts/lib/registry.mjs [cap] —— 调试用
    const cap = process.argv[2];
    const list = cap ? registry.withCap(cap) : registry.all();
    console.log(list.map(g => g.id).join('\n'));
}
