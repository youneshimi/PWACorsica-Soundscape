import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function serviceWorkerPlugin() {
  let config;

  return {
    name: 'soundscape-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async writeBundle(options, bundle) {
      const output = resolve(config.root, config.build.outDir);
      const source = await readFile(resolve(config.publicDir, 'sw.js'), 'utf8');
      const shell = [
        '/', '/index.html', '/offline.html', '/manifest.json', '/soundscape.md',
        '/img/icon-192.png', '/img/icon-512.png', '/img/icon-maskable-512.png',
      ];
      const files = Object.keys(bundle).filter((file) => !file.endsWith('.map')).sort();
      const assets = [...new Set([...shell, ...files.map((file) => `/${file}`)])];
      const hash = createHash('sha256').update(source);

      for (const file of assets.filter((asset) => asset !== '/')) {
        hash.update(file);
        hash.update(await readFile(resolve(output, file.slice(1))));
      }

      const worker = source
        .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'soundscape-${hash.digest('hex').slice(0, 16)}';`)
        .replace(/const CACHE_ASSETS = \[[\s\S]*?\];/, `const CACHE_ASSETS = ${JSON.stringify(assets, null, 2)};`);

      await writeFile(resolve(output, 'sw.js'), worker);
    },
  };
}
