import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import './InstallButton.css';

export default function InstallButton({ visible = true }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const installedHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    const displayModeHandler = () => {
      if (displayMode.matches || window.navigator.standalone === true) installedHandler();
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    if (displayMode.addEventListener) displayMode.addEventListener('change', displayModeHandler);
    else displayMode.addListener(displayModeHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
      if (displayMode.removeEventListener) displayMode.removeEventListener('change', displayModeHandler);
      else displayMode.removeListener(displayModeHandler);
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
  if (installed || !deferredPrompt || dismissed || !visible) return null;

  return (
    <div className="install-banner" role="status">
      <span>Emportez la carte sonore avec vous</span>
      <button className="install-btn" onClick={handleInstall}>
        <Download size={18} aria-hidden="true" /> Installer l'app
      </button>
      <button className="install-dismiss" onClick={() => setDismissed(true)} aria-label="Fermer la proposition d’installation">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
