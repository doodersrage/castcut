import sharp from 'sharp';
import {
  FOOTWEAR_CHECK_CROP_BOTTOM,
  FOOTWEAR_CHECK_PROMPT,
  footwearCheckVerdict,
  parseFootwearCheck,
  type FootwearCheckReading,
  type FootwearCheckVerdict,
} from '@/lib/wardrobe/footwear-check';
import { visionCompletion } from '@/lib/llm/client';
import {
  parseLlmRequestOptions,
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  sharedLlmRequestBody,
  type LlmRequestOptions,
} from '@/lib/llm/request-options';
import { splitImageDataUrl } from '@/lib/vision/image-prepare';
import { resolveVisionModel } from '@/lib/vision/model-auto';

/** The lower part of the still (legs and feet), as a JPEG data URL of at most 1024 px. */
export async function cropFeetForCheck(imageDataUrl: string): Promise<string> {
  const { base64 } = splitImageDataUrl(imageDataUrl);
  const input = Buffer.from(base64, 'base64');
  const meta = await sharp(input, { failOn: 'none' }).rotate().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  let pipeline = sharp(input, { failOn: 'none' }).rotate();
  if (width > 0 && height > 0) {
    const top = Math.round(height * (1 - FOOTWEAR_CHECK_CROP_BOTTOM));
    pipeline = pipeline.extract({ left: 0, top, width, height: height - top });
  }
  const output = await pipeline
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${output.toString('base64')}`;
}

/** Look at her feet and judge them against the picked shoes. Throws on config or parse errors. */
export async function checkFootwearInStill(options: {
  imageDataUrl: string;
  shoeWords: string;
  llm?: LlmRequestOptions;
}): Promise<{ reading: FootwearCheckReading; verdict: FootwearCheckVerdict }> {
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error('The shoe check needs a vision-capable LLM.');
  }
  const visionModel = await resolveVisionModel(options.llm);
  if (!visionModel) {
    throw new Error('The shoe check needs a vision model on the LLM server.');
  }
  const imageDataUrl = await cropFeetForCheck(options.imageDataUrl);
  const ask = () =>
    visionCompletion({
      // No system prompt and no shoe names: told what to expect, the model echoed it back.
      systemPrompt: '',
      textPrompt: FOOTWEAR_CHECK_PROMPT,
      imageDataUrl,
      maxTokens: 400,
      temperature: 0,
      model: visionModel,
      endpoint: resolveRequestLlmEndpoint(options.llm),
      usageContext: { route: 'footwear-check' },
    });
  // LM Studio drops the odd request while it swaps models ("fetch failed", 1 in 21 in testing).
  const text = await ask().catch(() => ask());
  const reading = parseFootwearCheck(text);
  if (!reading) {
    throw new Error('The shoe check returned an unreadable reply.');
  }
  return { reading, verdict: footwearCheckVerdict(reading, options.shoeWords) };
}

/** The page's limit before it compresses a still for a vision check (prepareVisionScanImagePayload). */
const VISION_STILL_MAX_BYTES = 6_000_000;

/**
 * checkStillFootwear's shape on the server (FINISHING_PLAN Phase 3): the still read with the
 * run's picture steps and checked as /api/footwear-check checks it. Null when the check cannot
 * run (no vision model, unreadable picture or reply) — the caller keeps its unchecked rule, as
 * the page's does. Never throws.
 */
export async function checkStillFootwearOnServer(
  options: {
    imageUrl: string;
    shoeWords: string;
    shared?: Parameters<typeof sharedLlmRequestBody>[0];
  },
  io: { loadBlob: (urls: string[]) => Promise<Blob> }
): Promise<FootwearCheckVerdict | null> {
  try {
    const blob = await io.loadBlob([options.imageUrl]);
    let bytes: Buffer = Buffer.from(await blob.arrayBuffer());
    let mimeType = blob.type || 'image/png';
    if (bytes.length > VISION_STILL_MAX_BYTES) {
      bytes = await sharp(bytes).rotate().jpeg({ quality: 88 }).toBuffer();
      mimeType = 'image/jpeg';
    }
    const result = await checkFootwearInStill({
      imageDataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
      shoeWords: options.shoeWords.slice(0, 300),
      llm: parseLlmRequestOptions(options.shared ? sharedLlmRequestBody(options.shared) : {}),
    });
    return typeof result.verdict?.ok === 'boolean' ? result.verdict : null;
  } catch (error) {
    console.warn('Shoe check skipped:', error instanceof Error ? error.message : error);
    return null;
  }
}
