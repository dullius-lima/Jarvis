// [JWT_AND_APK_FETCH_BRIDGE]
if (typeof window !== 'undefined' && !(window as any).__jarvisFetchBridgeInstalled) {
  (window as any).__jarvisFetchBridgeInstalled = true;
  const _baseFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let resolvedInput: RequestInfo | URL = input;
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (typeof resolvedInput === 'string' && resolvedInput.startsWith('/api/')) {
      const isLocalApp =
        window.location.hostname === 'localhost' ||
        window.location.protocol === 'capacitor:' ||
        window.location.protocol === 'file:';
      if (isLocalApp) {
        resolvedInput = 'http://163.176.111.18' + resolvedInput;
      }
    }

    const isApiCall = rawUrl.startsWith('/api/') || rawUrl.includes('/api/v1/');
    const token = localStorage.getItem('jarvis_auth_jwt_token') || '';
    let nextInit = init;

    if (isApiCall && token) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) {
        headers.set('Authorization', 'Bearer ' + token);
      }
      nextInit = { ...init, headers };
    }

    const resp = await _baseFetch(resolvedInput, nextInit);

    if (isApiCall && resp.status === 401 && !rawUrl.includes('/api/v1/auth/login')) {
      localStorage.removeItem('jarvis_authenticated_session');
      localStorage.removeItem('jarvis_auth_jwt_token');
      window.dispatchEvent(new Event('jarvis-auth-expired'));
      if (window.location.pathname.includes('settings')) {
        window.location.href = '/';
      }
    }

    return resp;
  };
}

import { createApp } from 'vue';
import SettingsApp from './SettingsApp.vue';

createApp(SettingsApp).mount('#app');
