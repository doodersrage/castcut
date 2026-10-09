/**
 * Generates the classic Prompt Studio app's routes (apps/prompt-studio/src/app) from Castcut's:
 * every page and API route outside the Play layer gets a thin wrapper that re-exports it, with
 * its route segment config copied literally (Next reads those statically). The classic layout,
 * styles and config are hand-written next to them. docs/architecture-boundaries.md.
 *
 *   npx tsx scripts/gen-classic-app.mts           write the wrappers
 *   npx tsx scripts/gen-classic-app.mts --check   exit 1 when they are out of date
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  classicAppFiles,
  wrapperSource,
  CLASSIC_APP_DIR,
  CLASSIC_GENERATED_MARK,
} from '../src/lib/classic-app';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const check = process.argv.includes('--check');
const owned = new Set<string>(
  JSON.parse(readFileSync(join(root, 'architecture/play-owned.json'), 'utf8'))
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(root, path)];
  });
}

const wanted = new Map<string, string>();
for (const source of classicAppFiles(walk(join(root, 'src/app')), owned)) {
  wanted.set(
    join(CLASSIC_APP_DIR, source.replace(/^src\//, 'src/')),
    wrapperSource(source, readFileSync(join(root, source), 'utf8'))
  );
}
for (const source of ['src/proxy.ts', 'src/instrumentation.ts']) {
  wanted.set(
    join(CLASSIC_APP_DIR, source),
    wrapperSource(source, readFileSync(join(root, source), 'utf8'))
  );
}

const stale: string[] = [];
const appDir = join(root, CLASSIC_APP_DIR, 'src');
const present = existsSync(appDir)
  ? walk(appDir).filter(path =>
      readFileSync(join(root, path), 'utf8').slice(0, 200).includes(CLASSIC_GENERATED_MARK)
    )
  : [];
for (const path of present) {
  if (!wanted.has(path)) {
    stale.push(`remove ${path}`);
    if (!check) rmSync(join(root, path));
  }
}
for (const [path, content] of wanted) {
  const full = join(root, path);
  const current = existsSync(full) ? readFileSync(full, 'utf8') : null;
  if (current === content) continue;
  stale.push(`${current === null ? 'add' : 'update'} ${path}`);
  if (!check) {
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}
if (check && stale.length) {
  console.error(
    `Classic app routes are out of date (npx tsx scripts/gen-classic-app.mts):\n${stale.join('\n')}`
  );
  process.exit(1);
}
console.log(
  check
    ? 'classic app routes: up to date'
    : `classic app routes: ${wanted.size} files, ${stale.length} changed`
);
