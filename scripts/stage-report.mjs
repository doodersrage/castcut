#!/usr/bin/env node
/**
 * Where a run's render time went (ENGINE_PLAN.md phase 1): each finished job's stages (load,
 * encode, sample, decode, finish, save, other — comfyui/stage-timing.ts, recorded on its Gallery
 * entry when the Castcut node pack 1.9.0+ timed it), as medians and totals, stills and clips apart.
 *
 *   node scripts/stage-report.mjs <studio.sqlite> [--from <ms|ISO>] [--to <ms|ISO>]
 *   node scripts/stage-report.mjs <studio.sqlite> --from A --to B --vs-from C --vs-to D
 *
 * With --vs-*, a second window (the benchmark run again) and each stage's median difference: the
 * phase's gate is two runs within 5%. Read a COPY of an install's studio.sqlite (with -wal, -shm),
 * never a live one.
 */
import { DatabaseSync } from 'node:sqlite';

const STAGES = ['load', 'encode', 'sample', 'decode', 'finish', 'save', 'other'];
const args = process.argv.slice(2);
const file = args.find(arg => !arg.startsWith('--'));
const option = name => {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return undefined;
  const raw = args[at + 1];
  const n = Number(raw);
  return Number.isFinite(n) ? n : Date.parse(raw);
};
if (!file) {
  console.error(
    'Usage: node scripts/stage-report.mjs <studio.sqlite> [--from] [--to] [--vs-from --vs-to]'
  );
  process.exit(2);
}

const db = new DatabaseSync(file, { readOnly: true });
const rows = db
  .prepare('SELECT completed_at, json FROM gallery_entries WHERE completed_at IS NOT NULL')
  .all();

function window(from, to) {
  const jobs = [];
  for (const row of rows) {
    const at = Number(row.completed_at);
    if (from !== undefined && at < from) continue;
    if (to !== undefined && at > to) continue;
    let entry;
    try {
      entry = JSON.parse(row.json);
    } catch {
      continue;
    }
    const stages = entry.renderStages;
    if (!stages || typeof stages.totalMs !== 'number') continue;
    const clip = (entry.images ?? []).some(image =>
      /\.(mp4|webm|mov|gif)$/i.test(image?.filename ?? '')
    );
    jobs.push({ clip, stages });
  }
  return jobs;
}

const median = values => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const sec = ms => `${(ms / 1000).toFixed(1)} s`;

function summary(jobs) {
  const out = {};
  for (const stage of [...STAGES, 'totalMs']) {
    const values = jobs.map(job => job.stages[stage] ?? 0);
    out[stage] = { median: median(values), total: values.reduce((a, b) => a + b, 0) };
  }
  return out;
}

function print(label, jobs) {
  for (const kind of ['stills', 'clips']) {
    const list = jobs.filter(job => job.clip === (kind === 'clips'));
    if (!list.length) continue;
    const s = summary(list);
    console.log(`\n${label} — ${list.length} ${kind}`);
    console.log('  stage     median     total   share');
    for (const stage of [...STAGES, 'totalMs']) {
      const share = s.totalMs.total ? ((100 * s[stage].total) / s.totalMs.total).toFixed(0) : '0';
      console.log(
        `  ${(stage === 'totalMs' ? 'total' : stage).padEnd(8)} ${sec(s[stage].median).padStart(8)} ${sec(s[stage].total).padStart(9)} ${share.padStart(5)} %`
      );
    }
  }
}

const first = window(option('from'), option('to'));
print('Run', first);
if (option('vs-from') !== undefined || option('vs-to') !== undefined) {
  const second = window(option('vs-from'), option('vs-to'));
  print('Again', second);
  console.log('\nMedian difference (the gate: within 5 %)');
  for (const kind of ['stills', 'clips']) {
    const a = summary(first.filter(job => job.clip === (kind === 'clips')));
    const b = summary(second.filter(job => job.clip === (kind === 'clips')));
    if (!a.totalMs.median || !b.totalMs.median) continue;
    const parts = [...STAGES, 'totalMs']
      .filter(stage => a[stage].median >= 100 || b[stage].median >= 100)
      .map(stage => {
        const diff = (100 * (b[stage].median - a[stage].median)) / Math.max(1, a[stage].median);
        return `${stage === 'totalMs' ? 'total' : stage} ${diff >= 0 ? '+' : ''}${diff.toFixed(1)} %`;
      });
    const total = Math.abs((100 * (b.totalMs.median - a.totalMs.median)) / a.totalMs.median);
    console.log(
      `  ${kind}: ${parts.join(' · ')} — ${total <= 5 ? 'within 5 %' : 'NOT within 5 %'}`
    );
  }
}
if (!first.length) {
  console.log(
    '\nNo timed jobs in that window: the Castcut node pack 1.9.0+ times them (Settings → ComfyUI → Castcut nodes).'
  );
}
