import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import {
  compositePortraitOnNeutralBackdrop,
  cropFaceBoxFromBlob,
  cropPortraitFaceRegionFromBlob,
} from '../src/lib/face/portrait-face-crop-server';

// FINISHING_PLAN Phase 3, step 5: the server crops faces and lays them on the neutral plate with
// @napi-rs/canvas (Skia, as Chrome's canvas). The page's code in Chromium and the server make the
// same pictures — measured 2026-11-13: mean difference 0.17–0.34 of 255, at most 13 (the two
// WebP decoders), so a small tolerance, not exact equality.
const BOX = { x: 300, y: 120, width: 160, height: 180 };

test('a face crop made on the server is the one the page makes', async ({ page }) => {
  test.setTimeout(180_000);
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'public', 'samples', 'check-sample.webp'));
  const bundled = await build({
    stdin: {
      contents: `import { compositePortraitOnNeutralBackdrop, cropFaceBoxFromBlob, cropPortraitFaceRegionFromBlob } from './src/lib/face/portrait-face-crop';
        window.faceOps = async (bytes, box) => {
          const blob = new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
          const files = [
            await cropPortraitFaceRegionFromBlob(blob),
            await cropFaceBoxFromBlob(blob, 'box.png', box),
            await compositePortraitOnNeutralBackdrop(blob),
          ];
          return Promise.all(files.map(async file => Array.from(new Uint8Array(await file.arrayBuffer()))));
        };`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    tsconfig: path.join(root, 'tsconfig.json'),
    external: ['node:*', 'sharp', '@napi-rs/canvas'],
    logLevel: 'error',
  });
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
  const fromPage = await page.evaluate(
    ([bytes, box]) =>
      (window as unknown as { faceOps: (...args: unknown[]) => Promise<number[][]> }).faceOps(bytes, box),
    [Array.from(source), BOX] as const
  );
  const blob = new Blob([source], { type: 'image/webp' });
  const fromServer = [
    await cropPortraitFaceRegionFromBlob(blob),
    await cropFaceBoxFromBlob(blob, 'box.png', BOX),
    await compositePortraitOnNeutralBackdrop(blob),
  ];
  const names = ['portrait crop', 'face-box crop', 'neutral backdrop'];
  for (let i = 0; i < names.length; i += 1) {
    const a = await sharp(Buffer.from(fromPage[i]!)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(Buffer.from(await fromServer[i]!.arrayBuffer()))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([b.info.width, b.info.height], names[i]).toEqual([a.info.width, a.info.height]);
    let sum = 0;
    let max = 0;
    for (let j = 0; j < a.data.length; j += 1) {
      const d = Math.abs(a.data[j]! - b.data[j]!);
      sum += d;
      if (d > max) max = d;
    }
    expect(sum / a.data.length, `${names[i]}: mean difference`).toBeLessThan(1);
    expect(max, `${names[i]}: largest difference`).toBeLessThan(32);
  }
});
