import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { engineLabelForModelKey, executingPhaseMessage, isLoaderClass } from './comfyui-loader-phase';
import {
  comfyUiJobStatusLabel,
  formatComfyUiJobStatusLine,
  isLoadingStatusMessage,
} from './comfyui-job-status';

const GRAPH = {
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_edit_2511_bf16.safetensors' } },
  '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b.safetensors' } },
  '7': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0] } },
  '8': { class_type: 'KSampler', inputs: { model: ['7', 0] } },
  '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
};

describe('executingPhaseMessage', () => {
  it('says which engine is loading on loader nodes', () => {
    assert.equal(executingPhaseMessage(GRAPH, '1'), 'Loading Qwen Edit 2511…');
    assert.equal(executingPhaseMessage(GRAPH, '2'), 'Loading Qwen Edit 2511…');
    assert.equal(executingPhaseMessage(GRAPH, '7'), 'Loading Qwen Edit 2511…');
  });

  it('says Rendering elsewhere, including image loads', () => {
    assert.equal(executingPhaseMessage(GRAPH, '8'), 'Rendering');
    assert.equal(executingPhaseMessage(GRAPH, '900'), 'Rendering');
  });

  it('is null for unknown nodes', () => {
    assert.equal(executingPhaseMessage(GRAPH, '42'), null);
    assert.equal(executingPhaseMessage(null, '1'), null);
  });
});

describe('job status with a loading phase', () => {
  it('leads with Loading until steps start', () => {
    const job = {
      promptId: 'p1',
      status: 'running' as const,
      statusMessage: 'Loading Qwen Edit 2511…',
    };
    assert.ok(isLoadingStatusMessage(job.statusMessage));
    assert.equal(comfyUiJobStatusLabel(job), 'Loading Qwen Edit 2511…');
    assert.equal(formatComfyUiJobStatusLine(job), 'Loading Qwen Edit 2511… · prompt_id p1');
    assert.equal(
      comfyUiJobStatusLabel({ ...job, progressValue: 2, progressMax: 8 }),
      'Running · 25%'
    );
    assert.equal(
      comfyUiJobStatusLabel({ ...job, statusMessage: 'Rendering · node 8' }),
      'Running'
    );
  });
});

describe('engine labels', () => {
  it('names the Day engines', () => {
    assert.equal(engineLabelForModelKey('qwen-rapid-aio-nsfw-v23'), 'Rapid AIO NSFW');
    assert.equal(engineLabelForModelKey('qwen-rapid-aio-sfw-v23'), 'Rapid AIO');
    assert.equal(engineLabelForModelKey('qwen_image_2.1_bf16'), 'Qwen-Image 2.1');
    assert.equal(engineLabelForModelKey('wan2.2-i2v-rapid-aio-v10-nsfw'), 'WAN 2.2 Rapid');
    assert.equal(engineLabelForModelKey('something_new'), 'something new');
    assert.equal(engineLabelForModelKey(null), 'the model');
  });

  it('tells loaders from image loads', () => {
    assert.ok(isLoaderClass('CheckpointLoaderSimple'));
    assert.ok(isLoaderClass('UnetLoaderGGUF'));
    assert.ok(!isLoaderClass('LoadImage'));
    assert.ok(!isLoaderClass('VHS_LoadVideo'));
  });
});
