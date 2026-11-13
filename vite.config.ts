import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  root: '.',
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: { overlay: false },
    watch: { ignored: ['**/.git/**', '**/node_modules/**', '**/dist/**'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3333',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: { exclude: ['.git'] },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        settings: resolve(__dirname, 'settings.html')
      }
    }
  }
});
