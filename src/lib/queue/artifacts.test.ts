import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';

let exportDirImpl: () => string | null = () => null;
const resolveQueueExportDir = mock.fn(() => exportDirImpl());
mock.module('./export-store', { namedExports: { resolveQueueExportDir } });

let tmpDir: string | null = null;

afterEach(() => {
  resolveQueueExportDir.mock.resetCalls();
  exportDirImpl = () => null;
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe('queue-artifacts', async () => {
  const { isQueueArtifactExportEnabled, writeQueueArtifact } = await import('./artifacts');

  describe('isQueueArtifactExportEnabled', () => {
    it('is false when resolveQueueExportDir returns null', () => {
      exportDirImpl = () => null;
      assert.equal(isQueueArtifactExportEnabled(), false);
    });

    it('is true when resolveQueueExportDir returns a path', () => {
      exportDirImpl = () => '/tmp/some-dir';
      assert.equal(isQueueArtifactExportEnabled(), true);
    });

    it('is false (not throwing) when resolveQueueExportDir throws', () => {
      exportDirImpl = () => {
        throw new Error('bad config');
      };
      assert.equal(isQueueArtifactExportEnabled(), false);
    });
  });

  describe('writeQueueArtifact', () => {
    it('returns null without writing anything when export is disabled', () => {
      exportDirImpl = () => null;
      const result = writeQueueArtifact({ prompt: 'a cat' });
      assert.equal(result, null);
    });

    it('creates a queue-<promptId> directory with a sidecar.json when export is enabled', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-artifacts-'));
      exportDirImpl = () => tmpDir!;
      const result = writeQueueArtifact({
        prompt: 'a cat in a garden',
        negativePrompt: 'blurry',
        promptId: 'abc-123',
        comfyUrl: 'http://127.0.0.1:8188',
      });
      assert.equal(result, path.join(tmpDir, 'queue-abc-123'));
      const sidecar = JSON.parse(
        fs.readFileSync(path.join(result!, 'sidecar.json'), 'utf8')
      ) as Record<string, unknown>;
      assert.equal(sidecar.prompt, 'a cat in a garden');
      assert.equal(sidecar.negativePrompt, 'blurry');
      assert.equal(sidecar.promptId, 'abc-123');
      assert.equal(sidecar.comfyUrl, 'http://127.0.0.1:8188');
      assert.ok(typeof sidecar.exportedAt === 'string');
      assert.equal(fs.existsSync(path.join(result!, 'workflow.json')), false);
    });

    it('writes workflow.json only when a workflow is given', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-artifacts-'));
      exportDirImpl = () => tmpDir!;
      const result = writeQueueArtifact({
        prompt: 'x',
        promptId: 'wf-1',
        workflow: { nodes: { '1': { class_type: 'KSampler' } } },
      });
      const workflow = JSON.parse(fs.readFileSync(path.join(result!, 'workflow.json'), 'utf8'));
      assert.deepEqual(workflow, { nodes: { '1': { class_type: 'KSampler' } } });
    });

    it('merges extra sidecar fields on top of the base fields', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-artifacts-'));
      exportDirImpl = () => tmpDir!;
      const result = writeQueueArtifact({
        prompt: 'x',
        promptId: 'side-1',
        sidecar: { extraField: 'extra value', prompt: 'overridden prompt' },
      });
      const sidecar = JSON.parse(fs.readFileSync(path.join(result!, 'sidecar.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      assert.equal(sidecar.extraField, 'extra value');
      assert.equal(sidecar.prompt, 'overridden prompt');
    });

    it('falls back to an ISO-timestamp-derived id when promptId is missing', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-artifacts-'));
      exportDirImpl = () => tmpDir!;
      const result = writeQueueArtifact({ prompt: 'x' });
      assert.ok(result!.startsWith(path.join(tmpDir, 'queue-')));
      assert.ok(fs.existsSync(result!));
    });

    it('creates the export directory itself if it does not yet exist', () => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-artifacts-'));
      tmpDir = base;
      const nested = path.join(base, 'nested', 'export-dir');
      exportDirImpl = () => nested;
      const result = writeQueueArtifact({ prompt: 'x', promptId: 'nested-1' });
      assert.equal(result, path.join(nested, 'queue-nested-1'));
      assert.ok(fs.existsSync(result!));
    });
  });
});
