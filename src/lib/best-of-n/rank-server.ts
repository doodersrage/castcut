import { chatCompletion } from '../llm/client';
import { rankBestOfN, type BestOfNCandidate } from './campaign';

export type BestOfNImageCandidate = {
  id: string;
  prompt: string;
  imageDataUrl: string;
};

/** Server-only LLM prompt ranking (uses llm-client / Ollama). */
export async function rankPromptsWithLlm(prompts: string[], keep: number): Promise<string[]> {
  if (prompts.length <= keep) {
    return prompts;
  }

  const numbered = prompts.map((prompt, index) => `${index + 1}. ${prompt}`).join('\n\n');
  const text = await chatCompletion({
    maxTokens: 120,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'Pick the best image prompts. Reply with comma-separated 1-based indices only, best first.',
      },
      {
        role: 'user',
        content: `Keep the top ${keep} prompts from this list:\n\n${numbered}`,
      },
    ],
    usageContext: { route: 'best-of-n-rank' },
  });

  const indices =
    text
      .match(/\d+/g)
      ?.map(value => Number(value) - 1)
      .filter(index => index >= 0 && index < prompts.length) ?? [];

  const picked: string[] = [];
  for (const index of indices) {
    if (!picked.includes(prompts[index])) {
      picked.push(prompts[index]);
    }
    if (picked.length >= keep) {
      break;
    }
  }

  return picked.length > 0 ? picked : prompts.slice(0, keep);
}

/** Vision-model ranking for generated images (requires LLM_VISION_MODEL). */
export async function rankImagesWithVision(
  candidates: BestOfNImageCandidate[],
  keep: number
): Promise<BestOfNImageCandidate[]> {
  if (candidates.length <= keep) {
    return candidates;
  }

  const ranked = await rankBestOfN(
    candidates.map((candidate): BestOfNCandidate => ({
      id: candidate.id,
      prompt: candidate.prompt,
      imageDataUrl: candidate.imageDataUrl,
    }))
  );

  return ranked.slice(0, keep).map(entry => ({
    id: entry.id,
    prompt: entry.prompt,
    imageDataUrl: entry.imageDataUrl,
  }));
}
