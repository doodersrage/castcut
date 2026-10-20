import { generateVideoPrompt, scanVideoInitFrame } from '@/lib/video/prompt';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { normalizeComfyModel } from '@/lib/comfy-models';
import { fileToDataUrl, normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';
import { parseLlmRequestOptions, parseLlmRequestOptionsFromForm } from '@/lib/llm/request-options';

export const runtime = 'nodejs';

async function parseScanImage(request: Request): Promise<{
  imageDataUrl: string;
  camera?: string;
  style?: string;
  extraHints?: string;
  llm: ReturnType<typeof parseLlmRequestOptions>;
}> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      const detail =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'Failed to parse body as FormData.';
      throw new Error(
        `Could not read the first frame (${detail}). Re-upload the still and try again, or refresh and scan once more.`
      );
    }
    const file = formData.get('image');
    if (!(file instanceof File)) {
      throw new Error('Image file is required.');
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Upload must be an image file.');
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('Image must be 8MB or smaller.');
    }
    return {
      imageDataUrl: await fileToDataUrl(file),
      camera: String(formData.get('camera') ?? '').trim() || undefined,
      style: String(formData.get('style') ?? '').trim() || undefined,
      extraHints: String(formData.get('extraHints') ?? '').trim() || undefined,
      llm: parseLlmRequestOptionsFromForm(formData),
    };
  }

  const body = (await request.json().catch(error => {
    if (error instanceof SyntaxError) {
      throw new Error(
        'Upload was too large or incomplete. Use a still image or pick a smaller frame from Gallery.'
      );
    }
    throw error;
  })) as {
    image?: string;
    mimeType?: string;
    camera?: string;
    style?: string;
    extraHints?: string;
    llmTemperature?: number;
    allowTemplateFallback?: boolean;
    llmModel?: string;
    llmVisionModel?: string;
    llmEnabled?: boolean;
    llmProvider?: string;
    llmApiKey?: string;
  };
  if (!body.image?.trim()) {
    throw new Error('Image data is required.');
  }
  if (body.image.length > 12_000_000) {
    throw new Error('Image payload is too large.');
  }
  return {
    imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
    camera: body.camera?.trim() || undefined,
    style: body.style?.trim() || undefined,
    extraHints: body.extraHints?.trim() || undefined,
    llm: parseLlmRequestOptions(body),
  };
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    const isMultipart = contentType.includes('multipart/form-data');
    if (isMultipart) {
      const scan = await parseScanImage(request);
      const result = await scanVideoInitFrame(scan);
      return apiJson(result);
    }

    const body = (await request.json().catch(error => {
      if (error instanceof SyntaxError) {
        throw new Error(
          'Upload was too large or incomplete. Use a still image or pick a smaller frame from Gallery.'
        );
      }
      throw error;
    })) as {
      action?: string;
      subject?: string;
      motion?: string;
      camera?: string;
      durationSec?: number;
      style?: string;
      extraHints?: string;
      model?: string;
      preferTemplate?: boolean;
      image?: string;
      mimeType?: string;
      llmTemperature?: number;
      allowTemplateFallback?: boolean;
      llmModel?: string;
      llmVisionModel?: string;
      llmEnabled?: boolean;
      llmProvider?: string;
      llmApiKey?: string;
    };

    if (body.action === 'scan') {
      if (!body.image?.trim()) {
        return apiError('Image data is required.', 400);
      }
      if (body.image.length > 12_000_000) {
        return apiError('Image payload is too large.', 400);
      }
      const result = await scanVideoInitFrame({
        imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
        camera: body.camera,
        style: body.style,
        extraHints: body.extraHints,
        llm: parseLlmRequestOptions(body),
      });
      return apiJson(result);
    }

    if (!body.subject?.trim()) {
      return apiError('subject is required.', 400);
    }

    const result = await generateVideoPrompt({
      subject: body.subject,
      motion: body.motion,
      camera: body.camera,
      durationSec: body.durationSec,
      style: body.style,
      model: body.model ? normalizeComfyModel(body.model) : undefined,
      preferTemplate: body.preferTemplate === true,
    });

    return apiJson({ prompt: result.prompt, method: result.method });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video prompt failed.';
    const status =
      /required|must be|too large|not set|needs a vision|could not read|re-upload/i.test(message)
        ? 400
        : 500;
    return apiError(message, status);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/video-prompt');
}
