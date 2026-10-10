// Le build ajoute les fichiers Vite et calcule la version du cache.
const CACHE_NAME = 'soundscape-v3';
const DATA_CACHE = 'soundscape-data-v1';
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/img/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(activateCaches());
});

async function activateCaches() {
  const keys = await caches.keys();
  for (const key of keys) {
    if (!key.startsWith('soundscape-') || key === CACHE_NAME || key === DATA_CACHE) continue;

    // Les anciens caches mélangeaient l'interface et les sons téléchargés.
    const oldCache = await caches.open(key);
    const dataCache = await caches.open(DATA_CACHE);
    let migrated = true;
    for (const request of await oldCache.keys()) {
      const url = new URL(request.url);
      if (url.origin === self.location.origin && /^\/(api|uploads)\//.test(url.pathname)) {
        const response = await oldCache.match(request);
        if (response?.status === 200 && !(await dataCache.match(request))) {
          if (!(await saveResponse(dataCache, request, response))) migrated = false;
        }
      }
    }
    if (migrated) await caches.delete(key);
  }
  await self.clients.claim();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Les tuiles OSM gardent le cache HTTP du navigateur, sans téléchargement groupé.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request, url));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(audioResponse(request));
  } else if (url.pathname === '/manifest.json' || url.pathname.endsWith('.md')) {
    const refresh = refreshStatic(request);
    event.waitUntil(refresh.catch(() => {}));
    event.respondWith(staleWhileRevalidate(request, refresh));
  } else if (CACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function saveResponse(cache, request, response) {
  if (!response.ok || response.status === 206) return false;
  try {
    await cache.put(request, response.clone());
    return true;
  } catch (error) {
    console.warn('[SW] Cache indisponible :', error);
    return false;
  }
}

async function cachedData(request) {
  const cache = await caches.open(DATA_CACHE);
  const response = await cache.match(request);
  if (response) return response;

  // Si la migration manque de place, l'ancien cache reste utilisable.
  for (const key of await caches.keys()) {
    if (!key.startsWith('soundscape-') || key === CACHE_NAME || key === DATA_CACHE) continue;
    const oldCache = await caches.open(key);
    const cached = await oldCache.match(request);
    if (cached?.status === 200) return cached;
  }
}

async function navigationResponse(request, url) {
  const cache = await caches.open(CACHE_NAME);
  // Le HTML reste avec les bundles de la même version, jusqu'à la mise à jour.
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const shell = await cache.match('/');
    if (shell) return shell;
  }
  try {
    return await fetch(request, { signal: AbortSignal.timeout(5000) });
  } catch {
    return (await cache.match('/offline.html')) || new Response('Hors connexion', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    await saveResponse(cache, request, response);
    return response;
  } catch {
    return new Response('Hors connexion', { status: 503 });
  }
}

async function refreshStatic(request) {
  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  await saveResponse(cache, request, response);
  return response;
}

async function staleWhileRevalidate(request, refresh) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    return await refresh;
  } catch {
    return new Response('Hors connexion', { status: 503 });
  }
}

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(5000) });
    if (response.status >= 500) return (await cachedData(request)) || response;
    await saveResponse(cache, request, response);
    return response;
  } catch {
    const cached = await cachedData(request);
    if (cached) return cached;
    return Response.json({ error: 'offline' }, {
      status: 503,
    });
  }
}

async function audioResponse(request) {
  const cache = await caches.open(DATA_CACHE);
  const headers = new Headers(request.headers);
  headers.delete('Range');
  const fullRequest = new Request(request, { headers });
  let response = await cachedData(fullRequest);
  if (!response) {
    try {
      response = await fetch(fullRequest);
      await saveResponse(cache, fullRequest, response);
    } catch {
      return new Response('Son indisponible hors connexion', { status: 503 });
    }
  }
  const range = request.headers.get('Range');
  return range && response.status === 200 ? rangeResponse(response, range) : response;
}

async function rangeResponse(response, range) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || end < start) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(body.slice(start, end + 1), { status: 206, headers });
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
      if (entry.audioBlob) {
        const type = entry.audioBlob.type.split(';')[0].toLowerCase();
        const extensions = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/aac': 'aac' };
        data.append('audio', entry.audioBlob, 'recording.' + (extensions[type] || 'bin'));
      }

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
    event.waitUntil(self.skipWaiting());
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
