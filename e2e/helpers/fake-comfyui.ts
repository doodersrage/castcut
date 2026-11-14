/**
 * A stand-in ComfyUI on a free local port, for e2e specs where the app's server talks to ComfyUI
 * itself (a run the server renders): jobs queued are kept and finish after `renderMs` with a
 * 1×1 picture; uploads are accepted; /object_info has no models (the queue skips its model check,
 * as it does when ComfyUI's list can't be read). Never the user's ComfyUI.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export type FakeComfyJob = { id: string; prompt: unknown; at: number; text: string };

export async function startFakeComfyUi(options: { renderMs?: number } = {}) {
  const renderMs = options.renderMs ?? 500;
  const jobs: FakeComfyJob[] = [];
  let uploads = 0;
  const done = (job: FakeComfyJob) => Date.now() - job.at >= renderMs;
  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (req.method === 'POST' && url.pathname === '/prompt') {
        const parsed = JSON.parse(body.toString('utf8') || '{}') as { prompt?: unknown };
        const id = `fake-${jobs.length + 1}`;
        jobs.push({
          id,
          prompt: parsed.prompt,
          at: Date.now(),
          text: JSON.stringify(parsed.prompt),
        });
        return json(res, 200, { prompt_id: id, number: jobs.length, node_errors: {} });
      }
      if (url.pathname.startsWith('/history/')) {
        const id = decodeURIComponent(url.pathname.slice('/history/'.length));
        const job = jobs.find(entry => entry.id === id);
        if (!job || !done(job)) return json(res, 200, {});
        return json(res, 200, {
          [id]: {
            status: { status_str: 'success', completed: true, messages: [] },
            outputs: {
              '9': { images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }] },
            },
          },
        });
      }
      if (url.pathname === '/history') {
        const out: Record<string, unknown> = {};
        for (const job of jobs.filter(done)) {
          out[job.id] = {
            status: { status_str: 'success', completed: true, messages: [] },
            outputs: {
              '9': { images: [{ filename: `${job.id}.png`, subfolder: '', type: 'output' }] },
            },
          };
        }
        return json(res, 200, out);
      }
      if (url.pathname === '/queue') {
        const pending = jobs
          .filter(job => !done(job))
          .map((job, i) => [i, job.id, job.prompt, {}, []]);
        return json(res, 200, {
          queue_running: pending.slice(0, 1),
          queue_pending: pending.slice(1),
        });
      }
      if (url.pathname === '/view') {
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(PNG);
      }
      if (req.method === 'POST' && url.pathname === '/upload/image') {
        uploads += 1;
        return json(res, 200, { name: `fake-upload-${uploads}.png`, subfolder: '', type: 'input' });
      }
      if (url.pathname === '/system_stats') {
        return json(res, 200, {
          system: {},
          devices: [{ name: 'fake', vram_total: 24e9, vram_free: 20e9 }],
        });
      }
      // No jobs API, no model lists: the app falls back as it does for an older ComfyUI.
      return json(res, 404, { error: 'not here' });
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    jobs,
    // The app keeps its connections to "ComfyUI" alive: closed first, or close() waits forever.
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
