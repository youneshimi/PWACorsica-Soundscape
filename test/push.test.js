import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVapidKeys } from '../scripts/generate-vapid.js';
import { handleRequest } from '../worker/index.js';
import { notifyNewSound, validEndpoint, vapidKeysValid } from '../worker/push.js';
import { disablePush, enablePush, pushActive, testPush } from '../src/utils/push.js';

const origin = 'https://soundscape.test';
const token = 'a'.repeat(64);

async function configuration() {
  const vapid = await createVapidKeys();
  return { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_fake_key', VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey };
}

async function subscriber(endpoint = 'https://fcm.googleapis.com/wp/test') {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, raw, auth, subscription: { endpoint, keys: { p256dh: Buffer.from(raw).toString('base64url'), auth: Buffer.from(auth).toString('base64url') } } };
}

function provider() {
  const rows = new Map();
  const sounds = [];
  const calls = [];
  const deliveries = [];
  const state = { pushTableDown: false, pushStatus: 201 };
  async function fetcher(input, options) {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.host !== 'example.supabase.co') { deliveries.push({ url, options }); return new Response(null, { status: state.pushStatus }); }
    if (url.pathname === '/rest/v1/rpc/register_push_subscription_v2') {
      const data = JSON.parse(options.body);
      const existing = rows.get(data.p_endpoint);
      if (existing && existing.token_hash !== data.p_token_hash) return Response.json(false);
      rows.set(data.p_endpoint, { endpoint: data.p_endpoint, p256dh: data.p_p256dh, auth: data.p_auth, token_hash: data.p_token_hash });
      return Response.json(true);
    }
    if (url.pathname === '/rest/v1/push_subscriptions_v2') {
      if (state.pushTableDown) return new Response(null, { status: 500 });
      if (options.method === 'DELETE') {
        const endpoint = url.searchParams.get('endpoint').slice(3);
        const hash = url.searchParams.get('token_hash')?.slice(3);
        if (!hash || rows.get(endpoint)?.token_hash === hash) rows.delete(endpoint);
        return new Response(null, { status: 204 });
      }
      const endpoint = url.searchParams.get('endpoint')?.slice(3);
      const hash = url.searchParams.get('token_hash')?.slice(3);
      return Response.json([...rows.values()].filter((row) => (!endpoint || row.endpoint === endpoint) && (!hash || row.token_hash === hash)));
    }
    if (url.pathname === '/rest/v1/sounds') {
      if (options.method !== 'POST') {
        const id = url.searchParams.get('client_id')?.slice(3);
        return Response.json(id ? sounds.filter((sound) => sound.client_id === id) : sounds);
      }
      const sound = { ...JSON.parse(options.body), id: crypto.randomUUID(), created_at: new Date().toISOString() };
      sounds.push(sound);
      return Response.json([sound], { status: 201 });
    }
    if (url.pathname.startsWith('/storage/v1/object/sounds/')) return Response.json({ Key: 'saved' });
    throw new Error(`Unexpected path: ${url.pathname}`);
  }
  return { rows, sounds, calls, deliveries, state, fetcher };
}

function request(body, method = 'POST', headers = {}) {
  return new Request(`${origin}/api/push/subscribe`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('la mise à jour conserve le Worker existant et le SQL ajoute uniquement les abonnements', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.name, 'pwacorsica-soundscape');
  assert.equal(config.keep_vars, true);
  assert.equal(config.env.v2.name, config.name);
  const sql = await readFile(new URL('../supabase/v2.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /public\.sounds\b|public\.push_subscriptions\b|'sounds'|\b(?:drop|truncate)\b/i);
  assert.doesNotMatch(sql, /sounds_v2|sounds-v2|storage\.buckets/);
  assert.match(sql, /public\.push_subscriptions_v2/);
  assert.match(sql, /register_push_subscription_v2/);
});

test('la configuration push publique ne révèle aucune clé privée', async () => {
  const env = await configuration();
  const response = await handleRequest(new Request(`${origin}/api/push/config`), env);
  const data = await response.json();
  assert.equal(data.enabled, true);
  assert.equal(data.publicKey, env.VAPID_PUBLIC_KEY);
  assert.ok(!JSON.stringify(data).includes(env.VAPID_PRIVATE_KEY));
  assert.ok(!JSON.stringify(data).includes(env.SUPABASE_SECRET_KEY));
  assert.deepEqual(await (await handleRequest(new Request(`${origin}/api/push/config`), {})).json(), { enabled: false, publicKey: null });
});

test('deux clés VAPID de paires différentes ne sont pas annoncées comme opérationnelles', async () => {
  const env = await configuration();
  assert.equal(await vapidKeysValid(env), true);
  const other = await configuration();
  const mixed = { ...env, VAPID_PRIVATE_KEY: other.VAPID_PRIVATE_KEY };
  assert.equal(await vapidKeysValid(mixed), false);
  const data = await (await handleRequest(new Request(`${origin}/api/push/config`), mixed)).json();
  assert.equal(data.enabled, false);
  assert.match(data.error, /ne correspondent pas/);
  assert.ok(!JSON.stringify(data).includes(mixed.VAPID_PRIVATE_KEY));
  assert.equal(await vapidKeysValid(env), true);
});

function testRequest(endpoint, value = token, headers = {}) {
  return new Request(`${origin}/api/push/test`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ endpoint, token: value }) });
}

test('la notification de test exige le jeton du même appareil et ne cible que son abonnement', async () => {
  const env = await configuration();
  const p = provider();
  const first = await subscriber('https://fcm.googleapis.com/wp/first');
  const second = await subscriber('https://web.push.apple.com/second');
  await handleRequest(request({ subscription: first.subscription, token }), env, p.fetcher);
  await handleRequest(request({ subscription: second.subscription, token: 'b'.repeat(64) }), env, p.fetcher);
  assert.equal((await handleRequest(testRequest(first.subscription.endpoint, 'b'.repeat(64)), env, p.fetcher)).status, 404);
  assert.equal((await handleRequest(testRequest(first.subscription.endpoint, token, { Origin: 'https://other.test' }), env, p.fetcher)).status, 403);
  assert.equal(p.deliveries.length, 0);
  assert.equal((await handleRequest(testRequest(first.subscription.endpoint), env, p.fetcher)).status, 200);
  assert.equal(p.deliveries.length, 1);
  assert.equal(p.deliveries[0].url.href, first.subscription.endpoint);
  assert.equal(new Headers(p.deliveries[0].options.headers).get('urgency'), 'high');
  assert.equal(p.rows.size, 2);
});

test('le test signale un refus VAPID ou un abonnement expiré et la désactivation fonctionne même sans clés', async () => {
  const env = await configuration();
  const p = provider();
  const { subscription } = await subscriber();
  await handleRequest(request({ subscription, token }), env, p.fetcher);
  p.state.pushStatus = 403;
  const refused = await handleRequest(testRequest(subscription.endpoint), env, p.fetcher);
  const data = await refused.json();
  assert.equal(refused.status, 502);
  assert.equal(data.providerStatus, 403);
  assert.match(data.error, /autorisation du serveur/);
  assert.equal(p.rows.size, 1);
  assert.ok(!JSON.stringify(data).includes(subscription.endpoint));
  p.state.pushStatus = 410;
  const expired = await (await handleRequest(testRequest(subscription.endpoint), env, p.fetcher)).json();
  assert.match(expired.error, /expiré/);
  assert.equal(p.rows.size, 0);
  await handleRequest(request({ subscription, token }), env, p.fetcher);
  const unconfigured = { ...env, VAPID_PRIVATE_KEY: '' };
  assert.equal((await handleRequest(request({ endpoint: subscription.endpoint, token }, 'DELETE'), unconfigured, p.fetcher)).status, 200);
  assert.equal(p.rows.size, 0);
});

test('l’inscription est idempotente et la désinscription exige le même jeton', async () => {
  const env = await configuration();
  const { subscription } = await subscriber();
  const p = provider();
  assert.equal((await handleRequest(request({ subscription, token }), env, p.fetcher)).status, 201);
  await handleRequest(request({ subscription, token }), env, p.fetcher);
  assert.equal(p.rows.size, 1);
  assert.match(p.rows.get(subscription.endpoint).token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(p.rows.get(subscription.endpoint).token_hash, token);
  const changed = 'b'.repeat(64);
  assert.equal((await handleRequest(request({ subscription, token: changed }), env, p.fetcher)).status, 409);
  await handleRequest(request({ endpoint: subscription.endpoint, token: changed }, 'DELETE'), env, p.fetcher);
  assert.equal(p.rows.size, 1);
  await handleRequest(request({ endpoint: subscription.endpoint, token }, 'DELETE'), env, p.fetcher);
  assert.equal(p.rows.size, 0);
});

test('les endpoints arbitraires, les clés invalides et les pages extérieures sont refusés', async () => {
  const env = await configuration();
  const { subscription } = await subscriber();
  const p = provider();
  for (const endpoint of ['http://fcm.googleapis.com/wp/a', 'https://127.0.0.1/private', 'https://example.com/push', 'https://fcm.googleapis.com.evil.test/push', 'https://user:pass@fcm.googleapis.com/wp/a']) {
    assert.equal(validEndpoint(endpoint), false);
    assert.equal((await handleRequest(request({ subscription: { ...subscription, endpoint }, token }), env, p.fetcher)).status, 400);
  }
  for (const endpoint of ['https://web.push.apple.com/test', 'https://updates.push.services.mozilla.com/wpush/v2/test', 'https://wns.notify.windows.com/test']) assert.equal(validEndpoint(endpoint), true);
  const invalid = { ...subscription, keys: { p256dh: 'invalid', auth: 'invalid' } };
  assert.equal((await handleRequest(request({ subscription: invalid, token }), env, p.fetcher)).status, 400);
  assert.equal((await handleRequest(request({ subscription, token }, 'POST', { Origin: 'https://another.test' }), env, p.fetcher)).status, 403);
  assert.equal(p.calls.length, 0);
  assert.equal((await handleRequest(request({ padding: 'a'.repeat(5000), token, subscription }), env, p.fetcher)).status, 400);
});

async function hkdf(secret, salt, info, bytes) {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

test('le serveur signe VAPID et chiffre un message déchiffrable par son destinataire', async () => {
  const env = await configuration();
  const receiver = await subscriber();
  let sent;
  const storage = { call: async () => Response.json([{ endpoint: receiver.subscription.endpoint, ...receiver.subscription.keys }]) };
  const stats = await notifyNewSound(storage, env, { id: 'sound-1', title: 'Forêt' }, async (url, options) => { sent = { url, options }; return new Response(null, { status: 201 }); });
  assert.deepEqual(stats, { sent: 1, expired: 0, failed: 0 });
  assert.equal(sent.options.redirect, 'manual');
  const headers = new Headers(sent.options.headers);
  assert.equal(headers.get('content-encoding'), 'aes128gcm');
  const jwt = headers.get('authorization').match(/^vapid t=([^,]+)/)[1];
  const [head, claims, signature] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(head, 'base64url')).alg, 'ES256');
  const claim = JSON.parse(Buffer.from(claims, 'base64url'));
  assert.equal(claim.aud, 'https://fcm.googleapis.com');
  assert.equal(claim.sub, 'https://pwacorsica-soundscape.ounesshimi.workers.dev/');
  assert.ok(claim.exp > Date.now() / 1000);
  const publicKey = await crypto.subtle.importKey('raw', Buffer.from(env.VAPID_PUBLIC_KEY, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${head}.${claims}`)), true);
  const body = sent.options.body;
  assert.equal(body.byteLength, 4096);
  assert.equal(body[20], 65);
  const serverBytes = body.slice(21, 86);
  const serverKey = await crypto.subtle.importKey('raw', serverBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, receiver.pair.privateKey, 256);
  const encoder = new TextEncoder();
  const ikm = await hkdf(secret, receiver.auth, Buffer.concat([encoder.encode('WebPush: info\0'), receiver.raw, serverBytes]), 32);
  const salt = body.slice(0, 16);
  const keyBytes = await hkdf(ikm, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(86)));
  const decoded = JSON.parse(new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2))));
  assert.equal(decoded.body, 'Forêt');
  assert.equal(decoded.url, '/?sound=sound-1');
});

test('un abonnement expiré est retiré et un échec temporaire ne bloque pas les autres', async () => {
  const env = await configuration();
  const receiver = await subscriber();
  const rows = ['expired', 'temporary', 'working', 'unsafe'].map((name) => ({ endpoint: name === 'unsafe' ? 'https://example.com/private' : `https://fcm.googleapis.com/wp/${name}`, ...receiver.subscription.keys }));
  const removed = [];
  const storage = { call: async (path, options = {}) => {
    if (options.method === 'DELETE') { removed.push(path); return new Response(null, { status: 204 }); }
    return Response.json(rows);
  } };
  const requested = [];
  const stats = await notifyNewSound(storage, env, { id: 'one', title: 'Mer' }, async (url) => {
    requested.push(url);
    return new Response(null, { status: url.includes('expired') ? 410 : url.includes('temporary') ? 503 : 201 });
  });
  assert.deepEqual(stats, { sent: 1, expired: 1, failed: 2 });
  assert.equal(removed.length, 1);
  assert.equal(requested.length, 3);
});

test('une redirection du fournisseur est refusée sans envoyer les données à une autre adresse', async () => {
  const env = await configuration();
  const receiver = await subscriber();
  let requests = 0;
  const storage = { call: async (_, options = {}) => {
    assert.notEqual(options.method, 'DELETE');
    return Response.json([{ endpoint: receiver.subscription.endpoint, ...receiver.subscription.keys }]);
  } };
  const result = await notifyNewSound(storage, env, { id: 'one', title: 'Mer' }, async (url, options) => {
    requests++;
    assert.equal(url, receiver.subscription.endpoint);
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://another.test/private' } });
  });
  assert.equal(requests, 1);
  assert.deepEqual(result, { sent: 0, expired: 0, failed: 1 });
});

test('un son V2 déclenche le push en arrière-plan une seule fois et sa sauvegarde survit à une panne push', async () => {
  const env = await configuration();
  const receiver = await subscriber();
  const p = provider();
  p.rows.set(receiver.subscription.endpoint, { endpoint: receiver.subscription.endpoint, ...receiver.subscription.keys });
  const previousSound = { id: '3e7dfa58-c15b-4937-9a1d-815174c281a7', client_id: 'local-existing', title: 'Forêt de vizzavona', description: 'Son déjà publié', latitude: 42.1283, longitude: 9.1333, category: 'nature', audio_path: 'ea4230f9-f357-490c-b8c4-1d76addf0b3b.webm', created_at: '2026-10-11T17:46:58Z' };
  p.sounds.push(previousSound);
  const before = await (await handleRequest(new Request(`${origin}/api/sounds`), env, p.fetcher)).json();
  assert.equal(before[0].id, previousSound.id);
  assert.equal(before[0].audioUrl, `/uploads/${previousSound.audio_path}`);
  assert.equal(p.deliveries.length, 0);
  function soundRequest(key) {
    const form = new FormData();
    for (const [name, value] of Object.entries({ title: 'Nouveau son', latitude: '42', longitude: '9', category: 'nature' })) form.set(name, value);
    form.set('audio', new Blob(['test sound'], { type: 'audio/webm' }), 'test.webm');
    return new Request(`${origin}/api/sounds`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: form });
  }
  const pending = [];
  const context = { waitUntil(promise) { pending.push(promise); } };
  assert.equal((await handleRequest(soundRequest('local-test'), env, p.fetcher, context)).status, 201);
  await Promise.all(pending);
  assert.equal(p.deliveries.length, 1);
  assert.equal((await handleRequest(soundRequest('local-test'), env, p.fetcher, context)).status, 200);
  assert.equal(pending.length, 1);
  p.state.pushTableDown = true;
  assert.equal((await handleRequest(soundRequest('local-next'), env, p.fetcher, context)).status, 201);
  await Promise.all(pending);
  assert.equal(p.sounds.length, 3);
  assert.deepEqual(p.sounds[0], previousSound);
  assert.ok(p.calls.filter((call) => call.url.host === 'example.supabase.co').every((call) => !call.url.pathname.includes('sounds_v2') && !call.url.pathname.includes('sounds-v2')));
});

function localStore() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('le clic inscrit le navigateur et la désactivation retire le serveur et le navigateur', async () => {
  const env = await configuration();
  const receiver = await subscriber();
  const storage = localStore();
  let unsubscribed = false;
  const subscription = { ...receiver.subscription, toJSON: () => receiver.subscription, unsubscribe: async () => { unsubscribed = true; return true; } };
  let subscribed = 0;
  const registration = { pushManager: { subscribe: async (options) => { subscribed++; assert.equal(options.userVisibleOnly, true); assert.equal(options.applicationServerKey.length, 65); return subscription; } } };
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ url, method: options.method, body: JSON.parse(options.body) }); return Response.json({ ok: true }); };
  assert.equal(pushActive(storage), false);
  await enablePush(registration, env.VAPID_PUBLIC_KEY, null, { storage, fetcher });
  assert.equal(subscribed, 1);
  assert.equal(pushActive(storage), true);
  assert.match(calls[0].body.token, /^[a-f0-9]{64}$/);
  await disablePush(subscription, { storage, fetcher });
  assert.equal(calls[1].method, 'DELETE');
  assert.equal(calls[1].body.token, calls[0].body.token);
  assert.equal(unsubscribed, true);
  assert.equal(pushActive(storage), false);
});

test('le bouton de test transmet uniquement son endpoint et son jeton, et affiche les erreurs du serveur', async () => {
  const env = await configuration();
  const storage = localStore();
  const receiver = await subscriber();
  let calls = 0;
  const subscription = { ...receiver.subscription, toJSON: () => receiver.subscription, unsubscribe: async () => true };
  await enablePush({ pushManager: { subscribe: async () => subscription } }, env.VAPID_PUBLIC_KEY, null, { storage, fetcher: async () => Response.json({ ok: true }) });
  await testPush(subscription, { storage, fetcher: async (path, options) => {
    calls++;
    assert.equal(path, '/api/push/test');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.endpoint, subscription.endpoint);
    assert.match(body.token, /^[a-f0-9]{64}$/);
    assert.equal(body.subscription, undefined);
    return Response.json({ ok: true });
  } });
  assert.equal(calls, 1);
  await assert.rejects(testPush(subscription, { storage, fetcher: async () => Response.json({ error: 'Cet abonnement a expiré.' }, { status: 502 }) }), /a expiré/);
  await assert.rejects(testPush(subscription, { storage: localStore(), fetcher: async () => { throw new Error('not called'); } }), /réactivez/);
});

test('un refus de permission n’envoie rien et une inscription échouée annule le nouvel abonnement', async () => {
  const env = await configuration();
  const storage = localStore();
  let requested = false;
  const denied = { pushManager: { subscribe: async () => { throw new Error('permission denied'); } } };
  await assert.rejects(enablePush(denied, env.VAPID_PUBLIC_KEY, null, { storage, fetcher: async () => { requested = true; } }));
  assert.equal(requested, false);
  let unsubscribed = false;
  const sub = { endpoint: 'https://fcm.googleapis.com/wp/fail', toJSON: () => ({}), unsubscribe: async () => { unsubscribed = true; } };
  await assert.rejects(enablePush({ pushManager: { subscribe: async () => sub } }, env.VAPID_PUBLIC_KEY, null, { storage, fetcher: async () => new Response(null, { status: 502 }) }));
  assert.equal(unsubscribed, true);
  assert.equal(pushActive(storage), false);
});
