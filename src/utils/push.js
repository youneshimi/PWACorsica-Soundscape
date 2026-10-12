const TOKEN_KEY = 'soundscape-v2-push-token';

function publicKeyBytes(key) {
  return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
}

function subscriptionToken(storage) {
  let token = storage.getItem(TOKEN_KEY);
  if (!token) {
    token = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    storage.setItem(TOKEN_KEY, token);
  }
  return token;
}

async function saveSubscription(subscription, token, method, fetcher) {
  const body = method === 'DELETE' ? { endpoint: subscription.endpoint, token } : { subscription: subscription.toJSON(), token };
  const response = await fetcher('/api/push/subscribe', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || (method === 'DELETE' ? 'La désactivation a échoué. Réessayez en ligne.' : 'L’inscription a échoué. Réessayez en ligne.'));
  }
}

export async function testPush(subscription, { storage = localStorage, fetcher = fetch } = {}) {
  const token = storage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Désactivez puis réactivez les notifications sur cet appareil.');
  const response = await fetcher('/api/push/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint, token }), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'La notification de test n’a pas pu être envoyée.');
}

// Le Worker et la clé sont chargés avant le clic, pour conserver le geste utilisateur.
export async function enablePush(registration, publicKey, existing, { storage = localStorage, fetcher = fetch } = {}) {
  const token = subscriptionToken(storage);
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKeyBytes(publicKey) });
  try {
    await saveSubscription(subscription, token, 'POST', fetcher);
    storage.setItem(`${TOKEN_KEY}-active`, 'true');
    return subscription;
  } catch (error) {
    if (!existing) await subscription.unsubscribe().catch(() => {});
    throw error;
  }
}

export async function disablePush(subscription, { storage = localStorage, fetcher = fetch } = {}) {
  const token = storage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Retirez l’autorisation de notification dans les réglages du navigateur.');
  await saveSubscription(subscription, token, 'DELETE', fetcher);
  await subscription.unsubscribe();
  storage.removeItem(`${TOKEN_KEY}-active`);
}

export function pushActive(storage = localStorage) {
  return storage.getItem(`${TOKEN_KEY}-active`) === 'true';
}
