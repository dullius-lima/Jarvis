import { createApp } from 'vue';
import SettingsApp from './SettingsApp.vue';

createApp(SettingsApp).mount('#app');

const mountTarget = document.getElementById('settings-app') ? '#settings-app' : '#app';
createApp(SettingsApp).mount(mountTarget);
