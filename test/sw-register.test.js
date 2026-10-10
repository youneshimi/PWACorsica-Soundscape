import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerSW, skipWaiting } from '../src/utils/sw-register.js';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const cleanups = [];
let workers;
let registration;
let reloads;
let registrations;

beforeEach(() => {
  reloads = 0;
  registrations = 0;
  registration = Object.assign(new EventTarget(), { waiting: null, installing: null });
  workers = Object.assign(new EventTarget(), {
    controller: null,
    async register(url, options) {
      registrations++;
      assert.equal(url, '/sw.js');
      assert.equal(options.updateViaCache, 'none');
      return registration;
    },
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: workers } });
  globalThis.window = Object.assign(new EventTarget(), { location: { reload() { reloads++; } } });
  globalThis.document = { readyState: 'complete' };
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  delete globalThis.window;
  delete globalThis.document;
});

function start(options) {
  const cleanup = registerSW(options);
  cleanups.push(cleanup);
  return cleanup;
}

test('le worker est enregistré même si la page a déjà fini de charger', async () => {
  start();
  await Promise.resolve();
  assert.equal(registrations, 1);
});

test('une version qui attend déjà est signalée dès le démarrage', async () => {
  workers.controller = {};
  registration.waiting = {};
  let update;
  start({ onUpdate(value) { update = value; } });
  await Promise.resolve();
  assert.equal(update, registration);
});

test('une nouvelle installation déclenche la bannière et respecte le choix de mise à jour', async () => {
  workers.controller = {};
  let update;
  let message;
  start({ onUpdate(value) { update = value; } });
  await Promise.resolve();
  const installing = Object.assign(new EventTarget(), { state: 'installing' });
  registration.installing = installing;
  registration.dispatchEvent(new Event('updatefound'));
  registration.waiting = { postMessage(value) { message = value; } };
  installing.state = 'installed';
  installing.dispatchEvent(new Event('statechange'));
  assert.equal(update, registration);
  assert.equal(message, undefined);
  skipWaiting(update);
  assert.deepEqual(message, { type: 'SKIP_WAITING' });
});

test('le premier contrôle ne recharge pas la page, une mise à jour ne la recharge qu’une fois', () => {
  start();
  workers.controller = {};
  workers.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads, 0);
  workers.dispatchEvent(new Event('controllerchange'));
  workers.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads, 1);
});

test('le nettoyage enlève les écouteurs et ignore un enregistrement terminé après démontage', async () => {
  workers.controller = {};
  registration.waiting = {};
  let updates = 0;
  const cleanup = start({ onUpdate() { updates++; } });
  cleanup();
  await Promise.resolve();
  workers.dispatchEvent(new Event('controllerchange'));
  assert.equal(updates, 0);
  assert.equal(reloads, 0);

  document.readyState = 'loading';
  start()();
  window.dispatchEvent(new Event('load'));
  assert.equal(registrations, 1);
});

test('le mode développement retire seulement le worker du projet', async () => {
  let removed = 0;
  workers.controller = { scriptURL: 'https://soundscape.test/sw.js' };
  workers.getRegistrations = async () => [{
    active: workers.controller,
    async unregister() { removed++; },
  }, {
    active: { scriptURL: 'https://soundscape.test/other-sw.js' },
    async unregister() { assert.fail('Un autre worker doit être préservé'); },
  }];
  start({ enabled: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removed, 1);
  assert.equal(registrations, 0);
  assert.equal(reloads, 1);
});
