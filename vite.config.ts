import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Carrega as variáveis de ambiente com base no modo atual (.env, .env.development, etc.)
  const env = loadEnv(mode, process.cwd(), '');
  
  // Define as portas dinamicamente ou adota os valores padrão (3333 para backend, 5173 para frontend)
  const backendPort = Number(env.PORT || process.env.PORT || 3333);
  const frontendPort = Number(env.VITE_PORT || process.env.VITE_PORT || 5173);
  const backendTarget = `http://127.0.0.1:${backendPort}`;

  return {
    plugins: [vue()],
    root: '.',
    server: {
      host: '0.0.0.0', // Permite acesso externo na rede local
      port: frontendPort,
      proxy: {
        // Redireciona chamadas de API HTTP para o backend
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false
        },
        // Redireciona conexões de WebSocket para a sincronização em tempo real
        '/ws': {
          target: backendTarget.replace(/^http/, 'ws'),
          ws: true,
          changeOrigin: true
        }
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          settings: resolve(__dirname, 'settings.html')
        }
      }
    }
  };
});
