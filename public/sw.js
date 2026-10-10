// ============================================================
// Corsica Soundscape — Service Worker
// ============================================================
// Stratégies :
//   - App Shell (HTML/CSS/JS/icônes) → Cache First (perf)
//   - Données API (/api/sounds)      → Network First (fraîcheur)
//   - Fallback offline               → offline.html
// ============================================================

const CACHE_NAME = 'soundscape-v2';
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

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
  });
}

async function legacyLocalId(db, entry) {
  if (entry.localId) return entry.localId;
  const sounds = await idbRequest(db.transaction('sounds').objectStore('sounds').getAll());
  const matches = [];
  for (const sound of sounds) {
    if (sound.synced || sound.title !== entry.title ||
        (sound.description || '') !== (entry.description || '') ||
        sound.latitude !== entry.latitude || sound.longitude !== entry.longitude ||
        sound.category !== entry.category ||
        !sound.audioBlob || !entry.audioBlob ||
        sound.audioBlob.size !== entry.audioBlob.size ||
        sound.audioBlob.type !== entry.audioBlob.type) continue;
    const left = new Uint8Array(await sound.audioBlob.arrayBuffer());
    const right = new Uint8Array(await entry.audioBlob.arrayBuffer());
    if (left.every((byte, index) => byte === right[index])) matches.push(sound.id);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

async function sendOutbox() {
  const db = await idbRequest(indexedDB.open('corsica-soundscape', 1));
  try {
    const entries = await idbRequest(db.transaction('outbox').objectStore('outbox').getAll());
    for (const entry of entries) {
      const localId = await legacyLocalId(db, entry);
      const clientId = entry.clientId || 'legacy-' + entry.createdAt + '-' + entry.id;
      const data = new FormData();
      data.append('title', entry.title);
      data.append('description', entry.description || '');
      data.append('latitude', entry.latitude);
      data.append('longitude', entry.longitude);
      data.append('category', entry.category || 'autre');
      if (entry.audioBlob) data.append('audio', entry.audioBlob, 'recording.webm');

      const response = await fetch('/api/sounds', {
        method: 'POST',
        headers: { 'Idempotency-Key': clientId },
        body: data,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Envoi impossible (' + response.status + ')');
      const sound = await response.json();
      if (!sound.id) throw new Error('Réponse du serveur invalide');

      const tx = db.transaction(['sounds', 'outbox'], 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore('sounds').put({ ...sound, audioBlob: entry.audioBlob });
      if (localId && localId !== sound.id) tx.objectStore('sounds').delete(localId);
      tx.objectStore('outbox').delete(entry.id);
      await done;

      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'SYNC_COMPLETE', id: entry.id, sound });
      }
    }
  } finally {
    db.close();
  }
}

// Un échec doit rejeter la promesse pour permettre une nouvelle tentative.
function syncOutbox() {
  return self.navigator?.locks
    ? self.navigator.locks.request('soundscape-sync', sendOutbox)
    : sendOutbox();
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
