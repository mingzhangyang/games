/**
 * 涟漪双生 — 20 关（由 scripts/ripple-build-levels.mjs 生成，勿手改）
 *
 * par 全部由 solvePar() 按成本分层穷举现算（构造式出题保证有解，par 取真最小值）。
 * 复核：scripts/verify-ripple-duet-levels.mjs
 */

export const LEVELS = [
    {
        id: 'rd1',
        name: {
            en: 'First Cancellation',
            zh: '第一次对消'
        },
        lambda: 72,
        ctrl: [
            {
                i: 7,
                j: 1,
                ph: 7
            }
        ],
        storms: [
            {
                x: 422.19280106946826,
                y: 172.74974145926535,
                ph: 7,
                amp: 0.9238545675179921
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 340,
                y: 99,
                tol: 0.05
            }
        ],
        par: 3
    },
    {
        id: 'rd2',
        name: {
            en: 'Against the Storm',
            zh: '逆着风来'
        },
        lambda: 72,
        ctrl: [
            {
                i: 1,
                j: 1,
                ph: 0
            }
        ],
        storms: [
            {
                x: 265.8156153233722,
                y: 63.88694917783141,
                ph: 4,
                amp: 0.9246254951227456
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 102,
                y: 260,
                tol: 0.05
            }
        ],
        par: 2
    },
    {
        id: 'rd3',
        name: {
            en: 'Half a Wave',
            zh: '半波之差'
        },
        lambda: 96,
        ctrl: [
            {
                i: 6,
                j: 6,
                ph: 6
            }
        ],
        storms: [
            {
                x: 331.02397117298096,
                y: 106.92528548184782,
                ph: 4,
                amp: 0.9032817685278133
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 340,
                y: 57,
                tol: 0.05
            }
        ],
        par: 4
    },
    {
        id: 'rd4',
        name: {
            en: 'Light in the Dark',
            zh: '暗处点灯'
        },
        lambda: 96,
        ctrl: [
            {
                i: 3,
                j: 1,
                ph: 1
            }
        ],
        storms: [
            {
                x: 436.34825011715293,
                y: 306.6765523888171,
                ph: 3,
                amp: 0.9086705216090195
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 200,
                y: 288,
                tol: 0.05
            },
            {
                kind: 'blaze',
                x: 326,
                y: 92,
                need: 0.62
            }
        ],
        par: 3
    },
    {
        id: 'rd5',
        name: {
            en: 'Two Tasks, One Sea',
            zh: '一海两事'
        },
        lambda: 72,
        ctrl: [
            {
                i: 1,
                j: 3,
                ph: 4
            }
        ],
        storms: [
            {
                x: 310.6004889588803,
                y: 111.42753145191818,
                ph: 1,
                amp: 1.1090505204978398
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 221,
                y: 225,
                tol: 0.05
            },
            {
                kind: 'blaze',
                x: 305,
                y: 162,
                need: 0.7699662605291078
            }
        ],
        par: 3
    },
    {
        id: 'rd6',
        name: {
            en: 'Storm and Beacon',
            zh: '风口与灯'
        },
        lambda: 96,
        ctrl: [
            {
                i: 3,
                j: 1,
                ph: 1
            }
        ],
        storms: [
            {
                x: 359.21213504392654,
                y: 170.40185778401792,
                ph: 4,
                amp: 1.1202891430701127
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 403,
                y: 288,
                tol: 0.05
            },
            {
                kind: 'blaze',
                x: 410,
                y: 183,
                need: 0.7237914152133158
            }
        ],
        par: 3
    },
    {
        id: 'rd7',
        name: {
            en: 'Twins',
            zh: '双生'
        },
        lambda: 64,
        ctrl: [
            {
                i: 5,
                j: 2,
                ph: 0
            },
            {
                i: 1,
                j: 5,
                ph: 0
            }
        ],
        storms: [],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 88,
                y: 365,
                tol: 0.05
            }
        ],
        par: 1
    },
    {
        id: 'rd8',
        name: {
            en: 'Mirror Distance',
            zh: '等距之静'
        },
        lambda: 72,
        ctrl: [
            {
                i: 0,
                j: 5,
                ph: 7
            },
            {
                i: 6,
                j: 3,
                ph: 2
            }
        ],
        storms: [],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 445,
                y: 260,
                tol: 0.05
            }
        ],
        par: 2
    },
    {
        id: 'rd9',
        name: {
            en: 'The Phase Key',
            zh: '相位之钥'
        },
        lambda: 96,
        ctrl: [
            {
                i: 6,
                j: 1,
                ph: 3
            },
            {
                i: 1,
                j: 2,
                ph: 7
            }
        ],
        storms: [
            {
                x: 183.0158906057477,
                y: 196.49956716690212,
                ph: 1,
                amp: 1.1972197961644269
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 284,
                y: 99,
                tol: 0.05
            }
        ],
        par: 2
    },
    {
        id: 'rd10',
        name: {
            en: 'Still and Bright',
            zh: '静与亮'
        },
        lambda: 96,
        ctrl: [
            {
                i: 6,
                j: 5,
                ph: 4
            },
            {
                i: 4,
                j: 2,
                ph: 4
            }
        ],
        storms: [
            {
                x: 441.29956386983395,
                y: 214.35198792256415,
                ph: 5,
                amp: 0.937142002035398
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'calm',
                x: 508,
                y: 113,
                tol: 0.05
            },
            {
                kind: 'blaze',
                x: 508,
                y: 316,
                need: 0.8145753155761494
            }
        ],
        par: 3
    },
    {
        id: 'rd11',
        name: {
            en: 'Beware the Echo',
            zh: '提防回波'
        },
        lambda: 80,
        ctrl: [
            {
                i: 7,
                j: 5,
                ph: 7
            },
            {
                i: 2,
                j: 1,
                ph: 5
            }
        ],
        storms: [
            {
                x: 477.4675360135734,
                y: 129.48052535299212,
                ph: 4,
                amp: 0.9454952472937292
            }
        ],
        walls: [
            {
                x1: 170.06149211557323,
                y1: -71.64694483452206,
                x2: 215.65658927677453,
                y2: 446.3502434926546,
                r: -0.7
            }
        ],
        targets: [
            {
                kind: 'calm',
                x: 508,
                y: 302,
                tol: 0.05
            }
        ],
        par: 2
    },
    {
        id: 'rd12',
        name: {
            en: 'Calm Behind the Wall',
            zh: '堤内之静'
        },
        lambda: 80,
        ctrl: [
            {
                i: 5,
                j: 0,
                ph: 1
            },
            {
                i: 5,
                j: 5,
                ph: 1
            }
        ],
        storms: [
            {
                x: 217.9790905676782,
                y: 262.78888936154544,
                ph: 0,
                amp: 0.9595780127099715
            }
        ],
        walls: [
            {
                x1: 400.2715640617872,
                y1: -84.53519921218117,
                x2: 230.91661778554672,
                y2: 407.11396652673443,
                r: -0.7
            }
        ],
        targets: [
            {
                kind: 'calm',
                x: 396,
                y: 344,
                tol: 0.05
            },
            {
                kind: 'blaze',
                x: 396,
                y: 99,
                need: 1.2508934084684464
            }
        ],
        par: 3
    },
    {
        id: 'rd13',
        name: {
            en: 'Reflected Light',
            zh: '折返的波'
        },
        lambda: 80,
        ctrl: [
            {
                i: 1,
                j: 5,
                ph: 3
            },
            {
                i: 6,
                j: 4,
                ph: 4
            }
        ],
        storms: [
            {
                x: 328.30309853423387,
                y: 353.31164583563805,
                ph: 7,
                amp: 1.0322836468927563
            }
        ],
        walls: [
            {
                x1: 576.0081181696702,
                y1: 96.29488583339575,
                x2: 113.35927971237413,
                y2: 333.6891828881371,
                r: 0.7
            }
        ],
        targets: [
            {
                kind: 'calm',
                x: 270,
                y: 260,
                tol: 0.05
            },
            {
                kind: 'blaze',
                x: 347,
                y: 211,
                need: 1.0677757075187955
            }
        ],
        par: 2
    },
    {
        id: 'rd14',
        name: {
            en: 'Opening the Channel',
            zh: '航道初开'
        },
        lambda: 72,
        ctrl: [
            {
                i: 6,
                j: 3,
                ph: 7
            },
            {
                i: 6,
                j: 6,
                ph: 4
            }
        ],
        storms: [
            {
                x: 259.59664527792484,
                y: 258.6040599877015,
                ph: 1,
                amp: 1.049215874541551
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'lane',
                x1: 138.88865370900956,
                y1: 333.4078179669771,
                x2: 23.111346290990433,
                y2: 340.5921820330229,
                n: 5,
                tol: 0.08140108350789244
            }
        ],
        par: 2
    },
    {
        id: 'rd15',
        name: {
            en: 'Corridor of Still Water',
            zh: '静水走廊'
        },
        lambda: 64,
        ctrl: [
            {
                i: 7,
                j: 6,
                ph: 0
            },
            {
                i: 1,
                j: 3,
                ph: 5
            }
        ],
        storms: [
            {
                x: 331.5185123728588,
                y: 196.99684354942292,
                ph: 7,
                amp: 1.1303477071691304
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'lane',
                x1: 238.18257700950846,
                y1: 80.38211575758655,
                x2: 119.81742299049154,
                y2: 5.617884242413446,
                n: 5,
                tol: 0.09799748885147701
            }
        ],
        par: 2
    },
    {
        id: 'rd16',
        name: {
            en: 'Between the Walls',
            zh: '双堤之间'
        },
        lambda: 64,
        ctrl: [
            {
                i: 5,
                j: 1,
                ph: 2
            },
            {
                i: 1,
                j: 4,
                ph: 4
            }
        ],
        storms: [
            {
                x: 414.73783612716943,
                y: 65.30302841216326,
                ph: 0,
                amp: 1.146794075460639
            },
            {
                x: 458.7665401119739,
                y: 288.24231795966625,
                ph: 0,
                amp: 0.9499196338350884
            }
        ],
        walls: [
            {
                x1: 293.8486269406571,
                y1: -34.94299752243788,
                x2: 96.95630776960708,
                y2: 446.34009448417453,
                r: 0.7
            }
        ],
        targets: [
            {
                kind: 'calm',
                x: 242,
                y: 169,
                tol: 0.05
            },
            {
                kind: 'blaze',
                x: 221,
                y: 316,
                need: 1.0778240464527529
            }
        ],
        par: 3
    },
    {
        id: 'rd17',
        name: {
            en: 'Trio',
            zh: '三重奏'
        },
        lambda: 72,
        ctrl: [
            {
                i: 4,
                j: 0,
                ph: 6
            },
            {
                i: 0,
                j: 1,
                ph: 2
            }
        ],
        storms: [
            {
                x: 342.46045847423375,
                y: 253.96736584603786,
                ph: 7,
                amp: 0.8607937823049724
            }
        ],
        walls: [],
        targets: [
            {
                kind: 'lane',
                x1: 87.50825624486043,
                y1: 219.17414154415994,
                x2: 4.4917437551395665,
                y2: 258.82585845584003,
                n: 5,
                tol: 0.0925871758920256
            },
            {
                kind: 'blaze',
                x: 368,
                y: 204,
                need: 0.7826306345020498
            }
        ],
        par: 2
    },
    {
        id: 'rd18',
        name: {
            en: 'Eye of the Storm',
            zh: '风暴之眼'
        },
        lambda: 96,
        ctrl: [
            {
                i: 6,
                j: 1,
                ph: 4
            },
            {
                i: 8,
                j: 4,
                ph: 2
            }
        ],
        storms: [
            {
                x: 83.15712188370526,
                y: 83.28219402115792,
                ph: 0,
                amp: 1.1398344956687652
            },
            {
                x: 244.7144133085385,
                y: 159.2475994862616,
                ph: 1,
                amp: 1.0637784826103598
            }
        ],
        walls: [
            {
                x1: 102.12248086048038,
                y1: 153.1741568752306,
                x2: 618.9268338619383,
                y2: 210.73508736409968,
                r: 0.7
            }
        ],
        targets: [
            {
                kind: 'lane',
                x1: 391.7703644486062,
                y1: 30.849868741084848,
                x2: 288.2296355513938,
                y2: 83.15013125891515,
                n: 5,
                tol: 0.095288015098514
            },
            {
                kind: 'calm',
                x: 305,
                y: 309,
                tol: 0.05
            }
        ],
        par: 6
    },
    {
        id: 'rd19',
        name: {
            en: 'A Sea of Pattern',
            zh: '满海文章'
        },
        lambda: 64,
        ctrl: [
            {
                i: 5,
                j: 6,
                ph: 5
            },
            {
                i: 5,
                j: 1,
                ph: 5
            }
        ],
        storms: [
            {
                x: 278.54185841977596,
                y: 210.69823125377297,
                ph: 1,
                amp: 1.009530562569853
            }
        ],
        walls: [
            {
                x1: 451.4177130928783,
                y1: 10.823000689509911,
                x2: 26.831018490478584,
                y2: 311.0331583567824,
                r: 0.7
            },
            {
                x1: 437.74012444019877,
                y1: -87.66645204291066,
                x2: 293.33542268126644,
                y2: 411.8806249277326,
                r: 0.7
            }
        ],
        targets: [
            {
                kind: 'calm',
                x: 494,
                y: 295,
                tol: 0.05
            },
            {
                kind: 'blaze',
                x: 172,
                y: 218,
                need: 1.4161746866445901
            }
        ],
        par: 4
    },
    {
        id: 'rd20',
        name: {
            en: 'Duet Finale',
            zh: '双生终章'
        },
        lambda: 80,
        ctrl: [
            {
                i: 7,
                j: 6,
                ph: 3
            },
            {
                i: 5,
                j: 1,
                ph: 7
            }
        ],
        storms: [
            {
                x: 475.6674704654142,
                y: 354.3808233831078,
                ph: 2,
                amp: 1.1362176083028315
            },
            {
                x: 467.4624712439254,
                y: 325.5218885047361,
                ph: 0,
                amp: 0.8628023579600267
            }
        ],
        walls: [
            {
                x1: 478.8593980247773,
                y1: 133.5445139723168,
                x2: -39.29112893591298,
                y2: 177.36267699130912,
                r: -0.7
            }
        ],
        targets: [
            {
                kind: 'calm',
                x: 326,
                y: 57,
                tol: 0.05
            },
            {
                kind: 'lane',
                x1: 91.16815243426561,
                y1: 338.06143751835697,
                x2: 28.831847565734396,
                y2: 377.93856248164303,
                n: 5,
                tol: 0.08156605048987468
            }
        ],
        par: 4
    }
];

export default LEVELS;
