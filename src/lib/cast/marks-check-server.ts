import sharp from 'sharp';
import {
  MARKS_CHECK_PROMPT,
  parseMarksCheck,
  type MarksCheckReading,
} from '@/lib/cast/marks-check';
import { visionCompletion } from '@/lib/llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from '@/lib/llm/request-options';
import { splitImageDataUrl } from '@/lib/vision/image-prepare';
import { resolveVisionModel } from '@/lib/vision/model-auto';

/** The whole still at up to 1280 px — glasses and a forearm tattoo need the detail. */
async function stillForCheck(imageDataUrl: string): Promise<string> {
  const { base64 } = splitImageDataUrl(imageDataUrl);
  const output = await sharp(Buffer.from(base64, 'base64'), { failOn: 'none' })
    .rotate()
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${output.toString('base64')}`;
}

/** What the vision model sees on her (glasses, tattoos). Throws on config or parse errors. */
export async function readMarksInStill(options: {
  imageDataUrl: string;
  llm?: LlmRequestOptions;
}): Promise<MarksCheckReading> {
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error('The marks check needs a vision-capable LLM.');
  }
  const visionModel = await resolveVisionModel(options.llm);
  if (!visionModel) {
    throw new Error('The marks check needs a vision model on the LLM server.');
  }
  const imageDataUrl = await stillForCheck(options.imageDataUrl);
  const ask = () =>
    visionCompletion({
      // No system prompt and no names of her marks: told what to expect, the model echoes it.
      systemPrompt: '',
      textPrompt: MARKS_CHECK_PROMPT,
      imageDataUrl,
      maxTokens: 400,
      temperature: 0,
      model: visionModel,
      endpoint: resolveRequestLlmEndpoint(options.llm),
      usageContext: { route: 'marks-check' },
    });
  const text = await ask().catch(() => ask());
  const reading = parseMarksCheck(text);
  if (!reading) throw new Error('The marks check returned an unreadable reply.');
  return reading;
}
