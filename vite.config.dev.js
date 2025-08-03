import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // 开发服务器配置
  server: {
    port: 3000,
    open: '/index.html',
    cors: true,
    // 代理配置（如果需要）
    proxy: {
      // '/api': {
      //   target: 'http://localhost:8080',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/api/, '')
      // }
    }
  },
  
  // 路径解析
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@js': resolve(__dirname, './js'),
      '@css': resolve(__dirname, './css'),
      '@assets': resolve(__dirname, './assets'),
      '@config': resolve(__dirname, './config')
    }
  },
  
  // 静态资源处理
  assetsInclude: [
    '**/*.json',
    '**/*.md',
    '**/sounds/**/*',
    '**/images/**/*'
  ],
  
  // 开发时不压缩，保持可读性
  build: {
    minify: false,
    sourcemap: true
  },
  
  // CSS 预处理器配置
  css: {
    devSourcemap: true
  },
  
  // 优化配置
  optimizeDeps: {
    // 预构建依赖
    include: [],
    // 排除预构建
    exclude: []
  }
});