'use strict';

(function forceOrcaZapUpdate() {
  const BUILD = '16';
  const BUILD_KEY = 'orcazap:app-build';
  const RELOAD_KEY = 'orcazap:build-reloaded';

  async function refreshApplicationFiles() {
    const previousBuild = localStorage.getItem(BUILD_KEY);
    if (previousBuild === BUILD) return;

    localStorage.setItem(BUILD_KEY, BUILD);

    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter(name => name.startsWith('orcazap-'))
            .map(name => caches.delete(name))
        );
      }

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register(`/sw.js?v=${BUILD}`, {
          updateViaCache: 'none'
        });
        await registration.update();
      }
    } catch (error) {
      console.warn('Atualização do OrçaZap:', error);
    }

    if (sessionStorage.getItem(RELOAD_KEY) !== BUILD) {
      sessionStorage.setItem(RELOAD_KEY, BUILD);
      location.replace(`${location.pathname}?build=${BUILD}${location.hash || ''}`);
    }
  }

  window.addEventListener('load', refreshApplicationFiles, { once: true });
})();
