/** Client-safe best-of-N ranking via server API (no llm-client / sharp in browser bundle). */
export async function rankPromptsWithLlm(prompts: string[], keep: number): Promise<string[]> {
  if (prompts.length <= keep) {
    return prompts.slice(0, keep);
  }

  try {
    const response = await fetch('/api/best-of-n/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts, keep }),
    });
    const data = (await response.json()) as { prompts?: string[]; error?: string };
    if (response.ok && Array.isArray(data.prompts) && data.prompts.length > 0) {
      return data.prompts.slice(0, keep);
    }
  } catch {
    // fall through
  }

  return prompts.slice(0, keep);
}

export type BestOfNImageCandidate = {
  id: string;
  prompt: string;
  imageDataUrl: string;
};

export async function rankImagesWithVision(
  candidates: BestOfNImageCandidate[],
  keep: number
): Promise<BestOfNImageCandidate[]> {
  if (candidates.length <= keep) {
    return candidates.slice(0, keep);
  }

  try {
    const response = await fetch('/api/best-of-n/rank-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates, keep }),
    });
    const data = (await response.json()) as {
      candidates?: BestOfNImageCandidate[];
      error?: string;
    };
    if (response.ok && Array.isArray(data.candidates) && data.candidates.length > 0) {
      return data.candidates.slice(0, keep);
    }
  } catch {
    // fall through
  }

  return candidates.slice(0, keep);
}
