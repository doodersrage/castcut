import path from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { buildDayPoseGuide } from '../src/lib/day/pose-guide-server';

// FINISHING_PLAN Phase 3, step 5: the server draws pose guides with @napi-rs/canvas (Skia, as
// Chrome's canvas). The same guide, drawn by the page's own code in Chromium and on the server,
// must be the same picture — pixel for pixel (measured 2026-11-13: identical).
const cases: Array<[string, string, number]> = [
  ['morning', 'pours coffee at the kitchen counter', 1],
  ['afternoon', 'sits on a park bench reading a book', 1],
  ['evening', 'Mara and Theo, the two of them together, dancing close in the living room', 2],
  ['night', 'lies on the sofa with a book on her chest', 1],
];

const options = (people: number) => ({
  stylePreference: 'openpose',
  aspect: { width: 1536, height: 864 },
  ...(people === 2 ? { headcount: 2 } : {}),
});

test('a pose guide drawn on the server is the one the page draws', async ({ page }) => {
  test.setTimeout(180_000);
  const root = path.join(__dirname, '..');
  const bundled = await build({
    stdin: {
      contents: `import { buildDayPoseGuide } from './src/lib/day/pose-guide';
        window.renderGuide = async (slot, beat, opts) => {
          const guide = await buildDayPoseGuide(slot, beat, 'qwen-image-edit-2511', opts);
          return Array.from(new Uint8Array(await guide.file.arrayBuffer()));
        };`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    tsconfig: path.join(root, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['node:*', 'sharp', '@napi-rs/canvas'],
    logLevel: 'error',
  });
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
  const pixels = async (png: Buffer) => sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const [slot, beat, people] of cases) {
    const fromPage = Buffer.from(
      await page.evaluate(
        ([s, b, o]) =>
          (window as unknown as { renderGuide: (...args: unknown[]) => Promise<number[]> }).renderGuide(s, b, o),
        [slot, beat, options(people)] as const
      )
    );
    const guide = await buildDayPoseGuide(slot as never, beat, 'qwen-image-edit-2511', options(people) as never);
    const fromServer = Buffer.from(await guide.file.arrayBuffer());
    const a = await pixels(fromPage);
    const b = await pixels(fromServer);
    expect([b.info.width, b.info.height], beat).toEqual([a.info.width, a.info.height]);
    let differ = 0;
    for (let i = 0; i < a.data.length; i += 1) if (Math.abs(a.data[i]! - b.data[i]!) > 8) differ += 1;
    expect(differ, beat).toBe(0);
  }
});
