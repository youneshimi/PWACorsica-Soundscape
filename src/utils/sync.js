import { getOutbox, completeSync } from './db.js';
import { getAudioFileName } from './audio.js';

let running;

async function sendEntries() {
  const sent = [];
  while (true) {
    const entries = await getOutbox();
    if (!entries.length) return sent;
    for (const entry of entries) {
      const data = new FormData();
      data.append('title', entry.title);
      data.append('description', entry.description || '');
      data.append('latitude', entry.latitude);
      data.append('longitude', entry.longitude);
      data.append('category', entry.category || 'autre');
      if (entry.audioBlob) data.append('audio', entry.audioBlob, getAudioFileName(entry.audioBlob));

      const response = await fetch('/api/sounds', {
        method: 'POST',
        headers: { 'Idempotency-Key': entry.clientId },
        body: data,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Envoi impossible (' + response.status + ')');
      const sound = await response.json();
      if (!sound.id) throw new Error('Réponse du serveur invalide');
      await completeSync(entry, sound);
      sent.push(sound);
    }
  }
}

// Une seule synchronisation par onglet, et par origine si Web Locks est disponible.
export function syncOutbox() {
  if (!running) {
    const task = navigator.locks
      ? navigator.locks.request('soundscape-sync', sendEntries)
      : sendEntries();
    running = task.finally(() => { running = undefined; });
  }
  return running;
}

export async function requestBackgroundSync() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.active && registration.sync) {
      await registration.sync.register('sync-outbox');
    }
  } catch (error) {
    console.warn('[Sounds] Background Sync indisponible:', error.message);
  }
}
