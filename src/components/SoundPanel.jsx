import { useState, useRef, useEffect, useCallback } from 'react';
import { Clock, Headphones, Heart, Pause, Play, ArrowLeft, Share2, RefreshCw, ChevronUp, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import PushButton from './PushButton';
import Comments from './Comments';
import Trails from './Trails';
import { getAudioSource } from '../utils/audio.js';
import './SoundPanel.css';

const categories = [
  { value: 'all', label: 'Tous', emoji: '✦' }, { value: 'mer', label: 'Mer', emoji: '🌊' },
  { value: 'nature', label: 'Nature', emoji: '🌿' }, { value: 'village', label: 'Village', emoji: '🏘️' },
  { value: 'animal', label: 'Animal', emoji: '🐦' }, { value: 'musique', label: 'Musique', emoji: '🎵' },
  { value: 'marche', label: 'Marché', emoji: '🥾' }, { value: 'autre', label: 'Autre', emoji: '🔊' },
];
const category = (value) => categories.find((item) => item.value === value) || categories.at(-1);
const formatTime = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';

function EmptyState() {
  return <div className="empty-state"><svg viewBox="0 0 180 120" width="180" height="120" aria-hidden="true"><path d="M15 95 Q50 48 82 82 T164 72" fill="none" stroke="var(--color-accent)" strokeWidth="6" strokeLinecap="round"/><circle cx="95" cy="43" r="30" fill="var(--color-sand)"/><path d="M81 43q14-20 28 0-14 20-28 0Z" fill="var(--color-primary)"/><path d="M12 105h156" stroke="var(--color-surface-hover)" strokeWidth="4" strokeLinecap="round"/></svg><strong>Aucun son ici, soyez le premier !</strong><p>Partagez une ambiance sonore de la Corse.</p></div>;
}

export default function SoundPanel({ sounds, selectedSound: selectedSoundProp, onSelectSound, outboxCount, profile, onStatsChange, view, onViewChange, onSelectTrail, loading, onRefresh, onNotify, theme, onThemeChange }) {
  const selectedSound = sounds.find((sound) => sound.id === selectedSoundProp?.id) || selectedSoundProp;
  const [filter, setFilter] = useState('all');
  const [sheetHeight, setSheetHeight] = useState(49);
  const dragRef = useRef(null);
  const touchRef = useRef(0);
  const audioRef = useRef(null);
  const sourceRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playError, setPlayError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [liked, setLiked] = useState(() => { try { return JSON.parse(localStorage.getItem('corsica-soundscape-liked') || '{}'); } catch { return {}; } });
  const [popularSort, setPopularSort] = useState('likes');
  const [popular, setPopular] = useState([]);
  const [popularLoading, setPopularLoading] = useState(false);

  useEffect(() => {
    if (view !== 'popular') return undefined;
    let active = true;
    setPopularLoading(true);
    fetch(`/api/sounds/popular?sort=${popularSort}&limit=10`)
      .then((response) => { if (!response.ok) throw new Error('Classement indisponible.'); return response.json(); })
      .then((items) => { if (active) { setPopular(items); setPlayError(''); } })
      .catch((error) => { if (active) { setPlayError(error.message); onNotify(error.message, 'error'); } })
      .finally(() => { if (active) setPopularLoading(false); });
    return () => { active = false; };
  }, [view, popularSort, refreshToken, onNotify]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause(); audioRef.current = null; }
    sourceRef.current?.release(); sourceRef.current = null;
    setProgress(0); setDuration(0);
  }, []);
  useEffect(() => stopPlayback, [stopPlayback]);

  async function toggleLike(sound) {
    if (!profile || !sound.synced) return;
    const next = !liked[sound.id];
    try {
      const response = await fetch(`/api/sounds/${sound.id}/like`, { method: next ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: profile.id }) });
      if (!response.ok) throw new Error('Le like n’a pas pu être enregistré.');
      const updated = { ...liked, [sound.id]: next };
      setLiked(updated); localStorage.setItem('corsica-soundscape-liked', JSON.stringify(updated));
      const likesCount = Math.max(0, (sound.likesCount || 0) + (next ? 1 : -1));
      onStatsChange(sound.id, { likesCount });
      setPopular((items) => items.map((item) => item.id === sound.id ? { ...item, likesCount } : item));
      navigator.vibrate?.(12); onNotify(next ? 'Ajouté à vos favoris' : 'Retiré des favoris');
    } catch (error) { setPlayError(error.message); onNotify(error.message, 'error'); }
  }

  async function handlePlay(sound) {
    setPlayError('');
    if (playingId === sound.id) { stopPlayback(); setPlayingId(null); return; }
    const source = getAudioSource(sound);
    if (!source) { setPlayError('Le fichier audio de ce son est indisponible.'); return; }
    stopPlayback(); sourceRef.current = source;
    const audio = new Audio(source.url); audioRef.current = audio;
    audio.ontimeupdate = () => setProgress(audio.currentTime);
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.onended = () => { stopPlayback(); setPlayingId(null); };
    setPlayingId(sound.id);
    try {
      await audio.play();
      if (profile && sound.synced) fetch(`/api/sounds/${sound.id}/listen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: profile.id }) })
        .then((response) => { if (response.ok) { const listensCount = (sound.listensCount || 0) + 1; onStatsChange(sound.id, { listensCount }); setPopular((items) => items.map((item) => item.id === sound.id ? { ...item, listensCount } : item)); } }).catch(() => {});
    } catch { if (audioRef.current === audio) { stopPlayback(); setPlayingId(null); setPlayError('Ce son n’a pas pu être lu. Vérifiez la connexion.'); } }
  }

  async function refresh() {
    setRefreshing(true);
    try { await onRefresh(); setRefreshToken((value) => value + 1); window.dispatchEvent(new Event('soundscape-refresh')); onNotify('La liste est à jour'); }
    catch { onNotify('Actualisation impossible. Vérifiez le réseau.', 'error'); }
    finally { setRefreshing(false); }
  }

  async function share(sound) {
    const url = new URL(window.location.href); url.searchParams.set('sound', sound.id);
    try { if (navigator.share) await navigator.share({ title: sound.title, url: url.toString() }); else { await navigator.clipboard.writeText(url.toString()); onNotify('Lien copié'); } }
    catch (error) { if (error.name !== 'AbortError') onNotify('Partage impossible', 'error'); }
  }

  const seek = (event) => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); };
  const source = view === 'popular' ? popular : sounds;
  const filtered = filter === 'all' ? source : source.filter((sound) => sound.category === filter);

  return <aside className={`sound-panel ${view !== 'map' && view !== 'trails' ? 'full-page' : ''}`} style={{ '--sheet-height': `${sheetHeight}%` }}>
    <div className="sheet-grip" onPointerDown={(event) => { dragRef.current = { y: event.clientY, height: sheetHeight }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!dragRef.current || innerWidth > 768) return; setSheetHeight(Math.max(26, Math.min(88, dragRef.current.height + (dragRef.current.y - event.clientY) / innerHeight * 100))); }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} role="slider" tabIndex={0} aria-label="Hauteur de la liste" aria-valuemin={26} aria-valuemax={88} aria-valuenow={sheetHeight} onKeyDown={(event) => { if (event.key === 'ArrowUp') setSheetHeight((h) => Math.min(88, h + 10)); if (event.key === 'ArrowDown') setSheetHeight((h) => Math.max(26, h - 10)); }}><span /><ChevronUp size={15} /></div>
    <div className="panel-header"><div className="panel-title-row"><div><span className="eyebrow">EXPLORER LA CORSE</span><h2>{view === 'popular' ? 'Les plus écoutés' : view === 'trails' ? 'Parcours sonores' : view === 'profile' ? 'Mon profil' : view === 'detail' ? 'Détail du son' : 'Les sons de l’île'}</h2></div><button className="refresh-btn" onClick={refresh} title="Actualiser" aria-label="Actualiser"><RefreshCw size={17} className={refreshing ? 'spinning' : ''} /></button></div><p className="sound-count">{view === 'map' || view === 'popular' ? `${filtered.length} son${filtered.length > 1 ? 's' : ''} à découvrir` : 'Laissez-vous guider'}{outboxCount > 0 && <span className="outbox-badge"><Clock size={12} /> {outboxCount} en attente</span>}</p>{view === 'popular' && <div className="popular-sort"><label htmlFor="popular-sort">Classer par </label><select id="popular-sort" value={popularSort} onChange={(event) => setPopularSort(event.target.value)}><option value="likes">J’aime</option><option value="listens">Écoutes</option></select></div>}</div>
    {(view === 'map' || view === 'popular') && <div className="filter-bar">{categories.map((item) => <button key={item.value} className={`filter-chip ${filter === item.value ? 'active' : ''}`} onClick={() => setFilter(item.value)} aria-pressed={filter === item.value}><span aria-hidden="true">{item.emoji}</span>{item.label}</button>)}</div>}
    <div className="sound-list" onTouchStart={(event) => { touchRef.current = event.currentTarget.scrollTop === 0 ? event.touches[0].clientY : 0; }} onTouchEnd={(event) => { if (touchRef.current && event.changedTouches[0].clientY - touchRef.current > 90) refresh(); touchRef.current = 0; }}>
      {view === 'trails' ? <Trails sounds={sounds} profile={profile} onSelectSound={onSelectSound} onSelectTrail={onSelectTrail} /> : view === 'profile' ? <section className="profile-page"><div className="profile-hero"><span className="profile-avatar">{profile?.nickname?.[0]?.toUpperCase() || 'C'}</span><div><strong>{profile?.nickname || 'Explorateur'}</strong><p>Membre de la carte sonore</p></div></div><h3>Préférences</h3><label htmlFor="theme-choice">Apparence</label><select id="theme-choice" value={theme} onChange={(event) => onThemeChange(event.target.value)}><option value="system">Automatique</option><option value="light">Clair</option><option value="dark">Sombre</option></select><h3>Notifications</h3><PushButton /></section> : view === 'detail' && selectedSound ? <section className="detail-page"><button className="back-link" onClick={() => onViewChange('map')}><ArrowLeft size={18} /> Retour aux sons</button><div className="detail-mini-map"><MapContainer key={selectedSound.id} center={[selectedSound.latitude, selectedSound.longitude]} zoom={12} zoomControl={false} scrollWheelZoom={false} dragging={false} style={{ width: '100%', height: '100%' }}><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" /><CircleMarker center={[selectedSound.latitude, selectedSound.longitude]} radius={9} pathOptions={{ color: '#1B6B93', fillColor: '#1B6B93', fillOpacity: .9 }} /></MapContainer><span><MapPin size={16} /> {Number(selectedSound.latitude).toFixed(3)}, {Number(selectedSound.longitude).toFixed(3)}</span></div><span className="category-label">{category(selectedSound.category).emoji} {category(selectedSound.category).label}</span><h2>{selectedSound.title}</h2><p className="detail-description">{selectedSound.description || 'Une ambiance sonore de Corse.'}</p><p className="detail-meta">Par <strong>{selectedSound.nickname || 'Anonyme'}</strong> · {new Date(selectedSound.createdAt).toLocaleDateString('fr-FR')}</p><div className="detail-player"><button className="play-btn" onClick={() => handlePlay(selectedSound)} aria-label={playingId === selectedSound.id ? 'Pause' : 'Écouter'}>{playingId === selectedSound.id ? <Pause /> : <Play />}</button><div className={`waveform ${playingId === selectedSound.id ? 'active' : ''}`} aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ '--i': i, height: `${15 + (i * 17 % 38)}px` }} />)}</div><span>{formatTime(progress)} / {formatTime(duration)}</span><input type="range" aria-label="Position de lecture" min="0" max={duration || 0} value={Math.min(progress, duration || 0)} onChange={seek} /></div><div className="detail-actions"><button className={liked[selectedSound.id] ? 'liked' : ''} onClick={() => toggleLike(selectedSound)} disabled={!selectedSound.synced}><Heart size={19} fill={liked[selectedSound.id] ? 'currentColor' : 'none'} /> {selectedSound.likesCount || 0} j’aime</button><button onClick={() => share(selectedSound)}><Share2 size={19} /> Partager</button></div><Comments sound={selectedSound} profile={profile} onNotify={onNotify} /></section> : <>
        {playError && <p className="error-msg" role="alert">{playError}</p>}
        {loading || popularLoading ? Array.from({ length: 3 }, (_, i) => <div className="skeleton-card" key={i}><span /><span /><span /></div>) : filtered.length === 0 ? <EmptyState /> : filtered.map((sound) => <article key={sound.id} className={`sound-card ${selectedSound?.id === sound.id ? 'selected' : ''} ${!sound.synced && sound.id?.startsWith('local-') ? 'pending' : ''}`} onClick={() => onSelectSound(sound)}><div className={`sound-card-art category-${sound.category}`}><span>{category(sound.category).emoji}</span><small>{category(sound.category).label}</small></div><div className="sound-card-content"><div className="sound-card-header"><div className="sound-info"><h3>{sound.title}</h3>{sound.description && <p className="sound-desc">{sound.description}</p>}<p className="sound-meta">Par {sound.nickname || 'Anonyme'} · {new Date(sound.createdAt).toLocaleDateString('fr-FR')}{!sound.synced && sound.id?.startsWith('local-') && <span className="sync-pending"> · <Clock size={12} /> Non synchronisé</span>}</p></div></div><div className="mini-player" onClick={(event) => event.stopPropagation()}><button className={`play-btn ${playingId === sound.id ? 'playing' : ''}`} onClick={() => handlePlay(sound)} aria-label={playingId === sound.id ? 'Pause' : 'Écouter'}>{playingId === sound.id ? <Pause size={17} /> : <Play size={17} />}</button><input type="range" min="0" max={playingId === sound.id ? duration || 0 : 0} value={playingId === sound.id ? Math.min(progress, duration || 0) : 0} onChange={seek} aria-label={`Position de lecture : ${sound.title}`} /><span>{playingId === sound.id ? formatTime(progress) : '0:00'} / {playingId === sound.id ? formatTime(duration) : '—:—'}</span></div><div className="sound-actions"><button type="button" className={liked[sound.id] ? 'liked' : ''} aria-label={liked[sound.id] ? 'Retirer le like' : 'Aimer ce son'} aria-pressed={!!liked[sound.id]} disabled={!sound.synced} onClick={(event) => { event.stopPropagation(); toggleLike(sound); }}><Heart size={16} fill={liked[sound.id] ? 'currentColor' : 'none'} /> {sound.likesCount || 0}</button><span><Headphones size={16} /> {sound.listensCount || 0}</span><button className="details-link" onClick={(event) => { event.stopPropagation(); onSelectSound(sound); onViewChange('detail'); }}>Voir le détail →</button></div></div></article>)}
      </>}
    </div>
  </aside>;
}
