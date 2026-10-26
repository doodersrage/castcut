#!/usr/bin/env node
/**
 * Upgrade check (M6 V1): what a running Castcut holds — Casts, Scenes, takes, kept takes,
 * scripts, Cut versions, Gallery entries, history — counted through its own storage API, read
 * only. Run it before an upgrade (`--out before.json`) and after (`--out after.json`), then
 * `--compare before.json after.json`: any count that went down is listed and the exit code is 1.
 *
 *   node scripts/upgrade-check.mjs --url http://127.0.0.1:47832 --username admin --password … --out before.json
 *   node scripts/upgrade-check.mjs --url http://127.0.0.1:47832 --username admin --password … --out after.json
 *   node scripts/upgrade-check.mjs --compare before.json after.json
 *
 * With sign-in on, it signs in (`--username` / `--password`, or CASTCUT_USERNAME /
 * CASTCUT_PASSWORD) — your data is per user. `--token` (or PROMPT_API_TOKEN) is sent as well, for
 * a server that also asks for its API token; `--cookie` uses a session you already have.
 *
 * It reads the server's copy (`PUT /api/storage?namespace=…`, which only reads), so open the app
 * in the browser first and let it finish syncing: the browser's own copy is the primary one.
 * Nothing is written to the server.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = name => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const list = value => (Array.isArray(value) ? value : []);
const obj = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** The counts a report holds, from the namespaces' data. */
export function countProduction({ settings, gallery, extras, history, deletedIds }) {
  const tools = obj(obj(settings).tools);
  const scene = obj(tools.scene);
  const cut = obj(tools.cut);
  const day = obj(tools.day);
  const scenes = list(scene.scenes);
  const scripts = list(scene.scripts);
  const entries = Array.isArray(gallery) ? gallery : list(obj(gallery).entries);
  const characters = list(obj(extras).characters);
  const historyEntries = Array.isArray(history) ? history : list(obj(history).entries);
  return {
    casts: characters.length,
    looks: characters.reduce((sum, cast) => sum + list(obj(cast).looks).length, 0),
    scenes: scenes.length,
    takes: scenes.reduce((sum, entry) => sum + list(obj(entry).takes).length, 0),
    keptTakes: scenes.filter(entry => obj(entry).keptTakeId).length,
    scripts: scripts.length,
    plannedShots: scripts.reduce((sum, entry) => sum + list(obj(entry).shots).length, 0),
    sceneRun: scene.run ? 1 : 0,
    cutVersions: list(cut.versions).length,
    cutAddedShots: list(cut.extras).length,
    cutShotEdits: Object.keys(obj(obj(obj(cut.options).shotEdits).shots)).length,
    daySlots: list(day.slots).length,
    dayStills: list(day.stills).length,
    galleryEntries: entries.length,
    galleryCompleted: entries.filter(entry => obj(entry).status === 'completed').length,
    galleryFilms: entries.filter(entry => obj(entry).derivedKind === 'film').length,
    galleryKeptCopies: entries.filter(entry => obj(entry).durableOriginalPath).length,
    galleryDeletedIds: list(deletedIds).length,
    historyEntries: historyEntries.length,
  };
}

/** What went down from `before` to `after` (a count that only grows or holds is fine). */
export function compareReports(before, after) {
  const lost = [];
  for (const [key, was] of Object.entries(before.counts)) {
    const now = after.counts[key] ?? 0;
    if (now < was) lost.push({ key, before: was, after: now });
  }
  return lost;
}

async function read(url, namespace, headers) {
  const response = await fetch(`${url}/api/storage?namespace=${namespace}`, {
    method: 'PUT',
    headers,
  });
  if (response.status === 401)
    throw new Error('Sign in required: pass --username and --password (or --cookie).');
  if (response.status === 503) {
    throw new Error('This server keeps no data (PROMPT_DATA_DIR not set): nothing to check.');
  }
  if (!response.ok) throw new Error(`${namespace}: HTTP ${response.status}`);
  return (await response.json()).data ?? null;
}

/** Sign in and return the session cookie (only what `cookie:` needs: name=value pairs). */
async function signIn(url, username, password, token) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-prompt-api-token': token, Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(`Sign-in failed (HTTP ${response.status}).`);
  const cookies = response.headers.getSetCookie?.() ?? [];
  const pairs = cookies.map(cookie => cookie.split(';')[0]).filter(Boolean);
  if (!pairs.length) throw new Error('Sign-in returned no session cookie.');
  return pairs.join('; ');
}

async function report(url, token, cookie) {
  const headers = {
    ...(token ? { 'x-prompt-api-token': token } : {}),
    ...(cookie ? { cookie } : {}),
  };
  const [settings, gallery, extras, history, deletedIds] = await Promise.all(
    [
      'settings-cache',
      'comfy-gallery',
      'studio-extras',
      'prompt-history',
      'gallery-deleted-ids',
    ].map(namespace => read(url, namespace, headers))
  );
  const version = await fetch(`${url}/api/version`, { headers })
    .then(response => (response.ok ? response.json() : {}))
    .catch(() => ({}));
  return {
    checkedAt: new Date().toISOString(),
    url,
    version: version.current ?? version.currentVersion ?? null,
    counts: countProduction({ settings, gallery, extras, history, deletedIds }),
  };
}

function printCounts(result) {
  console.log(
    `Castcut ${result.version ?? '(version unknown)'} at ${result.url} — ${result.checkedAt}`
  );
  for (const [key, value] of Object.entries(result.counts)) {
    console.log(`  ${key.padEnd(20)} ${value}`);
  }
}

async function main() {
  const compare = flag('--compare');
  if (compare) {
    const before = JSON.parse(readFileSync(compare, 'utf8'));
    const after = JSON.parse(readFileSync(args[args.indexOf('--compare') + 2], 'utf8'));
    console.log(`Before: ${before.version ?? '?'} (${before.checkedAt})`);
    console.log(`After:  ${after.version ?? '?'} (${after.checkedAt})`);
    for (const key of Object.keys(before.counts)) {
      const was = before.counts[key];
      const now = after.counts[key] ?? 0;
      const mark = now < was ? '  ✗ LESS' : now > was ? '  + more' : '';
      console.log(
        `  ${key.padEnd(20)} ${String(was).padStart(6)} → ${String(now).padStart(6)}${mark}`
      );
    }
    const lost = compareReports(before, after);
    if (lost.length) {
      console.log(`\n${lost.length} count(s) went down — stop, and roll back (docs/operator.md).`);
      process.exit(1);
    }
    console.log('\nNothing went down.');
    return;
  }
  const url = (flag('--url') ?? 'http://127.0.0.1:47832').replace(/\/+$/, '');
  const token = flag('--token') ?? process.env.PROMPT_API_TOKEN;
  const username = flag('--username') ?? process.env.CASTCUT_USERNAME;
  const password = flag('--password') ?? process.env.CASTCUT_PASSWORD;
  const cookie =
    flag('--cookie') ??
    (username && password ? await signIn(url, username, password, token) : undefined);
  const result = await report(url, token, cookie);
  printCounts(result);
  const out = flag('--out');
  if (out) {
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Saved to ${out}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
