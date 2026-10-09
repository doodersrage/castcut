/**
 * Builds the shared core package (packages/prompt-studio-core) that the classic Prompt Studio
 * repo depends on: every src/ file the classic app reaches from its routes and layout, with `@/`
 * imports rewritten to relative paths (consumers don't have Castcut's alias), and the npm
 * dependencies those files import. Castcut's src/ stays the one source; the package is a build
 * output (gitignored) — publish it with `npm publish packages/prompt-studio-core`.
 * docs/architecture-boundaries.md.
 *
 *   npx tsx scripts/pack-core.mts [--version 0.1.0] [--name @scope/prompt-studio-core]
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
import { isPlayLayer, readImports } from '../src/lib/architecture-boundaries';
import { classicRouteFiles } from '../src/lib/classic-app';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const arg = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const pkgName = arg('--name') ?? process.env.CORE_PACKAGE_NAME ?? 'prompt-studio-core';
const out = join(root, 'packages/prompt-studio-core');
const castcut = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = arg('--version') ?? castcut.version;
const owned = new Set<string>(
  JSON.parse(readFileSync(join(root, 'architecture/play-owned.json'), 'utf8'))
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(root, path).split(sep).join('/')];
  });
}

const EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];
function resolveLocal(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2);
  else if (spec.startsWith('.')) base = join(dirname(from), spec).split(sep).join('/');
  else return null;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(join(root, candidate)) && statSync(join(root, candidate)).isFile())
      return candidate;
  }
  throw new Error(`Cannot resolve ${spec} from ${from}`);
}

function packageOf(spec: string): string | null {
  if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

// Entry points: the routes the classic app wraps, the proxy and instrumentation, and what its
// layout uses.
const entries = [
  ...classicRouteFiles(walk(join(root, 'src')), owned).map(file => file.source),
  'src/proxy.ts',
  'src/instrumentation.ts',
  'src/app/globals.css',
  'src/components/RootDocument.tsx',
  'src/lib/root-metadata.ts',
  'src/lib/brand.ts',
];

const files = new Set<string>();
const npmDeps = new Set<string>();
const queue = [...entries];
while (queue.length) {
  const file = queue.pop()!;
  if (files.has(file)) continue;
  if (isPlayLayer(file, owned)) throw new Error(`The classic app reaches Play: ${file}`);
  files.add(file);
  if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(file)) continue;
  for (const { spec } of readImports(readFileSync(join(root, file), 'utf8'))) {
    const local = resolveLocal(file, spec);
    if (local) queue.push(local);
    else {
      const name = packageOf(spec);
      if (name) npmDeps.add(name);
    }
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const file of [...files].sort()) {
  const target = join(out, file);
  mkdirSync(dirname(target), { recursive: true });
  if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(file)) {
    cpSync(join(root, file), target);
    continue;
  }
  // `@/x` → a path relative to this file (the consumer has no alias).
  const source = readFileSync(join(root, file), 'utf8').replace(
    /(['"])@\/([^'"\n]+)\1/g,
    (_match, quote: string, rest: string) => {
      let rel = relative(dirname(file), 'src/' + rest)
        .split(sep)
        .join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      return quote + rel + quote;
    }
  );
  writeFileSync(target, source);
}
cpSync(join(root, 'next.config.base.cjs'), join(out, 'next.config.base.cjs'));
// prompt-studio-sync-routes: the app regenerates its route wrappers from this package.
mkdirSync(join(out, 'bin'), { recursive: true });
cpSync(join(root, 'scripts/classic-wrappers.mjs'), join(out, 'bin/classic-wrappers.mjs'));
cpSync(join(root, 'scripts/core-sync-routes.mjs'), join(out, 'bin/sync-routes.mjs'));
// The Castcut node pack file Settings → ComfyUI copy-installs (sync-routes copies it into the app).
mkdirSync(join(out, 'comfyui-nodes/castcut'), { recursive: true });
cpSync(
  join(root, 'comfyui-nodes/castcut/castcut_nodes.py'),
  join(out, 'comfyui-nodes/castcut/castcut_nodes.py')
);

const allDeps: Record<string, string> = { ...castcut.devDependencies, ...castcut.dependencies };
// Native or framework packages the app installs once at its top level (sharp: Next uses it too).
const peers = new Set(['react', 'react-dom', 'next', 'sharp']);
const dependencies: Record<string, string> = {};
const peerDependencies: Record<string, string> = {};
const optionalDependencies: Record<string, string> = {};
const missing: string[] = [];
for (const name of [...npmDeps].sort()) {
  const range = allDeps[name];
  if (range) {
    (peers.has(name) ? peerDependencies : dependencies)[name] = range;
    // Types the consumer's type-check needs (Castcut keeps them in devDependencies).
    const types = `@types/${name.replace(/^@([^/]+)\//, '$1__')}`;
    if (allDeps[types]) dependencies[types] = allDeps[types];
    continue;
  }
  // Installed here but not declared (an optional runtime import such as ioredis): declare it
  // optional at the installed version, so the consumer type-checks and can use it.
  const installed = join(root, 'node_modules', name, 'package.json');
  if (existsSync(installed)) {
    optionalDependencies[name] = `^${JSON.parse(readFileSync(installed, 'utf8')).version}`;
  } else if (!/^[a-z_]+$/.test(name)) {
    missing.push(name);
  }
}
for (const name of ['tailwindcss', '@tailwindcss/postcss']) {
  if (allDeps[name]) dependencies[name] = allDeps[name];
}
writeFileSync(
  join(out, 'package.json'),
  JSON.stringify(
    {
      name: pkgName,
      version,
      description:
        'Shared core of Castcut and Prompt Studio: ComfyUI pipeline, Gallery, settings, app shell and the classic tools (TypeScript source, for Next transpilePackages).',
      license: castcut.license,
      repository: {
        type: 'git',
        url: 'git+https://github.com/doodersrage/castcut.git',
        directory: 'packages/prompt-studio-core',
      },
      files: [
        ...new Set([...files].map(file => file.split('/')[0]!)),
        'next.config.base.cjs',
        'bin',
        'comfyui-nodes',
      ],
      bin: { 'prompt-studio-sync-routes': 'bin/sync-routes.mjs' },
      sideEffects: true,
      dependencies,
      peerDependencies,
      optionalDependencies,
    },
    null,
    2
  ) + '\n'
);
console.log(
  `${pkgName}@${version}: ${files.size} files, ${Object.keys(dependencies).length} deps, peers ${Object.keys(peerDependencies).join(' ')}`
);
if (missing.length) console.log('Imported but not in package.json (check):', missing.join(' '));
