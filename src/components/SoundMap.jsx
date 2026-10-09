// ============================================================
// Composant : Carte Leaflet interactive
// ============================================================
// Affiche la carte de la Corse avec les marqueurs sonores.
// Chaque marqueur est cliquable et ouvre un popup avec titre + play.
// ============================================================

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';

// Fixer l'icône Leaflet par défaut (problème connu avec bundlers)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Centre de la Corse (Corte)
const CORSICA_CENTER = [42.3, 9.15];
const CORSICA_ZOOM = 9;

// Icônes par catégorie
const categoryEmoji = {
  mer: '🌊',
  nature: '🌿',
  village: '🏘️',
  animal: '🐦',
  musique: '🎵',
  marche: '🛒',
  autre: '📍',
};

function createCategoryIcon(category) {
  const emoji = categoryEmoji[category] || '📍';
  return L.divIcon({
    html: `<div style="
      font-size: 1.5rem;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1e293b;
      border: 2px solid #1a73e8;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    ">${emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
    className: '',
  });
}

// Sous-composant pour recentrer la carte
function FlyToLocation({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 14, { duration: 1 });
    }
  }, [position, map]);
  return null;
}

export default function SoundMap({ sounds, selectedSound, onSelectSound, flyTo }) {
  return (
    <MapContainer
      center={CORSICA_CENTER}
      zoom={CORSICA_ZOOM}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {flyTo && <FlyToLocation position={flyTo} />}

      {sounds.map((sound) => (
        <Marker
          key={sound.id}
          position={[sound.latitude, sound.longitude]}
          icon={createCategoryIcon(sound.category)}
          eventHandlers={{
            click: () => onSelectSound(sound),
          }}
        >
          <Popup>
            <div style={{ minWidth: 180 }}>
              <strong style={{ fontSize: '1rem' }}>
                {categoryEmoji[sound.category] || '📍'} {sound.title}
              </strong>
              {sound.description && (
                <p style={{ margin: '0.5rem 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                  {sound.description}
                </p>
              )}
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {new Date(sound.createdAt).toLocaleDateString('fr-FR')}
                {!sound.synced && sound.id?.startsWith('local-') && (
                  <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>⏳ En attente de sync</span>
                )}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
