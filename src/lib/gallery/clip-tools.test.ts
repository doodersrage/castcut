import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  galleryClipTools,
  registerGalleryClipTool,
  runGalleryClipTool,
  runningGalleryClipTool,
  type GalleryClipTool,
} from './clip-tools';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

const entry = { id: 'entry-1', prompt: 'a swim at night', tool: 'day' } as ComfyGalleryEntry;

function tool(overrides: Partial<GalleryClipTool> = {}): GalleryClipTool {
  return {
    id: 'test',
    label: 'Test pass',
    busyText: 'Testing…',
    doneText: 'Tested.',
    keepKind: 'realism',
    run: async () => '/api/comfyui/view?filename=out.mp4&type=input',
    ...overrides,
  };
}

describe('gallery clip tools', () => {
  it('registers a tool once per id', () => {
    registerGalleryClipTool(tool({ id: 'a', label: 'One' }));
    registerGalleryClipTool(tool({ id: 'a', label: 'Two' }));
    assert.deepEqual(
      galleryClipTools()
        .filter(t => t.id === 'a')
        .map(t => t.label),
      ['Two']
    );
  });

  it('keeps the new clip as a child of the Gallery entry it came from', async () => {
    const kept: unknown[] = [];
    const toasts: string[] = [];
    const error = await runGalleryClipTool(tool(), entry, '/clip.mp4', {
      keep: async input => {
        kept.push(input);
        return { url: input.url };
      },
      toast: input => {
        toasts.push(input.tone ?? '');
        return null;
      },
    });
    assert.equal(error, null);
    assert.deepEqual(kept, [
      {
        url: '/api/comfyui/view?filename=out.mp4&type=input',
        kind: 'realism',
        prompt: 'Test pass · a swim at night',
        tool: 'day',
        sourceEntryId: 'entry-1',
      },
    ]);
    assert.deepEqual(toasts, ['info', 'success']);
    assert.equal(runningGalleryClipTool(), null);
  });

  it('runs one at a time and reports a failure', async () => {
    let release!: () => void;
    const slow = runGalleryClipTool(
      tool({ run: () => new Promise(resolve => (release = () => resolve('/x'))) }),
      entry,
      '/clip.mp4',
      { keep: async input => ({ url: input.url }), toast: () => null }
    );
    const blocked = await runGalleryClipTool(tool(), entry, '/clip.mp4', { toast: () => null });
    assert.match(blocked ?? '', /one at a time/);
    release();
    assert.equal(await slow, null);
    const failed = await runGalleryClipTool(
      tool({ run: async () => Promise.reject(new Error('needs the WAN model')) }),
      entry,
      '/clip.mp4',
      { toast: () => null }
    );
    assert.equal(failed, 'needs the WAN model');
  });
});
