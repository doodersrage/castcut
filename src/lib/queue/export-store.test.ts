import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertSafeQueueExportDir, resolveQueueExportDir } from './export-store';

describe('assertSafeQueueExportDir', () => {
  it('accepts an absolute non-system path', () => {
    const resolved = assertSafeQueueExportDir('/var/lib/prompt-studio/queue-export');
    assert.equal(resolved, '/var/lib/prompt-studio/queue-export');
  });

  it('rejects relative paths', () => {
    assert.throws(() => assertSafeQueueExportDir('tmp/export'), /absolute/);
  });

  it('rejects system prefixes', () => {
    assert.throws(() => assertSafeQueueExportDir('/etc/passwd-adjacent'), /system path/);
  });
});

describe('resolveQueueExportDir', () => {
  it('prefers COMFYUI_QUEUE_EXPORT_DIR over the overlay', () => {
    const previous = process.env.COMFYUI_QUEUE_EXPORT_DIR;
    process.env.COMFYUI_QUEUE_EXPORT_DIR = '/tmp/env-export';
    try {
      assert.equal(
        resolveQueueExportDir({ enabled: true, dir: '/tmp/overlay-export' }),
        '/tmp/env-export'
      );
    } finally {
      if (previous === undefined) {
        delete process.env.COMFYUI_QUEUE_EXPORT_DIR;
      } else {
        process.env.COMFYUI_QUEUE_EXPORT_DIR = previous;
      }
    }
  });

  it('uses the overlay when env is unset and enabled', () => {
    const previous = process.env.COMFYUI_QUEUE_EXPORT_DIR;
    delete process.env.COMFYUI_QUEUE_EXPORT_DIR;
    try {
      assert.equal(
        resolveQueueExportDir({ enabled: true, dir: '/tmp/overlay-export' }),
        '/tmp/overlay-export'
      );
    } finally {
      if (previous !== undefined) {
        process.env.COMFYUI_QUEUE_EXPORT_DIR = previous;
      }
    }
  });

  it('stays off when the overlay is disabled', () => {
    const previous = process.env.COMFYUI_QUEUE_EXPORT_DIR;
    delete process.env.COMFYUI_QUEUE_EXPORT_DIR;
    try {
      assert.equal(
        resolveQueueExportDir({ enabled: false, dir: '/tmp/overlay-export' }),
        null
      );
    } finally {
      if (previous !== undefined) {
        process.env.COMFYUI_QUEUE_EXPORT_DIR = previous;
      }
    }
  });
});
