import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        tetris: resolve(__dirname, 'tetris.html')
      },
      output: {
        manualChunks: {
          'tetris-core': ['./js/tetris.js'],
          'common-utils': [
            './js/config-manager.js',
            './js/performance-monitor.js'
          ]
        },
        dir: 'dist/tetris',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: '[ext]/[name]-[hash].[ext]'
      }
    },
    minify: 'terser',
    outDir: 'dist/tetris',
    emptyOutDir: true
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
      '@css': resolve(__dirname, './css')
    }
  }
});