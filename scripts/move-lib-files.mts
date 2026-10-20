/**
 * Moves src/lib files into domain folders (docs/architecture-boundaries.md, "Lib layout") with
 * `git mv`, and rewrites every reference to them: imports, `import()`, `mock.module(…)` and any
 * other `@/…` or relative string that resolves to a moved file (alias stays alias, relative stays
 * relative), the moved files' own relative imports, and `src/lib/…` path text in code,
 * architecture/*.json and docs. Each move is added to architecture/lib-moves.json, from which
 * pack-core writes re-exports at the old paths, so Prompt Studio's `prompt-studio-core/src/lib/…`
 * imports keep working.
 *
 *   npx tsx scripts/move-lib-files.mts --map moves.json [--only gallery,comfyui] [--dry-run]
 *   npx tsx scripts/move-lib-files.mts --prefix day- --dir day [--dry-run]
 *
 * `--map` is `{ "src/lib/old.ts": "src/lib/dir/new.ts" }`; entries whose file is gone are skipped,
 * so one map can be run folder by folder with `--only`. A move that would put a file on the other
 * side of the Play boundary (isPlayLayer) stops the run: widen PLAY_LAYER_RE first.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { isPlayLayer } from '../src/lib/architecture-boundaries';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const arg = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const dryRun = process.argv.includes('--dry-run');
const exists = (path: string) => existsSync(join(root, path));
const isFile = (path: string) => exists(path) && statSync(join(root, path)).isFile();

// The moves: old repo path → new repo path.
const moves = new Map<string, string>();
const mapFile = arg('--map');
const prefix = arg('--prefix');
const dir = arg('--dir');
if (mapFile) {
  const only = arg('--only')?.split(',');
  const map = JSON.parse(readFileSync(mapFile, 'utf8')) as Record<string, string>;
  for (const [from, to] of Object.entries(map)) {
    if (!isFile(from)) continue;
    if (only && !only.some(folder => to.startsWith(`src/lib/${folder}/`))) continue;
    moves.set(from, to);
  }
} else if (prefix && dir) {
  for (const name of readdirSync(join(root, 'src/lib'))) {
    const from = `src/lib/${name}`;
    if (name.startsWith(prefix) && /\.tsx?$/.test(name) && isFile(from))
      moves.set(from, `src/lib/${dir}/${name.slice(prefix.length)}`);
  }
} else {
  console.error('usage: move-lib-files.mts (--map <file> [--only a,b] | --prefix <p> --dir <d>) [--dry-run]');
  process.exit(1);
}
if (moves.size === 0) {
  console.log('Nothing to move.');
  process.exit(0);
}
const targets = new Set<string>();
for (const to of moves.values()) {
  if (exists(to)) throw new Error(`${to} already exists`);
  if (targets.has(to)) throw new Error(`two files move to ${to}`);
  targets.add(to);
}

// Play stays Play, shared stays shared.
const ownedFile = join(root, 'architecture/play-owned.json');
const owned = new Set<string>(JSON.parse(readFileSync(ownedFile, 'utf8')));
const ownedAfter = new Set([...owned].map(path => moves.get(path) ?? path));
// A test may join Play (nothing imports it; it only stops shipping in the core package).
const flipped = [...moves].filter(
  ([from, to]) =>
    isPlayLayer(from, owned) !== isPlayLayer(to, ownedAfter) &&
    !(to.includes('.test.') && isPlayLayer(to, ownedAfter))
);
if (flipped.length) {
  for (const [from, to] of flipped)
    console.error(`  ${from} → ${to}: ${isPlayLayer(from, owned) ? 'Play → shared' : 'shared → Play'}`);
  throw new Error(`${flipped.length} moves cross the Play boundary; update PLAY_LAYER_RE first`);
}

const CODE_EXT = /\.(?:ts|tsx|mts|mjs|js|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.claude', 'site', 'packages', 'test-results']);
function walk(start: string, accept: (path: string) => boolean): string[] {
  if (!exists(start)) return [];
  return readdirSync(join(root, start)).flatMap(name => {
    if (SKIP_DIRS.has(name)) return [];
    const path = posix.join(start, name);
    if (statSync(join(root, path)).isDirectory()) return walk(path, accept);
    return accept(path) ? [path] : [];
  });
}

const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.json', '/index.ts', '/index.tsx'];
function resolveLocal(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2);
  else if (spec.startsWith('./') || spec.startsWith('../')) base = posix.join(posix.dirname(from), spec);
  else return null;
  for (const ext of EXTENSIONS) if (isFile(base + ext)) return base + ext;
  return null;
}

/** The spec for `target` written from `fromNew`, in the same style as the original spec. */
function respec(original: string, resolved: string, target: string, fromNew: string): string {
  const keepExt = resolved.endsWith(original.slice(original.lastIndexOf('/') + 1));
  const viaIndex = /\/index\.tsx?$/.test(resolved) && !/\/index(?:\.tsx?)?$/.test(original);
  const path = viaIndex
    ? posix.dirname(target)
    : keepExt
      ? target
      : target.replace(/\.(?:tsx?|mts|m?js|cjs)$/, '');
  if (original.startsWith('@/')) return '@/' + path.slice('src/'.length);
  const rel = posix.relative(posix.dirname(fromNew), path);
  return rel.startsWith('.') ? rel : './' + rel;
}

const SPEC_RE = /(['"`])((?:@\/|\.\.?\/)[^'"`\n$]+)\1/g;
const stripExt = (path: string) => path.replace(/\.tsx?$/, '');
const libName = (path: string) => stripExt(path.slice('src/lib/'.length));
const byOldName = new Map([...moves].map(([from, to]) => [libName(from), libName(to)]));
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `src/lib/gallery/cap.ts`, `lib/gallery/cap` in path text (not part of a longer name).
const PATH_TEXT_RE = new RegExp(
  `((?:src/)?lib/)(${[...byOldName.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|')})(?![A-Za-z0-9_-])`,
  'g'
);
const rewritePathText = (text: string) =>
  text.replace(PATH_TEXT_RE, (_all, lead: string, name: string) => lead + byOldName.get(name)!);

const codeFiles = [
  ...['src', 'scripts', 'e2e', 'desktop'].flatMap(start => walk(start, path => CODE_EXT.test(path))),
  ...readdirSync(root).filter(name => CODE_EXT.test(name) && isFile(name)),
];
const textFiles = [
  ...walk('architecture', path => path.endsWith('.json') && !path.endsWith('lib-moves.json')),
  ...walk('docs', path => path.endsWith('.md') && !/release-notes|test-checklist/.test(path)),
];

const writes = new Map<string, string>();
let specEdits = 0;
for (const file of codeFiles) {
  const source = readFileSync(join(root, file), 'utf8');
  const fromNew = moves.get(file) ?? file;
  const fileMoved = fromNew !== file;
  // Specs first, then path text: a rewritten spec names only new paths, which the text pass skips.
  let out = source.replace(SPEC_RE, (all, quote: string, spec: string) => {
    const resolved = resolveLocal(file, spec);
    if (!resolved) return all;
    const target = moves.get(resolved);
    // An alias import of an unmoved file is unaffected; a relative one changes if this file moved.
    if (!target && (spec.startsWith('@/') || !fileMoved)) return all;
    const next = respec(spec, resolved, target ?? resolved, fromNew);
    if (next === spec) return all;
    specEdits++;
    return quote + next + quote;
  });
  out = rewritePathText(out);
  if (out !== source || fileMoved) writes.set(file, out);
}
for (const file of textFiles) {
  const source = readFileSync(join(root, file), 'utf8');
  const out = rewritePathText(source);
  if (out !== source) writes.set(file, out);
}

console.log(`${moves.size} files moved, ${specEdits} specifiers rewritten, ${writes.size} files written.`);
if (dryRun) {
  for (const [from, to] of moves) console.log(`  ${from} → ${to}`);
  process.exit(0);
}

for (const [from, to] of moves) {
  execFileSync('mkdir', ['-p', join(root, posix.dirname(to))]);
  execFileSync('git', ['mv', from, to], { cwd: root });
}
for (const [file, content] of writes) writeFileSync(join(root, moves.get(file) ?? file), content);

// The record pack-core reads. A file moved twice keeps its first path pointing at the latest.
const recordFile = join(root, 'architecture/lib-moves.json');
const record: Record<string, string> = existsSync(recordFile)
  ? JSON.parse(readFileSync(recordFile, 'utf8'))
  : {};
for (const [from, to] of Object.entries(record)) if (moves.has(to)) record[from] = moves.get(to)!;
for (const [from, to] of moves) if (!from.includes('.test.')) record[from] = to;
const sorted = Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(recordFile, JSON.stringify(sorted, null, 2) + '\n');
