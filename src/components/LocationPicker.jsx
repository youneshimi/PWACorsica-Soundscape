import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet';

function PickLocation({ position, onChange }) {
  const latitude = position?.latitude;
  const longitude = position?.longitude;
  const map = useMapEvents({
    click({ latlng }) {
      onChange({ latitude: latlng.lat, longitude: latlng.wrap().lng });
    },
  });

  useEffect(() => {
    if (latitude !== undefined && longitude !== undefined) map.panTo([latitude, longitude]);
  }, [map, latitude, longitude]);

  return position ? (
    <CircleMarker
      center={[position.latitude, position.longitude]}
      radius={8}
      pathOptions={{ color: '#3f604e', fillColor: '#3f604e', fillOpacity: 0.8 }}
    />
  ) : null;
}

export default function LocationPicker({ position, onChange, latitude, longitude, onCoordinatesChange }) {
  return (
    <div className="location-picker">
      <p className="form-help" id="position-help">Cliquez sur le lieu du son ou saisissez ses coordonnées. Sans réseau, la carte peut rester vide.</p>
      <MapContainer
        className="position-map"
        center={position ? [position.latitude, position.longitude] : [42.3, 9.15]}
        zoom={9}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <PickLocation position={position} onChange={onChange} />
      </MapContainer>
      <div className="position-fields">
        <div className="form-group">
          <label htmlFor="latitude">Latitude</label>
          <input id="latitude" type="number" min="-90" max="90" step="any" value={latitude}
            onChange={(event) => onCoordinatesChange('latitude', event.target.value)} aria-describedby="position-help" />
        </div>
        <div className="form-group">
          <label htmlFor="longitude">Longitude</label>
          <input id="longitude" type="number" min="-180" max="180" step="any" value={longitude}
            onChange={(event) => onCoordinatesChange('longitude', event.target.value)} aria-describedby="position-help" />
        </div>
      </div>
      {(latitude || longitude) && !position && <p className="error-msg" role="alert">Indiquez une latitude entre −90 et 90 et une longitude entre −180 et 180.</p>}
    </div>
  );
}
