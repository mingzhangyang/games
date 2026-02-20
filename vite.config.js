import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';

export default defineConfig({
  // 多入口点配置
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'math-rain': resolve(__dirname, 'math-rain.html'),
        tetris: resolve(__dirname, 'tetris.html'),
        'tank-battle': resolve(__dirname, 'tank-battle.html'),
        gomoku: resolve(__dirname, 'gomoku.html')
      },
      output: {
        // 分块策略
        manualChunks: {
          // 公共模块
          'common': [
            './js/config-manager.js',
            './js/performance-monitor.js',
            './js/resource-manager.js',
            './js/save-manager.js'
          ],
          // Math Rain 相关模块
          'math-rain-core': [
            './js/math-rain/main.js',
            './js/math-rain/expression-generator.js',
            './js/math-rain/question-bank-manager.js',
            './js/math-rain/question-bank-generator.js'
          ],
          'math-rain-engine': [
            './js/math-rain/animation-engine.js',
            './js/math-rain/particle-effects.js',
            './js/math-rain/sound-manager.js',
            './js/math-rain/difficulty-manager.js'
          ],
          'math-rain-systems': [
            './js/math-rain/systems/EventSystem.js',
            './js/math-rain/systems/DependencyContainer.js'
          ],
          'math-rain-managers': [
            './js/math-rain/core/GameStateManager.js',
            './js/math-rain/core/SessionManager.js',
            './js/math-rain/core/UIController.js',
            './js/math-rain/core/PerformanceOptimizer.js',
            './js/math-rain/core/ErrorHandler.js'
          ]
        },
        // 文件命名
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    },
    // 压缩配置
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    // 输出目录
    outDir: 'dist',
    // 清空输出目录
    emptyOutDir: true
  },
  
  // 开发服务器配置
  server: {
    port: 3000,
    open: true,
    cors: true
  },
  
  // 插件配置
  plugins: [
    // 兼容性支持
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  
  // 路径解析
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@js': resolve(__dirname, './js'),
      '@css': resolve(__dirname, './css'),
      '@assets': resolve(__dirname, './assets')
    }
  },
  
  // 静态资源处理
  assetsInclude: ['**/*.json', '**/*.md']
});
