export const GENERATE_HANDOFF_KEY = 'generate-prompt-stack-handoff-v1';
const HANDOFF_TTL_MS = 30 * 60 * 1000;

export type GenerateHandoff = {
  prompt: string;
  negativePrompt?: string;
  savedAt: number;
};

let recentlyConsumed: GenerateHandoff | null = null;
let recentlyConsumedUntil = 0;

export function saveGenerateHandoff(payload: GenerateHandoff): void {
  if (typeof window === 'undefined') {
    return;
  }
  recentlyConsumed = null;
  window.sessionStorage.setItem(GENERATE_HANDOFF_KEY, JSON.stringify(payload));
}

export function loadGenerateHandoff(): GenerateHandoff | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(GENERATE_HANDOFF_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as GenerateHandoff;
    if (Date.now() - parsed.savedAt > HANDOFF_TTL_MS) {
      window.sessionStorage.removeItem(GENERATE_HANDOFF_KEY);
      return null;
    }
    if (typeof parsed.prompt !== 'string' || !parsed.prompt.trim()) {
      window.sessionStorage.removeItem(GENERATE_HANDOFF_KEY);
      return null;
    }
    return {
      prompt: parsed.prompt,
      negativePrompt: typeof parsed.negativePrompt === 'string' ? parsed.negativePrompt : undefined,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearGenerateHandoff(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(GENERATE_HANDOFF_KEY);
}

/** Load once, then survive a Strict Mode remount without refilling later visits. */
export function consumeGenerateHandoff(): GenerateHandoff | null {
  const loaded = loadGenerateHandoff();
  if (loaded) {
    recentlyConsumed = loaded;
    recentlyConsumedUntil = Date.now() + 500;
    clearGenerateHandoff();
    return loaded;
  }
  if (recentlyConsumed && Date.now() < recentlyConsumedUntil) {
    return recentlyConsumed;
  }
  recentlyConsumed = null;
  return null;
}
