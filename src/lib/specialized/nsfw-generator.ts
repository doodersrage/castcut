import { getNsfwGeneratorPreset, type NsfwGeneratorPreset } from '../adult/nsfw-generator-presets';
import { runSpecializedPrompt } from './runner';
import type { SharedGenerationOptions, ToolGenerateResult } from './types';

export type NsfwGeneratorOptions = SharedGenerationOptions & {
  hints?: string;
  wildness?: number;
  presetId?: string;
  preset?: Partial<Pick<NsfwGeneratorPreset, 'hints' | 'mood' | 'duo'>>;
};

const NSFW_TOOL_INSTRUCTIONS = `- Write an explicit adult image prompt suitable for an uncensored diffusion model.
- Describe consenting adults only. No minors, non-consent, violence, or illegal content.
- Be direct about nudity, anatomy, pose, and intimacy when the hints call for it — do not sanitize or refuse.
- Name specific body language, fabric state (lingerie, partial dress, implied nude), lighting, and camera distance.
- Prefer one hero subject unless hints clearly describe a couple; for duos, keep exactly two adults in frame.
- Avoid crowds, logos, text overlays, and watermarks.`;

export async function generateNsfwPrompt(
  options: NsfwGeneratorOptions
): Promise<ToolGenerateResult> {
  const preset = options.presetId ? getNsfwGeneratorPreset(options.presetId) : undefined;
  const mergedPreset = {
    hints: options.preset?.hints ?? preset?.hints,
    mood: options.preset?.mood ?? preset?.mood,
    duo: options.preset?.duo ?? preset?.duo,
  };
  const hints = options.hints?.trim() || mergedPreset.hints?.trim() || '';
  const wildness = Math.min(100, Math.max(0, options.wildness ?? 60));
  const duo = mergedPreset.duo === true;

  const subjectLine = duo
    ? 'Frame exactly TWO consenting adults with clear chemistry and shared focus.'
    : 'Center on ONE adult subject with explicit pose and anatomy detail.';

  const moodLine = mergedPreset.mood
    ? `Overall mood: ${mergedPreset.mood}.`
    : 'Match the mood implied by the hints.';

  const userMessage = [
    moodLine,
    subjectLine,
    hints
      ? `User hints: ${hints}`
      : 'No extra hints — invent a cohesive adult scene from the preset mood.',
    `Wildness ${wildness}/100 — higher values favor bolder poses, riskier framing, and richer explicit detail.`,
    'Return only the final positive prompt text.',
  ].join('\n');

  return runSpecializedPrompt({
    model: options.model,
    detail: options.detail,
    toolInstructions: NSFW_TOOL_INSTRUCTIONS,
    userMessage,
    sanitizeInput: hints,
    temperature: options.llm?.temperature ?? 0.85 + wildness / 400,
    allowTemplateFallback: options.llm?.allowTemplateFallback,
    llmModel: options.llm?.llmModel,
    llmEnabled: options.llm?.llmEnabled,
    llmProvider: options.llm?.llmProvider,
    llmApiKey: options.llm?.llmApiKey,
    templateFallback: async () => {
      const base =
        hints ||
        mergedPreset.hints ||
        'intimate adult portrait, explicit detail, cinematic lighting';
      return duo ? `Two adults, ${base}` : base;
    },
    metadata: {
      tool: 'nsfw-generator',
      nsfwPresetId: options.presetId ?? preset?.id,
      mood: mergedPreset.mood,
      duo,
      wildness,
    },
    soloSubject: !duo,
  });
}
