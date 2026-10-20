/**
 * Moves one domain of the flat src/lib folder into its own folder: `src/lib/<prefix>*.ts(x)` →
 * `src/lib/<dir>/<name without prefix>`, with `git mv`, and rewrites every reference to the moved
 * files — imports, `import()`, `mock.module(…)` and any other `@/…` or relative string that
 * resolves to one of them (alias stays alias, relative stays relative), the moved files' own
 * relative imports, and `src/lib/…` path text in code, architecture/*.json and docs.
 *
 *   npx tsx scripts/move-lib-domain.mts --prefix day- --dir day [--dry-run]
 *
 * Only for modules the core package doesn't ship: Prompt Studio imports core files by path
 * (`prompt-studio-core/src/lib/…`), so moving a shared module is a breaking change for it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const arg = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const prefix = arg('--prefix');
const dir = arg('--dir');
const dryRun = process.argv.includes('--dry-run');
if (!prefix || !dir) {
  console.error('usage: move-lib-domain.mts --prefix <name-> --dir <folder> [--dry-run]');
  process.exit(1);
}

const toPosix = (path: string) => path.split(sep).join('/');
const CODE_EXT = /\.(?:ts|tsx|mts|mjs|js|cjs)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.claude',
  'site',
  'packages',
  'test-results',
]);

function walk(start: string, accept: (path: string) => boolean): string[] {
  if (!existsSync(join(root, start))) return [];
  return readdirSync(join(root, start)).flatMap(name => {
    if (SKIP_DIRS.has(name)) return [];
    const path = posix.join(start, name);
    if (statSync(join(root, path)).isDirectory()) return walk(path, accept);
    return accept(path) ? [path] : [];
  });
}

// The moves: old repo path → new repo path.
const moves = new Map<string, string>();
for (const name of readdirSync(join(root, 'src/lib'))) {
  const old = `src/lib/${name}`;
  if (!name.startsWith(prefix) || !/\.tsx?$/.test(name) || !statSync(join(root, old)).isFile())
    continue;
  const target = `src/lib/${dir}/${name.slice(prefix.length)}`;
  if (existsSync(join(root, target))) throw new Error(`${target} already exists`);
  moves.set(old, target);
}
if (moves.size === 0) throw new Error(`No src/lib/${prefix}* files`);

const EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '/index.ts',
  '/index.tsx',
];
function resolveLocal(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2);
  else if (spec.startsWith('./') || spec.startsWith('../'))
    base = posix.join(posix.dirname(from), spec);
  else return null;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(join(root, candidate)) && statSync(join(root, candidate)).isFile())
      return candidate;
  }
  return null;
}

/** The spec for `target` written from `fromNew`, in the same style as the original spec. */
function respec(original: string, resolved: string, target: string, fromNew: string): string {
  // Keep an explicit extension only if the original had one.
  const keepExt = resolved.endsWith(original.slice(original.lastIndexOf('/') + 1));
  const viaIndex = /\/index\.tsx?$/.test(resolved) && !/\/index(?:\.tsx?)?$/.test(original);
  const path = viaIndex
    ? posix.dirname(target)
    : keepExt
      ? target
      : target.replace(/\.(?:tsx?|mts|m?js|cjs)$/, '');
  if (original.startsWith('@/')) return '@/' + path.slice('src/'.length);
  let rel = posix.relative(posix.dirname(fromNew), path);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

const SPEC_RE = /(['"`])((?:@\/|\.\.?\/)[^'"`\n$]+)\1/g;
const oldNames = [...moves.keys()].map(path =>
  path.slice('src/lib/'.length).replace(/\.tsx?$/, '')
);
// `src/lib/day/planner.ts`, `lib/day/planner` in path text (not part of a longer name).
const PATH_TEXT_RE = new RegExp(
  `((?:src/)?lib/)(${oldNames
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?![A-Za-z0-9_-])`,
  'g'
);
const rewritePathText = (text: string) =>
  text.replace(PATH_TEXT_RE, (_all, lead: string, name: string) => {
    const target = moves.get(`src/lib/${name}.ts`) ?? moves.get(`src/lib/${name}.tsx`)!;
    return lead + target.slice('src/lib/'.length).replace(/\.tsx?$/, '');
  });

const codeFiles = [
  ...['src', 'scripts', 'e2e', 'desktop'].flatMap(start =>
    walk(start, path => CODE_EXT.test(path))
  ),
  ...readdirSync(root).filter(name => CODE_EXT.test(name) && statSync(join(root, name)).isFile()),
];
const textFiles = [
  ...walk('architecture', path => path.endsWith('.json')),
  ...walk('docs', path => path.endsWith('.md') && !/release-notes|test-checklist/.test(path)),
];

const writes = new Map<string, string>();
let specEdits = 0;
for (const file of codeFiles) {
  const source = readFileSync(join(root, file), 'utf8');
  const fromNew = moves.get(file) ?? file;
  let out = source.replace(SPEC_RE, (all, quote: string, spec: string) => {
    const resolved = resolveLocal(file, spec);
    if (!resolved) return all;
    const target = moves.get(resolved);
    const fileMoved = fromNew !== file;
    // An alias import of an unmoved file is unaffected; a relative one changes if this file moved.
    if (!target && (spec.startsWith('@/') || !fileMoved)) return all;
    const next = respec(spec, resolved, target ?? resolved, fromNew);
    if (next === spec) return all;
    specEdits++;
    return quote + next + quote;
  });
  out = rewritePathText(out);
  if (out !== source || moves.has(file)) writes.set(file, out);
}
for (const file of textFiles) {
  const source = readFileSync(join(root, file), 'utf8');
  const out = rewritePathText(source);
  if (out !== source) writes.set(file, out);
}

console.log(
  `${moves.size} files → src/lib/${dir}/, ${specEdits} specifiers rewritten, ${writes.size} files written.`
);
if (dryRun) {
  for (const [from, to] of moves) console.log(`  ${from} → ${to}`);
  process.exit(0);
}

for (const [from, to] of moves) {
  execFileSync('mkdir', ['-p', join(root, posix.dirname(to))]);
  execFileSync('git', ['mv', from, to], { cwd: root });
}
for (const [file, content] of writes) writeFileSync(join(root, moves.get(file) ?? file), content);
console.log(toPosix(relative(root, join(root, 'src/lib', dir))) + ' ready.');
