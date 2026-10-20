import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

type Issue = { severity: 'error' | 'warn'; message: string };

// ---- ./prompt-pair ----
let negativePromptModelResult = false;
const modelUsesNegativePrompt = mock.fn((_model: string) => negativePromptModelResult);
mock.module('../prompt/pair', { namedExports: { modelUsesNegativePrompt } });

// ---- ./comfy-models/client ----
let modelCategory = 'stable-diffusion';
const getComfyModelDefinition = mock.fn((_model?: string) => ({ category: modelCategory }));
mock.module('../comfy-models/client', { namedExports: { getComfyModelDefinition } });

// ---- ./model-denoise-defaults ----
let inpaintModelResult = false;
let editQueueToolResult = false;
const isInpaintModel = mock.fn((_model: string) => inpaintModelResult);
const isEditQueueTool = mock.fn((_tool?: string) => editQueueToolResult);
mock.module('../model/denoise-defaults', { namedExports: { isInpaintModel, isEditQueueTool } });

// ---- ./comfyui-runtime-for-model ----
let runtimeResult: Record<string, unknown> | undefined | null = {
  workflowJson: '{"nodes":{}}',
  apiUrl: 'http://comfy.local',
};
const resolveRuntimeForQueueAsync = mock.fn(async (_model: string, _tool?: string) => runtimeResult);
mock.module('../comfyui/runtime-for-model', { namedExports: { resolveRuntimeForQueueAsync } });

// ---- ./comfyui-requeue ----
type PreviewResult = {
  ok?: boolean;
  error?: string;
  workflowSource?: string;
  replacements?: { positive?: number };
  workflowJson?: string;
  preflightIssues?: Issue[];
};
let previewResult: PreviewResult | (() => PreviewResult) = {
  ok: true,
  workflowSource: 'custom',
  replacements: { positive: 1 },
  workflowJson: '{"nodes":{"1":{}}}',
};
const fetchWorkflowPreview = mock.fn(async (_input: unknown) => {
  if (typeof previewResult === 'function') {
    return previewResult();
  }
  return previewResult;
});
mock.module('../comfyui/requeue', { namedExports: { fetchWorkflowPreview } });

// ---- ./queue-params-settings ----
const resolveQueueParams = mock.fn((input?: Record<string, unknown>) => input ?? {});
mock.module('../queue/params-settings', { namedExports: { resolveQueueParams } });

// ---- ./workflow-queue-loader-preflight ----
let loaderIssues: Issue[] = [];
const auditLoaderMapsAtQueueTime = mock.fn(async (_input?: unknown) => loaderIssues);
mock.module('./queue-loader-preflight', { namedExports: { auditLoaderMapsAtQueueTime } });

// ---- ./lora-stack-preflight ----
let loraIssues: Issue[] = [];
const auditLoraStackAtQueueTime = mock.fn((_input: unknown) => loraIssues);
mock.module('../lora/stack-preflight', { namedExports: { auditLoraStackAtQueueTime } });

// ---- ./comfyui-object-info-cache ----
let objectInfoResult: { nodeTypes?: Set<string>; models?: unknown } | null = {
  nodeTypes: new Set(['CheckpointLoaderSimple']),
  models: { checkpoints: ['a.safetensors'] },
};
const fetchComfyObjectInfoCached = mock.fn(async (_input?: unknown) => objectInfoResult);
mock.module('../comfyui/object-info-cache', { namedExports: { fetchComfyObjectInfoCached } });

// ---- ./workflow-preflight-core ----
let graphPreflightIssues: Issue[] = [];
const collectWorkflowGraphPreflightIssues = mock.fn((_input: unknown) => graphPreflightIssues);
mock.module('./preflight-core', {
  namedExports: { collectWorkflowGraphPreflightIssues },
});

// NOTE: ./comfyui-manager-install-client is imported dynamically inside
// runWorkflowPreflightWithNodeInstall via a call-time `await import(...)`. mock.module()
// does not reliably intercept that path (only static top-of-file imports), so this file
// does not mock it and does not cover the node-install branch — only the ok:true
// short-circuit that returns before the dynamic import is ever reached.

afterEach(() => {
  modelUsesNegativePrompt.mock.resetCalls();
  getComfyModelDefinition.mock.resetCalls();
  isInpaintModel.mock.resetCalls();
  isEditQueueTool.mock.resetCalls();
  resolveRuntimeForQueueAsync.mock.resetCalls();
  fetchWorkflowPreview.mock.resetCalls();
  resolveQueueParams.mock.resetCalls();
  auditLoaderMapsAtQueueTime.mock.resetCalls();
  auditLoraStackAtQueueTime.mock.resetCalls();
  fetchComfyObjectInfoCached.mock.resetCalls();
  collectWorkflowGraphPreflightIssues.mock.resetCalls();

  negativePromptModelResult = false;
  modelCategory = 'stable-diffusion';
  inpaintModelResult = false;
  editQueueToolResult = false;
  runtimeResult = { workflowJson: '{"nodes":{}}', apiUrl: 'http://comfy.local' };
  previewResult = {
    ok: true,
    workflowSource: 'custom',
    replacements: { positive: 1 },
    workflowJson: '{"nodes":{"1":{}}}',
  };
  loaderIssues = [];
  loraIssues = [];
  objectInfoResult = { nodeTypes: new Set(['CheckpointLoaderSimple']), models: { checkpoints: ['a.safetensors'] } };
  graphPreflightIssues = [];
});

describe('workflow-preflight', async () => {
  const { runWorkflowPreflight, runWorkflowPreflightWithNodeInstall } = await import('./preflight');

  const baseInput = () => ({
    model: 'flux-dev',
    prompts: ['a cat in a hat'],
  });

  describe('runWorkflowPreflight', () => {
    it('returns ok:true with no issues on the happy path', async () => {
      const result = await runWorkflowPreflight(baseInput());
      assert.equal(result.ok, true);
      assert.deepEqual(result.issues, []);
    });

    it('errors and skips fetchWorkflowPreview when prompts are all blank', async () => {
      const result = await runWorkflowPreflight({ model: 'flux-dev', prompts: ['', '   '] });
      assert.equal(result.ok, false);
      assert.deepEqual(result.issues, [{ severity: 'error', message: 'No prompts to queue.' }]);
      assert.equal(fetchWorkflowPreview.mock.callCount(), 0);
    });

    it('errors when the prompts array is empty', async () => {
      const result = await runWorkflowPreflight({ model: 'flux-dev', prompts: [] });
      assert.equal(result.ok, false);
      assert.equal(result.issues[0]?.message, 'No prompts to queue.');
    });

    it('emits an audio-specific error when no workflow is mapped for an audio model', async () => {
      runtimeResult = undefined;
      modelCategory = 'audio';
      const result = await runWorkflowPreflight(baseInput());
      assert.equal(result.ok, false);
      assert.ok(
        result.issues.some(i => i.severity === 'error' && i.message.includes('No audio workflow mapped'))
      );
    });

    it('emits a mesh-specific error when no workflow is mapped for a mesh model', async () => {
      runtimeResult = null;
      modelCategory = 'mesh';
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message.includes('No mesh workflow mapped')));
    });

    it('emits a video-specific error when no workflow is mapped for a video model', async () => {
      runtimeResult = {};
      modelCategory = 'video';
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message.includes('No video workflow mapped')));
    });

    it('emits a generic warn for other categories when no workflow is mapped', async () => {
      runtimeResult = {};
      modelCategory = 'flux';
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(
        result.issues.some(i => i.severity === 'warn' && i.message.includes('No workflow JSON configured'))
      );
    });

    it('does not flag a missing workflow when workflowFileId is present without workflowJson', async () => {
      runtimeResult = { workflowFileId: 'abc123' };
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(!result.issues.some(i => i.message.toLowerCase().includes('no workflow')));
      assert.equal(getComfyModelDefinition.mock.callCount(), 0);
    });

    it('warns when the model uses negative prompts and none is provided', async () => {
      negativePromptModelResult = true;
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(
        result.issues.some(i => i.message === 'SD-family model queued without a negative prompt.')
      );
    });

    it('warns when negativePrompt is only whitespace', async () => {
      negativePromptModelResult = true;
      const result = await runWorkflowPreflight({ ...baseInput(), negativePrompt: '   ' });
      assert.ok(
        result.issues.some(i => i.message === 'SD-family model queued without a negative prompt.')
      );
    });

    it('does not warn when a non-blank negativePrompt is provided', async () => {
      negativePromptModelResult = true;
      const result = await runWorkflowPreflight({ ...baseInput(), negativePrompt: 'blurry' });
      assert.ok(!result.issues.some(i => i.message.includes('negative prompt')));
    });

    it('does not warn about negative prompts when the model does not use them', async () => {
      negativePromptModelResult = false;
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(!result.issues.some(i => i.message.includes('negative prompt')));
    });

    it('warns about a missing source image and mask for inpaint models with neither', async () => {
      inpaintModelResult = true;
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message.includes('without a source image or mask')));
    });

    it('warns about a missing mask only when an inpaint model has an input image but no mask', async () => {
      inpaintModelResult = true;
      const result = await runWorkflowPreflight({ ...baseInput(), hasInputImage: true });
      assert.ok(
        result.issues.some(
          i => i.message === 'Inpaint model queued without a mask — white pixels mark the edit region.'
        )
      );
      assert.ok(!result.issues.some(i => i.message.includes('without a source image or mask')));
    });

    it('does not warn about inpaint image/mask when a mask is provided', async () => {
      inpaintModelResult = true;
      const result = await runWorkflowPreflight({ ...baseInput(), hasMaskImage: true });
      assert.ok(!result.issues.some(i => i.message.includes('Inpaint model queued without')));
    });

    it('does not warn about inpaint image/mask for non-inpaint models', async () => {
      inpaintModelResult = false;
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(!result.issues.some(i => i.message.includes('Inpaint model')));
    });

    it('falls back to preview-input.png when hasInputImage is true with no explicit filename', async () => {
      await runWorkflowPreflight({ ...baseInput(), hasInputImage: true });
      const args = resolveQueueParams.mock.calls[0]?.arguments[0] as Record<string, unknown>;
      assert.equal(args.inputImageFilename, 'preview-input.png');
      assert.equal(args.maskImageFilename, undefined);
      assert.equal(args.controlImageFilename, undefined);
    });

    it('uses explicit queueParams filenames over the preview- defaults', async () => {
      await runWorkflowPreflight({
        ...baseInput(),
        hasInputImage: true,
        hasMaskImage: true,
        hasControlImage: true,
        queueParams: {
          inputImageFilename: 'my-input.png',
          maskImageFilename: 'my-mask.png',
          controlImageFilename: 'my-control.png',
        },
      });
      const args = resolveQueueParams.mock.calls[0]?.arguments[0] as Record<string, unknown>;
      assert.equal(args.inputImageFilename, 'my-input.png');
      assert.equal(args.maskImageFilename, 'my-mask.png');
      assert.equal(args.controlImageFilename, 'my-control.png');
    });

    it('falls back to preview-mask.png / preview-control.png when queueParams filenames are blank', async () => {
      await runWorkflowPreflight({
        ...baseInput(),
        hasMaskImage: true,
        hasControlImage: true,
        queueParams: { maskImageFilename: '   ', controlImageFilename: '' },
      });
      const args = resolveQueueParams.mock.calls[0]?.arguments[0] as Record<string, unknown>;
      assert.equal(args.maskImageFilename, 'preview-mask.png');
      assert.equal(args.controlImageFilename, 'preview-control.png');
    });

    it('leaves image/mask/control filenames undefined when the has* flags are false', async () => {
      await runWorkflowPreflight(baseInput());
      const args = resolveQueueParams.mock.calls[0]?.arguments[0] as Record<string, unknown>;
      assert.equal(args.inputImageFilename, undefined);
      assert.equal(args.maskImageFilename, undefined);
      assert.equal(args.controlImageFilename, undefined);
    });

    it('turns a failed preview into an error issue using its message', async () => {
      previewResult = { ok: false, error: 'ComfyUI is unreachable' };
      const result = await runWorkflowPreflight(baseInput());
      assert.equal(result.ok, false);
      assert.ok(result.issues.some(i => i.severity === 'error' && i.message === 'ComfyUI is unreachable'));
    });

    it('uses a default message when a failed preview has no error text', async () => {
      previewResult = { ok: false };
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message === 'Workflow preview failed.'));
    });

    it('errors when positive replacements are zero and workflowSource is not minimal', async () => {
      previewResult = {
        ok: true,
        workflowSource: 'custom',
        replacements: { positive: 0 },
        workflowJson: '{}',
      };
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message.includes('no positive prompt placeholder')));
    });

    it('errors when replacements is entirely absent and workflowSource is not minimal', async () => {
      previewResult = { ok: true, workflowSource: 'custom', workflowJson: '{}' };
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message.includes('no positive prompt placeholder')));
    });

    it('does not error about the positive placeholder when workflowSource is minimal', async () => {
      previewResult = {
        ok: true,
        workflowSource: 'minimal',
        replacements: { positive: 0 },
        workflowJson: '{}',
      };
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(!result.issues.some(i => i.message.includes('positive prompt placeholder')));
    });

    it('errors when the input image placeholder was not replaced and the tool is not an edit tool', async () => {
      editQueueToolResult = false;
      previewResult = {
        ok: true,
        workflowSource: 'custom',
        replacements: { positive: 1 },
        workflowJson: 'still has {{INPUT_IMAGE}}',
      };
      const result = await runWorkflowPreflight({ ...baseInput(), hasInputImage: true });
      assert.ok(result.issues.some(i => i.message.includes('Input image placeholder was not replaced')));
    });

    it('does not error about the input image placeholder for edit queue tools', async () => {
      editQueueToolResult = true;
      previewResult = {
        ok: true,
        workflowSource: 'custom',
        replacements: { positive: 1 },
        workflowJson: 'still has {{INPUT_IMAGE}}',
      };
      const result = await runWorkflowPreflight({ ...baseInput(), hasInputImage: true, tool: 'edit' });
      assert.ok(!result.issues.some(i => i.message.includes('Input image placeholder')));
    });

    it('does not error about the input image placeholder when hasInputImage is false', async () => {
      previewResult = {
        ok: true,
        workflowSource: 'custom',
        replacements: { positive: 1 },
        workflowJson: 'still has {{INPUT_IMAGE}}',
      };
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(!result.issues.some(i => i.message.includes('Input image placeholder')));
    });

    it('uses preview.preflightIssues directly and skips collectWorkflowGraphPreflightIssues', async () => {
      previewResult = {
        ok: true,
        workflowSource: 'custom',
        replacements: { positive: 1 },
        workflowJson: '{}',
        preflightIssues: [{ severity: 'warn', message: 'from preview' }],
      };
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message === 'from preview'));
      assert.equal(collectWorkflowGraphPreflightIssues.mock.callCount(), 0);
    });

    it('calls collectWorkflowGraphPreflightIssues with resolved object info when preview has no preflightIssues', async () => {
      graphPreflightIssues = [{ severity: 'warn', message: 'from graph' }];
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message === 'from graph'));
      assert.equal(collectWorkflowGraphPreflightIssues.mock.callCount(), 1);
      const arg = collectWorkflowGraphPreflightIssues.mock.calls[0]?.arguments[0] as Record<string, unknown>;
      assert.equal(arg.knownNodeTypes, objectInfoResult?.nodeTypes);
      assert.equal(arg.models, objectInfoResult?.models);
      assert.equal(arg.objectInfoUnavailable, false);
    });

    it('sets objectInfoUnavailable to true when fetchComfyObjectInfoCached returns null', async () => {
      objectInfoResult = null;
      await runWorkflowPreflight(baseInput());
      const arg = collectWorkflowGraphPreflightIssues.mock.calls[0]?.arguments[0] as Record<string, unknown>;
      assert.equal(arg.objectInfoUnavailable, true);
      assert.equal(arg.knownNodeTypes, undefined);
      assert.equal(arg.models, undefined);
    });

    it('treats an empty preflightIssues array on the preview as absent', async () => {
      previewResult = {
        ok: true,
        workflowSource: 'custom',
        replacements: { positive: 1 },
        workflowJson: '{}',
        preflightIssues: [],
      };
      await runWorkflowPreflight(baseInput());
      assert.equal(collectWorkflowGraphPreflightIssues.mock.callCount(), 1);
    });

    it('appends loader-map and lora-stack audit issues to the result', async () => {
      loaderIssues = [{ severity: 'warn', message: 'loader issue' }];
      loraIssues = [{ severity: 'error', message: 'lora issue' }];
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message === 'loader issue'));
      assert.ok(result.issues.some(i => i.message === 'lora issue'));
      assert.equal(result.ok, false);
    });

    it('catches a thrown Error and reports its message as an issue', async () => {
      previewResult = () => {
        throw new Error('boom');
      };
      const result = await runWorkflowPreflight(baseInput());
      assert.equal(result.ok, false);
      assert.ok(result.issues.some(i => i.severity === 'error' && i.message === 'boom'));
    });

    it('catches a non-Error throw and uses a default message', async () => {
      previewResult = () => {
         
        throw 'not an error object';
      };
      const result = await runWorkflowPreflight(baseInput());
      assert.ok(result.issues.some(i => i.message === 'Workflow preview failed.'));
    });

    it('is ok:true when only warn-severity issues are present', async () => {
      negativePromptModelResult = true;
      const result = await runWorkflowPreflight(baseInput());
      assert.equal(result.ok, true);
      assert.ok(result.issues.length > 0);
      assert.ok(result.issues.every(i => i.severity === 'warn'));
    });

    it('is ok:false when any issue has severity error', async () => {
      previewResult = { ok: false, error: 'bad' };
      const result = await runWorkflowPreflight(baseInput());
      assert.equal(result.ok, false);
    });
  });

  describe('runWorkflowPreflightWithNodeInstall', () => {
    it('returns the first result unchanged when it is already ok, without the dynamic node-install import', async () => {
      const result = await runWorkflowPreflightWithNodeInstall(baseInput());
      assert.equal(result.ok, true);
      assert.deepEqual(result.issues, []);
      assert.equal(result.installMessage, undefined);
    });

    it('short-circuits to ok:true even when warn-only issues are present', async () => {
      negativePromptModelResult = true;
      const result = await runWorkflowPreflightWithNodeInstall(baseInput());
      assert.equal(result.ok, true);
      assert.ok(result.issues.length > 0);
    });
  });
});
