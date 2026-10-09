// ============================================================
// IndexedDB — Modèle de données Corsica Soundscape
// ============================================================
// Utilise la librairie `idb` pour une API Promise-based.
//
// Deux stores :
//   1. `sounds`  — les sons téléchargés ou créés localement
//   2. `outbox`  — file d'attente de synchronisation
//
// Pourquoi IndexedDB et pas localStorage ?
//   - localStorage est synchrone (bloque le thread principal)
//   - localStorage est limité à ~5 Mo de strings
//   - IndexedDB stocke des blobs (audio), des objets structurés
//   - IndexedDB supporte les index pour requêter par catégorie, date, etc.
// ============================================================

import { openDB } from 'idb';

const DB_NAME = 'corsica-soundscape';
const DB_VERSION = 1;

// -- Ouvrir / créer la base -----------------------------------
export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Store principal : les sons
      if (!db.objectStoreNames.contains('sounds')) {
        const soundStore = db.createObjectStore('sounds', { keyPath: 'id' });
        soundStore.createIndex('by-category', 'category');
        soundStore.createIndex('by-date', 'createdAt');
        soundStore.createIndex('by-location', ['latitude', 'longitude']);
      }

      // Outbox : actions en attente de synchronisation
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    },
  });
}

// ============================================================
// CRUD — Store `sounds`
// ============================================================

// Récupérer tous les sons
export async function getAllSounds() {
  const db = await getDB();
  return db.getAll('sounds');
}

// Récupérer un son par ID
export async function getSound(id) {
  const db = await getDB();
  return db.get('sounds', id);
}

// Sauvegarder un son (ajout ou mise à jour)
export async function putSound(sound) {
  const db = await getDB();
  return db.put('sounds', sound);
}

// Supprimer un son
export async function deleteSound(id) {
  const db = await getDB();
  return db.delete('sounds', id);
}

// Sons par catégorie
export async function getSoundsByCategory(category) {
  const db = await getDB();
  return db.getAllFromIndex('sounds', 'by-category', category);
}

// Sauvegarder tous les sons du serveur (sync initiale)
export async function putAllSounds(sounds) {
  const db = await getDB();
  const tx = db.transaction('sounds', 'readwrite');
  for (const sound of sounds) {
    tx.store.put(sound);
  }
  await tx.done;
}

// ============================================================
// OUTBOX — File de synchronisation
// ============================================================
// Pattern outbox :
//   1. L'utilisateur crée un son → sauvé dans `outbox`
//   2. Si en ligne → envoi immédiat au serveur, suppression de l'outbox
//   3. Si hors ligne → reste dans l'outbox
//   4. Au retour du réseau → Background Sync ou event `online` vide l'outbox
// ============================================================

// Ajouter une entrée à l'outbox
export async function addToOutbox(entry) {
  const db = await getDB();
  const id = await db.add('outbox', {
    ...entry,
    createdAt: new Date().toISOString(),
    status: 'pending',
  });
  console.log(`[DB] Ajouté à l'outbox, id=${id}`);
  return id;
}

// Lire toutes les entrées de l'outbox
export async function getOutbox() {
  const db = await getDB();
  return db.getAll('outbox');
}

// Supprimer une entrée de l'outbox (après sync réussie)
export async function removeFromOutbox(id) {
  const db = await getDB();
  return db.delete('outbox', id);
}

// Vider toute l'outbox
export async function clearOutbox() {
  const db = await getDB();
  return db.clear('outbox');
}

// Compter les entrées en attente
export async function getOutboxCount() {
  const db = await getDB();
  return db.count('outbox');
}
