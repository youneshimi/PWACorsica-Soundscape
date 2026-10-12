import { buildPushPayload } from '@block65/webcrypto-web-push';

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function pushConfigured(env) {
  return /^[A-Za-z0-9_-]{87}$/.test(env.VAPID_PUBLIC_KEY || '') && /^[A-Za-z0-9_-]{43}$/.test(env.VAPID_PRIVATE_KEY || '');
}

let checkedKeys;
let keyCheck;

export async function vapidKeysValid(env) {
  if (!pushConfigured(env)) return false;
  const keys = `${env.VAPID_PUBLIC_KEY}:${env.VAPID_PRIVATE_KEY}`;
  if (keys !== checkedKeys) {
    checkedKeys = keys;
    keyCheck = (async () => {
      try {
        const bytes = Uint8Array.from(atob(env.VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
        const encode = (part) => btoa(String.fromCharCode(...part)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
        const privateKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: encode(bytes.slice(1, 33)), y: encode(bytes.slice(33)), d: env.VAPID_PRIVATE_KEY }, algorithm, false, ['sign']);
        const publicKey = await crypto.subtle.importKey('raw', bytes, algorithm, false, ['verify']);
        const data = new TextEncoder().encode('soundscape-vapid');
        const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data);
        return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, data);
      } catch { return false; }
    })();
  }
  return keyCheck;
}

export function validEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com');
    return allowed && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && url.pathname !== '/';
  } catch { return false; }
}

function validKey(value, size) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return decoded.length === size && (size !== 65 || decoded.charCodeAt(0) === 4);
  } catch { return false; }
}

async function tokenHash(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error('body'); }
    chunks.push(value);
  }
  return JSON.parse(await new Blob(chunks).text());
}

export async function handlePush(request, env, storage, fetcher = fetch) {
  const path = new URL(request.url).pathname;
  if (path === '/api/push/config' && request.method === 'GET') {
    const validKeys = await vapidKeysValid(env);
    const enabled = validKeys && Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'));
    const error = pushConfigured(env) && !validKeys ? 'Les clés VAPID publique et privée ne correspondent pas. Recopiez la même paire dans Cloudflare.' : undefined;
    return json({ enabled, publicKey: enabled ? env.VAPID_PUBLIC_KEY : null, ...(error ? { error } : {}) });
  }
  const testing = path === '/api/push/test';
  if (path !== '/api/push/subscribe' && !testing) return json({ error: 'Route inconnue.' }, 404);
  if (!(testing ? ['POST'] : ['POST', 'DELETE']).includes(request.method)) return json({ error: 'Méthode non autorisée.' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origine non autorisée.' }, 403);
  if (request.method !== 'DELETE' && !(await vapidKeysValid(env))) return json({ error: 'Vérifiez les deux clés VAPID dans Cloudflare : elles doivent provenir de la même paire.' }, 503);
  let input;
  try { input = await readJson(request); } catch { return json({ error: 'Demande invalide.' }, 400); }
  if (!input || !/^[a-f0-9]{64}$/.test(input.token || '')) return json({ error: 'Jeton invalide.' }, 400);
  const endpoint = request.method === 'POST' && !testing ? input.subscription?.endpoint : input.endpoint;
  if (!validEndpoint(endpoint)) return json({ error: 'Abonnement invalide.' }, 400);
  const hash = await tokenHash(input.token);
  if (testing) {
    const query = new URLSearchParams({ endpoint: `eq.${endpoint}`, token_hash: `eq.${hash}`, select: 'endpoint,p256dh,auth', limit: '1' });
    const response = await storage.call(`/rest/v1/push_subscriptions_v2?${query}`);
    if (!response.ok) return json({ error: 'La table des abonnements est indisponible. Vérifiez le SQL Supabase.' }, 502);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return json({ error: 'Cet appareil n’est plus inscrit sur le serveur. Désactivez puis réactivez les notifications.' }, 404);
    const result = await deliverPush(storage, env, rows[0], {
      data: JSON.stringify({ title: 'Test Corsica Soundscape', body: 'Les notifications sont prêtes sur cet appareil.', url: '/', tag: 'soundscape-push-test' }),
      options: { ttl: 300, urgency: 'high' },
    }, fetcher);
    if (result.state === 'sent') return json({ ok: true });
    const error = result.state === 'expired' ? 'Cet abonnement a expiré. Désactivez puis réactivez les notifications.'
      : [401, 403].includes(result.status) ? 'Le service push refuse l’autorisation du serveur. Vérifiez les clés VAPID et réabonnez cet appareil si les clés ont changé.'
      : 'Le service push n’a pas accepté l’envoi. Réessayez puis consultez les logs Cloudflare.';
    return json({ error, ...(result.status ? { providerStatus: result.status } : {}) }, 502);
  }
  if (request.method === 'DELETE') {
    const query = new URLSearchParams({ endpoint: `eq.${endpoint}`, token_hash: `eq.${hash}` });
    const response = await storage.call(`/rest/v1/push_subscriptions_v2?${query}`, { method: 'DELETE' });
    return response.ok ? json({ ok: true }) : json({ error: 'Désactivation impossible pour le moment.' }, 502);
  }
  const keys = input.subscription?.keys;
  if (!validKey(keys?.p256dh, 65) || !validKey(keys?.auth, 16)) return json({ error: 'Clés d’abonnement invalides.' }, 400);
  const response = await storage.call('/rest/v1/rpc/register_push_subscription_v2', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_token_hash: hash }),
  });
  if (!response.ok) return json({ error: 'Inscription impossible pour le moment.' }, 502);
  if (await response.json() !== true) return json({ error: 'Abonnement déjà associé ou limite d’abonnés atteinte.' }, 409);
  return json({ ok: true }, 201);
}

async function deliverPush(storage, env, row, message, fetcher = fetch) {
  const provider = validEndpoint(row.endpoint) ? new URL(row.endpoint).hostname : 'invalid';
  let stage = 'encrypt';
  try {
    if (!validEndpoint(row.endpoint)) throw new Error('invalid endpoint');
    const vapid = { subject: env.VAPID_SUBJECT || 'https://pwacorsica-soundscape.ounesshimi.workers.dev/', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
    const payload = await buildPushPayload(message, { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, vapid);
    stage = 'send';
    // Cloudflare accepte « manual » ; un statut 3xx reste un échec sans second envoi.
    const delivery = await fetcher(row.endpoint, { ...payload, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    await delivery.body?.cancel();
    if (!delivery.ok) console.warn('[Push V2] Refus du fournisseur', { provider, status: delivery.status });
    if ([404, 410].includes(delivery.status)) {
      stage = 'cleanup';
      const query = new URLSearchParams({ endpoint: `eq.${row.endpoint}` });
      const removed = await storage.call(`/rest/v1/push_subscriptions_v2?${query}`, { method: 'DELETE' });
      if (!removed.ok) throw new Error('cleanup failed');
      return { state: 'expired', status: delivery.status };
    }
    return { state: delivery.ok ? 'sent' : 'failed', status: delivery.status };
  } catch {
    console.warn('[Push V2] Échec', { provider, stage });
    return { state: 'failed' };
  }
}

export async function notifyNewSound(storage, env, sound, fetcher = fetch) {
  if (!(await vapidKeysValid(env))) {
    console.warn('[Push V2] Configuration VAPID invalide.');
    return;
  }
  const response = await storage.call('/rest/v1/push_subscriptions_v2?select=endpoint,p256dh,auth&order=created_at.asc&limit=20');
  if (!response.ok) {
    console.warn('[Push V2] Lecture des abonnements impossible', { status: response.status });
    throw new Error('push subscriptions unavailable');
  }
  const subscriptions = await response.json();
  if (!Array.isArray(subscriptions)) throw new Error('invalid subscriptions response');
  const message = {
    data: JSON.stringify({ title: 'Un nouveau son en Corse', body: sound.title, url: `/?sound=${sound.id}`, tag: `son-${sound.id}` }),
    options: { ttl: 3600 },
  };
  const results = { sent: 0, expired: 0, failed: 0 };
  const rows = subscriptions.slice(0, 20);
  for (let offset = 0; offset < rows.length; offset += 5) {
    await Promise.all(rows.slice(offset, offset + 5).map(async (row) => {
      const result = await deliverPush(storage, env, row, message, fetcher);
      results[result.state]++;
    }));
  }
  console.info('[Push V2]', results);
  return results;
}
