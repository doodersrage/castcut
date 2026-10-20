import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractParamsFromWorkflow } from './param-extract';

describe('workflow-param-extract', () => {
  describe('extractParamsFromWorkflow', () => {
    it('returns an empty object for an empty workflow', () => {
      assert.deepEqual(extractParamsFromWorkflow({}), {});
    });

    it('extracts recognized sampler/latent params from a single node', () => {
      const workflow = {
        '1': {
          class_type: 'KSampler',
          inputs: {
            seed: 12345,
            steps: 30,
            cfg: 7.5,
            width: 1024,
            height: 1024,
            sampler_name: 'euler',
            scheduler: 'normal',
          },
        },
      };
      const params = extractParamsFromWorkflow(workflow);
      assert.equal(params.seed, '12345');
      assert.equal(params.steps, '30');
      assert.equal(params.cfg, '7.5');
      assert.equal(params.width, '1024');
      assert.equal(params.height, '1024');
      assert.equal(params.samplerName, 'euler');
      assert.equal(params.scheduler, 'normal');
    });

    it('normalizes sampler_name to the samplerName camelCase key', () => {
      const workflow = { '1': { inputs: { sampler_name: 'dpmpp_2m' } } };
      const params = extractParamsFromWorkflow(workflow);
      assert.equal(params.samplerName, 'dpmpp_2m');
      assert.equal((params as Record<string, unknown>).sampler_name, undefined);
    });

    it('matches param keys case-insensitively', () => {
      const workflow = { '1': { inputs: { SEED: 42, Steps: 20 } } };
      const params = extractParamsFromWorkflow(workflow);
      assert.equal(params.seed, '42');
      assert.equal(params.steps, '20');
    });

    it('ignores inputs that are not on the recognized param list', () => {
      const workflow = { '1': { inputs: { text: 'a prompt', denoise: 0.8, model: 'checkpoint.safetensors' } } };
      assert.deepEqual(extractParamsFromWorkflow(workflow), {});
    });

    it('ignores non-number/non-string values for recognized keys', () => {
      const workflow = { '1': { inputs: { seed: true, steps: null, cfg: { nested: 1 } } } };
      assert.deepEqual(extractParamsFromWorkflow(workflow), {});
    });

    it('skips nodes with no inputs property', () => {
      const workflow = { '1': { class_type: 'Note' } };
      assert.deepEqual(extractParamsFromWorkflow(workflow), {});
    });

    it('skips node entries that are not objects', () => {
      const workflow = { '1': 'not-a-node', '2': null, '3': 42 } as unknown as Record<string, unknown>;
      assert.deepEqual(extractParamsFromWorkflow(workflow), {});
    });

    it('merges params across multiple nodes, later nodes overwriting earlier ones', () => {
      const workflow = {
        '1': { inputs: { seed: 111, steps: 20 } },
        '2': { inputs: { seed: 222 } },
      };
      const params = extractParamsFromWorkflow(workflow);
      assert.equal(params.seed, '222');
      assert.equal(params.steps, '20');
    });

    it('converts numeric values to strings but leaves string values as-is', () => {
      const workflow = { '1': { inputs: { steps: 25, scheduler: 'karras' } } };
      const params = extractParamsFromWorkflow(workflow);
      assert.equal(params.steps, '25');
      assert.equal(typeof params.steps, 'string');
      assert.equal(params.scheduler, 'karras');
    });
  });
});
