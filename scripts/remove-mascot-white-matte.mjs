/**
 * Removes the flat white / near-white matte around `public/mascot/eva-welcome.png`
 * by setting alpha to 0 for low-saturation, high-luminance pixels (typical JPEG/PNG
 * export matting). Writes `public/mascot/eva-welcome-nobg.png`.
 *
 * Run: node scripts/remove-mascot-white-matte.mjs
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const inputPath = join(root, 'public', 'mascot', 'eva-welcome.png');
const outputPath = join(root, 'public', 'mascot', 'eva-welcome-nobg.png');

function shouldRemoveMatte(r, g, b) {
  const lum = (r + g + b) / 3;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  /** Flat whites, light grays, and cream matting from the export. */
  if (lum > 240 && sat < 0.14) return true;
  if (r > 247 && g > 247 && b > 247) return true;
  return false;
}

async function main() {
  if (!existsSync(inputPath)) {
    console.error('Missing input:', inputPath);
    process.exit(1);
  }

  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) {
    console.error('Expected RGBA, got channels=', channels);
    process.exit(1);
  }

  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      if (shouldRemoveMatte(r, g, b)) {
        out[i + 3] = 0;
      }
    }
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(outputPath);

  console.log('Wrote', outputPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
