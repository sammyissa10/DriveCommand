/**
 * generate-email-logo.mjs
 *
 * Produces apps/web/public/email/logo-2x.png — the DriveCommand mark, rendered
 * light-on-navy for the transactional email header band.
 *
 * SOURCE, and why this one:
 *   public/brand/drivecommand-mark-mono-light.svg — every path is #F5F5F7 (the
 *   `bone` token), authored for dark surfaces. The obvious candidate,
 *   public/logo.png, is the COLOUR mark at #050A44 navy, which is very nearly
 *   the #002654 navy of the header band it would sit on — invisible in practice.
 *
 * WHY NOT logo-horizontal.png:
 *   Despite the name it carries no wordmark. process-logo.mjs builds it as the
 *   160x160 mark with `.extend({ right: 352 })`, i.e. 352px of empty transparent
 *   padding. There is no wordmark IMAGE anywhere in this repo — app-logo.tsx
 *   renders the wordmark as live text (Poppins, D at 800 + riveCommand at 600).
 *   The email header therefore pairs this mark with live HTML text, which also
 *   survives image blocking, unlike a wordmark bitmap.
 *
 * Output is 48x48 for a 24x24 CSS render (2x for retina). `.trim()` removes the
 * transparent margin baked into the 500x500 viewBox so the mark fills its box.
 *
 * Usage (from apps/web/):
 *   node scripts/generate-email-logo.mjs
 */

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../public/brand/drivecommand-mark-mono-light.svg');
const outDir = join(__dirname, '../public/email');

// Rendered at 24x24 in the header; 2x for retina.
const DISPLAY_PX = 24;
const SCALE = 2;

async function main() {
  mkdirSync(outDir, { recursive: true });

  // Rasterise the SVG large, then trim the transparent margin the 500x500
  // viewBox carries, then fit into the final square. Trimming before the resize
  // is what makes the mark fill its 24px box instead of floating in padding.
  const trimmed = await sharp(src, { density: 600 })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .trim()
    .toBuffer();

  const out = join(outDir, 'logo-2x.png');
  await sharp(trimmed)
    .resize(DISPLAY_PX * SCALE, DISPLAY_PX * SCALE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(out);

  const meta = await sharp(out).metadata();
  console.log(
    `logo-2x.png written: ${meta.width}x${meta.height}, ${meta.channels} channels, ` +
      `alpha=${meta.hasAlpha}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
