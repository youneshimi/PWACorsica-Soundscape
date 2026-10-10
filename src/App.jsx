// ============================================================
// App principale — Corsica Soundscape
// ============================================================
// Assemble : carte Leaflet + panneau latéral + recorder
//            + bannières offline/update + bouton install
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { Mic } from 'lucide-react';
import SoundMap from './components/SoundMap';
import SoundPanel from './components/SoundPanel';
import RecordModal from './components/RecordModal';
import OfflineBanner from './components/OfflineBanner';
import UpdateBanner from './components/UpdateBanner';
import InstallButton from './components/InstallButton';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSounds } from './hooks/useSounds';
import { registerSW } from './utils/sw-register';
import './App.css';

function App() {
  const isOnline = useOnlineStatus();
  const { sounds, loading, outboxCount, addSound } = useSounds();

  const [selectedSound, setSelectedSound] = useState(null);
  const [flyTo, setFlyTo] = useState(null);
  const [showRecorder, setShowRecorder] = useState(() =>
    new URLSearchParams(window.location.search).get('action') === 'record'
  );
  const [updateRegistration, setUpdateRegistration] = useState(null);

  // Enregistrer le Service Worker avec callback de mise à jour
  useEffect(() => {
    return registerSW({
      enabled: !import.meta.env.DEV,
      onUpdate: (registration) => {
        setUpdateRegistration(registration);
      },
    });
  }, []);

  // Sélectionner un son → fly to sur la carte
  const handleSelectSound = useCallback((sound) => {
    setSelectedSound(sound);
    setFlyTo([sound.latitude, sound.longitude]);
  }, []);

  // Sauvegarder un enregistrement
  const handleSaveSound = useCallback(async (soundData) => {
    await addSound(soundData);
    // Centrer la carte sur le nouveau son
    setFlyTo([soundData.latitude, soundData.longitude]);
  }, [addSound]);

  // Vérifier si on arrive avec ?action=record (shortcut manifest)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'record') {
      // Nettoyer l'URL
      params.delete('action');
      const query = params.toString();
      window.history.replaceState(window.history.state, '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  }, []);

  return (
    <div className="app">
      {/* Carte principale */}
      <div className="map-container">
        {loading ? (
          <div className="loading-screen">
            <div className="loading-spinner" />
            <p>Chargement de la carte sonore…</p>
          </div>
        ) : (
          <SoundMap
            sounds={sounds}
            selectedSound={selectedSound}
            onSelectSound={handleSelectSound}
            flyTo={flyTo}
          />
        )}
      </div>

      {/* Panneau latéral */}
      <SoundPanel
        sounds={sounds}
        selectedSound={selectedSound}
        onSelectSound={handleSelectSound}
        outboxCount={outboxCount}
      />

      {/* Bouton FAB enregistrement */}
      <button
        className="fab-record"
        onClick={() => setShowRecorder(true)}
        aria-label="Enregistrer un son"
        title="Enregistrer un son"
      >
        <Mic size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {/* Modal d'enregistrement */}
      <RecordModal
        isOpen={showRecorder}
        onClose={() => setShowRecorder(false)}
        onSave={handleSaveSound}
      />

      {/* Bannières */}
      <OfflineBanner isOnline={isOnline} outboxCount={outboxCount} />
      <UpdateBanner
        registration={updateRegistration}
        onDismiss={() => setUpdateRegistration(null)}
      />

      {/* Bouton d'installation */}
      <InstallButton />
    </div>
  );
}

export default App;
