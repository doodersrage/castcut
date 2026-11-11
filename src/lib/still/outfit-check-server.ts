import sharp from 'sharp';
import { chatCompletion, visionCompletion } from '@/lib/llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from '@/lib/llm/request-options';
import { splitImageDataUrl } from '@/lib/vision/image-prepare';
import { resolveVisionModel } from '@/lib/vision/model-auto';
import {
  outfitCheckJudgePrompt,
  outfitCheckVerdict,
  outfitDescribePrompt,
  type OutfitCheckVerdict,
  type OutfitWearer,
} from './outfit-check';

/** The whole still at up to 1280 px. */
async function stillForCheck(imageDataUrl: string): Promise<string> {
  const { base64 } = splitImageDataUrl(imageDataUrl);
  const output = await sharp(Buffer.from(base64, 'base64'), { failOn: 'none' })
    .rotate()
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${output.toString('base64')}`;
}

/**
 * Whether the still's lead wears the planned outfit (outfit-check.ts): described blind, then
 * judged. Throws on config errors; null when the replies can't be read.
 */
export async function checkOutfitInStill(options: {
  imageDataUrl: string;
  outfit: string;
  wearer: OutfitWearer;
  llm?: LlmRequestOptions;
}): Promise<OutfitCheckVerdict | null> {
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error('The outfit check needs a vision-capable LLM.');
  }
  const visionModel = await resolveVisionModel(options.llm);
  if (!visionModel) throw new Error('The outfit check needs a vision model on the LLM server.');
  const endpoint = resolveRequestLlmEndpoint(options.llm);
  const seen = await visionCompletion({
    // No system prompt and no plan: told what to expect, the model echoes it.
    systemPrompt: '',
    textPrompt: outfitDescribePrompt(options.wearer),
    imageDataUrl: await stillForCheck(options.imageDataUrl),
    maxTokens: 120,
    temperature: 0,
    model: visionModel,
    endpoint,
    usageContext: { route: 'outfit-check' },
  });
  const quick = outfitCheckVerdict(options.outfit, seen, null);
  if (quick) return quick;
  // Text only, on the same model, as the Auto-review second look was calibrated.
  const answer = await chatCompletion({
    messages: [
      {
        role: 'user',
        content: outfitCheckJudgePrompt(options.outfit, seen.trim(), options.wearer),
      },
    ],
    maxTokens: 5,
    temperature: 0,
    model: visionModel,
    endpoint,
    usageContext: { route: 'outfit-check' },
  });
  return outfitCheckVerdict(options.outfit, seen, answer);
}
