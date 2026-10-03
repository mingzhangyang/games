// 跨页校验器的按页过滤（verify-all --changed 用）。
//
//   VERIFY_PAGES=silk-dew,index node tests/verify-theme.mjs
//
// 未设置 VERIFY_PAGES = 全部页，默认行为不变。页标识 = 注册表 id（= html 文件名去掉 .html），
// 首页是 'index'。过滤只作用于「逐页循环」；覆盖率守卫（registry.assertCovered）和不属于
// 任何单页的全局断言照常执行 —— 过滤是为了少跑无关页，不能顺带放过漏登记。
const RAW = (process.env.VERIFY_PAGES || '').trim();

export const PAGE_FILTER = RAW
    ? new Set(RAW.split(',').map(s => s.trim().replace(/\.html$/, '')).filter(Boolean))
    : null;

/** id 或文件名（'silk-dew' / 'silk-dew.html'）是否在本次要跑的页里 */
export function keepPage(idOrFile) {
    return !PAGE_FILTER || PAGE_FILTER.has(String(idOrFile).replace(/\.html$/, ''));
}

/** 过滤后本校验器没有页可跑：打印原因并以 0 退出（在启动浏览器之前调用） */
export function exitIfNoPages(list, name) {
    if (PAGE_FILTER && list.length === 0) {
        console.log(`⊘ ${name}：VERIFY_PAGES=${RAW} 不涉及本校验器的页面，跳过`);
        process.exit(0);
    }
}
