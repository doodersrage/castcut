import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiErrorFrom } from '../api/response';
import {
  COMFY_MODELS_SETTINGS_HREF,
  ComfyUnreachableError,
  MissingModelsError,
  requireComfyModels,
} from './heavy-graph-server';

const listing =
  (folders: Record<string, string[]>): typeof fetch =>
  async input => {
    const folder = decodeURIComponent(String(input).split('/models/')[1] ?? '');
    return new Response(JSON.stringify(folders[folder] ?? []), { status: 200 });
  };

describe('requireComfyModels', () => {
  it('passes when every file is listed', async () => {
    await requireComfyModels('http://c:8188', 'Upscale', [{ folder: 'seedvr2', file: 'a.gguf' }], listing({ seedvr2: ['a.gguf'] }));
  });

  it('throws MissingModelsError naming the files, answered as 424 with a fix link', async () => {
    const error = await requireComfyModels(
      'http://c:8188',
      'Lip-sync',
      [
        { folder: 'diffusion_models', file: 'infinitetalk.safetensors' },
        { folder: 'vae', file: 'wan_vae.safetensors' },
      ],
      listing({ vae: ['wan_vae.safetensors'] })
    ).catch(e => e);
    assert.ok(error instanceof MissingModelsError);
    assert.deepEqual(error.missing, ['infinitetalk.safetensors']);
    assert.match(error.message, /Lip-sync needs infinitetalk\.safetensors in ComfyUI/);
    const res = apiErrorFrom(error, 502);
    assert.equal(res.status, 424);
    const body = (await res.json()) as { error: string; missing: string[]; fix: { href: string } };
    assert.equal(body.error, error.message);
    assert.deepEqual(body.missing, ['infinitetalk.safetensors']);
    assert.equal(body.fix.href, COMFY_MODELS_SETTINGS_HREF);
  });

  it('throws ComfyUnreachableError up front when ComfyUI is not there', async () => {
    const refused: typeof fetch = async () => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      });
    };
    const error = await requireComfyModels('http://c:8188', 'Copy moves', [{ folder: 'vae', file: 'x' }], refused).catch(e => e);
    assert.ok(error instanceof ComfyUnreachableError);
    assert.equal(error.message, "Can't reach ComfyUI at http://c:8188 — is it running?");
    const res = apiErrorFrom(error, 502);
    assert.equal(res.status, 503);
  });

  it('lets the job through when ComfyUI answers but cannot list (HTTP error)', async () => {
    const notFound: typeof fetch = async () => new Response('nope', { status: 404 });
    await requireComfyModels('http://c:8188', 'Upscale', [{ folder: 'seedvr2', file: 'a' }], notFound);
  });
});
