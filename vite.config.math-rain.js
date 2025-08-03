import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        'math-rain': resolve(__dirname, 'math-rain.html')
      },
      output: {
        // Math Rain 专用分块策略
        manualChunks: {
          // 核心游戏逻辑
          'math-rain-core': [
            './js/math-rain/math-rain-core.js'
          ],
          // 表达式和题库系统
          'math-rain-questions': [
            './js/math-rain/expression-generator.js',
            './js/math-rain/question-bank-manager.js',
            './js/math-rain/question-bank-generator.js'
          ],
          // 渲染和动画引擎
          'math-rain-engine': [
            './js/math-rain/animation-engine.js',
            './js/math-rain/particle-effects.js'
          ],
          // 音频和难度管理
          'math-rain-managers': [
            './js/math-rain/sound-manager.js',
            './js/math-rain/difficulty-manager.js'
          ],
          // 公共工具
          'common-utils': [
            './js/config-manager.js',
            './js/performance-monitor.js'
          ]
        },
        dir: 'dist/math-rain',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: '[ext]/[name]-[hash].[ext]'
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // 保留console用于调试
        drop_debugger: true,
        pure_funcs: ['console.log'] // 只移除console.log
      }
    },
    outDir: 'dist/math-rain',
    emptyOutDir: true,
    // 生成source map用于调试
    sourcemap: true
  },
  
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@js': resolve(__dirname, './js'),
      '@css': resolve(__dirname, './css'),
      '@assets': resolve(__dirname, './assets')
    }
  },
  
  // Math Rain 特定的静态资源
  assetsInclude: [
    '**/math-rain/**/*.json',
    '**/math-rain/**/*.md',
    '**/sounds/**/*',
    '**/images/**/*'
  ]
});