// ============================================================
// Hook : détection réseau (online/offline)
// ============================================================
// Pourquoi un hook : React re-render automatique quand le statut change.
// Utilisé pour : bannière offline, désactiver les boutons d'envoi,
// déclencher le flush de l'outbox au retour du réseau.
// ============================================================

import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
