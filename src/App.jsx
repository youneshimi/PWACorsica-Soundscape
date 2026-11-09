// ============================================================
// App principale — Corsica Soundscape
// ============================================================
// Assemble : carte Leaflet + panneau latéral + recorder
//            + bannières offline/update + bouton install
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { Mic, Map, Compass, Route, UserRound, Moon, Sun } from 'lucide-react';
import SoundMap from './components/SoundMap';
import SoundPanel from './components/SoundPanel';
import RecordModal from './components/RecordModal';
import OfflineBanner from './components/OfflineBanner';
import UpdateBanner from './components/UpdateBanner';
import InstallButton from './components/InstallButton';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSounds } from './hooks/useSounds';
import { registerSW } from './utils/sw-register';
import { createProfile, getProfile, registerProfile } from './utils/profile';
import './App.css';

function App() {
  const isOnline = useOnlineStatus();
  const { sounds, loading, outboxCount, addSound, reload } = useSounds();

  const [selectedSound, setSelectedSound] = useState(null);
  const [profile, setProfile] = useState(getProfile);
  const [nickname, setNickname] = useState('');
  const [profileError, setProfileError] = useState('');
  useEffect(() => {
    if (!profile) return;
    const sync = () => registerProfile(profile).catch(() => {});
    window.addEventListener('online', sync);
    sync();
    return () => window.removeEventListener('online', sync);
  }, [profile]);
  const [view, setView] = useState('map');
  const [theme, setTheme] = useState(() => localStorage.getItem('soundscape-theme') || 'system');
  const [notice, setNotice] = useState(null);
  const notify = useCallback((message, type = 'success') => setNotice({ message, type, id: Date.now() }), []);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem('soundscape-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [selectedTrail, setSelectedTrail] = useState(null);
  const [stats, setStats] = useState({});
  const displayedSounds = sounds.map((sound) => ({ ...sound, ...stats[sound.id] }));
  const updateStats = useCallback((id, patch) => setStats((previous) => ({ ...previous, [id]: { ...previous[id], ...patch } })), []);
  const [flyTo, setFlyTo] = useState(null);
  const [showRecorder, setShowRecorder] = useState(() =>
    new URLSearchParams(window.location.search).get('action') === 'record'
  );
  const [updateRegistration, setUpdateRegistration] = useState(null);
  const [requestedSoundId, setRequestedSoundId] = useState(() => new URLSearchParams(window.location.search).get('sound'));

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
  useEffect(() => {
    const sound = sounds.find((item) => item.id === requestedSoundId);
    if (!sound) return;
    setSelectedSound(sound);
    setFlyTo([sound.latitude, sound.longitude]);
    setRequestedSoundId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('sound');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, [sounds, requestedSoundId]);

  useEffect(() => {
    function onMessage(event) {
      if (event.data?.type !== 'OPEN_SOUND') return;
      setRequestedSoundId(event.data.id);
      reload().catch(() => {});
    }
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [reload]);

  const handleSelectSound = useCallback((sound) => {
    setSelectedSound(sound);
    setFlyTo([sound.latitude, sound.longitude]);
    navigator.vibrate?.(10);
  }, []);

  // Sauvegarder un enregistrement
  const handleSaveSound = useCallback(async (soundData) => {
    await addSound({ ...soundData, profileId: profile?.id, nickname: profile?.nickname });
    // Centrer la carte sur le nouveau son
    setFlyTo([soundData.latitude, soundData.longitude]);
    notify('Son ajouté à la carte !');
  }, [addSound, profile, notify]);

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
      <header className="app-header"><span className="brand-mark" aria-hidden="true">◉</span><div className="brand-text"><strong>Corsica Soundscape</strong><small>La Corse, à écouter</small></div><span className="header-location">⌖ Corse, France</span><button className="theme-toggle" type="button" aria-label="Changer le thème" onClick={() => setTheme(theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'light' : 'dark')}>{theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? <Sun size={19} /> : <Moon size={19} />}</button></header>
      <main className="workspace">
      {/* Carte principale */}
      <div className="map-container">
        {loading ? (
          <div className="loading-screen">
            <div className="loading-spinner" />
            <p>Chargement de la carte sonore…</p>
          </div>
        ) : (
          <SoundMap
            sounds={displayedSounds}
            selectedSound={selectedSound}
            onSelectSound={handleSelectSound}
            flyTo={flyTo}
            trail={selectedTrail}
          />
        )}
      </div>

      {/* Panneau latéral */}
      <SoundPanel
        sounds={displayedSounds}
        selectedSound={selectedSound}
        onSelectSound={handleSelectSound}
        outboxCount={outboxCount}
        profile={profile}
        onStatsChange={updateStats}
        view={view}
        onViewChange={setView}
        onSelectTrail={setSelectedTrail}
        loading={loading}
        onRefresh={reload}
        onNotify={notify}
        theme={theme}
        onThemeChange={setTheme}
      />
      </main>
      <nav className="bottom-nav" aria-label="Navigation principale">{[['map','Carte',Map],['popular','Populaires',Compass],['trails','Parcours',Route],['profile','Profil',UserRound]].map(([id,label,Icon]) => <button key={id} className={view === id || (view === 'detail' && id === 'map') ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); navigator.vibrate?.(8); }}><Icon size={21} /><span>{label}</span></button>)}</nav>

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
      {showRecorder && (
        <RecordModal
          onClose={() => setShowRecorder(false)}
          onSave={handleSaveSound}
        />
      )}

      {/* Bannières */}
      <OfflineBanner isOnline={isOnline} outboxCount={outboxCount} />
      <UpdateBanner
        registration={updateRegistration}
        onDismiss={() => setUpdateRegistration(null)}
      />

      {/* Bouton d'installation */}
      <InstallButton />
      {notice && <div key={notice.id} className={`app-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.message}<button onClick={() => setNotice(null)} aria-label="Fermer">×</button></div>}
      {!profile && <div className="profile-backdrop"><form className="profile-dialog" onSubmit={async (event) => {
        event.preventDefault();
        try { setProfile(await createProfile(nickname)); setProfileError(''); }
        catch (error) { setProfileError(error.message); }
      }}><h2>Bienvenue en Corse</h2><p>Choisissez un pseudo pour partager vos sons.</p>
        <input aria-label="Pseudo" maxLength={30} value={nickname} onChange={(event) => setNickname(event.target.value)} required />
        {profileError && <p role="alert">{profileError}</p>}<button type="submit">Commencer</button>
      </form></div>}
    </div>
  );
}

export default App;
