import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createVapidKeys } from '../scripts/generate-vapid.js';
import { notifyNewSound } from '../worker/push.js';

test('le moteur Cloudflare accepte la requête HTTP réellement préparée pour le push', { timeout: 30000 }, async () => {
  const keys = await createVapidKeys();
  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicBytes = await crypto.subtle.exportKey('raw', receiver.publicKey);
  const subscription = { endpoint: 'https://web.push.apple.com/runtime-fixture', p256dh: Buffer.from(publicBytes).toString('base64url'), auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') };
  let prepared;
  await notifyNewSound({ call: async () => Response.json([subscription]) }, { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey }, { id: 'fixture', title: 'Test local' }, async (url, options) => {
    prepared = { url, method: options.method, redirect: options.redirect, headers: Object.fromEntries(new Headers(options.headers)), body: [...options.body] };
    return new Response(null, { status: 201 });
  });
  assert.ok(prepared);
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  // Miniflare est fourni par Wrangler. Aucune requête n'est envoyée à Apple.
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: config.compatibility_date,
    script: `export default {
      async fetch(input) {
        const { url, body, ...options } = await input.json();
        const request = new Request(url, { ...options, body: new Uint8Array(body) });
        return Response.json({ redirect: request.redirect, method: request.method, encoding: request.headers.get('Content-Encoding'), bytes: (await request.arrayBuffer()).byteLength });
      }
    }`,
  }));
  try {
    const response = await runtime.dispatchFetch('https://local.test/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prepared) });
    assert.equal(response.status, 200, 'Le moteur Cloudflare doit accepter les options de la requête');
    assert.deepEqual(await response.json(), { redirect: 'manual', method: 'POST', encoding: 'aes128gcm', bytes: 4096 });
  } finally {
    await runtime.dispose();
  }
});
