// ============================================================
// Composant : Bannière de mise à jour
// ============================================================
// Stratégie choisie : proposée à l'utilisateur (pas d'office).
// Pourquoi : une carte sonore peut avoir un enregistrement en cours.
// Forcer un rechargement perdrait l'enregistrement. On laisse
// l'utilisateur décider quand appliquer la mise à jour.
// ============================================================

import { skipWaiting } from '../utils/sw-register';
import './UpdateBanner.css';

export default function UpdateBanner({ registration, onDismiss }) {
  if (!registration) return null;

  const handleUpdate = () => {
    skipWaiting(registration);
    // Le controllerchange dans sw-register.js va recharger la page
  };

  return (
    <div className="update-banner" role="alert">
      <div className="update-content">
        <span>🔄</span>
        <p>
          <strong>Nouvelle version disponible !</strong>
          <br />
          <span>Mettez à jour pour profiter des améliorations.</span>
        </p>
      </div>
      <div className="update-actions">
        <button className="update-dismiss" onClick={onDismiss}>
          Plus tard
        </button>
        <button className="update-apply" onClick={handleUpdate}>
          Mettre à jour
        </button>
      </div>
    </div>
  );
}
