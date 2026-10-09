// ============================================================
// Notifications locales
// ============================================================
// Utilisées pour :
//   - Confirmer qu'un son a été synchronisé (retour réseau)
//   - Alerter quand un nouveau son est posté dans sa zone
//
// La permission est demandée APRÈS une action utilisateur
// (jamais au chargement), conformément aux bonnes pratiques.
// ============================================================

// Demander la permission de notification
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('[Notif] API Notifications non supportée');
    return 'denied';
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  // Demander (après action utilisateur)
  const permission = await Notification.requestPermission();
  return permission;
}

// Envoyer une notification locale via le SW
export async function sendLocalNotification(title, options = {}) {
  if (Notification.permission !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      // Via le SW pour que ça marche même si l'app est en arrière-plan
      await registration.showNotification(title, {
        icon: '/img/icon-192.png',
        badge: '/img/icon-192.png',
        vibrate: [100, 50, 100],
        ...options,
      });
    }
  } catch (err) {
    console.error('[Notif] Erreur:', err);
  }
}

// Notification de sync réussie
export function notifySyncComplete(soundTitle) {
  sendLocalNotification('Son synchronisé !', {
    body: `"${soundTitle}" a été envoyé au serveur.`,
    tag: 'sync-complete',
  });
}

// Notification de nouveau son dans la zone
export function notifyNewSound(soundTitle, category) {
  const emoji = {
    mer: '🌊', nature: '🌿', village: '🏘️',
    animal: '🐦', musique: '🎵', marche: '🛒', autre: '📍',
  };

  sendLocalNotification('Nouveau son en Corse !', {
    body: `${emoji[category] || '📍'} ${soundTitle}`,
    tag: 'new-sound',
  });
}
