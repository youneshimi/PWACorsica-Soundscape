import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { build } from 'vite';
import { serviceWorkerPlugin } from '../build/service-worker.js';

test('le build précache ses bundles et change de version quand un fichier public change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'soundscape-build-test-'));
  try {
    await mkdir(join(root, 'public', 'img'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<html><head></head><body><script type="module" src="/entry.js"></script></body></html>');
    await writeFile(join(root, 'entry.js'), 'import "./style.css"; console.log("Soundscape");');
    await writeFile(join(root, 'style.css'), 'body { color: #243f35; }');
    const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
    await writeFile(join(root, 'public', 'sw.js'), worker);
    for (const [file, content] of [
      ['offline.html', '<html>Hors connexion</html>'],
      ['manifest.json', '{"name":"Soundscape"}'],
      ['img/icon-192.png', '192'], ['img/icon-512.png', '512'], ['img/icon-maskable-512.png', 'maskable'],
    ]) {
      await writeFile(join(root, 'public', file), content);
    }

    async function compile() {
      await build({ root, configFile: false, logLevel: 'silent', plugins: [serviceWorkerPlugin()] });
      return readFile(join(root, 'dist', 'sw.js'), 'utf8');
    }

    const first = await compile();
    const assets = JSON.parse(first.match(/const CACHE_ASSETS = (\[[\s\S]*?\]);/)[1]);
    assert.ok(assets.some((asset) => /^\/assets\/.+\.js$/.test(asset)));
    assert.ok(assets.some((asset) => /^\/assets\/.+\.css$/.test(asset)));
    assert.ok(assets.includes('/img/icon-maskable-512.png'));
    for (const asset of assets) {
      await readFile(join(root, 'dist', asset === '/' ? 'index.html' : asset.slice(1)));
    }
    assert.match(first, /const CACHE_NAME = 'soundscape-[a-f0-9]{16}';/);
    assert.equal(await compile(), first, 'Deux builds identiques gardent la même version');

    await writeFile(join(root, 'public', 'offline.html'), '<html>Une nouvelle page de secours</html>');
    const changed = await compile();
    assert.notEqual(changed.match(/const CACHE_NAME = '[^']+';/)[0], first.match(/const CACHE_NAME = '[^']+';/)[0]);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('soundscape-build-test-'));
    await rm(root, { recursive: true, force: true });
  }
});
