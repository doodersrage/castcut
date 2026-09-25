import { visionCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestVisionModel,
  type LlmRequestOptions,
} from './llm-request-options';
import { buildTileRolePrompt, parseTileRoleReply } from './look-tile-role';
import type { MoodboardTileRole } from './moodboard-scene';

/** Server: ask the vision model which role a Look reference tile plays. Null when unsure. */
export async function suggestLookTileRole(options: {
  imageDataUrl: string;
  llm?: LlmRequestOptions;
}): Promise<MoodboardTileRole | null> {
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error('Tile roles need a vision-capable LLM.');
  }
  const visionModel =
    resolveRequestVisionModel(options.llm) ?? process.env.LLM_VISION_MODEL?.trim();
  if (!visionModel) {
    throw new Error('Tile roles need a vision model (LLM_VISION_MODEL or Settings → LLM).');
  }
  const prompt = buildTileRolePrompt();
  const text = await visionCompletion({
    systemPrompt: prompt.system,
    textPrompt: prompt.user,
    imageDataUrl: options.imageDataUrl,
    maxTokens: 200,
    temperature: 0,
    model: visionModel,
    endpoint: resolveRequestLlmEndpoint(options.llm),
    usageContext: { route: 'look-tile-role' },
  });
  return parseTileRoleReply(text);
}
