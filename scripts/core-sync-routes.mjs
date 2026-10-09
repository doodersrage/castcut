#!/usr/bin/env node
// @ts-check
/**
 * `prompt-studio-sync-routes` (shipped in prompt-studio-core as bin/sync-routes.mjs): regenerates
 * the app's route wrappers from the installed core, so a core update brings new or removed pages
 * and API routes with it. Run from the app's root (where package.json is). Also copies the
 * Castcut node pack file Settings → ComfyUI installs. docs/architecture-boundaries.md.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLASSIC_GENERATED_MARK,
  isRouteSourceFile,
  pairClassicRouteFiles,
  wrapperSource,
} from './classic-wrappers.mjs';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgName = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).name;
const appDir = process.cwd();
if (!existsSync(join(appDir, 'package.json')))
  throw new Error('Run from the app root (package.json).');

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// Every route file the core ships — src/app, and Prompt Studio's own pages in src/studio-app,
// which win at the same route — plus the proxy and instrumentation (the app's own layout and
// styles stay as written).
/** @param {string} dir */
const routeFiles = dir =>
  existsSync(join(pkgDir, dir))
    ? walk(join(pkgDir, dir))
        .map(path => relative(pkgDir, path).split(sep).join('/'))
        .filter(path => isRouteSourceFile(path) && path !== 'src/app/layout.tsx')
    : [];
const files = pairClassicRouteFiles(routeFiles('src/app'), routeFiles('src/studio-app'));
for (const extra of ['src/proxy.ts', 'src/instrumentation.ts']) {
  if (existsSync(join(pkgDir, extra))) files.push({ source: extra, target: extra });
}

let removed = 0;
if (existsSync(join(appDir, 'src'))) {
  for (const path of walk(join(appDir, 'src'))) {
    if (readFileSync(path, 'utf8').slice(0, 200).includes(CLASSIC_GENERATED_MARK)) {
      rmSync(path);
      removed += 1;
    }
  }
}
for (const { source, target } of files) {
  const path = join(appDir, target);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    wrapperSource(source, readFileSync(join(pkgDir, source), 'utf8'), `${pkgName}/src/`)
  );
}
const nodes = join(pkgDir, 'comfyui-nodes/castcut/castcut_nodes.py');
if (existsSync(nodes)) {
  mkdirSync(join(appDir, 'comfyui-nodes/castcut'), { recursive: true });
  cpSync(nodes, join(appDir, 'comfyui-nodes/castcut/castcut_nodes.py'));
}
console.log(`${pkgName}: ${files.length} route files written (${removed} replaced).`);
