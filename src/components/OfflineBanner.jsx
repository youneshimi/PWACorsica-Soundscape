// ============================================================
// Composant : Bannière hors-ligne
// ============================================================
// Affichée quand navigator.onLine === false.
// Informe l'utilisateur que ses actions seront synchronisées plus tard.
// ============================================================

import { WifiOff } from 'lucide-react';
import './OfflineBanner.css';

export default function OfflineBanner({ isOnline, outboxCount }) {
  if (isOnline) return null;

  return (
    <div className="offline-banner" role="alert">
      <WifiOff className="offline-icon" size={20} aria-hidden="true" />
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
