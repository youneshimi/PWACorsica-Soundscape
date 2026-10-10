import { useState, useEffect, useCallback } from 'react';
import { getAllSounds, putAllSounds, savePendingSound, getOutbox } from '../utils/db.js';
import { syncOutbox, requestBackgroundSync } from '../utils/sync.js';

export function useSounds() {
  const [sounds, setSounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outboxCount, setOutboxCount] = useState(0);

  const refreshLocal = useCallback(async () => {
    const entries = await getOutbox();
    setSounds(await getAllSounds());
    setOutboxCount(entries.length);
    setLoading(false);
  }, []);

  const loadSounds = useCallback(async () => {
    await refreshLocal();
    if (!navigator.onLine) return;
    try {
      const response = await fetch('/api/sounds', { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        await putAllSounds(await response.json());
        await refreshLocal();
      }
    } catch {
      // Les données locales restent affichées si le serveur est indisponible.
    }
  }, [refreshLocal]);

  const flushOutbox = useCallback(async () => {
    try {
      if (navigator.onLine) await syncOutbox();
    } catch (error) {
      console.warn('[Sounds] Envoi différé:', error.message);
    }
    await loadSounds();
    if ((await getOutbox()).length) await requestBackgroundSync();
  }, [loadSounds]);

  const addSound = useCallback(async (soundData) => {
    const id = 'local-' + crypto.randomUUID();
    await savePendingSound({
      ...soundData,
      id,
      clientId: id,
      createdAt: new Date().toISOString(),
      synced: false,
    });
    // Une fois le son écrit en base, un problème d'affichage ou d'envoi ne doit pas inviter à le créer deux fois.
    try {
      await refreshLocal();
    } catch (error) {
      console.warn('[Sounds] Rafraîchissement différé:', error.message);
    }
    if (navigator.onLine) flushOutbox().catch((error) => console.warn('[Sounds] Envoi différé:', error.message));
    else requestBackgroundSync();
  }, [refreshLocal, flushOutbox]);

  useEffect(() => {
    let stopped = false;
    const flush = () => {
      if (!stopped) flushOutbox().catch((error) => console.error('[Sounds]', error));
    };
    const handleMessage = (event) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        refreshLocal().catch((error) => console.error('[Sounds]', error));
      }
    };
    const firstLoad = window.setTimeout(flush, 0);
    const retry = window.setInterval(async () => {
      if (navigator.onLine && !stopped) {
        try {
          if ((await getOutbox()).length) flush();
        } catch (error) {
          console.error('[Sounds]', error);
        }
      }
    }, 30000);

    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      stopped = true;
      window.clearTimeout(firstLoad);
      window.clearInterval(retry);
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [flushOutbox, refreshLocal]);

  return { sounds, loading, outboxCount, addSound, reload: loadSounds };
}
