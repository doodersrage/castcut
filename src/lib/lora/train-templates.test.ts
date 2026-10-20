import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildKohyaTrainArgv,
  getLoraTrainTemplate,
  kohyaDatasetBucketName,
  loraOutputStem,
  normalizeLoraTrainTemplateId,
  parseKohyaTrainProgress,
} from './train-templates';

describe('lora-train-templates', () => {
  it('normalizes known template ids', () => {
    assert.equal(normalizeLoraTrainTemplateId('kohya-sdxl'), 'kohya-sdxl');
    assert.equal(normalizeLoraTrainTemplateId('kohya-flux'), 'kohya-flux');
    assert.equal(normalizeLoraTrainTemplateId('nope'), undefined);
  });

  it('builds kohya argv with rank, steps, resolution, and base', () => {
    const argv = buildKohyaTrainArgv('kohya-sdxl', {
      scriptPath: '/opt/sd-scripts/train_network.py',
      datasetPath: '/data/lora-datasets/ds-1',
      outputDir: '/data/lora-output/job-1',
      outputName: 'rin-look-v1.safetensors',
      pretrainedModel: '/models/sd_xl_base_1.0.safetensors',
      networkRank: 32,
      maxTrainSteps: 800,
      resolution: 768,
    });
    assert.equal(argv[0], '/opt/sd-scripts/train_network.py');
    assert.ok(argv.includes('--pretrained_model_name_or_path=/models/sd_xl_base_1.0.safetensors'));
    assert.ok(argv.includes('--train_data_dir=/data/lora-datasets/ds-1'));
    assert.ok(argv.includes('--output_name=rin-look-v1'));
    assert.ok(argv.includes('--network_dim=32'));
    assert.ok(argv.includes('--max_train_steps=800'));
    assert.ok(argv.includes('--resolution=768'));
    assert.ok(argv.includes('--network_module=networks.lora'));
  });

  it('uses lora_flux network module for FLUX template', () => {
    const argv = buildKohyaTrainArgv('kohya-flux', {
      scriptPath: 'train_network.py',
      datasetPath: '/ds',
      outputDir: '/out',
      outputName: 'flux-lora',
      pretrainedModel: '/flux.safetensors',
    });
    assert.ok(argv.includes('--network_module=networks.lora_flux'));
    assert.equal(getLoraTrainTemplate('kohya-flux').defaultResolution, 1024);
  });

  it('parses kohya and tqdm progress lines', () => {
    assert.equal(parseKohyaTrainProgress('steps: 250/1000  loss=0.12'), 0.25);
    assert.equal(parseKohyaTrainProgress('45%|████| 450/1000 [00:10<00:12, 45it/s]'), 0.45);
    assert.equal(parseKohyaTrainProgress('epoch: 2/10'), 0.2);
    assert.equal(parseKohyaTrainProgress('loading vae…'), null);
  });

  it('names dataset buckets and output stems', () => {
    assert.equal(kohyaDatasetBucketName('Rin Style!!'), '10_rin_style');
    assert.equal(loraOutputStem('/tmp/out/my_lora.safetensors'), 'my_lora');
  });
});
