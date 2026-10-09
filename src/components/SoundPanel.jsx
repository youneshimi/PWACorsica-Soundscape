// ============================================================
// Composant : Panneau latéral — liste des sons + player
// ============================================================

import { useState, useRef } from 'react';
import { Clock, Headphones, Pause, Play, X } from 'lucide-react';
import CategoryIcon from './CategoryIcon';
import './SoundPanel.css';

const categories = [
  { value: 'all', label: 'Tous' },
  { value: 'mer', label: 'Mer' },
  { value: 'nature', label: 'Nature' },
  { value: 'village', label: 'Village' },
  { value: 'animal', label: 'Animal' },
  { value: 'musique', label: 'Musique' },
  { value: 'marche', label: 'Marché' },
  { value: 'autre', label: 'Autre' },
];

export default function SoundPanel({ sounds, selectedSound, onSelectSound, outboxCount }) {
  const [filter, setFilter] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);

  const filtered = filter === 'all'
    ? sounds
    : sounds.filter((s) => s.category === filter);

  const handlePlay = (sound) => {
    if (playingId === sound.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    // Si c'est un blob local (pas encore synchronisé)
    const src = sound.audioUrl || (sound.audioBlob ? URL.createObjectURL(sound.audioBlob) : null);
    if (!src) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.play();
    setPlayingId(sound.id);
    audio.onended = () => setPlayingId(null);
  };

  return (
    <>
      {/* Bouton toggle mobile */}
      <button
        className="panel-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Fermer la liste' : 'Ouvrir la liste'}
      >
        {isOpen ? <X size={20} aria-hidden="true" /> : <Headphones size={20} aria-hidden="true" />}
        {outboxCount > 0 && <span className="badge">{outboxCount}</span>}
      </button>

      <aside className={`sound-panel ${isOpen ? 'open' : ''}`}>
        <div className="panel-header">
          <h2>Sons de la Corse</h2>
          <p className="sound-count">
            {filtered.length} son{filtered.length > 1 ? 's' : ''}
            {outboxCount > 0 && (
              <span className="outbox-badge">
                <Clock size={12} aria-hidden="true" /> {outboxCount} en attente
              </span>
            )}
          </p>
        </div>

        {/* Filtre par catégorie */}
        <div className="filter-bar">
          {categories.map((cat) => (
            <button
              key={cat.value}
              className={`filter-chip ${filter === cat.value ? 'active' : ''}`}
              onClick={() => setFilter(cat.value)}
              aria-pressed={filter === cat.value}
            >
              {cat.value !== 'all' && <CategoryIcon category={cat.value} size={16} />}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Liste des sons */}
        <div className="sound-list">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <p>Aucun son dans cette catégorie.</p>
              <p className="hint">Enregistrez un son pour le partager ici.</p>
            </div>
          ) : (
            filtered.map((sound) => (
              <div
                key={sound.id}
                className={`sound-card ${selectedSound?.id === sound.id ? 'selected' : ''} ${!sound.synced && sound.id?.startsWith('local-') ? 'pending' : ''}`}
                onClick={() => onSelectSound(sound)}
              >
                <div className="sound-card-header">
                  <span className="sound-icon">
                    <CategoryIcon category={sound.category} size={22} />
                  </span>
                  <div className="sound-info">
                    <h3>{sound.title}</h3>
                    {sound.description && (
                      <p className="sound-desc">{sound.description}</p>
                    )}
                    <p className="sound-meta">
                      {new Date(sound.createdAt).toLocaleDateString('fr-FR')}
                      {!sound.synced && sound.id?.startsWith('local-') && (
                        <span className="sync-pending"> · <Clock size={12} aria-hidden="true" /> Non synchronisé</span>
                      )}
                    </p>
                  </div>
                  <button
                    className={`play-btn ${playingId === sound.id ? 'playing' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handlePlay(sound); }}
                    aria-label={playingId === sound.id ? 'Pause' : 'Écouter'}
                  >
                    {playingId === sound.id ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
