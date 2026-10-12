import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { handleRequest } from '../worker/index.js';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test_not_a_real_key',
  ASSETS: { fetch: () => new Response('<html>Accueil</html>', { headers: { 'Content-Type': 'text/html' } }) },
};

function provider() {
  const rows = [];
  const files = new Map();
  const calls = [];
  const state = { insertError: false, lostInsertResponse: false, offline: false };
  async function fetcher(input, options) {
    const url = new URL(input);
    const method = options.method || 'GET';
    calls.push({ url, method, headers: options.headers });
    assert.equal(options.headers.get('apikey'), env.SUPABASE_SECRET_KEY);
    assert.equal(options.headers.get('Authorization'), null);
    assert.equal(options.headers.get('User-Agent'), 'Corsica-Soundscape-Worker');
    if (state.offline) throw new Error('provider unavailable');
    if (url.pathname === '/rest/v1/sounds') {
      if (method === 'GET') {
        const filter = url.searchParams.get('client_id');
        const selected = filter ? rows.filter((row) => row.client_id === filter.slice(3)) : rows;
        const offset = Number(url.searchParams.get('offset') || 0);
        const limit = Number(url.searchParams.get('limit') || 1000);
        return Response.json(selected.slice(offset, offset + limit));
      }
      if (state.insertError) return Response.json({ error: 'private database details' }, { status: 500 });
      const data = JSON.parse(options.body);
      if (rows.some((row) => row.client_id === data.client_id)) return Response.json({ code: '23505' }, { status: 409 });
      const row = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      rows.push(row);
      if (state.lostInsertResponse) throw new Error('response lost after commit');
      return Response.json([row], { status: 201 });
    }
    if (url.pathname === '/storage/v1/object/sounds' && method === 'DELETE') {
      for (const path of JSON.parse(options.body).prefixes) files.delete(path);
      return Response.json([]);
    }
    const path = url.pathname.split('/').pop();
    if (method === 'POST') {
      files.set(path, { body: new Uint8Array(await options.body.arrayBuffer()), type: options.headers.get('Content-Type') });
      assert.ok(url.pathname.startsWith('/storage/v1/object/sounds/'));
      return Response.json({ Key: `sounds/${path}` });
    }
    assert.ok(url.pathname.startsWith('/storage/v1/object/authenticated/sounds/'));
    const file = files.get(path);
    if (!file) return Response.json({ statusCode: '404' }, { status: 400 });
    const headers = { 'Content-Type': file.type, 'Content-Length': String(file.body.length), 'Accept-Ranges': 'bytes' };
    const range = options.headers.get('Range');
    if (range) {
      assert.equal(range, 'bytes=0-2');
      headers['Content-Range'] = `bytes 0-2/${file.body.length}`;
      headers['Content-Length'] = '3';
      return new Response(file.body.slice(0, 3), { status: 206, headers });
    }
    return new Response(method === 'HEAD' ? null : file.body, { headers });
  }
  return { rows, files, calls, state, fetcher };
}

function post(values = {}, key = 'local-test') {
  const form = new FormData();
  for (const [name, value] of Object.entries({ title: 'Vagues', description: '', latitude: '41.92', longitude: '8.74', category: 'mer', ...values })) {
    if (value !== null) form.set(name, value);
  }
  if (!('audio' in values)) form.set('audio', new Blob(['sound bytes'], { type: 'audio/webm;codecs=opus' }), 'recording.webm');
  return new Request('https://soundscape.test/api/sounds', { method: 'POST', headers: key === null ? {} : { 'Idempotency-Key': key }, body: form });
}

test('le Worker conserve le HTML pour les pages et répond JSON aux routes API inconnues', async () => {
  // Cloudflare fournit un contexte en troisième argument, jamais un fetcher.
  assert.equal(await (await worker.fetch(new Request('https://soundscape.test/'), env, {})).text(), '<html>Accueil</html>');
  const unknown = await handleRequest(new Request('https://soundscape.test/api/inconnu'), env);
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('Content-Type'), /application\/json/);
  const missing = await worker.fetch(new Request('https://soundscape.test/api/sounds'), { ASSETS: env.ASSETS }, {});
  assert.equal(missing.status, 503);
});

test('un son est conservé en base et dans Storage, puis relu avec les champs du frontend', async () => {
  const p = provider();
  const saved = await handleRequest(post({ latitude: '0', longitude: '0' }), env, p.fetcher);
  assert.equal(saved.status, 201);
  const sound = await saved.json();
  assert.equal(sound.title, 'Vagues');
  assert.equal(sound.latitude, 0);
  assert.equal(sound.synced, true);
  assert.match(sound.audioUrl, /^\/uploads\/[a-f0-9-]+\.webm$/);
  assert.equal(p.files.size, 1);
  const list = await handleRequest(new Request('https://soundscape.test/api/sounds'), env, p.fetcher);
  assert.deepEqual(await list.json(), [sound]);
  assert.ok(!JSON.stringify(sound).includes(env.SUPABASE_SECRET_KEY));
});

test('les relances et les requêtes concurrentes créent un seul son et nettoient les fichiers en trop', async () => {
  const p = provider();
  const responses = await Promise.all(Array.from({ length: 3 }, () => handleRequest(post(), env, p.fetcher)));
  const sounds = await Promise.all(responses.map((response) => response.json()));
  assert.equal(new Set(sounds.map((sound) => sound.id)).size, 1);
  assert.equal(p.rows.length, 1);
  assert.equal(p.files.size, 1);
  const repeated = await handleRequest(post(), env, p.fetcher);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).id, sounds[0].id);
  assert.equal(p.files.size, 1);
});

test('les métadonnées et les formats invalides ne créent aucun fichier', async () => {
  const p = provider();
  for (const values of [
    { title: ' ' }, { title: 'x'.repeat(81) }, { description: 'x'.repeat(301) },
    { latitude: null }, { latitude: '' }, { latitude: 'NaN' }, { latitude: '91' },
    { longitude: '-181' }, { category: 'inventee' }, { audio: null },
    { audio: new Blob(['bad'], { type: 'text/plain' }) },
    { audio: new Blob([], { type: 'audio/mp4' }) },
  ]) {
    const response = await handleRequest(post(values), env, p.fetcher);
    assert.equal(response.status, 400, JSON.stringify(values));
  }
  assert.equal((await handleRequest(post({}, null), env, p.fetcher)).status, 400);
  assert.equal(p.files.size, 0);
});

test('le MP4 mobile garde son type et le fichier audio est limité à 10 Mo', async () => {
  const p = provider();
  const mp4 = await handleRequest(post({ audio: new Blob(['mp4 sample'], { type: 'audio/mp4' }) }), env, p.fetcher);
  assert.equal(mp4.status, 201);
  assert.match((await mp4.json()).audioUrl, /\.m4a$/);
  assert.equal([...p.files.values()][0].type, 'audio/mp4');
  const tooLarge = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'audio/webm' });
  assert.equal((await handleRequest(post({ audio: tooLarge }, 'local-large'), env, p.fetcher)).status, 413);
  assert.equal(p.files.size, 1);
});

test('un échec de la base nettoie le fichier et ne révèle pas les détails du fournisseur', async () => {
  const p = provider();
  p.state.insertError = true;
  const response = await handleRequest(post(), env, p.fetcher);
  assert.equal(response.status, 502);
  assert.equal(p.files.size, 0);
  assert.equal(p.rows.length, 0);
  assert.ok(!(await response.text()).includes('private database details'));
});

test('une réponse perdue après insertion conserve le fichier et retrouve le son sans doublon', async () => {
  const p = provider();
  p.state.lostInsertResponse = true;
  const response = await handleRequest(post(), env, p.fetcher);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, p.rows[0].id);
  assert.equal(p.files.size, 1);
  assert.equal(p.rows.length, 1);
});

test('les lectures audio complètes, Range et HEAD passent par le bucket privé', async () => {
  const p = provider();
  const saved = await (await handleRequest(post(), env, p.fetcher)).json();
  const url = `https://soundscape.test${saved.audioUrl}`;
  const complete = await handleRequest(new Request(url), env, p.fetcher);
  assert.equal(await complete.text(), 'sound bytes');
  assert.equal(complete.headers.get('Content-Type'), 'audio/webm');
  const partial = await handleRequest(new Request(url, { headers: { Range: 'bytes=0-2' } }), env, p.fetcher);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('Content-Range'), 'bytes 0-2/11');
  assert.equal(await partial.text(), 'sou');
  const head = await handleRequest(new Request(url, { method: 'HEAD' }), env, p.fetcher);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('Content-Length'), '11');
  const absent = `https://soundscape.test/uploads/${crypto.randomUUID()}.webm`;
  assert.equal((await handleRequest(new Request(absent), env, p.fetcher)).status, 404);
  assert.equal((await handleRequest(new Request('https://soundscape.test/uploads/not-a-file'), env, p.fetcher)).status, 404);
});

test('une panne Supabase reste une erreur JSON et ne renvoie pas le HTML de la PWA', async () => {
  const p = provider();
  p.state.offline = true;
  const response = await handleRequest(new Request('https://soundscape.test/api/sounds'), env, p.fetcher);
  assert.equal(response.status, 502);
  assert.match(response.headers.get('Content-Type'), /application\/json/);
});

test('la liste charge les pages suivantes au-delà de la limite PostgREST', async () => {
  const p = provider();
  for (let i = 0; i < 1001; i++) p.rows.push({ id: String(i), audio_path: `${i}.webm` });
  const response = await handleRequest(new Request('https://soundscape.test/api/sounds'), env, p.fetcher);
  assert.equal((await response.json()).length, 1001);
  assert.equal(p.calls.length, 2);
  assert.equal(p.calls[1].url.searchParams.get('offset'), '1000');
});
