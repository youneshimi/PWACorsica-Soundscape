export function registerSW({ enabled = true, onUpdate } = {}) {
  if (!('serviceWorker' in navigator)) return () => {};
  const workers = navigator.serviceWorker;
  let stopped = false;
  let controlled = Boolean(workers.controller);
  let refreshing = false;
  const cleanups = [];

  function listen(target, type, callback) {
    target.addEventListener(type, callback);
    cleanups.push(() => target.removeEventListener(type, callback));
  }

  async function register() {
    try {
      const registration = await workers.register('/sw.js', { updateViaCache: 'none' });
      if (stopped) return;

      function checkWaiting() {
        if (registration.waiting && workers.controller) onUpdate?.(registration);
      }

      function watchInstalling() {
        const worker = registration.installing;
        if (!worker) return;
        listen(worker, 'statechange', () => {
          if (worker.state === 'installed') checkWaiting();
        });
      }

      listen(registration, 'updatefound', watchInstalling);
      checkWaiting();
      watchInstalling();
    } catch (error) {
      if (!stopped) console.warn('[SW] Enregistrement impossible :', error);
    }
  }

  if (!enabled) {
    // Un ancien worker de production ne doit pas intercepter les modules de Vite.
    workers.getRegistrations().then(async (registrations) => {
      for (const registration of registrations) {
        const worker = registration.active || registration.waiting || registration.installing;
        if (worker && new URL(worker.scriptURL).pathname === '/sw.js') {
          await registration.unregister();
        }
      }
      if (!stopped && workers.controller?.scriptURL &&
          new URL(workers.controller.scriptURL).pathname === '/sw.js') {
        window.location.reload();
      }
    }).catch((error) => console.warn('[SW] Désactivation impossible :', error));
  } else {
    listen(workers, 'controllerchange', () => {
      // Le premier contrôle n'est pas une mise à jour et ne nécessite pas de reload.
      if (!controlled) {
        controlled = true;
        return;
      }
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    if (document.readyState === 'complete') register();
    else listen(window, 'load', register);
  }

  return () => {
    stopped = true;
    for (const cleanup of cleanups) cleanup();
  };
}

export function skipWaiting(registration) {
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
