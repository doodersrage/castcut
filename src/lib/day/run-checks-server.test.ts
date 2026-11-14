import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

const report = (extra: Record<string, unknown> = {}) =>
  ({
    prompt: 'Edit Image 1: she wears a black romper',
    drawnPeople: 1,
    slot: { id: 'evening', label: 'Evening', sceneHints: 'stirring a pot', wardrobeId: 'kit-romper' },
    toolSettings: { dayMood: 'everyday' },
    character: { id: 'c', name: 'Mara', marks: [{ id: 'm1', what: 'round glasses', where: 'face' }] },
    leadNoun: 'woman',
    plate: { filename: 'mara-plate.png' },
    wardrobeLabel: () => 'Black romper',
    ...extra,
  }) as never;
const io = { loadBlob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) };

describe('a run’s take checked on the server (Phase 3, step 7)', () => {
  it('alone on an Everyday day: outfit, face and marks, as the page checks them', async () => {
    const { checkServerTake } = await import('./run-checks-server');
    const asked: string[] = [];
    const checks = await checkServerTake({
      imageUrl: '/api/comfyui/view?filename=t.png&type=output',
      report: report(),
      shared: { sessionLlmEnabled: true } as never,
      comfyUrl: 'http://127.0.0.1:8188',
      io,
      outfitCheck: async input => {
        asked.push(`outfit:${input.outfit}:${input.wearer}`);
        return { match: false, seen: 'a red dress' } as never;
      },
      faceMatch: async input => {
        asked.push(`face:${input.referenceUrl}`);
        return { available: true, similarity: 0.31 } as never;
      },
      readMarks: async () => ({ glasses: false, tattoos: [] }),
    });
    assert.equal(asked[0], 'outfit:Black romper:woman');
    assert.match(asked[1]!, /^face:.*mara-plate\.png/);
    assert.equal(checks?.outfitMiss, 'a red dress');
    assert.equal(checks?.outfitChecked, true);
    assert.equal(checks?.face, 0.31);
    assert.equal(checks?.faceMiss, true);
    assert.ok(checks?.marksMissing, 'the glasses were not seen');
  });

  it('beside someone else: the outfit only (their face would be judged as hers)', async () => {
    const { checkServerTake } = await import('./run-checks-server');
    let faced = false;
    const checks = await checkServerTake({
      imageUrl: '/api/comfyui/view?filename=t.png&type=output',
      report: report({ drawnPeople: 2, prompt: 'she cooks beside a tall man' }),
      shared: {} as never,
      comfyUrl: 'http://127.0.0.1:8188',
      io,
      outfitCheck: async () => ({ match: true, seen: 'a black romper' }) as never,
      faceMatch: async () => {
        faced = true;
        return { available: true, similarity: 0.9 } as never;
      },
    });
    assert.equal(faced, false);
    assert.equal(checks?.outfitChecked, true);
    assert.equal(checks?.outfitMiss, '');
  });

  it('nothing could run (no vision model, no ComfyUI): unchecked, not passed', async () => {
    const { checkServerTake } = await import('./run-checks-server');
    const checks = await checkServerTake({
      imageUrl: '/api/comfyui/view?filename=t.png&type=output',
      report: report({ character: { id: 'c', name: 'Mara' } }),
      shared: {} as never,
      comfyUrl: 'http://127.0.0.1:8188',
      io,
      outfitCheck: async () => {
        throw new Error('The outfit check needs a vision-capable LLM.');
      },
      faceMatch: async () => ({ available: false, reason: 'offline' }) as never,
    });
    assert.equal(checks, undefined);
  });
});
