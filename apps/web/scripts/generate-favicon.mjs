import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '../public');
const appDir = join(__dirname, '../src/app');

// DC Chevron SVG — matches app-logo.tsx exactly (light variant: both paths white for favicon bg)
// Using the dark variant colors on transparent background for favicons
const svgDark = `<svg width="512" height="512" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 5h7c4.97 0 8 3.13 8 8v6c0 4.87-3.03 8-8 8H4V5zm4 4v14h3c2.76 0 4-1.62 4-4v-6c0-2.38-1.24-4-4-4H8z" fill="#1E3A5F"/>
  <path d="M28 10.5c-1.1-.97-2.56-1.5-4-1.5-3.31 0-5 2.24-5 5v4c0 2.76 1.69 5 5 5 1.44 0 2.9-.53 4-1.5v4.5c-1.2.67-2.56 1-4 1-5.52 0-9-3.58-9-9v-4c0-5.42 3.48-9 9-9 1.44 0 2.8.33 4 1v4.5z" fill="#2563EB"/>
</svg>`;

// Light variant (white) on brand dark background for favicon.ico
const svgOnDark = `<svg width="512" height="512" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="6" fill="#1E3A5F"/>
  <path d="M4 5h7c4.97 0 8 3.13 8 8v6c0 4.87-3.03 8-8 8H4V5zm4 4v14h3c2.76 0 4-1.62 4-4v-6c0-2.38-1.24-4-4-4H8z" fill="#FFFFFF"/>
  <path d="M28 10.5c-1.1-.97-2.56-1.5-4-1.5-3.31 0-5 2.24-5 5v4c0 2.76 1.69 5 5 5 1.44 0 2.9-.53 4-1.5v4.5c-1.2.67-2.56 1-4 1-5.52 0-9-3.58-9-9v-4c0-5.42 3.48-9 9-9 1.44 0 2.8.33 4 1v4.5z" fill="#60A5FA"/>
</svg>`;

async function generate() {
  // favicon.png (32x32, transparent bg, dark colors) — used by metadata.icons
  await sharp(Buffer.from(svgDark))
    .resize(32, 32)
    .png()
    .toFile(join(out, 'favicon.png'));
  console.log('✓ public/favicon.png (32x32)');

  // logo-32.png (32x32, same)
  await sharp(Buffer.from(svgDark))
    .resize(32, 32)
    .png()
    .toFile(join(out, 'logo-32.png'));
  console.log('✓ public/logo-32.png (32x32)');

  // logo-192.png (192x192) — PWA manifest
  await sharp(Buffer.from(svgDark))
    .resize(192, 192)
    .png()
    .toFile(join(out, 'logo-192.png'));
  console.log('✓ public/logo-192.png (192x192)');

  // favicon.ico (32x32 on dark rounded bg) — served by Next.js from src/app/
  const icoBuffer = await sharp(Buffer.from(svgOnDark))
    .resize(32, 32)
    .png()
    .toBuffer();
  writeFileSync(join(appDir, 'favicon.ico'), icoBuffer);
  console.log('✓ src/app/favicon.ico (32x32 on dark bg)');

  // logo.png (512x512 transparent) — high-res
  await sharp(Buffer.from(svgDark))
    .resize(512, 512)
    .png()
    .toFile(join(out, 'logo.png'));
  console.log('✓ public/logo.png (512x512)');

  console.log('\nAll favicon assets generated from DC Chevron SVG!');
}

generate().catch(console.error);
