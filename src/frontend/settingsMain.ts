import { createApp } from 'vue';
import SettingsApp from './SettingsApp.vue';

const origFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith('/api/')) {
    const tok =
      localStorage.getItem('jarvis_auth_jwt_token') ||
      localStorage.getItem('jarvis_jwt_token') ||
      localStorage.getItem('jarvis_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('jarvis_paired_device_token') ||
      '';
    const headers = new Headers(init?.headers || {});
    if (tok && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${tok}`);
    }
    const res = await origFetch(input, { ...init, headers });
    if (res.status === 401 && !url.includes('/auth/')) {
      alert('Sua sessão expirou após a atualização de segurança. Faça login na tela inicial e volte em Configurações.');
      window.location.href = '/';
    }
    return res;
  }
  return origFetch(input, init);
};

createApp(SettingsApp).mount('#app');
