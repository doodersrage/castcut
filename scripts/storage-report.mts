/**
 * Storage report (M6 V6): how big each part of a Castcut install's data is, against budgets.
 *
 *   npx tsx scripts/storage-report.mts --data <PROMPT_DATA_DIR>   # a real install, read only
 *   npx tsx scripts/storage-report.mts --synthetic                # a large project, built here
 *   … --json <file>                                               # the sizes as JSON too
 *
 * `--data` reads studio.sqlite (opened read only) and the media folders: each synced namespace,
 * the settings by tool and field, the Gallery rows, the folders. `--synthetic` builds one Cast at
 * the record caps — 12 feature-length scripts with their shots, 60 Scenes of 24 takes, a full run
 * and job log, 12 Cut versions — through the app's own constructors and normalizers, so the caps
 * apply, and measures the settings that would sync. Exit code 1 when a size is over its budget.
 * Budgets: docs/performance/storage-budgets.md.
 */
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { largeProjectAtCaps, STORAGE_BUDGETS } from '../src/lib/day/storage-budget';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

/** Bytes as JSON — what a sync push or a stored value costs. */
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value ?? null));
const kb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;

const BUDGETS = STORAGE_BUDGETS;

type Row = { part: string; bytes: number; budget?: number; note?: string };
const rows: Row[] = [];
const add = (part: string, bytes: number, budget?: number, note?: string) =>
  rows.push({ part, bytes, ...(budget ? { budget } : {}), ...(note ? { note } : {}) });

/** The biggest fields of an object, largest first. */
function fields(prefix: string, value: unknown, top = 8) {
  if (!value || typeof value !== 'object') return;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, field]) => [key, size(field)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top);
  for (const [key, bytes] of entries) add(`${prefix}.${key}`, bytes);
}

function folderBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    total += stat.isDirectory() ? folderBytes(path) : stat.size;
  }
  return total;
}

function sceneTool(settings: Record<string, unknown>) {
  const tools = (settings.tools ?? {}) as Record<string, Record<string, unknown>>;
  const scene = tools.scene ?? {};
  add('settings (synced)', size(settings), BUDGETS.settings);
  add('settings.shared', size(settings.shared));
  fields('settings.tools', tools, 6);
  fields('tools.scene', scene, 8);
  const scenes = (scene.scenes ?? []) as unknown[];
  if (scenes.length) {
    const biggest = Math.max(...scenes.map(size));
    add('one Scene (largest)', biggest, BUDGETS.scene, `${scenes.length} Scenes`);
  }
  const run = scene.run as { log?: unknown[] } | undefined;
  if (run?.log) add('run log', size(run.log), BUDGETS.runLog, `${run.log.length} lines`);
}

function reportData(dir: string) {
  const db = new DatabaseSync(join(dir, 'studio.sqlite'), { readOnly: true });
  const kv = db.prepare('select scope, key, json from kv').all() as Array<{
    scope: string;
    key: string;
    json: string;
  }>;
  for (const row of kv) {
    const label = `${row.key}${row.scope === 'global' ? '' : ` (${row.scope})`}`;
    if (row.key === 'settings-cache') sceneTool(JSON.parse(row.json) as Record<string, unknown>);
    else if (row.key === 'studio-extras') {
      const extras = JSON.parse(row.json) as Record<string, unknown>;
      add('studio-extras (synced)', Buffer.byteLength(row.json), BUDGETS.extras);
      fields('studio-extras', extras, 6);
    } else add(label, Buffer.byteLength(row.json));
  }
  const scripts = db
    .prepare(
      `select count(*) as n, coalesce(sum(length(json)), 0) as bytes,
         coalesce(max(length(json)), 0) as biggest
       from scene_scripts where json is not null`
    )
    .get() as { n: number; bytes: number; biggest: number };
  add('scene scripts (own rows)', scripts.bytes, undefined, `${scripts.n} scripts`);
  if (scripts.n) add('one script (largest)', scripts.biggest, BUDGETS.script);
  const gallery = db
    .prepare('select count(*) as n, coalesce(sum(length(json)), 0) as bytes from gallery_entries')
    .get() as { n: number; bytes: number };
  add('gallery rows', gallery.bytes, undefined, `${gallery.n} entries`);
  db.close();
  for (const folder of [
    'gallery-media',
    'film-output',
    'backups',
    'comfy-inputs',
    'comfy-view-cache',
  ])
    add(`${folder}/`, folderBytes(join(dir, folder)));
}

function reportSynthetic() {
  const { settings, scripts } = largeProjectAtCaps();
  sceneTool(settings);
  add('scene scripts (own records)', size(scripts), undefined, `${scripts.length} scripts`);
  add('one script (largest)', Math.max(...scripts.map(size)), BUDGETS.script);
  add(
    'tools.cut.versions',
    size(settings.tools.cut.versions),
    undefined,
    `${settings.tools.cut.versions.length} versions`
  );
}

if (args.includes('--synthetic')) reportSynthetic();
else if (flag('--data')) reportData(flag('--data')!);
else {
  console.error('usage: storage-report.mts --data <PROMPT_DATA_DIR> | --synthetic [--json <file>]');
  process.exit(2);
}

const width = Math.max(...rows.map(row => row.part.length));
let over = 0;
for (const row of rows) {
  const status = row.budget
    ? row.bytes > row.budget
      ? `OVER ${kb(row.budget)}`
      : `≤ ${kb(row.budget)}`
    : '';
  if (row.budget && row.bytes > row.budget) over += 1;
  console.log(
    `${row.part.padEnd(width)}  ${kb(row.bytes).padStart(10)}  ${status}${row.note ? `  (${row.note})` : ''}`
  );
}
const out = flag('--json');
if (out) writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`);
process.exit(over ? 1 : 0);
