import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';

let server;
let baseUrl;
let directory;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'soundscape-test-'));
  process.env.SOUNDS_DATA_DIR = join(directory, 'data');
  process.env.SOUNDS_UPLOADS_DIR = join(directory, 'uploads');
  const { app } = await import('../server/index.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  // Nettoyer uniquement le répertoire temporaire créé par ces tests.
  if (directory && dirname(resolve(directory)) === resolve(tmpdir()) &&
      basename(directory).startsWith('soundscape-test-')) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function upload(key) {
  const data = new FormData();
  data.append('title', 'Test ' + key);
  data.append('latitude', '42.3');
  data.append('longitude', '9.15');
  data.append('category', 'mer');
  data.append('audio', new Blob(['sound'], { type: 'audio/webm' }), 'recording.webm');
  return fetch(baseUrl + '/api/sounds', {
    method: 'POST', headers: { 'Idempotency-Key': key }, body: data,
  });
}

test('réenvoyer une même demande ne crée ni deuxième son ni deuxième fichier', async () => {
  const first = await upload('repeat');
  assert.equal(first.status, 201);
  const created = await first.json();
  const retry = await upload('repeat');
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, created.id);
  const sounds = JSON.parse(readFileSync(join(directory, 'data/sounds.json'), 'utf8'));
  assert.equal(sounds.filter((sound) => sound.clientId === 'repeat').length, 1);
  assert.equal(readdirSync(join(directory, 'uploads')).length, 1);
});

test('des envois concurrents avec le même identifiant créent un seul son', async () => {
  const beforeCount = readdirSync(join(directory, 'uploads')).length;
  const responses = await Promise.all([upload('parallel'), upload('parallel'), upload('parallel')]);
  const sounds = await Promise.all(responses.map((response) => response.json()));
  assert.equal(new Set(sounds.map((sound) => sound.id)).size, 1);
  const stored = JSON.parse(readFileSync(join(directory, 'data/sounds.json'), 'utf8'));
  assert.equal(stored.filter((sound) => sound.clientId === 'parallel').length, 1);
  assert.equal(readdirSync(join(directory, 'uploads')).length, beforeCount + 1);
});

test('deux enregistrements distincts restent distincts', async () => {
  const first = await (await upload('different-a')).json();
  const second = await (await upload('different-b')).json();
  assert.notEqual(first.id, second.id);
});
