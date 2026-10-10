import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioRecorder } from '../src/utils/recorder.js';
import { getAudioFileName } from '../src/utils/audio.js';
import { parsePosition } from '../src/utils/position.js';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalRecorder = globalThis.MediaRecorder;
let instances;
let supported;
let stoppedTracks;
let permissionRequests;
let constructorError;
let chunk;
let states;
let errors;
let audio;
let recording;
let timers;

beforeEach((context) => {
  instances = [];
  supported = ['audio/webm;codecs=opus'];
  stoppedTracks = 0;
  permissionRequests = 0;
  constructorError = null;
  chunk = null;
  states = [];
  errors = [];
  audio = null;
  timers = new Set();
  context.mock.method(globalThis, 'setInterval', (callback) => { timers.add(callback); return callback; });
  context.mock.method(globalThis, 'clearInterval', (timer) => timers.delete(timer));
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { async getUserMedia() { permissionRequests++; return stream(); } } },
  });
  globalThis.MediaRecorder = class {
    static isTypeSupported(type) { return supported.includes(type); }
    constructor(source, options) {
      if (constructorError) throw constructorError;
      this.mimeType = options?.mimeType || 'audio/ogg';
      this.state = 'inactive';
      instances.push(this);
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable?.({ data: chunk || new Blob(['sound'], { type: this.mimeType }) });
        this.onstop?.();
      });
    }
  };
  recording = createAudioRecorder({
    onState: (value) => states.push(value),
    onAudio: (value) => { audio = value; },
    onDuration() {},
    onError: (value) => { if (value) errors.push(value); },
  });
});

afterEach(() => {
  recording.destroy();
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  if (originalRecorder) globalThis.MediaRecorder = originalRecorder;
  else delete globalThis.MediaRecorder;
});

function stream() { return { getTracks: () => [{ stop() { stoppedTracks++; } }] }; }

test('aucune permission au démarrage du formulaire, puis un seul micro même avec deux clics', async () => {
  assert.equal(permissionRequests, 0);
  await Promise.all([recording.start(), recording.start()]);
  assert.equal(permissionRequests, 1);
  assert.equal(instances.length, 1);
  assert.deepEqual(states, ['requesting', 'recording']);
  assert.equal(timers.size, 1);
});

test('un refus du microphone permet une nouvelle tentative sans flux ni minuteur ouvert', async () => {
  navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
  await recording.start();
  assert.match(errors[0], /microphone refusé/);
  assert.equal(timers.size, 0);
  assert.equal(instances.length, 0);
  navigator.mediaDevices.getUserMedia = async () => stream();
  await recording.start();
  assert.equal(instances[0].state, 'recording');
});

test('fermer pendant une demande de permission arrête le flux reçu tardivement', async () => {
  let grant;
  navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { grant = resolve; });
  const pending = recording.start();
  recording.destroy();
  grant(stream());
  await pending;
  assert.equal(stoppedTracks, 1);
  assert.equal(instances.length, 0);
  assert.equal(timers.size, 0);
  assert.deepEqual(states, ['requesting']);
});

test('fermer pendant l’enregistrement libère immédiatement le micro et le minuteur', async () => {
  await recording.start();
  recording.destroy();
  assert.equal(stoppedTracks, 1);
  assert.equal(timers.size, 0);
  await Promise.resolve();
  assert.equal(audio, null);
  assert.deepEqual(states, ['requesting', 'recording']);
});

test('un échec de création du recorder arrête aussi le flux déjà autorisé', async () => {
  constructorError = new Error('Format indisponible');
  await recording.start();
  assert.equal(stoppedTracks, 1);
  assert.equal(timers.size, 0);
  assert.equal(states.at(-1), 'idle');
  assert.match(errors[0], /Format indisponible/);
});

test('la fermeture libère les pistes même si le recorder échoue pendant Stop', async () => {
  await recording.start();
  instances[0].stop = () => { throw new Error('Recorder indisponible'); };
  assert.doesNotThrow(() => recording.destroy());
  assert.equal(stoppedTracks, 1);
  assert.equal(timers.size, 0);
});

test('arrêter attend le dernier bloc audio, puis libère l’URL de préécoute au remplacement', async () => {
  await recording.start();
  recording.stop();
  assert.equal(stoppedTracks, 1);
  assert.equal(timers.size, 0);
  assert.equal(audio, null);
  assert.equal(states.at(-1), 'stopping');
  await Promise.resolve();
  assert.equal(states.at(-1), 'idle');
  assert.equal(await audio.blob.text(), 'sound');
  assert.equal(await (await fetch(audio.url)).text(), 'sound');
  const url = audio.url;
  recording.discard();
  await assert.rejects(fetch(url));
  assert.equal(audio, null);
});

test('fermer après Stop ne recrée pas une URL de préécoute', async () => {
  await recording.start();
  recording.stop();
  recording.destroy();
  await Promise.resolve();
  assert.equal(audio, null);
  assert.equal(timers.size, 0);
});

test('le format MP4 est conservé dans le blob et dans le nom du fichier envoyé', async () => {
  supported = ['audio/mp4'];
  await recording.start();
  recording.stop();
  await Promise.resolve();
  assert.equal(audio.blob.type, 'audio/mp4');
  assert.equal(getAudioFileName(audio.blob), 'recording.m4a');
});

test('le format par défaut du navigateur est utilisé si aucun format proposé n’est accepté', async () => {
  supported = [];
  await recording.start();
  recording.stop();
  await Promise.resolve();
  assert.equal(audio.blob.type, 'audio/ogg');
  assert.equal(getAudioFileName(audio.blob), 'recording.ogg');
});

test('un fichier vide ou trop volumineux ne peut pas être sauvegardé', async () => {
  chunk = new Blob([], { type: 'audio/webm' });
  await recording.start();
  recording.stop();
  await Promise.resolve();
  assert.equal(audio, null);
  assert.match(errors.at(-1), /Aucun son/);
  chunk = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'audio/webm' });
  await recording.start();
  recording.stop();
  await Promise.resolve();
  assert.equal(audio, null);
  assert.match(errors.at(-1), /10 Mo/);
});

test('les coordonnées doivent être complètes et valides, zéro est une vraie coordonnée', () => {
  assert.deepEqual(parsePosition('42.3', '9.15'), { latitude: 42.3, longitude: 9.15 });
  assert.deepEqual(parsePosition('0', '0'), { latitude: 0, longitude: 0 });
  for (const coords of [['', '9'], ['42', ''], [null, '9'], ['NaN', '9'], ['91', '9'], ['42', '-181'], ['Infinity', '0']]) {
    assert.equal(parsePosition(...coords), null);
  }
});
