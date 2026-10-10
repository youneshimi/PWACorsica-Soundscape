export function parsePosition(latitude, longitude) {
  if (String(latitude ?? '').trim() === '' || String(longitude ?? '').trim() === '') return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}
