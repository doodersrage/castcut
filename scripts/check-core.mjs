#!/usr/bin/env node
// @ts-check
/**
 * Type-checks the packed core package (packages/prompt-studio-core, `npm run pack:core`) on its
 * own: no Play files and no Castcut path alias, the way the Prompt Studio repo compiles it. It
 * catches shared code that leans on Play's declaration-merged fields (FeatureToolSettings,
 * CharacterFeatureFields) — Castcut's own type-check can't, Play is always there.
 * docs/architecture-boundaries.md.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'packages/prompt-studio-core');
writeFileSync(
  join(dir, 'tsconfig.check.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
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
        types: ['node', 'react', 'react-dom'],
      },
      include: ['src/**/*.ts', 'src/**/*.tsx', '../../next-env.d.ts'],
    },
    null,
    2
  )
);
execFileSync('npx', ['tsc', '-p', join(dir, 'tsconfig.check.json')], { stdio: 'inherit' });
console.log('prompt-studio-core type-checks on its own.');
