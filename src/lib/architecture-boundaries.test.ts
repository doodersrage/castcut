import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, it } from 'node:test';
import {
  edgeKey,
  isPlayLayer,
  playBoundaryEdges,
  readImports,
  type ImportEdge,
} from './architecture-boundaries';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const BASELINE = join(ROOT, 'architecture', 'play-boundary-baseline.json');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith('@/')
    ? join(ROOT, 'src', spec.slice(2))
    : spec.startsWith('.')
      ? normalize(join(dirname(from), spec))
      : null;
  if (!base) return null;
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const path = base + ext;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

function repoEdges(): ImportEdge[] {
  const edges: ImportEdge[] = [];
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    for (const { spec, typeOnly } of readImports(readFileSync(file, 'utf8'))) {
      const target = resolveSpec(file, spec);
      if (!target) continue;
      edges.push({
        from: relative(ROOT, file).split('\\').join('/'),
        to: relative(ROOT, target).split('\\').join('/'),
        typeOnly,
      });
    }
  }
  return edges;
}

describe('architecture: Play layer boundary', () => {
  it('classifies the layer by path', () => {
    assert.equal(isPlayLayer('src/lib/day-planner.ts'), true);
    assert.equal(isPlayLayer('src/components/fitting/FittingStagePending.tsx'), true);
    assert.equal(isPlayLayer('src/hooks/useDayPlannerToolOrchestration.ts'), true);
    assert.equal(isPlayLayer('src/lib/comfyui-client.ts'), false);
    assert.equal(isPlayLayer('src/lib/settings-cache.ts'), false);
    assert.equal(isPlayLayer('src/components/ComposeTool.tsx'), false);
  });

  it('reads type-only imports', () => {
    assert.deepEqual(readImports("import type { A } from './a';\nimport { type B, type C } from './b';\nimport { D, type E } from './c';"), [
      { spec: './a', typeOnly: true },
      { spec: './b', typeOnly: true },
      { spec: './c', typeOnly: false },
    ]);
    assert.deepEqual(readImports("type T = import('./d').Bio;\nconst m = await import('./e');\nimport('./f').then(x => x);"), [
      { spec: './d', typeOnly: true },
      { spec: './e', typeOnly: false },
      { spec: './f', typeOnly: false },
    ]);
  });

  it('no new imports into Play from outside it; the baseline only shrinks', () => {
    const current = playBoundaryEdges(repoEdges());
    const baseline = new Set<string>(JSON.parse(readFileSync(BASELINE, 'utf8')) as string[]);
    const now = new Set(current.map(edgeKey));
    const added = [...now].filter(key => !baseline.has(key)).sort();
    const gone = [...baseline].filter(key => !now.has(key)).sort();
    assert.deepEqual(
      added,
      [],
      `New imports into the Play layer from shared or Studio code (docs/architecture-boundaries.md):\n${added.join('\n')}`
    );
    assert.deepEqual(
      gone,
      [],
      `These boundary imports are gone — remove them from architecture/play-boundary-baseline.json:\n${gone.join('\n')}`
    );
  });
});
