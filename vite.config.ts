import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  root: '.',
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      overlay: false
    },
    fs: {
      strict: false,
      deny: ['.git', '**/.git/**', '**/node_modules/.git/**']
    },
    watch: {
      ignored: ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/backups/**']
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3333',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    entries: ['index.html', 'settings.html'],
    exclude: ['.git']
  },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        settings: resolve(__dirname, 'settings.html')
      }
    }
  }
});
