import { COMFYUI_MAX_BATCH_PROMPTS, queueBatchToComfyUi } from '@/lib/comfyui/client';
import { resolveQueueInjectionContext } from '@/lib/comfyui/config';
import {
  queueRequestContext,
  queueTakeToComfyUi,
  type ComfyUiQueueRequest,
} from '@/lib/comfyui/queue-take-server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveQueueFailureHref } from '@/lib/queue/failure-playbook';
import { NextResponse } from 'next/server';

function apiQueueError(message: string, status: number, extra?: Record<string, unknown>) {
  const href = resolveQueueFailureHref(message);
  return apiError(message, status, {
    ...(extra ?? {}),
    ...(href ? { href } : {}),
  });
}

export const runtime = 'nodejs';

type ComfyUiRequestBody = ComfyUiQueueRequest;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ComfyUiRequestBody;
    const { runtime, workflow } = queueRequestContext(body);
    const prompts =
      body.prompts?.map(entry => entry.trim()).filter(Boolean) ??
      (body.prompt?.trim() ? [body.prompt.trim()] : []);

    if (prompts.length === 0) {
      return apiQueueError('Prompt is required.', 400);
    }

    if (prompts.length > COMFYUI_MAX_BATCH_PROMPTS) {
      return apiQueueError(
        `At most ${COMFYUI_MAX_BATCH_PROMPTS} prompts can be queued per request.`,
        400
      );
    }

    if (prompts.length === 1) {
      const result = await queueTakeToComfyUi(body, prompts[0]!);

      if (!result.ok) {
        return apiQueueError(result.error ?? 'ComfyUI queue failed.', 502, {
          comfyUrl: result.comfyUrl,
          engineUrl: result.comfyUrl,
          workflowSource: result.workflowSource,
          engineId: result.engineId,
          family: result.family,
        });
      }

      return apiJson({
        ...result,
        engineUrl: result.comfyUrl,
      });
    }

    const batchClientId = body.clientId?.trim() || undefined;
    const batch = await queueBatchToComfyUi(
      prompts.map((prompt, index) => ({
        prompt,
        negativePrompt: body.negativePrompt,
        nodeTitle: body.nodeTitle,
        model: runtime?.queueTargetModel ?? body.model,
        clientId: batchClientId,
        params: resolveQueueInjectionContext({
          runtime,
          override: body.paramsPerPrompt?.[index] ?? body.params,
          model: runtime?.queueTargetModel ?? body.model,
          workflow,
        }).params,
      })),
      runtime,
      {
        preferDiffusers: body.preferDiffusers === true,
        allowComfyFallback: body.allowComfyFallback !== false,
        diffusersUrl: body.engineUrl?.trim() || undefined,
      }
    );

    if (!batch.ok) {
      return apiQueueError('No prompts were queued to ComfyUI.', 502, batch);
    }

    return apiJson(batch);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ComfyUI request failed.';
    const status = /not allowed|Invalid URL|URL is required|allowlist/i.test(message) ? 400 : 500;
    return apiQueueError(message, status);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
