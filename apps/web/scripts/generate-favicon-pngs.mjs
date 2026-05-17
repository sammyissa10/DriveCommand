#!/usr/bin/env node
/**
 * Generate PNG favicon and PWA icons from SVG source.
 *
 * Run: node scripts/generate-favicon-pngs.mjs
 *
 * Generates:
 * - logo-192.png (Apple touch icon, PWA)
 * - logo.png (512x512, PWA)
 *
 * Requires: npm install sharp
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// Use the dark variant (navy + silver) for PWA icons since they typically appear on light backgrounds
const svgPath = join(publicDir, 'brand', 'favicon-dark.svg');
const svgBuffer = readFileSync(svgPath);

const sizes = [
  { name: 'logo-192.png', size: 192 },
  { name: 'logo.png', size: 512 },
];

async function generate() {
  console.log('Generating PNG favicons from SVG...\n');

  for (const { name, size } of sizes) {
    const outputPath = join(publicDir, name);

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  console.log('\nDone! PNG files generated in public/');
  console.log('\nNote: For best results on dark backgrounds, you may also want to');
  console.log('generate light-variant PNGs using favicon-light.svg.');
}

generate().catch((err) => {
  console.error('Error generating PNGs:', err);
  process.exit(1);
});
