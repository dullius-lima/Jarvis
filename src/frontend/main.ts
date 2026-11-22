
// [JWT_FETCH_INTERCEPTOR]
if (typeof window !== 'undefined' && !(window as any).__jarvisJwtFetchPatched) {
  (window as any).__jarvisJwtFetchPatched = true;
  const _origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/v1/');
    const token = localStorage.getItem('jarvis_auth_jwt_token') || '';
    let nextInit = init;
    if (isApiCall && token) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) {
        headers.set('Authorization', 'Bearer ' + token);
      }
      nextInit = { ...init, headers };
    }
    const resp = await _origFetch(input, nextInit);
    if (isApiCall && resp.status === 401 && !urlStr.includes('/api/v1/auth/login')) {
      localStorage.removeItem('jarvis_authenticated_session');
      localStorage.removeItem('jarvis_auth_jwt_token');
      if (window.location.pathname.includes('settings')) {
        window.location.href = '/';
      }
    }
    return resp;
  };
}

if (typeof window !== 'undefined' && !(window as any).__jarvisGlobalSync) {
  (window as any).__jarvisGlobalSync = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: any, init?: any) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      if (location.hostname === 'localhost' || location.protocol === 'capacitor:' || location.protocol === 'file:') {
        input = 'http://163.176.111.18' + input;
      }
    }
    return origFetch(input, init);
  };
}

if (typeof window !== 'undefined' && !(window as any).__jarvisSync) {
  (window as any).__jarvisSync = true;
  const BASE = 'http://163.176.111.18';
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: any, init?: any) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      if (location.hostname === 'localhost' || location.protocol === 'capacitor:' || location.protocol === 'file:') {
        input = BASE + input;
      }
    }
    return origFetch(input, init);
  };
}

// Sincronizacao universal APK <-> Servidor Oracle
if (typeof window !== 'undefined' && !(window as any).__jarvisFetchHooked) {
  (window as any).__jarvisFetchHooked = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: any, init?: any) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      const isLocalApp = window.location.hostname === 'localhost' || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';
      if (isLocalApp) input = 'http://163.176.111.18' + input;
    }
    return origFetch(input, init);
  };
}

import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');