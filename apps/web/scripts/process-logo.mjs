import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { renameSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../public/logo.png');
const out = join(__dirname, '../public');

async function process() {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const buf = Buffer.from(data);

  // Remove white/near-white background
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    if (r > 230 && g > 230 && b > 230) {
      buf[i + 3] = 0;
    } else if (r > 200 && g > 200 && b > 200) {
      const whiteness = Math.min(r, g, b);
      buf[i + 3] = Math.round(255 * (1 - (whiteness - 200) / 55));
    }
  }

  const base = sharp(buf, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 });

  // 512x512 — main logo (write to temp then rename to avoid read/write conflict)
  await base.clone()
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(join(out, 'logo-new.png'));
  renameSync(join(out, 'logo-new.png'), join(out, 'logo.png'));
  console.log('✓ logo.png (512x512 transparent)');

  // 32x32 — favicon
  await base.clone()
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(join(out, 'logo-32.png'));
  console.log('✓ logo-32.png (32x32 favicon)');

  // 192x192 — PWA / apple icon
  await base.clone()
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(join(out, 'logo-192.png'));
  console.log('✓ logo-192.png (192x192)');

  // Horizontal — icon + space for wordmark
  await base.clone()
    .resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ right: 352, top: 16, bottom: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(join(out, 'logo-horizontal.png'));
  console.log('✓ logo-horizontal.png (512x192 horizontal)');

  console.log('\nAll variants generated!');
}

process().catch(console.error);
