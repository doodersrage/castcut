import { COMFY_MODEL_IDS, type ComfyImageModel } from './comfy-models/client';
import { sanitizePreferEditToolModel, stillImageToolModel } from './queue-tool-model';
import { loadToolContext } from './tool-context-memory';

/** Page / sidebar keys (kebab-case) → settings-cache tool keys where the two differ. */
const PAGE_KEY_TO_TOOL_KEY: Record<string, string> = {
  compose: 'imageCompose',
  'image-prompt': 'imagePrompt',
  'prompt-editor': 'promptEditor',
  'nsfw-generator': 'nsfwGenerator',
};

export function toolKeyForPageKey(pageKey: string | undefined): string {
  const key = (pageKey ?? '').trim();
  return PAGE_KEY_TO_TOOL_KEY[key] ?? key;
}

/**
 * The model a tool will actually run: its remembered model (same sanitising as the tool's own
 * settings hook), else the shared model, never a video / audio / 3D model on a still tool.
 * Read-only — the header Engine chip used the raw shared model and disagreed with the panel.
 */
export function toolEffectiveModel(
  sharedModel: string | undefined,
  pageOrToolKey: string | undefined
): ComfyImageModel | undefined {
  const toolKey = toolKeyForPageKey(pageOrToolKey);
  const memory = toolKey ? loadToolContext(toolKey) : undefined;
  const remembered = memory?.model ? sanitizePreferEditToolModel(toolKey, memory.model) : undefined;
  const model =
    remembered && COMFY_MODEL_IDS.has(remembered) ? remembered : sharedModel?.trim() || undefined;
  return model ? stillImageToolModel(toolKey, model) : undefined;
}
