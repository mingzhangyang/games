import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';

// dev / prod 单文件按 mode 分支：保证两边插件、别名、assetsInclude 完全一致。
// 旧 vite.config.dev.js 已删除（它没有 shared-css-first 插件，且引用了不存在的 ./config 别名）。
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    // 开发服务器配置
    server: {
      port: 3000,
      open: '/index.html',
      cors: true,
    },

    // 路径解析（@config 曾指向不存在的 ./config，已删）
    resolve: {
      alias: {
        '@': resolve(__dirname, './'),
        '@js': resolve(__dirname, './js'),
        '@css': resolve(__dirname, './css'),
        '@assets': resolve(__dirname, './assets'),
      },
    },

    // 静态资源处理。
    // ⚠ 刻意不含 '**/*.json'：它会让 `import x from './y.json'` 拿到 URL 字符串而不是对象
    //   （games.config.json / gen 工具链依赖普通 JSON 语义）。目前仓库也没有 ESM import JSON 的用例。
    assetsInclude: ['**/*.md', '**/sounds/**/*', '**/images/**/*'],

    build: {
      minify: isDev ? false : 'terser',
      sourcemap: isDev ? true : false,
      terserOptions: isDev ? undefined : {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      rollupOptions: {
        input: {
            // registry:begin inputs
main: resolve(__dirname, 'index.html'),
            "math-rain": resolve(__dirname, 'math-rain.html'),
            "tetris": resolve(__dirname, 'tetris.html'),
            "tank-battle": resolve(__dirname, 'tank-battle.html'),
            "gomoku": resolve(__dirname, 'gomoku.html'),
            "planet-merge": resolve(__dirname, 'planet-merge.html'),
            "word-daily": resolve(__dirname, 'word-daily.html'),
            "hoop-shot": resolve(__dirname, 'hoop-shot.html'),
            "minesweeper": resolve(__dirname, 'minesweeper.html'),
            "reversi": resolve(__dirname, 'reversi.html'),
            "tower-defense": resolve(__dirname, 'tower-defense.html'),
            "gravity-slingshot": resolve(__dirname, 'gravity-slingshot.html'),
            "needle-awn": resolve(__dirname, 'needle-awn.html'),
            "sword-flight": resolve(__dirname, 'sword-flight.html'),
            "lumen": resolve(__dirname, 'lumen.html'),
            "circuit": resolve(__dirname, 'circuit.html'),
            "silk-dew": resolve(__dirname, 'silk-dew.html'),
            "bond-forge": resolve(__dirname, 'bond-forge.html'),
            "echo-cave": resolve(__dirname, 'echo-cave.html'),
            "maxwell-demon": resolve(__dirname, 'maxwell-demon.html'),
            "crystal-bloom": resolve(__dirname, 'crystal-bloom.html'),
            "flame-verse": resolve(__dirname, 'flame-verse.html'),
            "ripple-duet": resolve(__dirname, 'ripple-duet.html'),
            "carrot-pull": resolve(__dirname, 'carrot-pull.html'),
            "firefly-signal": resolve(__dirname, 'firefly-signal.html'),
            // registry:end inputs
        },
        output: {
          // ⚠️ 不要再加 manualChunks：Rollup 的对象式 manualChunks 会把列出模块
          //   **连同其整条依赖图**塞进该分块。math-rain/main.js 的依赖里有
          //   safe-storage / site-settings / icons / analytics 这些**全站共享模块**，
          //   它们一旦被并进 math-rain-core，其它 14 个页面为了拿这些共享导出
          //   就必须加载整个 math-rain-core —— 于是 main.js 的自动初始化副作用
          //   在每个游戏页都会执行一次，弹出「❌ 游戏初始化失败」红框（2026-09-21 事故）。
          //   现在交给 Vite 默认的共享分块策略。
          // 文件命名
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
        }
      },
      // 输出目录 + 清空
      outDir: 'dist',
      emptyOutDir: true,
    },

    css: {
      devSourcemap: true,
    },

    // 插件配置
    plugins: [
      // 契约样式必须排在各页样式之前：tokens(变量) → layout(骨架) → 页面 → more-games。
      // Vite 打包后会按入口把页面 CSS 提到最前，导致 layout 的默认值反向覆盖页面覆盖值
      // （实测 gomoku 的 --frame-* 在产物中失效）。这里在产出 HTML 时重新排序 link。
      {
        name: 'shared-css-first',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            const RANK = name =>
              /\/tokens-/.test(name) ? 0
                : /\/layout-/.test(name) ? 1
                  // 科学展柜共享皮肤（5 个实验室游戏）：源码里排在 layout 之后、页面 CSS 之前
                  : /\/science-showcase-/.test(name) ? 2
                    : /\/more-games-/.test(name) ? 9
                      : 5;
            // ① 外链之间排序：tokens → layout → [science-showcase] → 页面 → more-games
            const links = [...html.matchAll(/[ \t]*<link rel="stylesheet"[^>]*>/g)];
            if (links.length >= 2) {
              const sorted = [...links].sort((a, b) => RANK(a[0]) - RANK(b[0]));
              if (!sorted.every((m, i) => m.index === links[i].index)) {
                let out = '', last = 0;
                links.forEach((m, i) => {
                  out += html.slice(last, m.index) + sorted[i][0];
                  last = m.index + m[0].length;
                });
                html = out + html.slice(last);
              }
            }
            if (!links.length) return html;

            // ② 外链还必须排在**内联 <style> 之前**。
            //    Vite 把注入的 <link> 追加到 </head> 末尾，对有内联样式的页面
            //    （index.html 的落地页样式、math-rain.html）等于把共享层放到了内联样式**之后**，
            //    层叠关系与源码态相反：源码里 index 的 .game-footer{padding:20px 0 28px}
            //    胜出，产物里却变成 layout.css 的 {padding:6px 0 2px} 胜出（同权重，后来者赢）。
            //    只排 link 之间的顺序抓不到这一类，必须整体搬到第一个内联样式前面。
            //    ⚠️ 定位内联样式前要先把 HTML 注释抹掉 —— index 的说明注释里就写着
            //    这个标签名，裸搜会命中注释、把 link 插到注释里去。用等长空格替换以保持下标有效。
            const masked = html.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
            const styleAt = masked.search(/<style[\s>]/);
            if (styleAt < 0) return html;
            const all = [...html.matchAll(/[ \t]*<link rel="stylesheet"[^>]*>[ \t]*\r?\n?/g)];
            if (!all.length || all.every(m => m.index < styleAt)) return html;

            const tags = all.map(m => m[0].trim());
            let stripped = '', prev = 0;
            for (const m of all) {
              stripped += html.slice(prev, m.index);
              prev = m.index + m[0].length;
            }
            stripped += html.slice(prev);

            const maskedOut = stripped.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
            const si = maskedOut.search(/<style[\s>]/);
            const lineStart = stripped.lastIndexOf('\n', si) + 1;
            const indent = stripped.slice(lineStart, si).match(/^[ \t]*/)[0];
            return stripped.slice(0, lineStart)
              + tags.map(t => indent + t + '\n').join('')
              + stripped.slice(lineStart);
          }
        }
      },
      // 兼容性支持（仅生产构建需要）
      ...(isDev ? [] : [legacy({ targets: ['defaults', 'not IE 11'] })]),
    ],
  };
});
