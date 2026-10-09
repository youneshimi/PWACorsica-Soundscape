// ============================================================
// Composant : Modal d'enregistrement sonore
// ============================================================
// Utilise MediaRecorder API (micro) et Geolocation API.
// Les permissions sont demandées APRÈS une action utilisateur
// (clic sur le bouton "Enregistrer"), comme exigé par le TP.
// Le refus est géré avec un message clair, pas une erreur.
// ============================================================

import { useState, useRef, useCallback } from 'react';
import { LocateFixed, MapPin, Mic, RotateCcw, Save, X } from 'lucide-react';
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

export default function RecordModal({ isOpen, onClose, onSave }) {
  // État du formulaire
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('nature');

  // État d'enregistrement
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // Géolocalisation
  const [position, setPosition] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // Erreurs
  const [micError, setMicError] = useState(null);

  // -- GÉOLOCALISATION ------------------------------------------
  // Demandée au clic (pas au chargement !) pour respecter les bonnes
  // pratiques : la permission a du sens à ce moment car l'utilisateur
  // veut placer un son sur la carte.
  const requestLocation = useCallback(async () => {
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
      setPosition({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    } catch (err) {
      // Gestion explicite du refus — pas de crash, message clair
      switch (err.code) {
        case err.PERMISSION_DENIED:
          setGeoError('Position refusée. Vous pouvez placer le son manuellement sur la carte.');
          break;
        case err.POSITION_UNAVAILABLE:
          setGeoError('Position indisponible. Vérifiez votre GPS.');
          break;
        case err.TIMEOUT:
          setGeoError('Délai dépassé. Réessayez à l\'extérieur.');
          break;
        default:
          setGeoError('Erreur de géolocalisation.');
      }
    } finally {
      setGeoLoading(false);
    }
  }, []);

  // -- ENREGISTREMENT AUDIO -------------------------------------
  // MediaRecorder API — demande la permission micro au premier clic.
  const startRecording = useCallback(async () => {
    setMicError(null);
    setAudioBlob(null);
    setAudioUrl(null);
    chunksRef.current = [];

    try {
      // Demande de permission micro (après action utilisateur)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        // Stopper toutes les pistes du flux
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      setDuration(0);

      // Timer pour afficher la durée
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      // Demander la position en parallèle (si pas déjà obtenue)
      if (!position) requestLocation();
    } catch (err) {
      // Gestion du refus micro — message clair
      if (err.name === 'NotAllowedError') {
        setMicError('Accès au microphone refusé. Autorisez-le dans les paramètres du navigateur pour enregistrer.');
      } else if (err.name === 'NotFoundError') {
        setMicError('Aucun microphone détecté sur cet appareil.');
      } else {
        setMicError(`Erreur micro : ${err.message}`);
      }
    }
  }, [position, requestLocation]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    clearInterval(timerRef.current);
  }, []);

  // -- SAUVEGARDE -----------------------------------------------
  const handleSave = () => {
    if (!title.trim() || !audioBlob) return;

    // Si pas de position (refus GPS), on met un point par défaut en Corse
    const lat = position?.latitude ?? 42.15 + Math.random() * 0.3;
    const lng = position?.longitude ?? 8.9 + Math.random() * 0.5;

    onSave({
      title: title.trim(),
      description: description.trim(),
      category,
      latitude: lat,
      longitude: lng,
      audioBlob,
      audioUrl,
    });

    // Reset
    setTitle('');
    setDescription('');
    setCategory('nature');
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setPosition(null);
    onClose();
  };

  const formatDuration = (s) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Enregistrer un son</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          {/* Zone d'enregistrement */}
          <div className="record-zone">
            {!audioBlob ? (
              <button
                className={`record-btn ${recording ? 'recording' : ''}`}
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? (
                  <>
                    <span className="record-dot" />
                    {formatDuration(duration)} — Appuyez pour arrêter
                  </>
                ) : (
                  <><Mic size={20} aria-hidden="true" /> Appuyez pour enregistrer</>
                )}
              </button>
            ) : (
              <div className="audio-preview">
                <audio src={audioUrl} controls />
                <button
                  className="re-record-btn"
                  onClick={() => { setAudioBlob(null); setAudioUrl(null); }}
                >
                  <RotateCcw size={16} aria-hidden="true" /> Réenregistrer
                </button>
              </div>
            )}

            {micError && <p className="error-msg">{micError}</p>}
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
            <label>Position</label>
            {position ? (
              <p className="geo-info">
                <MapPin size={16} aria-hidden="true" /> {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}
              </p>
            ) : geoLoading ? (
              <p className="geo-loading"><LocateFixed size={16} aria-hidden="true" /> Localisation en cours…</p>
            ) : geoError ? (
              <div>
                <p className="error-msg">{geoError}</p>
                <button className="geo-retry-btn" onClick={requestLocation}>
                  Réessayer
                </button>
              </div>
            ) : (
              <button className="geo-btn" onClick={requestLocation}>
                <MapPin size={16} aria-hidden="true" /> Obtenir ma position
              </button>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={!title.trim() || !audioBlob}
          >
            <Save size={16} aria-hidden="true" /> Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}
