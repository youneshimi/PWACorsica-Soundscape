import { openDB } from 'idb';

const DB_NAME = 'corsica-soundscape';
let dbPromise;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        const sounds = db.createObjectStore('sounds', { keyPath: 'id' });
        sounds.createIndex('by-category', 'category');
        sounds.createIndex('by-date', 'createdAt');
        sounds.createIndex('by-location', ['latitude', 'longitude']);
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      },
    }).catch((error) => {
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

function storedSound(sound) {
  const copy = { ...sound };
  if (copy.audioUrl?.startsWith('blob:')) delete copy.audioUrl;
  return copy;
}

export async function getAllSounds() {
  const db = await getDB();
  const sounds = await db.getAll('sounds');
  return sounds.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getSound(id) {
  return (await getDB()).get('sounds', id);
}

export async function putSound(sound) {
  return (await getDB()).put('sounds', storedSound(sound));
}

export async function deleteSound(id) {
  return (await getDB()).delete('sounds', id);
}

export async function getSoundsByCategory(category) {
  return (await getDB()).getAllFromIndex('sounds', 'by-category', category);
}

// Le son et sa demande d'envoi sont enregistrés ensemble.
export async function savePendingSound(sound) {
  const db = await getDB();
  const tx = db.transaction(['sounds', 'outbox'], 'readwrite');
  const saved = tx.objectStore('sounds').put(storedSound(sound));
  const queued = tx.objectStore('outbox').add({
    localId: sound.id,
    clientId: sound.clientId,
    title: sound.title,
    description: sound.description,
    latitude: sound.latitude,
    longitude: sound.longitude,
    category: sound.category,
    audioBlob: sound.audioBlob,
    createdAt: sound.createdAt,
  });
  await Promise.all([saved, queued, tx.done]);
}

// Conserver les sons en attente et les fichiers audio déjà téléchargés.
export async function putAllSounds(serverSounds, { removeMissingIds = [] } = {}) {
  if (!Array.isArray(serverSounds) || serverSounds.some((sound) => !sound?.id)) throw new Error('Liste de sons invalide.');
  const db = await getDB();
  const tx = db.transaction(['sounds', 'outbox'], 'readwrite');
  const store = tx.objectStore('sounds');
  const outbox = tx.objectStore('outbox');
  const localSounds = await store.getAll();
  const entries = await outbox.getAll();
  const writes = [];
  const removedAudio = [];
  const serverIds = new Set(serverSounds.map((sound) => sound.id));
  const removable = new Set(removeMissingIds);

  // Retirer seulement les sons déjà synchronisés au départ de la requête réseau.
  for (const sound of localSounds) {
    const pending = entries.some((entry) => entry.localId === sound.id || (sound.clientId && entry.clientId === sound.clientId));
    if (!sound.synced || !removable.has(sound.id) || serverIds.has(sound.id) || pending) continue;
    writes.push(store.delete(sound.id));
    if (sound.audioUrl?.startsWith('/uploads/')) removedAudio.push(sound.audioUrl);
  }

  for (const sound of serverSounds) {
    const entry = sound.clientId && entries.find((item) => item.clientId === sound.clientId);
    const pending = localSounds.find((item) =>
      item.id === entry?.localId ||
      (sound.clientId && item.clientId === sound.clientId && item.id !== sound.id));
    const existing = localSounds.find((item) => item.id === sound.id);
    const local = pending || existing;
    writes.push(store.put(storedSound({
      ...sound,
      ...(local?.audioBlob ? { audioBlob: local.audioBlob } : {}),
    })));
    if (local && local.id !== sound.id) writes.push(store.delete(local.id));
    if (entry) writes.push(outbox.delete(entry.id));
  }
  await Promise.all([...writes, tx.done]);
  return removedAudio;
}

export async function completeSync(entry, serverSound) {
  const db = await getDB();
  const tx = db.transaction(['sounds', 'outbox'], 'readwrite');
  const writes = [tx.objectStore('sounds').put(storedSound({
    ...serverSound,
    audioBlob: entry.audioBlob,
  }))];
  if (entry.localId && entry.localId !== serverSound.id) {
    writes.push(tx.objectStore('sounds').delete(entry.localId));
  }
  writes.push(tx.objectStore('outbox').delete(entry.id));
  await Promise.all([...writes, tx.done]);
}

export async function addToOutbox(entry) {
  return (await getDB()).add('outbox', {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
  });
}

async function sameAudio(a, b) {
  if (!a || !b || a.size !== b.size || a.type !== b.type) return false;
  const left = new Uint8Array(await a.arrayBuffer());
  const right = new Uint8Array(await b.arrayBuffer());
  return left.every((byte, index) => byte === right[index]);
}

// Raccorder les anciennes entrées seulement quand un seul son correspond.
export async function getOutbox() {
  const db = await getDB();
  const entries = await db.getAll('outbox');
  const oldEntries = entries.filter((entry) => !entry.clientId);
  if (!oldEntries.length) return entries;

  const sounds = await db.getAll('sounds');
  const linked = new Set(entries.map((entry) => entry.localId).filter(Boolean));
  for (const entry of oldEntries) {
    const matches = [];
    for (const sound of sounds) {
      if (sound.synced || linked.has(sound.id) ||
          sound.title !== entry.title ||
          (sound.description || '') !== (entry.description || '') ||
          sound.latitude !== entry.latitude || sound.longitude !== entry.longitude ||
          sound.category !== entry.category) continue;
      if (await sameAudio(sound.audioBlob, entry.audioBlob)) matches.push(sound);
    }
    if (matches.length === 1) {
      entry.localId = matches[0].id;
      linked.add(entry.localId);
    }
    entry.clientId = 'legacy-' + entry.createdAt + '-' + entry.id;
  }

  const tx = db.transaction('outbox', 'readwrite');
  for (const entry of oldEntries) {
    // Le Service Worker peut avoir terminé l'envoi entre-temps.
    const current = await tx.store.get(entry.id);
    if (current) await tx.store.put({ ...current, clientId: entry.clientId, localId: entry.localId });
  }
  const result = await tx.store.getAll();
  await tx.done;
  return result;
}

export async function removeFromOutbox(id) {
  return (await getDB()).delete('outbox', id);
}

export async function clearOutbox() {
  return (await getDB()).clear('outbox');
}

export async function getOutboxCount() {
  return (await getDB()).count('outbox');
}
