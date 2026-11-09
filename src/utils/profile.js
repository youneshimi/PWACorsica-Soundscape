const KEY = 'corsica-soundscape-profile';

export function getProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(KEY));
    return profile?.id && profile?.nickname ? profile : null;
  } catch { return null; }
}

export async function createProfile(nickname) {
  const trimmed = nickname.trim();
  if (!trimmed || trimmed.length > 30) throw new Error('Le pseudo doit contenir de 1 à 30 caractères.');
  const profile = { id: crypto.randomUUID(), nickname: trimmed };
  const response = await fetch('/api/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
  });
  if (!response.ok) throw new Error((await response.json()).error || 'Création du profil impossible.');
  localStorage.setItem(KEY, JSON.stringify(profile));
  return profile;
}
