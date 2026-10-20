import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditDualClipNodesInWorkflow } from './dual-clip-audit';

function models(overrides: Partial<{ dualClipTypes: string[]; clips: string[] }> = {}) {
  return {
    checkpoints: [],
    unets: [],
    vaes: [],
    upscaleModels: [],
    clips: overrides.clips ?? [],
    dualClipTypes: overrides.dualClipTypes ?? [],
    clipLoaderTypes: [],
    loras: [],
    controlNets: [],
  };
}

describe('workflow-dual-clip-audit', () => {
  describe('auditDualClipNodesInWorkflow', () => {
    it('returns [] when neither workflow nor workflowJson is given', () => {
      assert.deepEqual(auditDualClipNodesInWorkflow({ models: models() }), []);
    });

    it('returns [] when workflowJson is blank', () => {
      assert.deepEqual(
        auditDualClipNodesInWorkflow({ workflowJson: '   ', models: models() }),
        []
      );
    });

    it('returns [] when workflowJson is invalid JSON', () => {
      assert.deepEqual(
        auditDualClipNodesInWorkflow({ workflowJson: '{not json', models: models() }),
        []
      );
    });

    it('ignores non-DualCLIPLoader nodes', () => {
      const workflow = {
        '1': { class_type: 'CLIPTextEncode', inputs: { text: 'hi' } },
      };
      assert.deepEqual(auditDualClipNodesInWorkflow({ workflow, models: models() }), []);
    });

    it('ignores nodes that are not objects', () => {
      const workflow = { '1': 'not-a-node', '2': null } as unknown as Record<string, unknown>;
      assert.deepEqual(auditDualClipNodesInWorkflow({ workflow, models: models() }), []);
    });

    it('flags a qwen_image DualCLIPLoader type as an error, always', () => {
      const workflow = {
        '1': { class_type: 'DualCLIPLoader', inputs: { type: 'qwen_image' } },
      };
      const issues = auditDualClipNodesInWorkflow({ workflow, models: models() });
      assert.equal(issues.length, 1);
      assert.equal(issues[0]!.severity, 'error');
      assert.match(issues[0]!.message, /must use CLIPLoader/);
    });

    it('flags an unsupported dual-clip type when allowedTypes is non-empty', () => {
      const workflow = {
        '1': { class_type: 'DualCLIPLoader', inputs: { type: 'sd3' } },
      };
      const issues = auditDualClipNodesInWorkflow({
        workflow,
        models: models({ dualClipTypes: ['flux', 'sdxl'] }),
      });
      assert.equal(issues.length, 1);
      assert.match(issues[0]!.message, /not supported by your ComfyUI install/);
    });

    it('does not flag a type when allowedTypes is empty (no info to compare against)', () => {
      const workflow = {
        '1': { class_type: 'DualCLIPLoader', inputs: { type: 'sd3' } },
      };
      const issues = auditDualClipNodesInWorkflow({ workflow, models: models() });
      assert.deepEqual(issues, []);
    });

    it('does not flag a type that is in allowedTypes', () => {
      const workflow = {
        '1': { class_type: 'DualCLIPLoader', inputs: { type: 'flux' } },
      };
      const issues = auditDualClipNodesInWorkflow({
        workflow,
        models: models({ dualClipTypes: ['flux'] }),
      });
      assert.deepEqual(issues, []);
    });

    it('flags clip_name1/clip_name2 filenames not present in the clips inventory', () => {
      const workflow = {
        '1': {
          class_type: 'DualCLIPLoader',
          inputs: { type: 'flux', clip_name1: 'missing1.safetensors', clip_name2: 'clip_l.safetensors' },
        },
      };
      const issues = auditDualClipNodesInWorkflow({
        workflow,
        models: models({ dualClipTypes: ['flux'], clips: ['clip_l.safetensors'] }),
      });
      assert.equal(issues.length, 1);
      assert.match(issues[0]!.message, /clip_name1 “missing1\.safetensors” not found/);
    });

    it('does not flag clip filenames when the clips inventory is empty', () => {
      const workflow = {
        '1': {
          class_type: 'DualCLIPLoader',
          inputs: { type: 'flux', clip_name1: 'missing1.safetensors' },
        },
      };
      const issues = auditDualClipNodesInWorkflow({
        workflow,
        models: models({ dualClipTypes: ['flux'], clips: [] }),
      });
      assert.deepEqual(issues, []);
    });

    it('accepts a workflow supplied only as workflowJson', () => {
      const workflowJson = JSON.stringify({
        '1': { class_type: 'DualCLIPLoader', inputs: { type: 'qwen_image' } },
      });
      const issues = auditDualClipNodesInWorkflow({ workflowJson, models: models() });
      assert.equal(issues.length, 1);
    });

    it('audits multiple nodes and accumulates issues across them', () => {
      const workflow = {
        '1': { class_type: 'DualCLIPLoader', inputs: { type: 'qwen_image' } },
        '2': {
          class_type: 'DualCLIPLoader',
          inputs: { type: 'flux', clip_name1: 'missing.safetensors' },
        },
        '3': { class_type: 'CLIPTextEncode', inputs: {} },
      };
      const issues = auditDualClipNodesInWorkflow({
        workflow,
        models: models({ dualClipTypes: ['flux'], clips: ['clip_l.safetensors'] }),
      });
      assert.equal(issues.length, 2);
    });
  });
});
