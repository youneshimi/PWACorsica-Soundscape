// ============================================================
// Corsica Soundscape — Service Worker
// ============================================================
// Stratégies :
//   - App Shell (HTML/CSS/JS/icônes) → Cache First (perf)
//   - Données API (/api/sounds)      → Network First (fraîcheur)
//   - Fallback offline               → offline.html
// ============================================================

const CACHE_NAME = 'soundscape-v1';
const CACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/img/icon-192.png',
  '/img/icon-512.png',
];

// -- INSTALL : pré-cache l'App Shell --------------------------
self.addEventListener('install', (event) => {
  console.log('[SW] Install — cache App Shell');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_ASSETS))
  );
});

// -- ACTIVATE : nettoie les anciens caches --------------------
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate — nettoyage anciens caches');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  // Prend le contrôle immédiatement des pages ouvertes
  return self.clients.claim();
});

// -- FETCH : routage par type de requête ----------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET (POST, etc.)
  if (request.method !== 'GET') return;

  // API → Network First (fraîcheur des données)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Tout le reste (App Shell, assets) → Cache First (perf)
  event.respondWith(cacheFirst(request));
});

// -- STRATÉGIE : Cache First ----------------------------------
// Idéale pour l'App Shell et les assets statiques.
// Pourquoi : les fichiers sont versionnés par Vite (hash dans le nom),
// donc un fichier en cache est toujours le bon. Résultat : chargement
// instantané même avec un réseau lent.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Mettre en cache les réponses valides
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Si c'est une navigation (page), renvoyer offline.html
    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }
    // Sinon, erreur réseau
    return new Response('Offline', { status: 503 });
  }
}

// -- STRATÉGIE : Network First --------------------------------
// Idéale pour les données API : on veut la version la plus fraîche,
// mais si le réseau est down, on sert le cache (données locales).
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// -- BACKGROUND SYNC ------------------------------------------
// Déclenché quand le réseau revient après une action hors-ligne
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-outbox') {
    console.log('[SW] Background Sync — envoi outbox');
    event.waitUntil(syncOutbox());
  }
});

// Synchronise les entrées de l'outbox IndexedDB → serveur
async function syncOutbox() {
  // On importe idb depuis le CDN pour lire l'outbox
  // Note: dans le SW, on utilise importScripts ou on lit directement l'IDB
  const dbName = 'corsica-soundscape';
  const storeName = 'outbox';

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });

  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const entries = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const entry of entries) {
    try {
      const formData = new FormData();
      formData.append('title', entry.title);
      formData.append('description', entry.description || '');
      formData.append('latitude', entry.latitude);
      formData.append('longitude', entry.longitude);
      formData.append('category', entry.category || 'autre');
      formData.append('audio', entry.audioBlob, 'recording.webm');

      const response = await fetch('/api/sounds', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        // Supprimer de l'outbox après envoi réussi
        const delTx = db.transaction(storeName, 'readwrite');
        delTx.objectStore(storeName).delete(entry.id);
        await new Promise((resolve) => {
          delTx.oncomplete = resolve;
        });
        console.log(`[SW] Sync OK — son "${entry.title}" envoyé`);

        // Notifier les clients
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_COMPLETE', id: entry.id });
        });
      }
    } catch (err) {
      console.error(`[SW] Sync échoué pour "${entry.title}"`, err);
      // On ne supprime pas de l'outbox → sera re-tenté
    }
  }

  db.close();
}

// -- MESSAGE : écoute les messages de l'app -------------------
self.addEventListener('message', (event) => {
  // L'app envoie SKIP_WAITING quand l'utilisateur clique "Mettre à jour"
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] skipWaiting demandé par l\'utilisateur');
    self.skipWaiting();
  }
});

// -- NOTIFICATION CLICK ---------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Si l'app est déjà ouverte, la focus
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon, ouvrir une nouvelle fenêtre
      return self.clients.openWindow('/');
    })
  );
});
