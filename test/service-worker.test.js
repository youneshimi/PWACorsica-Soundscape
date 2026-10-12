import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://soundscape.test';

function worker(fetch = async () => { throw new TypeError('offline'); }) {
  const handlers = {};
  const stores = new Map();
  let claimed = false;
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, response) {
          assert.notEqual(response.status, 206, 'Cache.put refuse une réponse partielle');
          entries.set(key(request), response.clone());
        },
        async keys() { return [...entries.keys()].map((url) => new Request(url)); },
        async addAll(urls) {
          for (const url of urls) this.put(url, await fetch(new Request(key(url))));
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const context = vm.createContext({
    caches, fetch, URL, Request, Response, Headers, AbortSignal,
    console: { log() {}, warn() {} },
    self: {
      location: { origin },
      addEventListener(name, handler) { handlers[name] = handler; },
      clients: { async claim() { claimed = true; } },
      async skipWaiting() {},
    },
  });
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);

  return {
    caches, stores, context, handlers,
    get claimed() { return claimed; },
    request(path, options = {}) {
      const request = new Request(new URL(path, origin), options);
      if (options.navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
      const pending = [];
      let response;
      handlers.fetch({ request, waitUntil(promise) { pending.push(promise); }, respondWith(promise) { response = promise; } });
      return { response, finished: () => Promise.all(pending) };
    },
  };
}

test('le raccourci enregistrement et index.html ouvrent le même HTML hors connexion', async () => {
  const sw = worker();
  const cache = await sw.caches.open('soundscape-v3');
  await cache.put('/', new Response('<main>Application</main>'));
  for (const path of ['/?action=record', '/index.html?test=1']) {
    const response = await sw.request(path, { navigate: true }).response;
    assert.equal(await response.text(), '<main>Application</main>');
  }
});

test('le Service Worker affiche le push avec une URL interne et un message de secours', async () => {
  const sw = worker();
  const notifications = [];
  sw.context.self.registration = { showNotification: async (title, options) => { notifications.push({ title, options }); } };
  async function receive(data) {
    let pending;
    sw.handlers.push({ data, waitUntil(promise) { pending = promise; } });
    await pending;
  }
  await receive({ json: () => ({ title: 'Nouveau son', body: 'Vagues', url: '/?sound=one' }) });
  assert.equal(notifications[0].options.data.url, origin + '/?sound=one');
  assert.equal(notifications[0].options.body, 'Vagues');
  await receive({ json: () => ({ url: 'https://another.test/' }) });
  assert.equal(notifications[1].options.data.url, origin + '/');
  await receive({ json: () => { throw new Error('invalid json'); } });
  assert.equal(notifications[2].title, 'Corsica Soundscape V2');
  await receive(null);
  assert.equal(notifications.length, 4);
});

test('le clic push ouvre la PWA ou retrouve sa fenêtre sans recharger un enregistrement', async () => {
  const sw = worker();
  const opened = [];
  const messages = [];
  let closed = false;
  let focused = false;
  let clients = [];
  sw.context.self.clients = { matchAll: async () => clients, openWindow: async (url) => { opened.push(url); } };
  async function click() {
    let pending;
    sw.handlers.notificationclick({ notification: { data: { url: '/?sound=one' }, close() { closed = true; } }, waitUntil(promise) { pending = promise; } });
    await pending;
  }
  await click();
  assert.equal(closed, true);
  assert.equal(opened[0], origin + '/?sound=one');
  clients = [{ url: origin + '/', postMessage: (data) => messages.push(data), focus: async () => { focused = true; }, navigate() { throw new Error('no navigation during recording'); } }];
  await click();
  assert.equal(focused, true);
  assert.equal(messages[0].type, 'OPEN_SOUND');
  assert.equal(messages[0].id, 'one');
  assert.equal(opened.length, 1);
});

test('une autre page reçoit le secours offline sans remplacer le HTML du build', async () => {
  const sw = worker();
  const cache = await sw.caches.open('soundscape-v3');
  await cache.put('/offline.html', new Response('Page de secours'));
  assert.equal(await (await sw.request('/autre-page', { navigate: true }).response).text(), 'Page de secours');
});

test('le cache API fournit les données après une panne réseau ou une erreur serveur', async () => {
  let failure = false;
  const sw = worker(async () => {
    if (failure) throw new TypeError('offline');
    return Response.json([{ id: 'one' }]);
  });
  assert.deepEqual(await (await sw.request('/api/sounds').response).json(), [{ id: 'one' }]);
  failure = true;
  assert.deepEqual(await (await sw.request('/api/sounds').response).json(), [{ id: 'one' }]);
  sw.context.fetch = async () => new Response('Serveur indisponible', { status: 503 });
  assert.deepEqual(await (await sw.request('/api/sounds').response).json(), [{ id: 'one' }]);
  sw.context.fetch = async () => new Response('Introuvable', { status: 404 });
  assert.equal((await sw.request('/api/sounds').response).status, 404);
});

test('le manifeste est servi immédiatement puis actualisé en arrière-plan', async () => {
  let resolveNetwork;
  const sw = worker(() => new Promise((resolve) => { resolveNetwork = resolve; }));
  const cache = await sw.caches.open('soundscape-v3');
  await cache.put('/manifest.json', Response.json({ name: 'Ancien' }));
  const request = sw.request('/manifest.json');
  assert.equal((await (await request.response).json()).name, 'Ancien');
  resolveNetwork(Response.json({ name: 'Nouveau' }));
  await request.finished();
  assert.equal((await (await cache.match('/manifest.json')).json()).name, 'Nouveau');
});

test('un manifeste en cache reste accessible si son rafraîchissement échoue', async () => {
  const sw = worker();
  const cache = await sw.caches.open('soundscape-v3');
  await cache.put('/manifest.json', Response.json({ name: 'Soundscape' }));
  const request = sw.request('/manifest.json');
  assert.equal((await (await request.response).json()).name, 'Soundscape');
  await request.finished();
});

test('le lien Markdown ouvre la présentation précachée hors connexion', async () => {
  const sw = worker();
  const cache = await sw.caches.open('soundscape-v3');
  await cache.put('/soundscape.md', new Response('# Corsica Soundscape', {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  }));
  const request = sw.request('/soundscape.md', { navigate: true });
  const response = await request.response;
  assert.match(response.headers.get('Content-Type'), /text\/markdown/);
  assert.equal(await response.text(), '# Corsica Soundscape');
  await request.finished();
});

test('un son écouté en ligne reste lisible et navigable hors connexion', async () => {
  let calls = 0;
  const sw = worker(async (request) => {
    calls++;
    assert.equal(request.headers.has('Range'), false);
    return new Response('0123456789', { headers: { 'Content-Type': 'audio/webm' } });
  });
  const first = await sw.request('/uploads/son.webm', { headers: { Range: 'bytes=0-3' } }).response;
  assert.equal(first.status, 206);
  assert.equal(first.headers.get('Content-Range'), 'bytes 0-3/10');
  assert.equal(await first.text(), '0123');

  sw.context.fetch = async () => { throw new TypeError('offline'); };
  for (const [range, text, contentRange] of [
    ['bytes=4-', '456789', 'bytes 4-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=8-100', '89', 'bytes 8-9/10'],
  ]) {
    const response = await sw.request('/uploads/son.webm', { headers: { Range: range } }).response;
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), contentRange);
    assert.equal(await response.text(), text);
  }
  assert.equal(calls, 1);
  const invalid = await sw.request('/uploads/son.webm', { headers: { Range: 'bytes=50-' } }).response;
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('Content-Range'), 'bytes */10');
  assert.equal(await (await sw.request('/uploads/son.webm').response).text(), '0123456789');
});

test('un son jamais téléchargé retourne une erreur hors connexion', async () => {
  const sw = worker();
  assert.equal((await sw.request('/uploads/inconnu.webm').response).status, 503);
});

test('une mise à jour garde les sons, migre les anciens téléchargements et préserve les autres caches', async () => {
  const sw = worker();
  const oldCache = await sw.caches.open('soundscape-v2');
  await oldCache.put('/', new Response('Ancien HTML'));
  await oldCache.put('/uploads/ancien.webm', new Response('ancien son'));
  const dataCache = await sw.caches.open('soundscape-data-v1');
  await dataCache.put('/api/sounds', Response.json([{ id: 'one' }]));
  await sw.caches.open('soundscape-v3');
  await sw.caches.open('autre-application');
  let completed;
  sw.handlers.activate({ waitUntil(promise) { completed = promise; } });
  await completed;
  assert.equal(sw.claimed, true);
  assert.deepEqual((await sw.caches.keys()).sort(), ['autre-application', 'soundscape-data-v1', 'soundscape-v3']);
  assert.equal(await (await dataCache.match('/uploads/ancien.webm')).text(), 'ancien son');
  assert.deepEqual(await (await dataCache.match('/api/sounds')).json(), [{ id: 'one' }]);
});

test('les requêtes POST, la configuration push et les tuiles externes ne sont pas interceptées', () => {
  const sw = worker();
  assert.equal(sw.request('/api/sounds', { method: 'POST' }).response, undefined);
  assert.equal(sw.request('/api/push/config').response, undefined);
  assert.equal(sw.request('https://tile.openstreetmap.org/6/33/23.png').response, undefined);
});

test('si une migration manque de place, les anciens sons et données restent accessibles', async () => {
  const sw = worker();
  const oldCache = await sw.caches.open('soundscape-v2');
  await oldCache.put('/uploads/ancien.webm', new Response('ancien son'));
  await oldCache.put('/api/sounds', Response.json([{ id: 'one' }]));
  const open = sw.caches.open;
  sw.caches.open = async (name) => name !== 'soundscape-data-v1' ? open(name) : {
    ...await open(name),
    async put() { throw new DOMException('quota', 'QuotaExceededError'); },
  };
  let completed;
  sw.handlers.activate({ waitUntil(promise) { completed = promise; } });
  await completed;
  assert.ok(sw.stores.has('soundscape-v2'));
  assert.equal(await (await sw.request('/uploads/ancien.webm').response).text(), 'ancien son');
  assert.deepEqual(await (await sw.request('/api/sounds').response).json(), [{ id: 'one' }]);
});

test('un manque de place dans le cache ne bloque pas une réponse réseau valide', async () => {
  const sw = worker(async () => Response.json([{ id: 'one' }]));
  const open = sw.caches.open;
  sw.caches.open = async (name) => ({
    ...await open(name),
    async put() { throw new DOMException('quota', 'QuotaExceededError'); },
  });
  assert.deepEqual(await (await sw.request('/api/sounds').response).json(), [{ id: 'one' }]);
});
