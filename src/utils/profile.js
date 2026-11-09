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
  localStorage.setItem(KEY, JSON.stringify(profile));
  try { await registerProfile(profile); } catch { /* Réessai au retour du réseau. */ }
  return profile;
}

export async function registerProfile(profile = getProfile()) {
  if (!profile) return;
  const response = await fetch('/api/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Synchronisation du profil impossible.');
}
