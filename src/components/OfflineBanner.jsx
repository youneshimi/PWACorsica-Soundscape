// ============================================================
// Composant : Bannière hors-ligne
// ============================================================
// Affichée quand navigator.onLine === false.
// Informe l'utilisateur que ses actions seront synchronisées plus tard.
// ============================================================

import './OfflineBanner.css';

export default function OfflineBanner({ isOnline, outboxCount }) {
  if (isOnline) return null;

  return (
    <div className="offline-banner" role="alert">
      <span className="offline-icon">📡</span>
      <div className="offline-text">
        <strong>Hors connexion</strong>
        <p>
          Vos enregistrements seront envoyés au retour du réseau.
          {outboxCount > 0 && ` (${outboxCount} en attente)`}
        </p>
      </div>
    </div>
  );
}
