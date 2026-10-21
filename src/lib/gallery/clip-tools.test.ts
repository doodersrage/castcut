import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  galleryClipTools,
  registerGalleryClipTool,
  runGalleryClipTool,
  type GalleryClipTool,
} from './clip-tools';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { ClipJobBusyError } from '../clip/clip-jobs';

const entry = { id: 'entry-1', prompt: 'a swim at night', tool: 'day' } as ComfyGalleryEntry;

function tool(overrides: Partial<GalleryClipTool> = {}): GalleryClipTool {
  return {
    id: 'test',
    label: 'Test pass',
    busyText: 'Testing…',
    keepKind: 'realism',
    job: 'realism',
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

  it('starts a background job that keeps the new clip as a child of the entry', async () => {
    const runs: unknown[] = [];
    const error = await runGalleryClipTool(
      tool({ body: () => ({ strength: 'light' }) }),
      entry,
      '/clip.mp4',
      {
        run: async input => {
          runs.push(input);
          return { url: '/kept.mp4' };
        },
        toast: () => null,
      }
    );
    assert.equal(error, null);
    assert.deepEqual(runs, [
      {
        tool: 'realism',
        body: { clipUrl: '/clip.mp4', entryId: 'entry-1', strength: 'light' },
        keep: {
          kind: 'realism',
          prompt: 'Test pass · a swim at night',
          tool: 'day',
          sourceEntryId: 'entry-1',
        },
        owner: { feature: 'gallery', ref: 'entry-1' },
        label: 'Test pass · a swim at night',
      },
    ]);
  });

  it('says so when the server is busy, and returns a failure', async () => {
    const toasts: string[] = [];
    const busy = await runGalleryClipTool(tool(), entry, '/clip.mp4', {
      run: async () => Promise.reject(new ClipJobBusyError()),
      toast: input => {
        toasts.push(input.tone ?? '');
        return null;
      },
    });
    assert.match(busy ?? '', /one at a time/);
    assert.deepEqual(toasts, ['info', 'warning']);
    const failed = await runGalleryClipTool(tool(), entry, '/clip.mp4', {
      run: async () => Promise.reject(new Error('needs the WAN model')),
      toast: () => null,
    });
    assert.equal(failed, 'needs the WAN model');
  });
});
