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
import SettingsApp from './SettingsApp.vue';

createApp(SettingsApp).mount('#app');