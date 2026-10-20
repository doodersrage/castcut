import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery';

type PreviewArgs = Record<string, unknown>;
let previewImpl: (args: PreviewArgs) => Promise<unknown> = async () => ({ nodes: [] });
const fetchWorkflowPreview = mock.fn((args: PreviewArgs) => previewImpl(args));
mock.module('../comfyui/requeue', { namedExports: { fetchWorkflowPreview } });

const resolveQueueParams = mock.fn((args: PreviewArgs) => ({ resolved: true, ...args }));
mock.module('../queue/params-settings', { namedExports: { resolveQueueParams } });

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;
function installFetchStub(impl: FetchImpl) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push(url);
    return Promise.resolve(impl(url, init));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

afterEach(() => {
  previewImpl = async () => ({ nodes: [] });
  fetchWorkflowPreview.mock.resetCalls();
  resolveQueueParams.mock.resetCalls();
});

describe('gallery-workflow-view', async () => {
  const { loadGalleryWorkflowView, workflowParamDisplayRows, formatWorkflowParamValue } =
    await import('./workflow-view');

  function entry(overrides?: Partial<ComfyGalleryEntry>): ComfyGalleryEntry {
    return {
      id: 'e1',
      prompt: 'a prompt',
      status: 'completed',
      ...overrides,
    } as unknown as ComfyGalleryEntry;
  }

  describe('loadGalleryWorkflowView', () => {
    it('skips the history fetch entirely when the entry has no promptId', async () => {
      const stub = installFetchStub(() => new Response('{}', { status: 200 }));
      try {
        const view = await loadGalleryWorkflowView(entry());
        assert.equal(stub.calls.length, 0);
        assert.equal(view.history, undefined);
        assert.equal(view.historyError, undefined);
      } finally {
        stub.restore();
      }
    });

    it('fetches history by promptId and stores the result on success', async () => {
      const stub = installFetchStub(() =>
        Response.json({ workflow: { nodes: {} } } as Record<string, unknown>, { status: 200 })
      );
      try {
        const view = await loadGalleryWorkflowView(entry({ promptId: 'p-1' }));
        assert.equal(stub.calls.length, 1);
        assert.match(stub.calls[0]!, /promptId=p-1/);
        assert.deepEqual(view.history, { workflow: { nodes: {} } });
        assert.equal(view.historyError, undefined);
      } finally {
        stub.restore();
      }
    });

    it('includes comfyUrl in the query string when the entry has one', async () => {
      const stub = installFetchStub(() => Response.json({}, { status: 200 }));
      try {
        await loadGalleryWorkflowView(entry({ promptId: 'p-1', comfyUrl: 'http://host:8188' }));
        assert.match(stub.calls[0]!, /comfyUrl=http/);
      } finally {
        stub.restore();
      }
    });

    it('sets historyError from the response body error on a non-ok response', async () => {
      const stub = installFetchStub(() =>
        Response.json({ error: 'not found' }, { status: 404 })
      );
      try {
        const view = await loadGalleryWorkflowView(entry({ promptId: 'p-1' }));
        assert.equal(view.historyError, 'not found');
        assert.equal(view.history, undefined);
      } finally {
        stub.restore();
      }
    });

    it('sets a default historyError message when a non-ok response has no error field', async () => {
      const stub = installFetchStub(() => Response.json({}, { status: 500 }));
      try {
        const view = await loadGalleryWorkflowView(entry({ promptId: 'p-1' }));
        assert.equal(view.historyError, 'History lookup failed (HTTP 500).');
      } finally {
        stub.restore();
      }
    });

    it('sets historyError from a rejected fetch call', async () => {
      // installFetchStub wraps the impl in Promise.resolve(impl(...)) — a
      // *synchronous* throw here would escape before the source's
      // `fetch(...).then().catch()` chain is even constructed (fetch()
      // itself would throw, not return a rejected promise), which doesn't
      // match how the real global fetch behaves on a network failure. Real
      // fetch always rejects its returned promise, so the impl does too.
      const stub = installFetchStub(() => Promise.reject(new Error('network down')));
      try {
        const view = await loadGalleryWorkflowView(entry({ promptId: 'p-1' }));
        assert.equal(view.historyError, 'network down');
      } finally {
        stub.restore();
      }
    });

    it('sets a generic historyError for a non-Error rejection', async () => {
      const original = globalThis.fetch;
      globalThis.fetch = (() => Promise.reject('nope')) as typeof fetch;
      try {
        const view = await loadGalleryWorkflowView(entry({ promptId: 'p-1' }));
        assert.equal(view.historyError, 'History lookup failed.');
      } finally {
        globalThis.fetch = original;
      }
    });

    it('resolves preview params via resolveQueueParams and stores the preview on success', async () => {
      previewImpl = async () => ({ preview: 'ok' });
      const view = await loadGalleryWorkflowView(
        entry({ model: 'flux', tool: 'generate', queueQualityProfile: 'final' })
      );
      assert.equal(resolveQueueParams.mock.calls.length, 1);
      assert.deepEqual(view.preview, { preview: 'ok' });
      assert.equal(view.previewError, undefined);
    });

    it('computes hasInputImage/hasMaskImage from storedParams filenames', async () => {
      await loadGalleryWorkflowView(
        entry({
          queueParams: {
            inputImageFilename: 'in.png',
            maskImageFilename: 'mask.png',
          } as ComfyGalleryEntry['queueParams'],
        })
      );
      const args = fetchWorkflowPreview.mock.calls[0]!.arguments[0] as PreviewArgs;
      assert.equal(args.hasInputImage, true);
      assert.equal(args.hasMaskImage, true);
    });

    it('falls back to entry.sourceImageUrl/maskImageUrl when storedParams has no filenames', async () => {
      await loadGalleryWorkflowView(
        entry({ sourceImageUrl: 'https://x/src.png', maskImageUrl: 'https://x/mask.png' })
      );
      const args = fetchWorkflowPreview.mock.calls[0]!.arguments[0] as PreviewArgs;
      assert.equal(args.hasInputImage, true);
      assert.equal(args.hasMaskImage, true);
    });

    it('reports false for hasInputImage/hasMaskImage when nothing is set', async () => {
      await loadGalleryWorkflowView(entry());
      const args = fetchWorkflowPreview.mock.calls[0]!.arguments[0] as PreviewArgs;
      assert.equal(args.hasInputImage, false);
      assert.equal(args.hasMaskImage, false);
    });

    it('sets previewError from a thrown Error', async () => {
      previewImpl = async () => {
        throw new Error('preview blew up');
      };
      const view = await loadGalleryWorkflowView(entry());
      assert.equal(view.previewError, 'preview blew up');
      assert.equal(view.preview, undefined);
    });

    it('sets a generic previewError for a non-Error rejection', async () => {
      previewImpl = () => Promise.reject('nope');
      const view = await loadGalleryWorkflowView(entry());
      assert.equal(view.previewError, 'Workflow preview failed.');
    });

    it('carries storedParams through onto the returned view', async () => {
      const queueParams = { seed: 42 } as ComfyGalleryEntry['queueParams'];
      const view = await loadGalleryWorkflowView(entry({ queueParams }));
      assert.equal(view.storedParams, queueParams);
      assert.equal(view.entry.id, 'e1');
    });
  });

  describe('workflowParamDisplayRows', () => {
    it('returns an empty array when params is undefined', () => {
      assert.deepEqual(workflowParamDisplayRows(undefined), []);
    });

    it('returns a row for every known param key, in a fixed order', () => {
      const rows = workflowParamDisplayRows({ seed: 1, width: 512 });
      assert.equal(rows.length, 12);
      assert.equal(rows[0]?.key, 'seed');
      assert.equal(rows[0]?.value, 1);
      assert.equal(rows[1]?.key, 'width');
      assert.equal(rows[1]?.value, 512);
      assert.equal(rows[2]?.key, 'height');
      assert.equal(rows[2]?.value, undefined);
    });

    it('joins array values with a comma', () => {
      const rows = workflowParamDisplayRows({ samplerName: ['euler', 'dpm++'] as unknown as string });
      const row = rows.find(r => r.key === 'samplerName');
      assert.equal(row?.value, 'euler, dpm++');
    });
  });

  describe('formatWorkflowParamValue', () => {
    it('renders an em dash for undefined or empty string', () => {
      assert.equal(formatWorkflowParamValue(undefined), '—');
      assert.equal(formatWorkflowParamValue(''), '—');
    });

    it('stringifies a number', () => {
      assert.equal(formatWorkflowParamValue(20), '20');
    });

    it('stringifies zero (not treated as empty)', () => {
      assert.equal(formatWorkflowParamValue(0), '0');
    });

    it('returns a non-empty string as-is', () => {
      assert.equal(formatWorkflowParamValue('euler'), 'euler');
    });
  });
});
