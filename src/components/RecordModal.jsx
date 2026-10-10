import { useState, useRef, useCallback, useEffect } from 'react';
import { LocateFixed, MapPin, Mic, RotateCcw, Save, X } from 'lucide-react';
import LocationPicker from './LocationPicker';
import { createAudioRecorder } from '../utils/recorder';
import { parsePosition } from '../utils/position';
import './RecordModal.css';

const categories = [
  { value: 'mer', label: 'Mer / Plage' },
  { value: 'nature', label: 'Nature / Maquis' },
  { value: 'village', label: 'Village / Cloches' },
  { value: 'animal', label: 'Animal' },
  { value: 'musique', label: 'Musique' },
  { value: 'marche', label: 'Marché' },
  { value: 'autre', label: 'Autre' },
];

export default function RecordModal({ onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('nature');

  const [phase, setPhase] = useState('idle');
  const [audio, setAudio] = useState(null);
  const [duration, setDuration] = useState(0);
  const recorderRef = useRef(null);
  const session = useRef({ active: true, geoRequest: 0 });
  const savingRef = useRef(false);

  const [gpsPosition, setGpsPosition] = useState(null);
  const [manual, setManual] = useState(false);
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' });
  const [geoError, setGeoError] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const [micError, setMicError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const position = manual ? parsePosition(coordinates.latitude, coordinates.longitude) : gpsPosition;
  const recording = phase === 'recording';

  const cancelRequests = useCallback(() => {
    session.current.active = false;
    session.current.geoRequest++;
  }, []);

  useEffect(() => {
    session.current.active = true;
    const recorder = createAudioRecorder({
      onState: setPhase, onAudio: setAudio, onDuration: setDuration, onError: setMicError,
    });
    recorderRef.current = recorder;
    return () => {
      cancelRequests();
      recorder.destroy();
    };
  }, [cancelRequests]);

  const handleClose = useCallback(() => {
    if (savingRef.current) return;
    cancelRequests();
    recorderRef.current?.destroy();
    onClose();
  }, [onClose, cancelRequests]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handleClose]);

  const requestLocation = useCallback(async () => {
    const request = ++session.current.geoRequest;
    setGeoLoading(true);
    setGeoError(null);

    if (!('geolocation' in navigator)) {
      setGeoError('Géolocalisation non supportée par ce navigateur.');
      setGeoLoading(false);
      return;
    }

    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });
      if (!session.current.active || request !== session.current.geoRequest) return;
      setGpsPosition({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      setManual(false);
    } catch (err) {
      if (!session.current.active || request !== session.current.geoRequest) return;
      switch (err.code) {
        case 1:
          setGeoError('Position refusée. Choisissez le lieu sur la carte ou saisissez ses coordonnées.');
          break;
        case 2:
          setGeoError('Position indisponible. Vérifiez votre GPS.');
          break;
        case 3:
          setGeoError('Délai dépassé. Réessayez à l\'extérieur.');
          break;
        default:
          setGeoError('Erreur de géolocalisation.');
      }
    } finally {
      if (session.current.active && request === session.current.geoRequest) setGeoLoading(false);
    }
  }, []);

  function chooseManualPosition() {
    session.current.geoRequest++;
    setGeoLoading(false);
    setCoordinates(position ? {
      latitude: String(position.latitude), longitude: String(position.longitude),
    } : { latitude: '', longitude: '' });
    setManual(true);
  }

  function pickPosition(value) {
    session.current.geoRequest++;
    setGeoLoading(false);
    setCoordinates({ latitude: value.latitude.toFixed(6), longitude: value.longitude.toFixed(6) });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (savingRef.current || !title.trim() || !audio || !position || phase !== 'idle') return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        category,
        latitude: position.latitude,
        longitude: position.longitude,
        audioBlob: audio.blob,
      });
      if (session.current.active) {
        recorderRef.current?.destroy();
        cancelRequests();
        onClose();
      }
    } catch {
      if (session.current.active) setSaveError('La sauvegarde a échoué. Votre enregistrement est conservé dans ce formulaire. Réessayez.');
    } finally {
      savingRef.current = false;
      if (session.current.active) setSaving(false);
    }
  }

  const formatDuration = (s) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <form className="modal" onSubmit={handleSave} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="record-title" aria-busy={saving}>
        <div className="modal-header">
          <h2 id="record-title">Enregistrer un son</h2>
          <button type="button" className="modal-close" onClick={handleClose} aria-label="Fermer" disabled={saving}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <fieldset className="modal-body" disabled={saving}>
          {/* Zone d'enregistrement */}
          <div className="record-zone">
            {!audio ? (
              <button
                type="button"
                className={`record-btn ${recording ? 'recording' : ''}`}
                onClick={() => recording ? recorderRef.current.stop() : recorderRef.current.start()}
                disabled={phase === 'requesting' || phase === 'stopping'}
              >
                {recording ? (
                  <>
                    <span className="record-dot" />
                    {formatDuration(duration)} — Appuyez pour arrêter
                  </>
                ) : phase === 'requesting' ? 'Autorisez le microphone…' : phase === 'stopping' ? 'Préparation du son…' : (
                  <><Mic size={20} aria-hidden="true" /> Appuyez pour enregistrer</>
                )}
              </button>
            ) : (
              <div className="audio-preview">
                <audio src={audio.url} controls />
                <button
                  className="re-record-btn"
                  type="button"
                  onClick={() => { recorderRef.current.discard(); setSaveError(null); setDuration(0); }}
                >
                  <RotateCcw size={16} aria-hidden="true" /> Réenregistrer
                </button>
              </div>
            )}

            {micError && <p className="error-msg" role="alert">{micError}</p>}
          </div>

          {/* Formulaire */}
          <div className="form-group">
            <label htmlFor="title">Titre *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Vagues à Palombaggia"
              maxLength={80}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez l'ambiance, le moment…"
              rows={2}
              maxLength={300}
            />
          </div>

          <div className="form-group">
            <label htmlFor="category">Catégorie</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Position GPS */}
          <div className="form-group">
            <span className="position-label">Position du son *</span>
            <div className="position-actions">
              <button type="button" className="geo-btn" onClick={requestLocation} disabled={geoLoading}>
                <LocateFixed size={16} aria-hidden="true" /> {geoLoading ? 'Localisation…' : 'Obtenir ma position'}
              </button>
              <button type="button" className="geo-btn" onClick={chooseManualPosition}>
                <MapPin size={16} aria-hidden="true" /> Choisir le lieu
              </button>
            </div>
            {geoError && <p className="error-msg" role="alert">{geoError}</p>}
            {manual && <LocationPicker
              position={position} onChange={pickPosition}
              latitude={coordinates.latitude} longitude={coordinates.longitude}
              onCoordinatesChange={(field, value) => {
                session.current.geoRequest++;
                setGeoLoading(false);
                setCoordinates((current) => ({ ...current, [field]: value }));
              }}
            />}
            {position && (
              <p className="geo-info">
                <MapPin size={16} aria-hidden="true" /> {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}
              </p>
            )}
            {!position && !manual && <p className="form-help">Obtenez votre position ou choisissez le lieu avant de sauvegarder.</p>}
          </div>
          {saveError && <p className="error-msg" role="alert">{saveError}</p>}
        </fieldset>

        <div className="modal-footer">
          <button type="button" className="cancel-btn" onClick={handleClose} disabled={saving}>
            Annuler
          </button>
          <button
            className="save-btn"
            type="submit"
            disabled={saving || !title.trim() || !audio || !position || phase !== 'idle'}
          >
            <Save size={16} aria-hidden="true" /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </form>
    </div>
  );
}
