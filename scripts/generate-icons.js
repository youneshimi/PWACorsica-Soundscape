import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const image = (name) => fileURLToPath(new URL(`image/${name}`, root));
const output = (name) => fileURLToPath(new URL(`public/${name}`, root));
const background = '#3f604e';

await mkdir(output('img'), { recursive: true });

async function png(source, size, opaque = false) {
  let icon = sharp(image(source)).resize(size, size, { fit: 'contain' });
  if (opaque) icon = icon.flatten({ background });
  return icon.png({ compressionLevel: 9 }).toBuffer();
}

for (const [name, source, size, opaque] of [
  ['img/icon-192.png', 'Pic3.png', 192, false],
  ['img/icon-512.png', 'Pic3.png', 512, false],
  ['img/icon-maskable-512.png', 'Pic1.png', 512, true],
  ['img/apple-touch-icon.png', 'Pic2.png', 180, true],
  ['img/favicon-16.png', 'Pic3.png', 16, false],
  ['img/favicon-32.png', 'Pic3.png', 32, false],
]) {
  await writeFile(output(name), await png(source, size, opaque));
}

// Le fichier ICO contient trois PNG pour les onglets et les raccourcis.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => png('Pic3.png', size)));
const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
for (let i = 0; i < images.length; i++) {
  const entry = 6 + i * 16;
  directory[entry] = sizes[i];
  directory[entry + 1] = sizes[i];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[i].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
}
await writeFile(output('favicon.ico'), Buffer.concat([directory, ...images]));
console.log('Icônes PWA, iPhone et favicon exportés depuis le dossier image.');
