// ── JARVIS — src/core/pwa.js ──────────────────────────────────
// Service worker registration and PWA install prompt handling.
// Emits 'cmd:response' on the bus when the app is installed.

import { bus } from './bus.js';

let deferredInstallPrompt = null;

export function initPwa() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  // Capture the browser install prompt (fires before user installs)
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // Small delay — avoids the banner flashing on initial page load
    setTimeout(() => {
      document.getElementById('install-banner')?.classList.add('visible');
    }, 3000);
  });

  // "INSTALL" button click
  document.getElementById('install-btn')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('install-banner')?.classList.remove('visible');
  });

  // "×" dismiss button
  document.getElementById('install-dismiss')?.addEventListener('click', () => {
    document.getElementById('install-banner')?.classList.remove('visible');
    deferredInstallPrompt = null;
  });

  // App successfully installed
  window.addEventListener('appinstalled', () => {
    document.getElementById('install-banner')?.classList.remove('visible');
    deferredInstallPrompt = null;
    bus.emit('cmd:response', { msg: '✓ JARVIS INSTALLED' });
  });
}
