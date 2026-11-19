/**
 * The engine benchmark (ENGINE_PLAN.md phase 1): a fixed set of real render graphs replayed on
 * ComfyUI with their own seeds, each job's time by stage read from the Castcut node pack
 * (/castcut/timings, 1.9.0+) and summed as the app does (comfyui/stage-timing.ts). Run it twice:
 * the phase's gate is the two runs within 5 %.
 *
 *   npx tsx scripts/engine-bench.mts <list.txt> --out <results.json> [--vs <earlier.json>]
 *     [--comfy http://127.0.0.1:8188] [--output-dir <ComfyUI output folder>]
 *
 * list.txt: one ComfyUI output PNG or MP4 per line (a file name in --output-dir, or a path); its
 * embedded graph is the job (an MP4's is read with ffprobe). Saves go to the output folder's castcut-bench/ (never over a render). Jobs are
 * queued one at a time, as client castcut-bench, behind anything already in the queue.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  RENDER_STAGES,
  renderStagesOf,
  type ComfyJobTimings,
  type RenderStages,
} from '../src/lib/comfyui/stage-timing';

type Graph = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
type Result = { file: string; promptId?: string; stages?: RenderStages; skipped?: string };

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const listFile = args.find(
  arg => !arg.startsWith('--') && !args[args.indexOf(arg) - 1]?.startsWith('--')
);
const comfy = (flag('comfy') ?? 'http://127.0.0.1:8188').replace(/\/+$/, '');
const outputDir = flag('output-dir') ?? '';
const outFile = flag('out');
if (!listFile || !outFile) {
  console.error(
    'Usage: npx tsx scripts/engine-bench.mts <list.txt> --out <results.json> [--vs <earlier.json>]'
  );
  process.exit(2);
}

/** An MP4 or WebM's embedded API graph (SaveVideo's "prompt" tag), read with ffprobe. */
function videoGraphOf(file: string): Graph | null {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'quiet', '-show_entries', 'format_tags=prompt', '-of', 'json', file],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    const prompt = (JSON.parse(out) as { format?: { tags?: { prompt?: string } } }).format?.tags
      ?.prompt;
    return prompt ? (JSON.parse(prompt) as Graph) : null;
  } catch {
    return null;
  }
}

/** A PNG's embedded API graph (tEXt "prompt"), or a video's. */
function graphOf(file: string): Graph | null {
  if (/\.(mp4|webm|mov)$/i.test(file)) return videoGraphOf(file);
  const bytes = readFileSync(file);
  let at = 8;
  while (at + 8 <= bytes.length) {
    const size = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    if (type === 'tEXt') {
      const data = bytes.subarray(at + 8, at + 8 + size);
      const zero = data.indexOf(0);
      if (data.toString('latin1', 0, zero) === 'prompt') {
        try {
          return JSON.parse(data.toString('utf8', zero + 1)) as Graph;
        } catch {
          return null;
        }
      }
    }
    if (type === 'IEND') break;
    at += 12 + size;
  }
  return null;
}

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok)
    throw new Error(`${response.status} ${await response.text().catch(() => '')}`.slice(0, 300));
  return response.json();
}

async function inputExists(name: string): Promise<boolean> {
  const slash = name.lastIndexOf('/');
  const params = new URLSearchParams({
    filename: slash >= 0 ? name.slice(slash + 1) : name,
    subfolder: slash >= 0 ? name.slice(0, slash) : '',
    type: 'input',
  });
  const response = await fetch(`${comfy}/view?${params}`, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return Boolean(response?.ok);
}

async function run(file: string): Promise<Result> {
  const path = isAbsolute(file) ? file : join(outputDir, file);
  if (!existsSync(path)) return { file, skipped: 'no such file' };
  const graph = graphOf(path);
  if (!graph) return { file, skipped: 'no graph in the PNG' };
  // Its pictures, sounds and videos must still be in ComfyUI's input folder.
  for (const node of Object.values(graph)) {
    const name =
      node.class_type === 'LoadImage'
        ? node.inputs?.image
        : node.class_type === 'LoadAudio'
          ? node.inputs?.audio
          : node.class_type === 'LoadVideo'
            ? node.inputs?.file
            : undefined;
    if (typeof name === 'string' && !(await inputExists(name))) {
      return { file, skipped: `input missing: ${name}` };
    }
  }
  for (const node of Object.values(graph)) {
    if (/^Save/.test(node.class_type ?? '') && node.inputs && 'filename_prefix' in node.inputs) {
      node.inputs.filename_prefix = 'castcut-bench/bench';
    }
  }
  const queued = (await json(`${comfy}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: 'castcut-bench' }),
  })) as { prompt_id?: string };
  const promptId = queued.prompt_id;
  if (!promptId) return { file, skipped: 'not queued' };
  for (let waited = 0; waited < 30 * 60_000; waited += 2000) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const history = (await json(`${comfy}/history/${promptId}`).catch(() => ({}))) as Record<
      string,
      { status?: { completed?: boolean; status_str?: string } }
    >;
    const entry = history[promptId];
    if (!entry?.status) continue;
    if (entry.status.status_str === 'error') return { file, promptId, skipped: 'render error' };
    if (!entry.status.completed) continue;
    const timings = (await json(
      `${comfy}/castcut/timings?prompt_id=${encodeURIComponent(promptId)}`
    )) as ComfyJobTimings & { unknown?: boolean };
    if (timings.unknown)
      return { file, promptId, skipped: 'not timed (Castcut nodes 1.9.0+ needed)' };
    const stages = renderStagesOf(graph, timings);
    return stages ? { file, promptId, stages } : { file, promptId, skipped: 'no timings' };
  }
  return { file, promptId, skipped: 'timed out' };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length
    ? sorted.length % 2
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2
    : 0;
};

function summarize(results: Result[]) {
  const timed = results.filter(result => result.stages);
  const out: Record<string, { median: number; total: number }> = {};
  for (const key of [...RENDER_STAGES, 'totalMs'] as const) {
    const values = timed.map(result => result.stages![key]);
    out[key] = { median: median(values), total: values.reduce((a, b) => a + b, 0) };
  }
  return { jobs: timed.length, stages: out };
}

const files = readFileSync(listFile, 'utf8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));
const results: Result[] = [];
const started = Date.now();
for (const [index, file] of files.entries()) {
  const result = await run(file).catch(
    error => ({ file, skipped: String(error).slice(0, 200) }) as Result
  );
  results.push(result);
  console.log(
    `${index + 1}/${files.length} ${file}: ${result.stages ? `${(result.stages.totalMs / 1000).toFixed(1)} s` : `skipped — ${result.skipped}`}`
  );
}
const summary = summarize(results);
writeFileSync(outFile, JSON.stringify({ at: started, comfy, summary, results }, null, 2));
console.log(
  `\n${summary.jobs} jobs timed of ${files.length} in ${((Date.now() - started) / 60_000).toFixed(1)} min`
);
for (const key of [...RENDER_STAGES, 'totalMs'] as const) {
  const s = summary.stages[key]!;
  console.log(
    `  ${(key === 'totalMs' ? 'total' : key).padEnd(7)} median ${(s.median / 1000).toFixed(2).padStart(7)} s   total ${(s.total / 1000).toFixed(1).padStart(8)} s`
  );
}
const vs = flag('vs');
if (vs) {
  const earlier = JSON.parse(readFileSync(vs, 'utf8')) as {
    summary: ReturnType<typeof summarize>;
    results: Result[];
  };
  // The same jobs in both runs only.
  const both = new Set(earlier.results.filter(r => r.stages).map(r => r.file));
  const mine = summarize(results.filter(r => r.stages && both.has(r.file)));
  const theirs = summarize(
    earlier.results.filter(r => r.stages && results.some(m => m.stages && m.file === r.file))
  );
  console.log(`\nAgainst ${vs} (${mine.jobs} jobs in both):`);
  for (const key of [...RENDER_STAGES, 'totalMs'] as const) {
    const a = theirs.stages[key]!.total;
    const b = mine.stages[key]!.total;
    if (a < 1000 && b < 1000) continue;
    const diff = (100 * (b - a)) / Math.max(1, a);
    console.log(
      `  ${(key === 'totalMs' ? 'total' : key).padEnd(7)} ${(a / 1000).toFixed(1)} s → ${(b / 1000).toFixed(1)} s  ${diff >= 0 ? '+' : ''}${diff.toFixed(1)} %`
    );
  }
  const total = Math.abs(
    (100 * (mine.stages.totalMs!.total - theirs.stages.totalMs!.total)) /
      Math.max(1, theirs.stages.totalMs!.total)
  );
  console.log(
    `  Gate (total within 5 %): ${total <= 5 ? 'MET' : 'NOT met'} (${total.toFixed(1)} %)`
  );
}
