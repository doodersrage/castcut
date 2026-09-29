import {
  stripEmptyComfyUiRuntime,
  type ComfyUiRuntimeConfig,
  type WorkflowParamValues,
} from '@/lib/comfyui-config';
import { previewWorkflowInjection } from '@/lib/comfyui-workflow-preview';
import { fetchComfyObjectInfoPayload } from '@/lib/comfyui-object-info';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type PreviewRequestBody = {
  prompt?: string;
  negativePrompt?: string;
  params?: WorkflowParamValues;
  comfy?: ComfyUiRuntimeConfig;
  model?: string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
  fullWorkflow?: boolean;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/preview');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PreviewRequestBody;
    const runtimeConfig = stripEmptyComfyUiRuntime(body.comfy);
    const objectInfo = await fetchComfyObjectInfoPayload(runtimeConfig);
    const result = previewWorkflowInjection({
      prompt: body.prompt?.trim() ?? '',
      negativePrompt: body.negativePrompt,
      params: body.params,
      comfy: runtimeConfig,
      model: body.model,
      hasInputImage: body.hasInputImage,
      hasMaskImage: body.hasMaskImage,
      fullWorkflow: body.fullWorkflow === true,
      inventory: {
        models: objectInfo?.models ?? null,
        supportsNeuralUpscaleTileSize: objectInfo?.supportsNeuralUpscaleTileSize,
        objectInfoUnavailable: !objectInfo,
        nodeTypes: objectInfo?.nodeTypes ?? null,
        webpSaveAdapters: objectInfo?.webpSaveAdapters ?? null,
      },
    });

    if (!result.ok) {
      return apiError(result.error ?? 'Preview failed.', 400);
    }

    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Workflow preview failed.', 500);
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
