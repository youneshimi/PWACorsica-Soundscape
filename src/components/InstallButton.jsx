// ============================================================
// Composant : Bouton d'installation PWA
// ============================================================
// Intercepte l'événement beforeinstallprompt pour proposer
// l'installation au bon moment (après exploration de l'app).
// ============================================================

import { useState, useEffect } from 'react';
import './InstallButton.css';

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const installedHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    // Vérifier si déjà en mode standalone
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[Install] Choix: ${outcome}`);
    setDeferredPrompt(null);
  };

  // Masquer si déjà installée ou si pas de prompt disponible
  if (installed || !deferredPrompt) return null;

  return (
    <button className="install-btn" onClick={handleInstall}>
      📲 Installer l'app
    </button>
  );
}
