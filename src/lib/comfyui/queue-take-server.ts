/**
 * One take queued to ComfyUI, the server's way (FINISHING_PLAN Phase 3, step 6): what POST
 * /api/comfyui does with a single prompt, as a function. The route calls it for the page; the
 * run's server loop calls it with the same body, so a take queued with the tab closed reaches
 * ComfyUI exactly as one queued from the page.
 */
import { queuePromptToComfyUi } from './client';
import {
  parseWorkflowJson,
  resolveQueueInjectionContext,
  stripEmptyComfyUiRuntime,
  type ComfyUiRuntimeConfig,
  type WorkflowParamValues,
} from './config';

/** What POST /api/comfyui is sent (the page's request; the run loop's for a take). */
export type ComfyUiQueueRequest = {
  prompt?: string;
  prompts?: string[];
  negativePrompt?: string;
  nodeTitle?: string;
  model?: string;
  params?: WorkflowParamValues;
  paramsPerPrompt?: WorkflowParamValues[];
  /** Browser WebSocket client id for live latent previews. */
  clientId?: string;
  /** Jump ahead of pending jobs (interactive singles). Ignored for batches. */
  front?: boolean;
  comfy?: ComfyUiRuntimeConfig;
  /** Diffusers-first: classify + /v1/workflow, then optional Comfy fallback. */
  preferDiffusers?: boolean;
  allowComfyFallback?: boolean;
  /** Diffusers engine URL hint when preferDiffusers is set. */
  engineUrl?: string;
};

/** The request's runtime, its workflow and model, as the route reads them. */
export function queueRequestContext(body: ComfyUiQueueRequest) {
  const runtime = stripEmptyComfyUiRuntime(body.comfy);
  const workflow = runtime?.workflowJson?.trim()
    ? (parseWorkflowJson(runtime.workflowJson) ?? undefined)
    : undefined;
  return { runtime, workflow, model: runtime?.queueTargetModel ?? body.model };
}

/** Queue one prompt (`prompt`) to ComfyUI — or Diffusers first when the request says so. */
export async function queueTakeToComfyUi(body: ComfyUiQueueRequest, prompt: string) {
  const { runtime, workflow, model } = queueRequestContext(body);
  const resolvedQueue = resolveQueueInjectionContext({
    runtime,
    override: body.params,
    model,
    workflow,
  });
  return queuePromptToComfyUi(
    {
      prompt,
      negativePrompt: body.negativePrompt,
      nodeTitle: body.nodeTitle,
      model,
      params: resolvedQueue.params,
      clientId: body.clientId?.trim() || undefined,
      front: body.front === true,
    },
    runtime,
    {
      preferDiffusers: body.preferDiffusers === true,
      allowComfyFallback: body.allowComfyFallback !== false,
      diffusersUrl: body.engineUrl?.trim() || undefined,
    }
  );
}
