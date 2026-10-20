import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildComfyInputFolderReport } from './comfy-input-folder-server';

const NOW = Date.UTC(2026, 9, 3);
const OLD = new Date(NOW - 30 * 86_400_000).toUTCString();
const NEW = new Date(NOW - 60_000).toUTCString();

function fakeComfy(options: { queueFails?: boolean } = {}) {
  const files: Record<string, { size: number; modified: string }> = {
    'day-nude-face-1.png': { size: 100, modified: OLD },
    'day-nude-face-2.png': { size: 200, modified: OLD },
    'day-nude-face-3.png': { size: 300, modified: NEW },
    'cast-plate-in-gallery.png': { size: 50, modified: OLD },
    'day-pose-guide-queued.png': { size: 10, modified: OLD },
    'PromptStudio_00163_.png': { size: 999, modified: OLD },
  };
  return async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/internal/files/input') {
      return Response.json(Object.keys(files).map(name => `${name} [input]`));
    }
    if (parsed.pathname === '/system_stats') {
      return Response.json({ system: { argv: ['/opt/comfyui/main.py', '--input-directory', '/srv/in'] } });
    }
    if (parsed.pathname === '/queue') {
      if (options.queueFails) return new Response('down', { status: 500 });
      return Response.json({
        queue_running: [],
        queue_pending: [[1, 'id', { '1': { inputs: { image: 'day-pose-guide-queued.png' } } }]],
      });
    }
    if (parsed.pathname === '/view' && init?.method === 'HEAD') {
      const file = files[parsed.searchParams.get('filename') ?? ''];
      return file
        ? new Response(null, {
            headers: { 'content-length': String(file.size), 'last-modified': file.modified },
          })
        : new Response(null, { status: 404 });
    }
    return new Response('nope', { status: 404 });
  };
}

describe('comfy-input-folder-server', () => {
  const saved = process.env.PROMPT_DATA_DIR;
  before(() => {
    delete process.env.PROMPT_DATA_DIR;
  });
  after(() => {
    if (saved === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = saved;
  });

  it('lists old app-made inputs nothing references, with a command — never others’ files', async () => {
    const report = await buildComfyInputFolderReport({
      baseUrl: 'http://comfy.remote:8188/',
      browserReferences: ['cast-plate-in-gallery.png', 'not-ours.png'],
      now: NOW,
      fetchImpl: fakeComfy(),
    });
    assert.equal(report.local, false);
    assert.equal(report.writable, false);
    assert.equal(report.inputDir, '/srv/in');
    assert.equal(report.totalFiles, 6);
    assert.equal(report.appMadeCount, 5);
    assert.equal(report.referencedCount, 2);
    assert.deepEqual(
      report.removable.map(file => file.name),
      ['day-nude-face-1.png', 'day-nude-face-2.png']
    );
    assert.equal(report.removableBytes, 300);
    assert.equal(report.tooNewCount, 1);
    assert.equal(
      report.command,
      "rm -- '/srv/in/day-nude-face-1.png' '/srv/in/day-nude-face-2.png'"
    );
    assert.deepEqual(report.sources, { browser: 2, serverStorage: false, comfyQueue: true });
  });

  it('offers nothing when the queue cannot be read', async () => {
    const report = await buildComfyInputFolderReport({
      baseUrl: 'http://comfy.remote:8188',
      browserReferences: [],
      now: NOW,
      fetchImpl: fakeComfy({ queueFails: true }),
    });
    assert.equal(report.removable.length, 0);
    assert.equal(report.command, '');
    assert.equal(report.appMadeCount, 5);
  });
});
