import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isPlayLayer } from './architecture-boundaries';
import { STUDIO_ONLY_ROUTES } from './app-profile';
import {
  CLASSIC_APP_DIR,
  CLASSIC_GENERATED_MARK,
  classicRouteFiles,
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
  const files = [
    ...classicRouteFiles(walk(join(ROOT, 'src')), OWNED),
    { source: 'src/proxy.ts', target: 'src/proxy.ts' },
    { source: 'src/instrumentation.ts', target: 'src/instrumentation.ts' },
  ];
  const sources = files.map(file => file.source);

  it('wraps every shared route as generated (npm run gen:classic)', () => {
    const stale = files
      .filter(({ source, target }) => {
        const path = join(ROOT, CLASSIC_APP_DIR, target);
        return (
          !existsSync(path) ||
          readFileSync(path, 'utf8') !== wrapperSource(source, readFileSync(join(ROOT, source), 'utf8'))
        );
      })
      .map(file => file.target);
    assert.deepEqual(stale, [], 'Run `npm run gen:classic` and commit apps/prompt-studio');
  });

  it('has no generated route left from a removed or Play route', () => {
    const wanted = new Set(files.map(file => join(CLASSIC_APP_DIR, file.target)));
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

  it("Castcut's STUDIO_ONLY_ROUTES are exactly the pages in src/studio-app", () => {
    const pages = walk(join(ROOT, 'src/studio-app'))
      .filter(path => path.endsWith('/page.tsx'))
      .map(path => path.replace(/^src\/studio-app/, '').replace(/\/page\.tsx$/, '') || '/');
    const topLevel = [...new Set(pages.map(route => (route === '/' ? '/' : `/${route.split('/')[1]}`)))].sort();
    assert.deepEqual([...STUDIO_ONLY_ROUTES].sort(), topLevel);
  });

  it("Prompt Studio's own page wins at the same route (\"/\" is Generate there)", () => {
    const home = files.find(file => file.target === 'src/app/page.tsx');
    assert.equal(home?.source, 'src/studio-app/page.tsx');
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
