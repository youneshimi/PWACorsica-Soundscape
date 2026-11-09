import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const icon = resolve(root, 'public/img/icon-512.png');
const output = resolve(root, 'public/img/og-soundscape.png');

const background = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#123D52"/>
      <stop offset="1" stop-color="#1B6B93"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop stop-color="#70B8DF" stop-opacity=".35"/>
      <stop offset="1" stop-color="#70B8DF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#sea)"/>
  <circle cx="970" cy="280" r="410" fill="url(#glow)"/>
  <path d="M0 575 C190 523 333 616 515 563 S921 513 1200 597" fill="none" stroke="#89C879" stroke-width="3" opacity=".55"/>
  <path d="M0 605 C190 553 333 646 515 593 S921 543 1200 627" fill="none" stroke="#70B8DF" stroke-width="2" opacity=".4"/>
  <rect x="72" y="74" width="7" height="482" rx="3.5" fill="#89C879"/>
  <text x="110" y="205" fill="#F2F6F5" font-family="Arial, sans-serif" font-size="65" font-weight="700">Corsica</text>
  <text x="110" y="283" fill="#F2F6F5" font-family="Arial, sans-serif" font-size="65" font-weight="700">Soundscape</text>
  <text x="113" y="362" fill="#D8E9EC" font-family="Arial, sans-serif" font-size="31">La Corse, à écouter</text>
  <text x="113" y="466" fill="#D8E9EC" font-family="Arial, sans-serif" font-size="24">Explorez les sons de l’île sur une carte interactive</text>
  <text x="113" y="505" fill="#D8E9EC" font-family="Arial, sans-serif" font-size="24">et partagez vos propres enregistrements.</text>
</svg>`);

await sharp(background)
  .composite([{ input: await sharp(icon).resize(360, 360).toBuffer(), left: 777, top: 135 }])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Image Open Graph générée : ${output}`);
