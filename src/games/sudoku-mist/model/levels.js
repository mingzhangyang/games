/**
 * 雾隐九宫的关卡（由 tools/generators/sudoku-mist-levels.mjs --write 生成，勿手改）。
 * givens：题面（'.' = 空格）；window：开局视野（'1' = 可见）；cap：通关所需的最高档位；
 * reveal：揭雾核；stars：星级阈值 [★2, ★3]（分数 ≥ 阈值）。seed 只用于追溯出处——运行时不再调用生成器，关卡以这里的字符串为准。
 * 可解性、唯一解、永不卡死由 tests/verify-sudoku-mist-levels.mjs 锁住。
 */
export const CHAPTERS = Object.freeze([
    { id: 'thin', name: { en: 'Thin Mist', zh: '初雾' } },
    { id: 'through', name: { en: 'Through the Mist', zh: '穿雾' } },
].map(Object.freeze));

export const LEVELS = Object.freeze([
    {
        id: 'thin-1', chapter: 'thin', name: { en: 'Bamboo Path', zh: '竹径' },
        cap: 2, reveal: 'box', seed: 1017, stars: [980, 1170],
        givens: '..3..2....6.351...9.2674...8..427.6..46.13....37.8.29..79.35.41.......7.38.......',
        window: '000000000000001000001000000000111010010001000000010010000001000000000000000000000',
    },
    {
        id: 'thin-2', chapter: 'thin', name: { en: 'Stone Bridge', zh: '石桥' },
        cap: 2, reveal: 'box', seed: 1002, stars: [980, 1160],
        givens: '..5...81..6438.9..1..5.2....47123..8236..91..8.94.75..358.7..........7.....6...5.',
        window: '001000000000100000100000000011000000011001000001001000000010000000000000000000000',
    },
    {
        id: 'thin-3', chapter: 'thin', name: { en: 'Tea Terraces', zh: '茶田' },
        cap: 2, reveal: 'box', seed: 1005, stars: [940, 1110],
        givens: '.693.1.......5.39.38149....654.2.7.9.32.471...7.....3..4.7..........62.58..214...',
        window: '010001000000010110000110000001010000011000000000000000000000000000001000000000000',
    },
    {
        id: 'thin-4', chapter: 'thin', name: { en: 'Mountain Temple', zh: '山寺' },
        cap: 2, reveal: 'box', seed: 1003, stars: [1050, 1230],
        givens: '1...2.8.66.3.1795.97.8...3172.98.3...18..524...41..6...3...87.....2........7....8',
        window: '000010000101000010100000000110000000001001000000000100000000000000000000000000000',
    },
    {
        id: 'through-1', chapter: 'through', name: { en: 'Ferry Crossing', zh: '渡口' },
        cap: 2, reveal: 'cross', seed: 2654437769, stars: [1050, 1240],
        givens: '.3.91.7....45.7.2..27.8.3.9.5.6..............3...4.2......98...2497.38.15.1..4.3.',
        window: '000000000001000000011000000010000000000000000100010100000001000110101000101001000',
    },
    {
        id: 'through-2', chapter: 'through', name: { en: 'Pine Cliff', zh: '松崖' },
        cap: 2, reveal: 'cross', seed: 2654437761, stars: [1160, 1330],
        givens: '.1.57..6.2.4681....8.2...1.19..6.7....8.591...267......65........1..5..8...1..3..',
        window: '000110010000110000000000000010000000001011000001100000011000000000000000000000000',
    },
    {
        id: 'through-3', chapter: 'through', name: { en: 'Cloud Walkway', zh: '云栈' },
        cap: 2, reveal: 'cross', seed: 2011, stars: [1140, 1340],
        givens: '..........2.9..5.7936.75...5..3..8..7.92...6....756.....2.4.9....56297.84...1.6..',
        window: '000000000010100000010000000100000000001000000000011000001010100001011100000010000',
    },
    {
        id: 'through-4', chapter: 'through', name: { en: 'Sea of Mist', zh: '雾海' },
        cap: 2, reveal: 'cross', seed: 2004, stars: [1100, 1280],
        givens: '..13.9.....8.4.91.....182.....6.57..3..8.2.41..7.3462..2...6..5..9.5.....1.....98',
        window: '000000000000010000000011100000101100000001011000001110010001000000000000000000000',
    },
].map(Object.freeze));

export const levelById = id => LEVELS.find(l => l.id === id) || null;
