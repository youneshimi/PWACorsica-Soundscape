import { buildPushPayload } from '@block65/webcrypto-web-push';

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function pushConfigured(env) {
  return /^[A-Za-z0-9_-]{87}$/.test(env.VAPID_PUBLIC_KEY || '') && /^[A-Za-z0-9_-]{43}$/.test(env.VAPID_PRIVATE_KEY || '');
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

export async function handlePush(request, env, storage) {
  const path = new URL(request.url).pathname;
  if (path === '/api/push/config' && request.method === 'GET') {
    const enabled = pushConfigured(env) && Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'));
    return json({ enabled, publicKey: enabled ? env.VAPID_PUBLIC_KEY : null });
  }
  if (path !== '/api/push/subscribe') return json({ error: 'Route inconnue.' }, 404);
  if (!['POST', 'DELETE'].includes(request.method)) return json({ error: 'Méthode non autorisée.' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origine non autorisée.' }, 403);
  if (!pushConfigured(env)) return json({ error: 'Notifications momentanément indisponibles.' }, 503);
  let input;
  try { input = await readJson(request); } catch { return json({ error: 'Demande invalide.' }, 400); }
  if (!input || !/^[a-f0-9]{64}$/.test(input.token || '')) return json({ error: 'Jeton invalide.' }, 400);
  const endpoint = request.method === 'POST' ? input.subscription?.endpoint : input.endpoint;
  if (!validEndpoint(endpoint)) return json({ error: 'Abonnement invalide.' }, 400);
  const hash = await tokenHash(input.token);
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

export async function notifyNewSound(storage, env, sound, fetcher = fetch) {
  if (!pushConfigured(env)) return;
  const response = await storage.call('/rest/v1/push_subscriptions_v2?select=endpoint,p256dh,auth&order=created_at.asc&limit=20');
  if (!response.ok) throw new Error('push subscriptions unavailable');
  const subscriptions = await response.json();
  if (!Array.isArray(subscriptions)) throw new Error('invalid subscriptions response');
  const message = {
    data: JSON.stringify({ title: 'Un nouveau son en Corse', body: sound.title, url: `/?sound=${sound.id}`, tag: `son-${sound.id}` }),
    options: { ttl: 3600 },
  };
  const vapid = { subject: env.VAPID_SUBJECT || 'https://pwacorsica-soundscape.ounesshimi.workers.dev/', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const results = { sent: 0, expired: 0, failed: 0 };
  const rows = subscriptions.slice(0, 20);
  for (let offset = 0; offset < rows.length; offset += 5) {
    await Promise.all(rows.slice(offset, offset + 5).map(async (row) => {
      try {
        if (!validEndpoint(row.endpoint)) throw new Error('invalid endpoint');
        const payload = await buildPushPayload(message, { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, vapid);
        const delivery = await fetcher(row.endpoint, { ...payload, redirect: 'error', signal: AbortSignal.timeout(5000) });
        await delivery.body?.cancel();
        if ([404, 410].includes(delivery.status)) {
          const query = new URLSearchParams({ endpoint: `eq.${row.endpoint}` });
          const removed = await storage.call(`/rest/v1/push_subscriptions_v2?${query}`, { method: 'DELETE' });
          if (!removed.ok) throw new Error('cleanup failed');
          results.expired++;
        } else if (delivery.ok) results.sent++;
        else results.failed++;
      } catch { results.failed++; }
    }));
  }
  console.info('[Push V2]', results);
  return results;
}
