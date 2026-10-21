// Capture proxy between the bench's Castcut and the real ComfyUI. Everything is forwarded except
// still renders: a POST /prompt with a sampler and a saved output is written to CAPTURE_DIR and
// answered with a fake prompt id (nothing reaches ComfyUI's shared queue). Utility graphs (DWPose
// reads for "From a photo", face crops, mattes) run for real so the page carries on. Queue
// deletes / interrupts are swallowed: the queue is shared.
//
//   CAPTURE_DIR=<dir> PROXY_PORT=47964 node scripts/pose-bench/proxy.mjs
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const TARGET = { host: '127.0.0.1', port: Number(process.env.COMFY_PORT || 8188) };
const OUT = (process.env.CAPTURE_DIR || './captured').replace(/\/?$/, '/');
const PORT = Number(process.env.PROXY_PORT || 47964);
mkdirSync(OUT, { recursive: true });
const SAVES =
  /"class_type"\s*:\s*"(?:SaveImage|SaveAnimatedWEBP|SaveAnimatedPNG|SaveVideo|VHS_VideoCombine)"/;
const SAMPLES =
  /"class_type"\s*:\s*"(?:KSampler|KSamplerAdvanced|SamplerCustom|SamplerCustomAdvanced|T8QwenImage21FunAccPDD4Step)"/;
let n = 0;
// Captured ids stay "pending" in GET /queue, so the page keeps its cards waiting instead of
// calling the still lost (and redoing it).
const fake = [];
http
  .createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const path = (req.url ?? '').split('?')[0];
      const text = req.method === 'POST' && path === '/prompt' ? body.toString('utf8') : '';
      if (text && SAVES.test(text) && SAMPLES.test(text)) {
        const id = randomUUID();
        n += 1;
        writeFileSync(`${OUT}${Date.now()}-${String(n).padStart(4, '0')}-${id}.json`, body);
        fake.push([1000 + n, id, {}, {}, []]);
        console.log('captured', n, id);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ prompt_id: id, number: n, node_errors: {} }));
        return;
      }
      if (req.method !== 'GET' && /^\/(queue|interrupt|free|history)$/.test(path)) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      }
      const mergeQueue = req.method === 'GET' && path === '/queue';
      const up = http.request(
        {
          ...TARGET,
          method: req.method,
          path: req.url,
          headers: {
            ...req.headers,
            host: `${TARGET.host}:${TARGET.port}`,
            ...(mergeQueue ? { 'accept-encoding': 'identity' } : {}),
          },
        },
        r => {
          if (!mergeQueue || r.statusCode !== 200) {
            res.writeHead(r.statusCode ?? 502, r.headers);
            r.pipe(res);
            return;
          }
          const parts = [];
          r.on('data', c => parts.push(c));
          r.on('end', () => {
            let out = Buffer.concat(parts);
            try {
              const queue = JSON.parse(out.toString('utf8'));
              queue.queue_pending = [...(queue.queue_pending ?? []), ...fake];
              out = Buffer.from(JSON.stringify(queue));
            } catch {
              /* not JSON: pass through */
            }
            const headers = { ...r.headers, 'content-length': String(out.length) };
            delete headers['transfer-encoding'];
            delete headers['content-encoding'];
            res.writeHead(200, headers);
            res.end(out);
          });
        }
      );
      up.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      up.end(body);
    });
  })
  .listen(PORT, '127.0.0.1', () =>
    console.log(`proxy on ${PORT} → ${TARGET.port}, capturing to ${OUT}`)
  );
