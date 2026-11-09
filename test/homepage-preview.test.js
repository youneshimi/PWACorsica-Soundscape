import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleRequest } from '../worker/index.js';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const soundId = 'e7cf0fe1-8cca-48c3-9a7f-8cb737422334';
const env = {
  SUPABASE_URL: 'https://soundscape.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  ASSETS: { fetch: () => new Response(source, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) },
};

test('la page d’accueil contient les vrais sons dans le HTML avant JavaScript', async () => {
  let calls = 0;
  const fetcher = async (url) => {
    calls += 1;
    assert.match(String(url), /\/rest\/v1\/sounds\?/);
    assert.match(String(url), /limit=8/);
    return Response.json([{
      id: soundId, title: '<Vagues & vent>', description: 'Sur la plage',
      category: 'mer', audio_path: '44a82280-f74f-4659-bb63-e181db830ed2.mp3',
      profile: { nickname: 'Ada "Corse"' }, created_at: '2026-10-11T12:00:00Z',
    }]);
  };
  const response = await handleRequest(new Request('https://soundscape.test/'), env, fetcher);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.match(response.headers.get('Cache-Control'), /no-cache/);
  assert.match(html, /<h3>&lt;Vagues &amp; vent&gt;<\/h3>/);
  assert.match(html, /Par Ada &quot;Corse&quot; · 11\/10\/2026/);
  assert.match(html, /<audio controls preload="none" src="\/uploads\//);
  assert.match(html, new RegExp(`href="/\\?sound=${soundId}"`));
  assert.doesNotMatch(html, /<h3><Vagues/);
  assert.doesNotMatch(html, /SOUND_PREVIEW/);
});

test('la présentation reste disponible si Supabase ne répond pas', async () => {
  const response = await handleRequest(new Request('https://soundscape.test/'), env, async () => {
    throw new Error('Supabase indisponible');
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<h1>Corsica Soundscape<\/h1>/);
  assert.match(html, /<h2>Les sons de l’île<\/h2>/);
  assert.doesNotMatch(html, /SOUND_PREVIEW/);
});
