import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCivitaiSearchUrl,
  civitaiAssetId,
  civitaiBaseModelForStudioModel,
  civitaiLoraDownloadUrl,
  isBlockedCivitaiLoraHaystack,
  isCivitaiDownloadUrl,
  mapCivitaiSearchItems,
  parseCivitaiVersionId,
  sanitizeCivitaiBaseModel,
  sanitizeLoraFilename,
} from './civitai-lora';

describe('civitai lora helpers', () => {
  it('parses version ids and rejects junk', () => {
    assert.equal(parseCivitaiVersionId(42), 42);
    assert.equal(parseCivitaiVersionId('civitai:99'), 99);
    assert.equal(parseCivitaiVersionId(' 12 '), 12);
    assert.equal(parseCivitaiVersionId(0), null);
    assert.equal(parseCivitaiVersionId(-1), null);
    assert.equal(parseCivitaiVersionId('12.5'), null);
    assert.equal(parseCivitaiVersionId('https://civitai.com/api/download/models/9'), null);
    assert.equal(civitaiAssetId(9), 'civitai:9');
  });

  it('only treats constructed Civitai download paths as download URLs', () => {
    assert.equal(isCivitaiDownloadUrl(civitaiLoraDownloadUrl(123)), true);
    assert.equal(isCivitaiDownloadUrl('https://civitai.com/api/v1/models?query=x'), false);
    assert.equal(isCivitaiDownloadUrl('http://civitai.com/api/download/models/123'), false);
  });

  it('sanitizes LoRA filenames and blocks traversal', () => {
    assert.equal(sanitizeLoraFilename('foo/bar.safetensors'), 'bar.safetensors');
    assert.equal(sanitizeLoraFilename('style'), 'style.safetensors');
    assert.throws(() => sanitizeLoraFilename('..'));
  });

  it('maps studio models to Civitai base models', () => {
    assert.equal(civitaiBaseModelForStudioModel('flux-dev'), 'Flux.1 D');
    assert.equal(civitaiBaseModelForStudioModel('flux-schnell'), 'Flux.1 S');
    assert.equal(civitaiBaseModelForStudioModel('flux-2-klein'), 'Flux.2');
    assert.equal(civitaiBaseModelForStudioModel('qwen-image-2512'), 'Qwen');
    assert.equal(civitaiBaseModelForStudioModel('wan-video'), 'Wan Video');
    assert.equal(civitaiBaseModelForStudioModel('sdxl'), 'SDXL 1.0');
    assert.equal(sanitizeCivitaiBaseModel('flux.1 d'), 'Flux.1 D');
    assert.equal(sanitizeCivitaiBaseModel('not-a-base'), undefined);
  });

  it('builds a Civitai search URL without client-supplied hosts', () => {
    const url = new URL(
      buildCivitaiSearchUrl({ query: 'portrait', baseModel: 'Flux.1 D', nsfw: false })
    );
    assert.equal(url.origin, 'https://civitai.com');
    assert.equal(url.pathname, '/api/v1/models');
    assert.equal(url.searchParams.get('types'), 'LORA');
    assert.equal(url.searchParams.get('query'), 'portrait');
    assert.equal(url.searchParams.get('baseModels'), 'Flux.1 D');
    assert.equal(url.searchParams.get('nsfw'), 'false');
  });

  it('maps Civitai payloads and drops blocked / nsfw-when-disabled hits', () => {
    const hits = mapCivitaiSearchItems(
      {
        items: [
          {
            id: 1,
            name: 'Portrait LoRA',
            nsfw: false,
            creator: { username: 'alice' },
            modelVersions: [
              {
                id: 11,
                name: 'v1',
                baseModel: 'Flux.1 D',
                files: [{ name: 'portrait.safetensors', type: 'Model', sizeKB: 1024 }],
                images: [{ url: 'https://image.civitai.com/x.png', nsfw: false }],
              },
            ],
          },
          {
            id: 2,
            name: 'loli character pack',
            nsfw: false,
            tags: ['loli'],
            modelVersions: [
              {
                id: 22,
                name: 'v1',
                baseModel: 'Flux.1 D',
                files: [{ name: 'blocked.safetensors', type: 'Model', sizeKB: 10 }],
              },
            ],
          },
          {
            id: 3,
            name: 'NSFW style',
            nsfw: true,
            modelVersions: [
              {
                id: 33,
                name: 'v1',
                baseModel: 'Flux.1 D',
                files: [{ name: 'nsfw.safetensors', type: 'Model', sizeKB: 10 }],
              },
            ],
          },
        ],
      },
      { includeNsfw: false }
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.versionId, 11);
    assert.equal(hits[0]?.filename, 'portrait.safetensors');
    assert.equal(hits[0]?.previewUrl, 'https://image.civitai.com/x.png');
    assert.equal(isBlockedCivitaiLoraHaystack('cute loli portrait'), true);
  });
});
