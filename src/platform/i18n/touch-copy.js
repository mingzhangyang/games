// 触屏文案：手指操作的设备上，把键鼠说明（「Click a point…」「P 暂停 · M 静音」「右键插旗」）换成
// 同一张语言表里的 <key>Touch。判据只用 (pointer: coarse)：带触屏的笔记本主指针仍是鼠标，照旧显示键鼠文案。
// 声明式绑定用 data-i18n-touch="<key>"（src/platform/i18n/bindings.js），命令式写入用 touchCopy()。

export function isCoarsePointer() {
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

/** 触屏上优先 table[`${key}Touch`]，缺省回到 table[key]；只在同一张表里找，不跨语言回退 */
export function touchCopy(table, key) {
    const touch = isCoarsePointer() ? table?.[`${key}Touch`] : undefined;
    return touch ?? table?.[key];
}
