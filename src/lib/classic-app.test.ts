import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isPlayLayer } from './architecture-boundaries';
import { coreRouteFiles, wrapperSource } from './classic-app';

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

describe('routes the core package ships to Prompt Studio', () => {
  const routes = coreRouteFiles(walk(join(ROOT, 'src')), OWNED);

  it('ships the shared pages and API routes', () => {
    assert.ok(routes.includes('src/app/gallery/page.tsx'));
    assert.ok(routes.includes('src/app/api/comfyui/route.ts'));
  });

  it('ships no Play route, and not the layout Prompt Studio writes itself', () => {
    assert.deepEqual(
      routes.filter(source => isPlayLayer(source, OWNED)),
      []
    );
    assert.ok(!routes.includes('src/app/layout.tsx'));
  });

  it('copies segment config and keeps client pages client', () => {
    const route = wrapperSource(
      'src/app/api/x/route.ts',
      "export const runtime = 'nodejs';\nexport const maxDuration = 300;\nexport async function GET() {}\n"
    );
    assert.match(route, /^export const runtime = 'nodejs';$/m);
    assert.match(route, /^export const maxDuration = 300;$/m);
    assert.match(route, /^export \* from '@\/app\/api\/x\/route';$/m);
    const page = wrapperSource(
      'src/app/g/page.tsx',
      "'use client';\nexport default function G() {}\n"
    );
    assert.match(page, /^'use client';/);
    assert.match(page, /^export \{ default \} from '@\/app\/g\/page';$/m);
    assert.doesNotMatch(page, /export \*/);
  });
});
