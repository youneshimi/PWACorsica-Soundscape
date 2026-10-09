// ============================================================
// Hook : gestion des sons (chargement, ajout, sync)
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { getAllSounds, putAllSounds, putSound, addToOutbox, getOutbox, removeFromOutbox } from '../utils/db';

const API_URL = '/api/sounds';

export function useSounds() {
  const [sounds, setSounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outboxCount, setOutboxCount] = useState(0);

  // Charger les sons : d'abord IndexedDB (instantané), puis réseau
  const loadSounds = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Afficher les sons locaux immédiatement (offline-first)
      const localSounds = await getAllSounds();
      if (localSounds.length > 0) {
        setSounds(localSounds);
      }

      // 2. Tenter de récupérer les sons du serveur
      if (navigator.onLine) {
        try {
          const res = await fetch(API_URL);
          if (res.ok) {
            const serverSounds = await res.json();
            await putAllSounds(serverSounds);
            setSounds(serverSounds);
          }
        } catch {
          console.log('[Sounds] Réseau indisponible, données locales utilisées');
        }
      }

      // 3. Compter l'outbox
      const outbox = await getOutbox();
      setOutboxCount(outbox.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSounds();
  }, [loadSounds]);

  // Écouter les messages du SW (sync terminée)
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        console.log('[Sounds] Sync complète, rechargement');
        loadSounds();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  }, [loadSounds]);

  // Ajouter un son (enregistrement)
  const addSound = useCallback(async (soundData) => {
    // Créer l'objet son local
    const localSound = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...soundData,
      createdAt: new Date().toISOString(),
      synced: false,
    };

    // Sauvegarder dans IndexedDB pour affichage immédiat
    await putSound(localSound);
    setSounds((prev) => [localSound, ...prev]);

    // Ajouter à l'outbox pour sync
    await addToOutbox({
      title: soundData.title,
      description: soundData.description,
      latitude: soundData.latitude,
      longitude: soundData.longitude,
      category: soundData.category,
      audioBlob: soundData.audioBlob,
    });

    // Tenter l'envoi immédiat si en ligne
    if (navigator.onLine) {
      await flushOutbox();
    } else {
      // Demander un Background Sync
      const registration = await navigator.serviceWorker?.ready;
      if (registration?.sync) {
        try {
          await registration.sync.register('sync-outbox');
          console.log('[Sounds] Background Sync enregistré');
        } catch {
          console.log('[Sounds] Background Sync non supporté');
        }
      }
      setOutboxCount((c) => c + 1);
    }
  }, []);

  // Vider l'outbox manuellement (fallback pour Firefox/Safari)
  const flushOutbox = useCallback(async () => {
    const entries = await getOutbox();
    for (const entry of entries) {
      try {
        const formData = new FormData();
        formData.append('title', entry.title);
        formData.append('description', entry.description || '');
        formData.append('latitude', entry.latitude);
        formData.append('longitude', entry.longitude);
        formData.append('category', entry.category || 'autre');
        if (entry.audioBlob) {
          formData.append('audio', entry.audioBlob, 'recording.webm');
        }

        const res = await fetch(API_URL, { method: 'POST', body: formData });
        if (res.ok) {
          await removeFromOutbox(entry.id);
          console.log(`[Sounds] Outbox sync OK — "${entry.title}"`);
        }
      } catch (err) {
        console.error(`[Sounds] Sync échoué pour "${entry.title}"`, err);
        break; // Arrêter si le réseau flanche
      }
    }
    await loadSounds();
  }, [loadSounds]);

  // Écouter le retour du réseau pour flush (fallback Background Sync)
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Sounds] Réseau de retour — flush outbox');
      flushOutbox();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushOutbox]);

  return { sounds, loading, outboxCount, addSound, reload: loadSounds };
}
