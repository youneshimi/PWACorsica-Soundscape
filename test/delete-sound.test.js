import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker/index.js';

const id = '12345678-1234-4123-8123-123456789abc';
const audioPath = 'abcdef12-1234-4123-8123-123456789abc.webm';
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test_not_a_real_key',
};

function provider({ exists = true, failAt, audioUrlOnly = false, missingTables = [] } = {}) {
  const calls = [];
  let sound = exists ? audioUrlOnly ? { id, audio_url: `https://soundscape.test/uploads/${audioPath}` } : { id, audio_path: audioPath } : null;
  const fetcher = async (input, options) => {
    const url = new URL(input);
    const method = options.method || 'GET';
    calls.push(`${method} ${url.pathname}`);
    if (url.pathname === '/rest/v1/sounds' && method === 'GET') {
      assert.equal(url.searchParams.get('id'), `eq.${id}`);
      return Response.json(sound ? [sound] : []);
    }
    if (failAt === url.pathname) return new Response(null, { status: 500 });
    if (missingTables.includes(url.pathname.split('/').pop())) {
      return Response.json({ code: 'PGRST205', message: 'table unavailable' }, { status: 404 });
    }
    if (url.pathname === '/storage/v1/object/sounds') {
      assert.deepEqual(JSON.parse(options.body), { prefixes: [audioPath] });
      return Response.json([]);
    }
    assert.equal(method, 'DELETE');
    assert.equal(url.searchParams.get(url.pathname.endsWith('/sounds') ? 'id' : 'sound_id'), `eq.${id}`);
    if (url.pathname === '/rest/v1/sounds') sound = null;
    return new Response(null, { status: 204 });
  };
  return { calls, fetcher, get sound() { return sound; } };
}

function request(soundId = id, method = 'DELETE') {
  return new Request(`https://soundscape.test/api/sounds/${soundId}`, { method });
}

test('DELETE supprime le fichier, les interactions et le son, puis renvoie 204', async () => {
  const p = provider();
  const response = await handleRequest(request(), env, p.fetcher);
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(p.sound, null);
  assert.deepEqual(p.calls, [
    'GET /rest/v1/sounds',
    'DELETE /storage/v1/object/sounds',
    'DELETE /rest/v1/likes',
    'DELETE /rest/v1/comments',
    'DELETE /rest/v1/listens',
    'DELETE /rest/v1/sounds',
  ]);
});

test('DELETE renvoie 404 pour un son absent et ne supprime rien', async () => {
  const p = provider({ exists: false });
  assert.equal((await handleRequest(request(), env, p.fetcher)).status, 404);
  assert.deepEqual(p.calls, ['GET /rest/v1/sounds']);
  assert.equal((await handleRequest(request('invalid'), env, p.fetcher)).status, 404);
  assert.equal((await handleRequest(request(id, 'GET'), env, p.fetcher)).status, 405);
});

test('une erreur Storage conserve le son et les interactions pour une nouvelle tentative', async () => {
  const p = provider({ failAt: '/storage/v1/object/sounds' });
  assert.equal((await handleRequest(request(), env, p.fetcher)).status, 502);
  assert.ok(p.sound);
  assert.deepEqual(p.calls, ['GET /rest/v1/sounds', 'DELETE /storage/v1/object/sounds']);
});

test('DELETE extrait audio_url et ignore uniquement les tables sociales absentes', async () => {
  const p = provider({ audioUrlOnly: true, missingTables: ['likes', 'comments'] });
  assert.equal((await handleRequest(request(), env, p.fetcher)).status, 204);
  assert.equal(p.sound, null);
  assert.ok(p.calls.includes('DELETE /storage/v1/object/sounds'));
  assert.ok(p.calls.includes('DELETE /rest/v1/sounds'));
});

test('une vraie erreur sur les interactions ne supprime pas le son', async () => {
  const p = provider({ failAt: '/rest/v1/comments' });
  assert.equal((await handleRequest(request(), env, p.fetcher)).status, 502);
  assert.ok(p.sound);
  assert.ok(!p.calls.includes('DELETE /rest/v1/sounds'));
});
