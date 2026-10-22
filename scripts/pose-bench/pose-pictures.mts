/**
 * Pose bench: the shaded 3D body picture (renderPosePicture, pose/rig3d-render.ts) of reference
 * poses, from their joints alone (the rig is lifted from the 2D points, as for any pose without a
 * saved rig) — for the picture-led pose experiment (variants.py, variant D).
 *
 *   node --import tsx scripts/pose-bench/pose-pictures.mts --ids a,b --out <dir> \
 *     [--base URL] [--height 768] [--canvas 576x768]
 *
 * Needs a bench `next dev` built with NEXT_PUBLIC_PLAYWRIGHT=1 (the 3D editor's test API). Each
 * picture is drawn at the pose's own aspect and centred on the guide canvas (the Day pose map's
 * size) in the picture's background colour: <out>/<id>.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { seedSettingsCacheOnNextLoad } from '../../e2e/helpers/idb';
import { openDaySlotSheet } from '../../e2e/helpers/day';
import { dismissBlockingOverlays } from '../../e2e/helpers/overlays';
import { isolateServerStorage } from '../../e2e/helpers/storage';

const arg = (flag: string, fallback?: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1]! : fallback;
};
const ids = arg('--ids')!.split(',').filter(Boolean);
const outDir = arg('--out')!;
const baseURL = arg('--base', 'http://127.0.0.1:47963')!;
const height = Number(arg('--height', '768'));
const [canvasW, canvasH] = arg('--canvas', '576x768')!.split('x').map(Number) as [number, number];
mkdirSync(outDir, { recursive: true });

type Body = Array<{ x: number; y: number } | null>;
type Ref = { id: string; aspect: number; people: Body[] };
const refs = new Map(
  (
    JSON.parse(readFileSync('public/pose-references.json', 'utf8')) as { references: Ref[] }
  ).references.map(ref => [ref.id, ref])
);

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'comfy-workspace-mode-v1', value: 'play', url: baseURL }]);
const page = await context.newPage();
await isolateServerStorage(page);
await page.goto('/manifest.json');
await seedSettingsCacheOnNextLoad(page, {
  shared: { activeCharacterId: 'bench-pics' },
  characters: {
    version: 1,
    characters: [{ id: 'bench-pics', name: 'Pics', version: 1, updatedAt: Date.now() }],
    removedIds: [],
  },
  tools: {
    day: {
      stillsCharacterId: 'bench-pics',
      slots: ['morning', 'afternoon', 'evening', 'night'].map(id => ({
        id,
        label: id,
        location: 'a park',
        sceneHints: 'takes a quiet moment',
      })),
    },
  },
});
await page.addInitScript(() => {
  localStorage.setItem('comfy-workspace-mode-v1', 'play');
  localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
  localStorage.setItem(
    'comfy-prompt-characters-v1',
    JSON.stringify({
      version: 1,
      characters: [{ id: 'bench-pics', name: 'Pics', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    })
  );
});
await page.goto('/day?character=bench-pics', { waitUntil: 'domcontentloaded' });
await page
  .getByTestId('day-progress-edit-morning')
  .first()
  .waitFor({ timeout: 180_000 })
  .catch(async error => {
    await page.screenshot({ path: join(outDir, 'failed.png') });
    throw error;
  });
await page.waitForTimeout(5000);
await dismissBlockingOverlays(page);
await openDaySlotSheet(page, 'morning');
await page.getByTestId('day-slot-pose-preview-edit').click();
const canvas = page.getByTestId('day-slot-pose-preview-canvas');
await canvas.waitFor({ timeout: 60_000 });
for (let i = 0; i < 120; i += 1) {
  if ((await canvas.getAttribute('data-ready')) === 'true') break;
  await page.waitForTimeout(500);
}
// Keep the PNG renderPosePicture makes (its canvas keeps its drawing buffer).
await page.evaluate(() => {
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, type, quality) {
    (window as unknown as { __lastPic?: string }).__lastPic = this.toDataURL('image/png');
    return toBlob.call(this, cb, type, quality);
  };
});
for (const id of ids) {
  const ref = refs.get(id);
  if (!ref) throw new Error(`no reference ${id}`);
  const dataUrl = await page.evaluate(
    async ({ pose, height, canvasW, canvasH }) => {
      await window.__castcutPose3d!.renderPosePicture(pose as never, height);
      const src = (window as unknown as { __lastPic: string }).__lastPic;
      const img = new Image();
      img.src = src;
      await img.decode();
      const out = document.createElement('canvas');
      out.width = canvasW;
      out.height = canvasH;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#f3f2ef';
      ctx.fillRect(0, 0, canvasW, canvasH);
      const scale = Math.min(canvasW / img.width, canvasH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (canvasW - w) / 2, (canvasH - h) / 2, w, h);
      return out.toDataURL('image/png');
    },
    { pose: { aspect: ref.aspect, people: ref.people, source: 'edited' }, height, canvasW, canvasH }
  );
  writeFileSync(join(outDir, `${id}.png`), Buffer.from(dataUrl.split(',')[1]!, 'base64'));
  console.log('picture', id);
}
await browser.close();
