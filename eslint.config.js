// ESLint flat config（eslint 10）— P3-2 风格契约
//
// 范围：保留的 js/**/*.js、src/platform/**/*.js、src/games/**/*.js、worker/**/*.js，以及 tests/**/*.mjs 和 tools/dev、tools/generators、tools/checks、tools/lib 下的 *.mjs。
// 豁免：src/games/math-rain/**（保留的专用架构）、Workers/**（Cloudflare 独立域）、
//       dist/**、node_modules/**、以及由 SVG 生成的 shadow-loom 运行时缓存。
// 原则：正确性规则 error（阻断），风格规则以项目现状为准（4 空格 + 单引号），
//       拿不准的先 warn 观察，避免首跑百行噪音淹没真问题。
export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'Workers/**', 'src/games/math-rain/**', 'public/**', 'src/platform/more-games.js', 'src/generated/**'],
    },
    {
        files: ['js/**/*.js', 'src/platform/**/*.js', 'src/games/**/*.js', 'worker/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                window: 'writable',
                document: 'writable',
                navigator: 'writable',
                location: 'writable',
                history: 'writable',
                localStorage: 'writable',
                sessionStorage: 'writable',
                console: 'writable',
                alert: 'writable',
                requestAnimationFrame: 'writable',
                cancelAnimationFrame: 'writable',
                setTimeout: 'writable',
                clearTimeout: 'writable',
                setInterval: 'writable',
                clearInterval: 'writable',
                fetch: 'writable',
                Headers: 'writable',
                Request: 'writable',
                Response: 'writable',
                AbortController: 'writable',
                CustomEvent: 'writable',
                Event: 'writable',
                performance: 'writable',
                ResizeObserver: 'writable',
                MutationObserver: 'writable',
                IntersectionObserver: 'writable',
                getComputedStyle: 'writable',
                matchMedia: 'writable',
                URL: 'writable',
                URLSearchParams: 'writable',
                Blob: 'writable',
                File: 'writable',
                FileReader: 'writable',
                FormData: 'writable',
                Image: 'writable',
                Worker: 'writable',
                customElements: 'writable',
                Element: 'writable',
                HTMLElement: 'writable',
                HTMLCanvasElement: 'writable',
                HTMLInputElement: 'writable',
                Path2D: 'writable',
                CSS: 'writable',
                getSelection: 'writable',
                scrollTo: 'writable',
                open: 'writable',
                clipboardData: 'writable',
                AudioContext: 'writable',
                webkitAudioContext: 'writable',
                // 线上排行榜 Worker 注入（tetris 等页直接调用）
                hubTrack: 'writable',
            },
        },
        rules: {
            // ── 正确性（error）──
            'no-undef': 'error',
            'no-dupe-keys': 'error',
            'no-dupe-args': 'error',
            'no-redeclare': 'error',
            'no-unreachable': 'error',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-fallthrough': 'error',
            'no-async-promise-executor': 'error',
            // 各页榜单渲染的固定模式：await fetch → list.textContent = ...
            // （list 为局部引用，非共享状态；规则在此误报，见 P3-2 记录）
            'require-atomic-updates': 'off',
            // ── 风格（项目现状：4 空格 + 单引号；分号有则保留）──
            indent: ['error', 4, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
            'prefer-const': 'warn',
            'no-var': 'warn',
            // ── 观察（warn，不阻断）──
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'eqeqeq': ['warn', 'smart'],
        },
    },
    {
        files: ['tests/**/*.mjs', 'tools/dev/**/*.mjs', 'tools/generators/**/*.mjs', 'tools/checks/**/*.mjs', 'tools/lib/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                // node 侧
                console: 'writable',
                process: 'writable',
                setTimeout: 'writable',
                clearTimeout: 'writable',
                setInterval: 'writable',
                clearInterval: 'writable',
                fetch: 'writable',
                AbortController: 'writable',
                URL: 'writable',
                performance: 'writable',
                Buffer: 'readonly',
                // 校验器在 page.evaluate 回调里静态引用浏览器 API
                document: 'writable',
                window: 'writable',
                navigator: 'writable',
                location: 'writable',
                localStorage: 'writable',
                getComputedStyle: 'writable',
                requestAnimationFrame: 'writable',
                cancelAnimationFrame: 'writable',
                CustomEvent: 'writable',
                Event: 'writable',
                MouseEvent: 'writable',
                HTMLElement: 'writable',
                HTMLCanvasElement: 'writable',
                getSelection: 'writable',
                innerWidth: 'writable',
                innerHeight: 'writable',
            },
        },
        rules: {
            'no-undef': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
            indent: ['error', 4, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
        },
    },
    {
        // Web Worker 环境（reversi 的 AI worker）
        files: ['src/games/reversi/reversi-worker.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                self: 'readonly',
                postMessage: 'writable',
                onmessage: 'writable',
                importScripts: 'writable',
            },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
        },
    },
];
