import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isPlayLayer } from './architecture-boundaries';
import {
  CLASSIC_APP_DIR,
  CLASSIC_GENERATED_MARK,
  classicAppFiles,
  wrapperSource,
} from './classic-app';

const ROOT = join(__dirname, '..', '..');
const OWNED = new Set<string>(
  JSON.parse(readFileSync(join(ROOT, 'architecture/play-owned.json'), 'utf8')) as string[]
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(ROOT, path)];
  });
}

describe('classic Prompt Studio app (apps/prompt-studio)', () => {
  const sources = [
    ...classicAppFiles(walk(join(ROOT, 'src/app')), OWNED),
    'src/proxy.ts',
    'src/instrumentation.ts',
  ];

  it('wraps every shared route as generated (npm run gen:classic)', () => {
    const stale = sources.filter(source => {
      const target = join(ROOT, CLASSIC_APP_DIR, source);
      return (
        !existsSync(target) ||
        readFileSync(target, 'utf8') !== wrapperSource(source, readFileSync(join(ROOT, source), 'utf8'))
      );
    });
    assert.deepEqual(stale, [], 'Run `npm run gen:classic` and commit apps/prompt-studio');
  });

  it('has no generated route left from a removed or Play route', () => {
    const wanted = new Set(sources.map(source => join(CLASSIC_APP_DIR, source)));
    const extra = walk(join(ROOT, CLASSIC_APP_DIR, 'src'))
      .filter(path => /\.(?:ts|tsx)$/.test(path))
      .filter(path => readFileSync(join(ROOT, path), 'utf8').slice(0, 200).includes(CLASSIC_GENERATED_MARK))
      .filter(path => !wanted.has(path));
    assert.deepEqual(extra, [], 'Run `npm run gen:classic` and commit apps/prompt-studio');
  });

  it('wraps no Play route', () => {
    assert.deepEqual(
      sources.filter(source => isPlayLayer(source, OWNED)),
      []
    );
  });

  it('copies segment config and keeps client pages client', () => {
    const route = wrapperSource('src/app/api/x/route.ts', "export const runtime = 'nodejs';\nexport const maxDuration = 300;\nexport async function GET() {}\n");
    assert.match(route, /^export const runtime = 'nodejs';$/m);
    assert.match(route, /^export const maxDuration = 300;$/m);
    assert.match(route, /^export \* from '@\/app\/api\/x\/route';$/m);
    const page = wrapperSource('src/app/g/page.tsx', "'use client';\nexport default function G() {}\n");
    assert.match(page, /^'use client';/);
    assert.match(page, /^export \{ default \} from '@\/app\/g\/page';$/m);
    assert.doesNotMatch(page, /export \*/);
  });
});
