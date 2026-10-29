// Render baked frames (bake output JSON: { name: PoseRig3dFigure[] }) as driving videos in
// headless Chromium with the Director's own stage, one AVI per name.
//   npx tsx scripts/director-mocap/render.mts <frames.json> <outDir> [still-framing JSON]
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [framesPath, outDir, stillJson] = process.argv.slice(2);
if (!framesPath || !outDir) throw new Error('usage: render.mts <frames.json> <outDir> [still]');
const root = path.resolve(import.meta.dirname, '../..');
const bundled = await build({
  entryPoints: [path.join(import.meta.dirname, 'render-entry.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  tsconfig: path.join(root, 'tsconfig.json'),
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = bundled.outputFiles[0]!.text;
const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url === '/') return res.end('<!doctype html><script type="module" src="/b.js"></script>');
  if (url === '/b.js') {
    res.setHeader('content-type', 'text/javascript');
    return res.end(js);
  }
  const file = path.join(root, 'public', decodeURIComponent(url.split('?')[0]!));
  if (!file.startsWith(path.join(root, 'public')) || !existsSync(file)) {
    res.statusCode = 404;
    return res.end();
  }
  res.end(readFileSync(file));
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;
const body = (process.env.BODY === 'male' ? 'male' : 'female') as 'female' | 'male';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('console', message => console.log('[page]', message.text()));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => typeof window.renderMove === 'function');
  const all = JSON.parse(readFileSync(framesPath, 'utf8')) as Record<string, unknown[]>;
  const still = stillJson ? JSON.parse(stillJson) : null;
  mkdirSync(outDir, { recursive: true });
  for (const [name, entry] of Object.entries(all)) {
    // An entry is the frames, or { frames, camera } (a Director camera, e.g. the still's view).
    const { frames, camera, framing16 } = Array.isArray(entry)
      ? { frames: entry, camera: undefined, framing16: undefined }
      : (entry as { frames: unknown[]; camera?: unknown; framing16?: unknown[] });
    const b64 = await page.evaluate(
      ([f, s, b, h, c, r, g]) =>
        window.renderMove(
          f as never,
          s as never,
          624,
          832,
          b,
          h,
          (c ?? undefined) as never,
          r ?? undefined,
          (g ?? undefined) as never
        ),
      [
        frames,
        still,
        body,
        process.env.HOLD === '1',
        camera ?? null,
        process.env.FPS ? Number(process.env.FPS) : null,
        framing16 ?? null,
      ] as const
    );
    writeFileSync(path.join(outDir, `${name}.avi`), Buffer.from(b64, 'base64'));
    console.log(name, frames.length, 'frames');
  }
} finally {
  await browser.close();
  server.close();
}
