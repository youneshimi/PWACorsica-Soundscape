// ============================================================
// Enregistrement du Service Worker + détection mise à jour
// ============================================================
// Pourquoi dans un fichier séparé : séparation des responsabilités.
// Le SW est un fichier statique (public/sw.js), pas bundlé par Vite.
// ============================================================

export function registerSW({ onUpdate } = {}) {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Workers non supportés');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[SW] Enregistré avec succès, scope:', registration.scope);

      // Détection de mise à jour
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // Un nouveau SW est installé et attend d'être activé
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            console.log('[SW] Nouvelle version disponible');
            // Callback pour afficher la bannière de mise à jour
            if (onUpdate) onUpdate(registration);
          }
        });
      });
    } catch (err) {
      console.error('[SW] Échec enregistrement:', err);
    }
  });

  // Recharger la page quand le nouveau SW prend le contrôle
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

// Demander au SW en attente de prendre le contrôle
export function skipWaiting(registration) {
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}
