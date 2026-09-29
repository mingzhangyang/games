import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';

// dev / prod 单文件按 mode 分支。共享 CSS 的优先级由 CSS cascade layers
// （tokens → layout → components → 未分层的页面样式）在源码层表达，不再依赖构建后重排 link。
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
        '@platform': resolve(__dirname, './src/platform'),
        '@generated': resolve(__dirname, './src/generated'),
        '@games': resolve(__dirname, './src/games'),
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
            "shadow-loom": resolve(__dirname, 'shadow-loom.html'),
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
      // CSS 层级由 @layer 在源码中声明；这里仅保留真正的构建插件。
      // 兼容性支持（仅生产构建需要）
      ...(isDev ? [] : [legacy({ targets: ['defaults', 'not IE 11'] })]),
    ],
  };
});
