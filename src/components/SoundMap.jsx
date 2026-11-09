// ============================================================
// Composant : Carte Leaflet interactive
// ============================================================
// Affiche la carte de la Corse avec les marqueurs sonores.
// Chaque marqueur est cliquable et ouvre un popup avec titre + play.
// ============================================================

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
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

const CORSICA_CENTER = [42.15, 9.1];
const CORSICA_ZOOM = 8;
const CORSICA_BOUNDS = L.latLngBounds([41.35, 8.55], [43.05, 9.65]);

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
      map.flyTo(CORSICA_BOUNDS.contains(position) ? position : CORSICA_CENTER, 14, { duration: 1 });
    }
  }, [position, map]);
  return null;
}

function FitTrail({ trail }) {
  const map = useMap();
  useEffect(() => {
    if (trail?.steps?.length) {
      map.fitBounds(trail.steps.map((step) => {
        const point = [step.sound.latitude, step.sound.longitude];
        return CORSICA_BOUNDS.contains(point) ? point : CORSICA_CENTER;
      }), { padding: [35, 35], maxZoom: 13 });
    }
  }, [trail, map]);
  return null;
}

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function ClusteredSounds({ sounds, selectedSound, onSelectSound }) {
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()), moveend: () => setZoom(map.getZoom()) });
  const [zoom, setZoom] = useState(map.getZoom());
  const groups = useMemo(() => {
    const buckets = new Map();
    for (const sound of sounds) {
      if (!Number.isFinite(Number(sound.latitude)) || !Number.isFinite(Number(sound.longitude))) continue;
      const point = map.project([sound.latitude, sound.longitude], zoom);
      const key = `${Math.floor(point.x / 55)}:${Math.floor(point.y / 55)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(sound);
    }
    return [...buckets.values()];
  }, [sounds, zoom, map]);
  return groups.map((group) => {
    if (group.length > 1) {
      const bounds = L.latLngBounds(group.map((sound) => [sound.latitude, sound.longitude]));
      const position = bounds.getCenter();
      const icon = L.divIcon({ html: `<span class="sound-cluster">${group.length}</span>`, className: '', iconSize: [42, 42], iconAnchor: [21, 21] });
      return <Marker key={`cluster-${group.map((sound) => sound.id).join('-')}`} position={position} icon={icon} eventHandlers={{ click: () => map.fitBounds(bounds, { padding: [48, 48], maxZoom: Math.min(map.getZoom() + 2, 18) }) }} />;
    }
    const sound = group[0];
    return <Marker key={sound.id} position={[sound.latitude, sound.longitude]} icon={createCategoryIcon(sound.category, selectedSound?.id === sound.id)} eventHandlers={{ click: () => onSelectSound(sound) }}><Popup><div className="map-popup"><strong className="map-popup-title"><CategoryIcon category={sound.category} size={18} /> {sound.title}</strong>{sound.description && <p className="map-popup-description">{sound.description}</p>}<p className="map-popup-meta">{new Date(sound.createdAt).toLocaleDateString('fr-FR')}{!sound.synced && sound.id?.startsWith('local-') && <span className="sync-pending"><Clock size={12} /> En attente de sync</span>}</p></div></Popup></Marker>;
  });
}

export default function SoundMap({ sounds, selectedSound, onSelectSound, flyTo, trail }) {
  return (
    <MapContainer
      center={CORSICA_CENTER}
      zoom={CORSICA_ZOOM}
      minZoom={7}
      maxZoom={18}
      maxBounds={CORSICA_BOUNDS}
      maxBoundsViscosity={1}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ResizeMap />

      {flyTo && <FlyToLocation position={flyTo} />}
      {trail && <FitTrail trail={trail} />}
      {trail?.steps?.length > 1 && <Polyline positions={trail.steps.map((step) => [step.sound.latitude, step.sound.longitude])} pathOptions={{ color: '#d47643', weight: 4 }} />}
      {trail?.steps?.map((step) => <Marker key={`trail-${step.position}`} position={[step.sound.latitude, step.sound.longitude]} icon={L.divIcon({ html: `<span class="trail-map-number">${Number(step.position)}</span>`, className: '', iconSize: [28, 28], iconAnchor: [14, 14] })} eventHandlers={{ click: () => onSelectSound(step.sound) }}><Popup>{step.position}. {step.sound.title}</Popup></Marker>)}

      <ClusteredSounds sounds={sounds} selectedSound={selectedSound} onSelectSound={onSelectSound} />
    </MapContainer>
  );
}
