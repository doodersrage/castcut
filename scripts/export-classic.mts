/**
 * Writes the standalone Prompt Studio repository (github.com/doodersrage/prompt-studio): the
 * classic app's routes as wrappers around the core package (scripts/pack-core.mts), its own
 * layout, styles, config, public assets, README and CI. Re-run after a core release to pick up
 * new or removed routes; files it does not generate are left alone. docs/architecture-boundaries.md.
 *
 *   npx tsx scripts/export-classic.mts <target-dir> [--core-name prompt-studio-core] [--core-version ^2.3.5]
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
import { CLASSIC_GENERATED_MARK, classicAppFiles, wrapperSource } from '../src/lib/classic-app';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const target = process.argv[2];
if (!target || target.startsWith('--')) throw new Error('usage: export-classic.mts <target-dir>');
const arg = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const castcut = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const core = arg('--core-name') ?? process.env.CORE_PACKAGE_NAME ?? 'prompt-studio-core';
const coreVersion = arg('--core-version') ?? `^${castcut.version}`;
const owned = new Set<string>(
  JSON.parse(readFileSync(join(root, 'architecture/play-owned.json'), 'utf8'))
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(root, path).split(sep).join('/')];
  });
}
function write(path: string, content: string) {
  const full = join(target!, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

// Routes: drop wrappers whose route went away, then write the current set.
const appDir = join(target, 'src');
if (existsSync(appDir)) {
  for (const path of readdirSync(appDir, { recursive: true }) as string[]) {
    const full = join(appDir, path);
    if (
      statSync(full).isFile() &&
      readFileSync(full, 'utf8').slice(0, 200).includes(CLASSIC_GENERATED_MARK)
    )
      rmSync(full);
  }
}
const prefix = `${core}/src/`;
for (const source of [
  ...classicAppFiles(walk(join(root, 'src/app')), owned),
  'src/proxy.ts',
  'src/instrumentation.ts',
]) {
  write(source, wrapperSource(source, readFileSync(join(root, source), 'utf8'), prefix));
}

write(
  'src/app/layout.tsx',
  `import type { Metadata, Viewport } from 'next';
import RootDocument from '${prefix}components/RootDocument';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '${prefix}lib/brand';
import { ROOT_VIEWPORT, rootMetadata } from '${prefix}lib/root-metadata';
import './globals.css';

export const metadata: Metadata = rootMetadata(PRODUCT_NAME, PRODUCT_TAGLINE);

export const viewport: Viewport = ROOT_VIEWPORT;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootDocument>{children}</RootDocument>;
}
`
);
write(
  'src/app/globals.css',
  `/* The shared styles, and the shared components for Tailwind to scan (they live in the core package). */
@import '${core}/src/app/globals.css';
@source '../../node_modules/${core}/src';
`
);
cpSync(join(root, 'src/app/favicon.ico'), join(target, 'src/app/favicon.ico'));

write(
  'next.config.ts',
  `import type { NextConfig } from 'next';
// The shared Next config from the core package (CommonJS, so a TypeScript config can require it).
import baseConfig from '${core}/next.config.base.cjs';

/** Paths in the shared config are relative to the app root; the core's source is in node_modules. */
const config: NextConfig = {
  ...baseConfig,
  // The core ships TypeScript source.
  transpilePackages: ['${core}'],
  env: { ...baseConfig.env, NEXT_PUBLIC_APP_PROFILE: 'classic' },
};

export default config;
`
);
write(
  'tsconfig.json',
  json({
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'react-jsx',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./src/*'] },
    },
    include: [
      'next-env.d.ts',
      'src/**/*.ts',
      'src/**/*.tsx',
      '.next/types/**/*.ts',
      '.next/dev/types/**/*.ts',
    ],
    exclude: ['node_modules'],
  })
);
cpSync(join(root, 'postcss.config.mjs'), join(target, 'postcss.config.mjs'));

// Public assets the shared code serves (not Castcut's Outfit thumbnails).
rmSync(join(target, 'public'), { recursive: true, force: true });
cpSync(join(root, 'public'), join(target, 'public'), {
  recursive: true,
  filter: source => !relative(join(root, 'public'), source).startsWith('wardrobe-thumbs'),
});
for (const file of ['manifest.json']) {
  const manifest = JSON.parse(readFileSync(join(target, 'public', file), 'utf8'));
  manifest.name = 'Prompt Studio';
  manifest.short_name = 'Prompt Studio';
  manifest.description = 'Prompt, image, video and audio tools for ComfyUI.';
  writeFileSync(join(target, 'public', file), json(manifest));
}

const pick = (names: string[]) =>
  Object.fromEntries(
    names
      .filter(name => castcut.dependencies?.[name] ?? castcut.devDependencies?.[name])
      .map(name => [name, castcut.dependencies?.[name] ?? castcut.devDependencies?.[name]])
  );
const existing = existsSync(join(target, 'package.json'))
  ? JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
  : {};
write(
  'package.json',
  json({
    name: 'prompt-studio',
    version: existing.version ?? '0.1.0',
    private: true,
    description: 'Prompt, image, video and audio tools for ComfyUI.',
    license: castcut.license,
    repository: { type: 'git', url: 'git+https://github.com/doodersrage/prompt-studio.git' },
    engines: castcut.engines,
    scripts: {
      dev: 'next dev -p 47833',
      build: 'next build',
      start: 'next start -p 47833',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      [core]: existing.dependencies?.[core]?.startsWith('file:')
        ? existing.dependencies[core]
        : coreVersion,
      ...pick(['next', 'react', 'react-dom', 'sharp']),
    },
    devDependencies: pick(['typescript', '@types/node', '@types/react', '@types/react-dom']),
  })
);
write(
  '.gitignore',
  `/node_modules
/.next/
/out/
next-env.d.ts
*.tsbuildinfo
.env*.local
.prompt-studio-data/
`
);
cpSync(join(root, '.env.example'), join(target, '.env.example'));
cpSync(join(root, 'LICENSE'), join(target, 'LICENSE'));
write(
  '.github/workflows/ci.yml',
  `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run build
`
);
if (!existsSync(join(target, 'README.md'))) {
  write(
    'README.md',
    `# Prompt Studio

**Prompt, image, video and audio tools for ComfyUI**, running locally: Generate, Prompt Editor, Image → Prompt, Video, Variations, Compose, ControlNet, Inpaint / Outpaint, Refine, Audio, Mesh, the workflow editor, Gallery and Queue.

Prompt Studio is the classic toolset of [Castcut](https://github.com/doodersrage/castcut), which grew into a character-film app. Both apps share one core, published as [\`${core}\`](https://www.npmjs.com/package/${core}); this repository is the app around it.

## Run it

Needs Node 22+ and a running [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (default \`http://127.0.0.1:8188\`). An LLM server (LM Studio or Ollama) is optional, for prompt writing and vision.

\`\`\`bash
npm install
cp .env.example .env.local   # set COMFYUI_API_URL, LLM settings, auth
npm run dev                  # http://127.0.0.1:47833
\`\`\`

Production: \`npm run build && npm run start\`. Settings → Connection checks ComfyUI and offers **Heal & ready** for a new install.

Data lives in \`.prompt-studio-data/\` (or \`PROMPT_DATA_DIR\`).

## Developing

The pages here are thin wrappers around the core package; the shared code itself is developed in the Castcut repository (\`src/\`, packed by \`scripts/pack-core.mts\`). Changes to routes come over with \`scripts/export-classic.mts\`.

## License

MIT — see [LICENSE](./LICENSE).
`
  );
}
console.log(`Prompt Studio written to ${target} (core ${core}@${coreVersion})`);
