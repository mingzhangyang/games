import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        'tank-battle': resolve(__dirname, 'tank-battle.html')
      },
      output: {
        manualChunks: {
          'tank-battle-core': ['./js/tank-battle.js'],
          'common-utils': [
            './js/config-manager.js',
            './js/performance-monitor.js'
          ]
        },
        dir: 'dist/tank-battle',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: '[ext]/[name]-[hash].[ext]'
      }
    },
    minify: 'terser',
    outDir: 'dist/tank-battle',
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