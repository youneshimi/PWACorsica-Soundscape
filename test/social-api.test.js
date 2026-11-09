import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker/index.js';

const profileId = '11111111-1111-4111-8111-111111111111';
const soundId = '22222222-2222-4222-8222-222222222222';
const trailId = '33333333-3333-4333-8333-333333333333';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const sound = { id: soundId, client_id: 'test', title: 'Vagues', description: '', latitude: 42, longitude: 9, category: 'mer', audio_path: `${soundId}.webm`, created_at: '2026-01-01T00:00:00Z', profile_id: profileId, profile: { nickname: 'Ada' } };

function mock() {
  const calls = [];
  async function fetcher(input, options) {
    const url = new URL(input);
    const method = options.method || 'GET';
    calls.push({ path: url.pathname, method, body: options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null });
    if (url.pathname === '/rest/v1/profiles') return Response.json({}, { status: 201 });
    if (url.pathname === '/rest/v1/sound_stats') return Response.json([{ sound_id: soundId, likes_count: 2, listens_count: 5 }]);
    if (url.pathname === '/rest/v1/sounds') return Response.json([sound]);
    if (url.pathname === '/rest/v1/likes' || url.pathname === '/rest/v1/listens') return Response.json({}, { status: 200 });
    if (url.pathname === '/rest/v1/comments') return Response.json(method === 'GET' ? [{ id: 'c', text: 'Super', profile_id: profileId, created_at: '2026-01-01', profile: { nickname: 'Ada' } }] : [{ id: 'c2', text: 'Merci', profile_id: profileId, created_at: '2026-01-02', profile: { nickname: 'Ada' } }], { status: method === 'GET' ? 200 : 201 });
    if (url.pathname === '/rest/v1/trails') return Response.json([{ id: trailId, title: 'Balade', description: '', profile_id: profileId, created_at: '2026-01-01', profile: { nickname: 'Ada' }, trail_sounds: [{ id: 's' }] }]);
    if (url.pathname === '/rest/v1/trail_sounds') return Response.json([{ position: 1, note: 'Départ', sound }]);
    if (url.pathname === '/rest/v1/rpc/create_trail') return Response.json(trailId);
    throw new Error(`Unexpected ${url.pathname}`);
  }
  return { fetcher, calls };
}

function req(path, method = 'GET', body) {
  return new Request(`https://soundscape.test${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
}

test('profils, interactions et commentaires répondent avec les données publiques attendues', async () => {
  const m = mock();
  assert.equal((await handleRequest(req('/api/profiles', 'POST', { id: profileId, nickname: 'Ada' }), env, m.fetcher)).status, 201);
  assert.equal((await handleRequest(req(`/api/sounds/${soundId}/like`, 'POST', { profileId }), env, m.fetcher)).status, 200);
  assert.equal((await handleRequest(req(`/api/sounds/${soundId}/like`, 'DELETE', { profileId }), env, m.fetcher)).status, 200);
  assert.equal((await handleRequest(req(`/api/sounds/${soundId}/listen`, 'POST', { profileId }), env, m.fetcher)).status, 200);
  const list = await (await handleRequest(req('/api/sounds'), env, m.fetcher)).json();
  assert.equal(list[0].nickname, 'Ada');
  assert.equal(list[0].likesCount, 2);
  assert.equal(list[0].listensCount, 5);
  assert.equal((await (await handleRequest(req(`/api/sounds/${soundId}/comments`), env, m.fetcher)).json())[0].text, 'Super');
  assert.equal((await handleRequest(req(`/api/sounds/${soundId}/comments`, 'POST', { profileId, text: 'Merci' }), env, m.fetcher)).status, 201);
  assert.equal((await handleRequest(req(`/api/sounds/${soundId}/comments`, 'POST', { profileId, text: 'x'.repeat(501) }), env, m.fetcher)).status, 400);
  assert.equal(m.calls.filter((call) => call.path === '/rest/v1/comments').length, 2);
});

test('classement et parcours répondent, et le parcours conserve l’ordre des étapes', async () => {
  const m = mock();
  const popular = await (await handleRequest(req('/api/sounds/popular?sort=listens&limit=10'), env, m.fetcher)).json();
  assert.equal(popular[0].id, soundId);
  assert.equal(popular[0].listensCount, 5);
  assert.equal((await handleRequest(req('/api/sounds/popular?sort=invalid'), env, m.fetcher)).status, 400);
  const trails = await (await handleRequest(req('/api/trails'), env, m.fetcher)).json();
  assert.equal(trails[0].soundsCount, 1);
  const detail = await (await handleRequest(req(`/api/trails/${trailId}`), env, m.fetcher)).json();
  assert.equal(detail.steps[0].position, 1);
  assert.equal(detail.steps[0].sound.id, soundId);
  const created = await handleRequest(req('/api/trails', 'POST', { profileId, title: 'Balade', description: '', sounds: [{ soundId, note: 'Départ' }] }), env, m.fetcher);
  assert.equal(created.status, 201);
  assert.equal((await created.json()).id, trailId);
  assert.equal(m.calls.find((call) => call.path === '/rest/v1/rpc/create_trail').body.p_sounds[0].note, 'Départ');
});
