import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function createVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const key = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const bytes = Buffer.concat([Buffer.from([4]), Buffer.from(key.x, 'base64url'), Buffer.from(key.y, 'base64url')]);
  return { publicKey: bytes.toString('base64url'), privateKey: key.d };
}

async function main() {
  const path = resolve('.dev.vars.v2');
  const previous = await readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return 'SUPABASE_SECRET_KEY=\n';
    throw error;
  });
  if (/^VAPID_(PUBLIC|PRIVATE)_KEY=\S+/m.test(previous)) {
    console.log('Les clés VAPID existantes dans .dev.vars.v2 sont conservées.');
    return;
  }
  const keys = await createVapidKeys();
  const kept = previous.replace(/^VAPID_(PUBLIC|PRIVATE)_KEY=.*(?:\r?\n|$)/gm, '').trimEnd();
  await writeFile(path, `${kept}\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`, { mode: 0o600 });
  console.log('Clés V2 créées dans .dev.vars.v2, ignoré par Git. Ouvrez ce fichier dans votre éditeur pour les copier dans Cloudflare.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Impossible de préparer .dev.vars.v2. Vérifiez les droits du fichier.'); process.exitCode = 1; });
}
