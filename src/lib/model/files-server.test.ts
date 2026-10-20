import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  deleteModelFile,
  listModelFilesFromComfy,
  listModelFilesOnDisk,
  ModelFileDeleteError,
} from './files-server';

/** Minimal PNG carrying a ComfyUI `prompt` tEXt chunk (the parser skips CRCs). */
function pngWithGraph(graph: unknown): Buffer {
  const text = Buffer.from(`prompt\0${JSON.stringify(graph)}`, 'latin1');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(text.length);
  const end = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    length,
    Buffer.from('tEXt', 'ascii'),
    text,
    Buffer.alloc(4),
    end,
  ]);
}

describe('model files on disk', () => {
  let root = '';
  const previousRoot = process.env.COMFYUI_ROOT;
  const weight = (rel: string) => {
    const full = path.join(root, 'models', rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.alloc(2 * 1024 * 1024));
  };
  // Nothing listens here: ComfyUI history is unavailable, output PNGs still count.
  const comfyBaseUrl = 'http://127.0.0.1:9';

  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-files-'));
    process.env.COMFYUI_ROOT = root;
    weight('checkpoints/used.safetensors');
    weight('checkpoints/idle.safetensors');
    weight('checkpoints/target.safetensors');
    weight('diffusion_models/half.safetensors.partial');
    fs.symlinkSync(
      path.join(root, 'models/checkpoints/target.safetensors'),
      path.join(root, 'models/diffusion_models/link.safetensors')
    );
    fs.writeFileSync(path.join(root, 'models/checkpoints/config.json'), '{}');
    fs.mkdirSync(path.join(root, 'output'));
    fs.writeFileSync(
      path.join(root, 'output/render_00001_.png'),
      pngWithGraph({ '1': { inputs: { ckpt_name: 'used.safetensors' } } })
    );
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (previousRoot === undefined) delete process.env.COMFYUI_ROOT;
    else process.env.COMFYUI_ROOT = previousRoot;
  });

  it('lists weights, links and partial downloads, not configs', () => {
    const { files } = listModelFilesOnDisk();
    const byPath = new Map(files.map(file => [file.path, file]));
    assert.equal(byPath.has('checkpoints/config.json'), false);
    assert.equal(byPath.get('diffusion_models/link.safetensors')?.linkTarget, 'checkpoints/target.safetensors');
    assert.equal(byPath.get('checkpoints/target.safetensors')?.linkedBy, 1);
    assert.equal(byPath.get('diffusion_models/half.safetensors.partial')?.partial, true);
  });

  const refuses = async (input: { path: string; confirmName: string }, pattern: RegExp) => {
    await assert.rejects(
      deleteModelFile({ ...input, comfyBaseUrl }),
      (error: unknown) => error instanceof ModelFileDeleteError && pattern.test(error.message)
    );
  };

  it('refuses unsafe or protected deletes', async () => {
    await refuses({ path: '../outside.txt', confirmName: 'outside.txt' }, /Invalid path/);
    await refuses({ path: 'checkpoints/idle.safetensors', confirmName: 'nope' }, /Type the file name/);
    await refuses({ path: 'checkpoints/used.safetensors', confirmName: 'used.safetensors' }, /Used by a render/);
    await refuses({ path: 'checkpoints/target.safetensors', confirmName: 'target.safetensors' }, /link points/);
    await refuses({ path: 'checkpoints', confirmName: 'checkpoints' }, /Folders/);
  });

  it('deletes idle files, partial downloads and links (not their targets)', async () => {
    const idle = await deleteModelFile({ path: 'checkpoints/idle.safetensors', confirmName: 'idle.safetensors', comfyBaseUrl });
    assert.equal(idle.freedBytes, 2 * 1024 * 1024);
    await deleteModelFile({ path: 'diffusion_models/half.safetensors.partial', confirmName: 'half.safetensors.partial', comfyBaseUrl });
    const link = await deleteModelFile({ path: 'diffusion_models/link.safetensors', confirmName: 'link.safetensors', comfyBaseUrl });
    assert.equal(link.freedBytes, 0);
    assert.equal(fs.existsSync(path.join(root, 'models/checkpoints/target.safetensors')), true);
    assert.equal(fs.existsSync(path.join(root, 'models/checkpoints/idle.safetensors')), false);
  });
});

describe('model files through the ComfyUI API (no models folder here)', () => {
  let server: http.Server;
  let base = '';
  before(async () => {
    server = http.createServer((req, res) => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.url === '/models') return send(200, ['loras', 'checkpoints', 'configs', 'lora_gguf']);
      // A custom node's folder over the same directory: the same file again.
      if (req.url === '/api/experiment/models/lora_gguf') {
        return send(200, [{ name: 'sub/look.safetensors', modified: 1700000000.5, size: 295146208 }]);
      }
      if (req.url === '/api/experiment/models/loras') {
        return send(200, [
          { name: 'sub\\look.safetensors', pathIndex: 0, modified: 1700000000.5, size: 295146208 },
          { name: 'notes.txt', pathIndex: 0, modified: 1, size: 10 },
        ]);
      }
      // An older ComfyUI: names only.
      if (req.url === '/api/experiment/models/checkpoints') return send(404, {});
      if (req.url === '/models/checkpoints') return send(200, ['base.ckpt']);
      return send(404, {});
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  after(() => server.close());

  it('lists weight files with sizes when ComfyUI gives them, names alone when not', async () => {
    const rows = await listModelFilesFromComfy(base);
    assert.deepEqual(
      rows?.map(row => [row.path, row.bytes, row.modifiedAt]),
      [
        ['loras/sub/look.safetensors', 295146208, 1700000000500],
        ['checkpoints/base.ckpt', 0, 0],
      ]
    );
  });

  it('is null when ComfyUI is not there', async () => {
    assert.equal(await listModelFilesFromComfy('http://127.0.0.1:9'), null);
  });
});
