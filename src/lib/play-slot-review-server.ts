import { resolveVisionModel } from '@/lib/vision-model-auto';
import { visionCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from './llm-request-options';
import {
  buildSlotReviewPrompt,
  parseSlotQualityReport,
  type SlotQualityReport,
  type SlotReviewContext,
} from './play-slot-quality';

/** Server-side single-image quality review for one Day still. Throws on config or parse errors. */
export async function reviewPlaySlotStill(options: {
  imageDataUrl: string;
  context?: SlotReviewContext;
  llm?: LlmRequestOptions;
}): Promise<SlotQualityReport> {
  const hosted = Boolean(options.llm?.llmProvider && options.llm.llmProvider !== 'server');
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error(
      hosted
        ? 'Slot review needs a hosted vision model. Pick one under Settings → LLM and paste your API key.'
        : 'Slot review needs a vision-capable LLM. Set LLM_ENABLED=true and configure LLM_VISION_MODEL.'
    );
  }
  const visionModel = await resolveVisionModel(options.llm);
  if (!visionModel) {
    throw new Error(
      hosted
        ? 'Pick a session vision model under Settings → LLM to review this still.'
        : 'No vision model found on the LLM server. Pull one (e.g. qwen2.5vl or gemma3) or set LLM_VISION_MODEL in .env.local and restart.'
    );
  }

  const prompt = buildSlotReviewPrompt(options.context);
  const text = await visionCompletion({
    systemPrompt: prompt.system,
    textPrompt: prompt.user,
    imageDataUrl: options.imageDataUrl,
    // Vision models often spend tokens on reasoning first; keep headroom for the JSON answer.
    maxTokens: 800,
    temperature: 0.1,
    model: visionModel,
    endpoint: resolveRequestLlmEndpoint(options.llm),
    usageContext: { route: 'play-slot-review' },
  });
  const report = parseSlotQualityReport(text);
  if (!report) {
    throw new Error(
      'Slot review returned an unreadable reply. Try again or use a larger vision model.'
    );
  }
  return report;
}
