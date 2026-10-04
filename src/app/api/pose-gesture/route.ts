import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';
import { MAX_GESTURE_QUESTIONS, type GestureQuestion } from '@/lib/pose-gesture';
import { askGestureVision } from '@/lib/pose-gesture-vision-server';
import { normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/pose-gesture');
}

function readQuestions(raw: unknown): GestureQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((entry): GestureQuestion[] => {
      if (!entry || typeof entry !== 'object') return [];
      const { id, text, label } = entry as Record<string, unknown>;
      if (typeof id !== 'string' || typeof text !== 'string') return [];
      const clean = {
        id: id.trim().slice(0, 40),
        text: text.trim().slice(0, 300),
        label: typeof label === 'string' ? label.trim().slice(0, 80) : '',
      };
      return clean.id && clean.text ? [clean] : [];
    })
    .slice(0, MAX_GESTURE_QUESTIONS);
}

/** The gesture check's action questions: `{ answers: GestureAnswer[] | null }`. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      image?: string;
      mimeType?: string;
      questions?: unknown;
      llmTemperature?: number;
      allowTemplateFallback?: boolean;
      llmModel?: string;
      llmVisionModel?: string;
      llmEnabled?: boolean;
      llmProvider?: string;
      llmApiKey?: string;
    };
    if (!body.image?.trim()) {
      return apiError('Image data is required.', 400);
    }
    if (body.image.length > 12_000_000) {
      return apiError('Image payload is too large.', 400);
    }
    const questions = readQuestions(body.questions);
    if (questions.length === 0) {
      return apiError('At least one question is required.', 400);
    }
    const answers = await askGestureVision({
      imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
      questions,
      llm: parseLlmRequestOptions(body),
    });
    return apiJson({ answers });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Gesture check failed.', 500);
  }
}
