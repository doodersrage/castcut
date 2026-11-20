#!/usr/bin/env node
/**
 * The card's memory over a run (ENGINE_PLAN.md phase 6): every few seconds, what each process
 * holds on the GPU (nvidia-smi), whether ComfyUI is running a job and what LM Studio has loaded,
 * one JSON line each. With --report, a summary of a recorded file: the peak, the time the card
 * was nearly full, and who held what then.
 *
 *   node scripts/gpu-watch.mjs --out gpu.jsonl [--every 2] [--comfy http://127.0.0.1:8188]
 *     [--lmstudio http://127.0.0.1:1234]
 *   node scripts/gpu-watch.mjs --report gpu.jsonl [--full-mib 1024]
 *
 * Read-only: it never queues, frees or unloads anything. Same machine as the GPU only.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = name => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

/** A process's role on the card, by its command line. */
function roleOf(command) {
  if (/ComfyUI\/main\.py|comfyui/i.test(command)) return 'comfyui';
  if (/lmstudio|llama\.cpp|ollama/i.test(command)) return 'llm';
  if (/addons\/voice|castcut-voice|voice/i.test(command)) return 'voice';
  if (/diffusers/i.test(command)) return 'diffusers';
  return 'other';
}

function gpuNow() {
  const total = execFileSync(
    'nvidia-smi',
    ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'],
    { encoding: 'utf8', timeout: 10_000 }
  )
    .trim()
    .split(',')
    .map(Number);
  const apps = execFileSync(
    'nvidia-smi',
    ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'],
    { encoding: 'utf8', timeout: 10_000 }
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => line.split(',').map(part => part.trim()));
  const held = {};
  for (const [pid, mib] of apps) {
    let command = '';
    try {
      command = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    } catch {
      // Gone since nvidia-smi listed it.
    }
    const role = roleOf(command);
    held[role] = (held[role] ?? 0) + Number(mib);
  }
  return { usedMib: total[0], totalMib: total[1], util: total[2], held };
}

async function json(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function record() {
  const out = flag('out');
  if (!out) {
    console.error('Usage: node scripts/gpu-watch.mjs --out gpu.jsonl | --report gpu.jsonl');
    process.exit(2);
  }
  const every = Math.max(1, Number(flag('every') ?? 2)) * 1000;
  const comfy = (flag('comfy') ?? 'http://127.0.0.1:8188').replace(/\/+$/, '');
  const lms = (flag('lmstudio') ?? 'http://127.0.0.1:1234').replace(/\/+$/, '');
  for (;;) {
    const started = Date.now();
    let gpu = null;
    try {
      gpu = gpuNow();
    } catch {
      // nvidia-smi busy or gone: the line says so.
    }
    const [queue, models] = await Promise.all([
      json(`${comfy}/queue`),
      json(`${lms}/api/v0/models`),
    ]);
    const line = {
      at: started,
      ...(gpu ?? { error: 'nvidia-smi' }),
      comfyRunning: queue ? queue.queue_running.length : null,
      comfyPending: queue ? queue.queue_pending.length : null,
      llmLoaded: models
        ? (models.data ?? []).filter(model => model.state === 'loaded').map(model => model.id)
        : null,
    };
    appendFileSync(out, `${JSON.stringify(line)}\n`);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, every - (Date.now() - started))));
  }
}

function report(file) {
  const fullMib = Number(flag('full-mib') ?? 1024);
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(line => typeof line.usedMib === 'number');
  if (!lines.length) return console.log('no samples');
  const span = (lines.at(-1).at - lines[0].at) / 60_000;
  const step = lines.length > 1 ? (lines.at(-1).at - lines[0].at) / (lines.length - 1) : 0;
  const peak = lines.reduce((a, b) => (b.usedMib > a.usedMib ? b : a));
  const full = lines.filter(line => line.totalMib - line.usedMib < fullMib);
  const roles = [...new Set(lines.flatMap(line => Object.keys(line.held)))];
  console.log(`${lines.length} samples over ${span.toFixed(1)} min; card ${peak.totalMib} MiB`);
  console.log(
    `peak ${peak.usedMib} MiB at ${new Date(peak.at).toLocaleTimeString()}: ${JSON.stringify(peak.held)}`
  );
  for (const role of roles) {
    const values = lines.map(line => line.held[role] ?? 0);
    const on = values.filter(value => value > 0).length;
    console.log(
      `  ${role.padEnd(9)} max ${Math.max(...values)} MiB, on the card ${((100 * on) / lines.length).toFixed(0)}% of the time`
    );
  }
  console.log(
    `within ${fullMib} MiB of full: ${full.length} samples (${((full.length * step) / 60_000).toFixed(1)} min)` +
      (full.length
        ? `; ComfyUI running in ${full.filter(line => line.comfyRunning).length}, an LLM loaded in ${full.filter(line => line.llmLoaded?.length).length}`
        : '')
  );
  const gaps = lines.filter((line, index) => index && line.at - lines[index - 1].at > 30_000);
  if (gaps.length) console.log(`${gaps.length} gaps over 30 s in the record (nvidia-smi stalls?)`);
}

const reportFile = flag('report');
if (reportFile) report(reportFile);
else await record();
