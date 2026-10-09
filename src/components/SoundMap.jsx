// ============================================================
// Composant : Carte Leaflet interactive
// ============================================================
// Affiche la carte de la Corse avec les marqueurs sonores.
// Chaque marqueur est cliquable et ouvre un popup avec titre + play.
// ============================================================

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import { Clock } from 'lucide-react';
import CategoryIcon from './CategoryIcon';
import merIcon from '../assets/icons/mer.svg?raw';
import natureIcon from '../assets/icons/nature.svg?raw';
import villageIcon from '../assets/icons/village.svg?raw';
import animalIcon from '../assets/icons/animal.svg?raw';
import musiqueIcon from '../assets/icons/musique.svg?raw';
import marcheIcon from '../assets/icons/marche.svg?raw';
import autreIcon from '../assets/icons/autre.svg?raw';

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
const categoryIcons = {
  mer: merIcon,
  nature: natureIcon,
  village: villageIcon,
  animal: animalIcon,
  musique: musiqueIcon,
  marche: marcheIcon,
  autre: autreIcon,
};

function createCategoryIcon(category, selected) {
  const svg = categoryIcons[category] || autreIcon;
  return L.divIcon({
    html: `<div class="map-marker${selected ? ' selected' : ''}">${svg}</div>`,
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
          icon={createCategoryIcon(sound.category, selectedSound?.id === sound.id)}
          eventHandlers={{
            click: () => onSelectSound(sound),
          }}
        >
          <Popup>
            <div className="map-popup">
              <strong className="map-popup-title">
                <CategoryIcon category={sound.category} size={18} /> {sound.title}
              </strong>
              {sound.description && (
                <p className="map-popup-description">
                  {sound.description}
                </p>
              )}
              <p className="map-popup-meta">
                {new Date(sound.createdAt).toLocaleDateString('fr-FR')}
                {!sound.synced && sound.id?.startsWith('local-') && (
                  <span className="sync-pending"><Clock size={12} aria-hidden="true" /> En attente de sync</span>
                )}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
