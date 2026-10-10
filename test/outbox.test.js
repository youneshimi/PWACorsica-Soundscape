import 'fake-indexeddb/auto';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  getDB, getAllSounds, getOutbox, savePendingSound, putAllSounds, putSound, addToOutbox,
} from '../src/utils/db.js';
import { syncOutbox, requestBackgroundSync } from '../src/utils/sync.js';
import { getAudioSource } from '../src/utils/audio.js';

const originalFetch = globalThis.fetch;
const audioBlob = new Blob(['recording'], { type: 'audio/webm' });
const localSound = {
  id: 'local-test', clientId: 'local-test', title: 'Vagues',
  description: '', category: 'mer', latitude: 42.3, longitude: 9.15,
  createdAt: '2026-10-10T10:00:00.000Z', synced: false, audioBlob,
};
const serverSound = {
  ...localSound, id: 'server-test', audioBlob: undefined,
  audioUrl: '/uploads/test.webm', version: 1, synced: true,
};

function legacyEntry() {
  const entry = { ...localSound };
  delete entry.id;
  delete entry.clientId;
  delete entry.synced;
  return entry;
}

beforeEach(async () => {
  globalThis.fetch = originalFetch;
  const db = await getDB();
  await db.clear('sounds');
  await db.clear('outbox');
});

test('le son et la demande d’envoi partagent un identifiant, sans URL blob persistée', async () => {
  await savePendingSound({ ...localSound, audioUrl: 'blob:ancienne-url' });
  const [sound] = await getAllSounds();
  const [entry] = await getOutbox();
  assert.equal(entry.localId, sound.id);
  assert.equal(entry.clientId, sound.clientId);
  assert.equal(sound.audioUrl, undefined);
  assert.equal(await sound.audioBlob.text(), 'recording');
});

test('un rafraîchissement serveur conserve les sons qui attendent leur envoi', async () => {
  await savePendingSound(localSound);
  await putAllSounds([{ id: 'other', title: 'Cloches', synced: true }]);
  assert.deepEqual((await getAllSounds()).map((sound) => sound.id).sort(), ['local-test', 'other']);
  assert.equal((await getOutbox()).length, 1);
});

test('un envoi réussi remplace la copie locale et conserve le fichier audio', async () => {
  await savePendingSound(localSound);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/sounds');
    assert.equal(options.headers['Idempotency-Key'], localSound.clientId);
    assert.equal(await options.body.get('audio').text(), 'recording');
    return Response.json(serverSound);
  };
  await syncOutbox();
  const sounds = await getAllSounds();
  assert.equal(sounds.length, 1);
  assert.equal(sounds[0].id, serverSound.id);
  assert.equal(await sounds[0].audioBlob.text(), 'recording');
  assert.equal((await getOutbox()).length, 0);
});

test('la synchronisation conserve le format MP4 ou Ogg au lieu de le nommer WebM', async () => {
  for (const [type, filename] of [['audio/mp4', 'recording.m4a'], ['audio/ogg;codecs=opus', 'recording.ogg']]) {
    const audioBlob = new Blob(['sound'], { type });
    await savePendingSound({ ...localSound, audioBlob });
    globalThis.fetch = async (url, options) => {
      const file = options.body.get('audio');
      assert.equal(file.name, filename);
      assert.equal(file.type, type);
      return Response.json(serverSound);
    };
    await syncOutbox();
    assert.equal((await getOutbox()).length, 0);
  }
});

test('les échecs réseau et HTTP gardent le son et la demande d’envoi', async () => {
  await savePendingSound(localSound);
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(syncOutbox(), /offline/);
  globalThis.fetch = async () => new Response('', { status: 503 });
  await assert.rejects(syncOutbox(), /503/);
  assert.equal((await getOutbox()).length, 1);
  assert.equal((await getAllSounds())[0].id, localSound.id);
});

test('deux demandes simultanées dans le même onglet font un seul envoi', async () => {
  await savePendingSound(localSound);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json(serverSound);
  };
  await Promise.all([syncOutbox(), syncOutbox()]);
  assert.equal(calls, 1);
});

test('une réponse invalide ne supprime pas les données locales', async () => {
  await savePendingSound(localSound);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(syncOutbox(), /invalide/);
  assert.equal((await getOutbox()).length, 1);
});

test('le rafraîchissement réconcilie un envoi accepté avant une interruption du client', async () => {
  await savePendingSound(localSound);
  await putSound({ ...serverSound, audioBlob });
  await putAllSounds([serverSound]);
  assert.deepEqual((await getAllSounds()).map((sound) => sound.id), ['server-test']);
  assert.equal((await getOutbox()).length, 0);
  assert.equal(await (await getAllSounds())[0].audioBlob.text(), 'recording');
});

test('une ancienne entrée est liée au bon son et reçoit un identifiant stable', async () => {
  await putSound({ ...localSound, clientId: undefined });
  const id = await addToOutbox(legacyEntry());
  const [entry] = await getOutbox();
  assert.equal(entry.localId, localSound.id);
  assert.equal(entry.clientId, 'legacy-' + localSound.createdAt + '-' + id);
  assert.equal((await getOutbox())[0].clientId, entry.clientId);
});

test('une correspondance ancienne ambiguë ne supprime aucun enregistrement', async () => {
  await putSound({ ...localSound, id: 'local-a', clientId: undefined });
  await putSound({ ...localSound, id: 'local-b', clientId: undefined });
  await addToOutbox(legacyEntry());
  assert.equal((await getOutbox())[0].localId, undefined);
  assert.equal((await getAllSounds()).length, 2);
});

test('le lecteur recrée une URL valide depuis le blob et la libère ensuite', async () => {
  const source = getAudioSource({ audioUrl: 'blob:ancienne-url', audioBlob });
  assert.equal(await (await originalFetch(source.url)).text(), 'recording');
  source.release();
  await assert.rejects(originalFetch(source.url));
  assert.equal(getAudioSource({ audioUrl: 'blob:ancienne-url' }), null);
});

test('la demande de Background Sync finit même sans Service Worker actif', async () => {
  await requestBackgroundSync();
});

function workerContext(fetch) {
  const handlers = {};
  const context = vm.createContext({
    indexedDB, Blob, FormData, AbortSignal, URL, Response, fetch,
    console: { log() {}, error() {} },
    self: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      clients: { matchAll: async () => [] },
    },
  });
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  return { context, handlers };
}

test('le Service Worker remplace également la copie locale après synchronisation', async () => {
  await savePendingSound(localSound);
  const { context } = workerContext(async (url, options) => {
    assert.equal(options.headers['Idempotency-Key'], localSound.clientId);
    return Response.json(serverSound);
  });
  await context.syncOutbox();
  assert.deepEqual((await getAllSounds()).map((sound) => sound.id), ['server-test']);
  assert.equal((await getOutbox()).length, 0);
  assert.equal(await (await getAllSounds())[0].audioBlob.text(), 'recording');
});

test('le Background Sync conserve également le format MP4 ou Ogg', async () => {
  for (const [type, filename] of [['audio/mp4', 'recording.m4a'], ['audio/ogg;codecs=opus', 'recording.ogg']]) {
    await savePendingSound({ ...localSound, audioBlob: new Blob(['sound'], { type }) });
    const { context } = workerContext(async (url, options) => {
      const file = options.body.get('audio');
      assert.equal(file.name, filename);
      assert.equal(file.type, type);
      return Response.json(serverSound);
    });
    await context.syncOutbox();
    assert.equal((await getOutbox()).length, 0);
  }
});

test('l’événement sync rejette son attente en cas d’échec, pour permettre une relance', async () => {
  await savePendingSound(localSound);
  const { handlers } = workerContext(async () => new Response('', { status: 503 }));
  let pending;
  handlers.sync({ tag: 'sync-outbox', waitUntil: (promise) => { pending = promise; } });
  await assert.rejects(pending, /503/);
  assert.equal((await getOutbox()).length, 1);
});

test('le Service Worker sait raccorder une ancienne entrée sans localId', async () => {
  await putSound({ ...localSound, clientId: undefined });
  const db = await getDB();
  await db.add('outbox', legacyEntry());
  const { context } = workerContext(async () => Response.json(serverSound));
  await context.syncOutbox();
  assert.deepEqual((await getAllSounds()).map((sound) => sound.id), ['server-test']);
  assert.equal((await getOutbox()).length, 0);
});
