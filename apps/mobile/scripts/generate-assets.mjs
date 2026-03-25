/**
 * Generates DriveCommand mobile app assets:
 *  - icon.png (1024x1024)
 *  - android-icon-foreground.png (1024x1024)
 *  - android-icon-background.png (1024x1024)
 *  - android-icon-monochrome.png (1024x1024)
 *  - splash-icon.png (1284x2778 full-bleed splash)
 *  - favicon.png (48x48)
 *  - notification-icon.png (96x96)
 */

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../assets/images');

// ─── SVG definitions ──────────────────────────────────────────────────────────

/**
 * DC Chevron icon SVG (1024x1024)
 * Design: dark navy bg, blue gradient chevron (upward arrow) with "DC" lettermark
 */
const iconSvg = (size = 1024) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="chevron" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="60%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>

  <!-- Chevron shape: two thick angled bars meeting at the top-center -->
  <!-- Left arm of chevron -->
  <polygon
    points="180,720  340,720  512,330  512,190  "
    fill="url(#chevron)"
    filter="url(#glow)"
    opacity="0.15"
  />

  <!-- Main chevron (solid) -->
  <!-- Left bar -->
  <polygon
    points="155,740  310,740  512,345  512,205  "
    fill="url(#chevron)"
  />
  <!-- Right bar -->
  <polygon
    points="869,740  714,740  512,345  512,205  "
    fill="url(#chevron)"
  />

  <!-- "DC" wordmark below chevron -->
  <text
    x="512"
    y="870"
    font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
    font-size="130"
    font-weight="900"
    fill="white"
    text-anchor="middle"
    letter-spacing="18"
    opacity="0.95"
  >DC</text>

  <!-- Subtle tagline -->
  <text
    x="512"
    y="945"
    font-family="Arial, sans-serif"
    font-size="52"
    font-weight="400"
    fill="#60a5fa"
    text-anchor="middle"
    letter-spacing="10"
    opacity="0.7"
  >DRIVECOMMAND</text>
</svg>`;

/**
 * Android foreground (1024x1024, safe zone is center 66%)
 */
const androidFgSvg = (size = 1024) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="chevron" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="60%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>

  <!-- transparent background for adaptive icon -->

  <!-- Chevron centered in safe zone (roughly 200–820 area) -->
  <!-- Left bar -->
  <polygon
    points="210,700  335,700  512,360  512,250  "
    fill="url(#chevron)"
  />
  <!-- Right bar -->
  <polygon
    points="814,700  689,700  512,360  512,250  "
    fill="url(#chevron)"
  />

  <!-- DC -->
  <text
    x="512"
    y="820"
    font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
    font-size="110"
    font-weight="900"
    fill="white"
    text-anchor="middle"
    letter-spacing="16"
  >DC</text>
</svg>`;

/**
 * Android monochrome (1024x1024, white on transparent)
 */
const androidMonoSvg = (size = 1024) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <!-- Left bar -->
  <polygon points="210,700  335,700  512,360  512,250  " fill="white"/>
  <!-- Right bar -->
  <polygon points="814,700  689,700  512,360  512,250  " fill="white"/>
  <text
    x="512" y="820"
    font-family="'Arial Black', Arial, sans-serif"
    font-size="110" font-weight="900"
    fill="white" text-anchor="middle" letter-spacing="16"
  >DC</text>
</svg>`;

/**
 * Full-bleed splash screen (1284 x 2778 — iPhone 15 Pro Max size, works for all)
 * Design: dark teal-navy gradient background + centered DC chevron + "DriveCommand" wordmark
 */
const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778" viewBox="0 0 1284 2778">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#0d2137"/>
      <stop offset="45%" stop-color="#0f2d3d"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="teal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#134e6f" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="chevron" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="55%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="20" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <filter id="softglow">
      <feGaussianBlur stdDeviation="40" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1284" height="2778" fill="url(#bg)"/>

  <!-- Subtle teal radial overlay (top-left, matching login-bg feel) -->
  <ellipse cx="0" cy="600" rx="900" ry="700" fill="#1a5f7a" opacity="0.18"/>
  <!-- bottom right warmth -->
  <ellipse cx="1284" cy="2200" rx="700" ry="500" fill="#0f3460" opacity="0.15"/>

  <!-- Subtle horizontal road-line hints (very faint) -->
  <line x1="0" y1="1700" x2="1284" y2="1680" stroke="#1e4a6e" stroke-width="1.5" opacity="0.3"/>
  <line x1="0" y1="1720" x2="1284" y2="1700" stroke="#1e4a6e" stroke-width="1" opacity="0.2"/>
  <line x1="0" y1="1740" x2="1284" y2="1725" stroke="#1e4a6e" stroke-width="0.8" opacity="0.15"/>

  <!-- ── Logo group, centered at y=1200 ── -->
  <!-- Glow halo behind chevron -->
  <ellipse cx="642" cy="1130" rx="260" ry="200" fill="#3b82f6" opacity="0.08" filter="url(#softglow)"/>

  <!-- Chevron (scaled for 1284px wide canvas) -->
  <!-- Left bar -->
  <polygon
    points="220,1340  410,1340  642,900  642,740  "
    fill="url(#chevron)"
    filter="url(#glow)"
  />
  <!-- Right bar -->
  <polygon
    points="1064,1340  874,1340  642,900  642,740  "
    fill="url(#chevron)"
    filter="url(#glow)"
  />

  <!-- "DriveCommand" wordmark -->
  <text
    x="642"
    y="1520"
    font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
    font-size="98"
    font-weight="900"
    fill="white"
    text-anchor="middle"
    letter-spacing="6"
  >DriveCommand</text>

  <!-- Subtitle tagline -->
  <text
    x="642"
    y="1610"
    font-family="Arial, 'Helvetica Neue', sans-serif"
    font-size="40"
    font-weight="400"
    fill="#60a5fa"
    text-anchor="middle"
    letter-spacing="8"
    opacity="0.75"
  >FLEET MANAGEMENT</text>

  <!-- Bottom diamond spark (matches login-bg star motif) -->
  <polygon
    points="642,2580  651,2595  642,2610  633,2595"
    fill="white"
    opacity="0.5"
  />
</svg>`;

// ─── Generate all assets ───────────────────────────────────────────────────────

async function generate() {
  console.log('Generating DriveCommand mobile assets...\n');

  // App icon (1024x1024)
  await sharp(Buffer.from(iconSvg(1024)))
    .png()
    .toFile(join(OUT, 'icon.png'));
  console.log('✓ icon.png');

  // Favicon (48x48)
  await sharp(Buffer.from(iconSvg(1024)))
    .resize(48, 48)
    .png()
    .toFile(join(OUT, 'favicon.png'));
  console.log('✓ favicon.png');

  // Notification icon (96x96, monochrome works best)
  await sharp(Buffer.from(androidMonoSvg(1024)))
    .resize(96, 96)
    .png()
    .toFile(join(OUT, 'notification-icon.png'));
  console.log('✓ notification-icon.png');

  // Android adaptive foreground (1024x1024, transparent bg)
  await sharp(Buffer.from(androidFgSvg(1024)))
    .png()
    .toFile(join(OUT, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png');

  // Android adaptive background (solid dark navy)
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } }
  })
    .png()
    .toFile(join(OUT, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png');

  // Android monochrome (1024x1024)
  await sharp(Buffer.from(androidMonoSvg(1024)))
    .png()
    .toFile(join(OUT, 'android-icon-monochrome.png'));
  console.log('✓ android-icon-monochrome.png');

  // Splash screen (1284x2778)
  await sharp(Buffer.from(splashSvg))
    .png()
    .toFile(join(OUT, 'splash-icon.png'));
  console.log('✓ splash-icon.png');

  console.log('\nAll assets generated successfully!');
}

generate().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
