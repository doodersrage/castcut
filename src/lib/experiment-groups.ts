import type { ComfyGalleryEntry } from './comfyui-gallery';
import { galleryCardCaption } from './gallery-card-caption';

export type ExperimentGroup = {
  id: string;
  label: string;
  parentPrompt: string;
  entries: ComfyGalleryEntry[];
  variants: {
    seeds: string[];
    cfgValues: string[];
    stepValues: string[];
  };
};

function normalizePromptKey(prompt: string): string {
  return prompt.trim().toLowerCase().slice(0, 120);
}

/**
 * Stable experiment-winner key shared by Gallery Compare, Experiments, and Mutate.
 *
 * Must return the FULL normalized key, not a truncated prefix of it: this id is used both as
 * the React row key for a group's rendered block and as the lookup key for its collapse/winner
 * state (a plain object/Set keyed by this string, with no length limit). Two entries with
 * different prompts that happen to share the same leading ~32 characters — extremely common
 * with templated prompts like "keep the subject's pose and framing, but change X" repeated with
 * different X's — used to collide onto the identical truncated id even though
 * `groupGalleryExperiments` correctly treats them as separate groups (it maps by the full key).
 * That collision meant unrelated groups on different pages shared the same React key (so React
 * could reuse/confuse their DOM nodes across page navigation) and the same collapse/winner state
 * (so expanding or crowning one silently affected the other) — together looking exactly like an
 * experiment block "sticking" across pages that shouldn't be related at all.
 */
export function experimentGroupIdForPrompt(prompt: string): string | null {
  const key = normalizePromptKey(prompt);
  if (!key) {
    return null;
  }
  return key;
}

export function groupGalleryExperiments(entries: ComfyGalleryEntry[]): ExperimentGroup[] {
  const map = new Map<string, ExperimentGroup>();

  for (const entry of entries) {
    const key = normalizePromptKey(entry.prompt);
    if (!key) continue;

    const existing = map.get(key);
    const seed = entry.queueParams?.seed != null ? String(entry.queueParams.seed) : undefined;
    const cfg = entry.queueParams?.cfg != null ? String(entry.queueParams.cfg) : undefined;
    const steps = entry.queueParams?.steps != null ? String(entry.queueParams.steps) : undefined;

    if (!existing) {
      map.set(key, {
        // See experimentGroupIdForPrompt's doc comment: this must be the full key, not a
        // truncated prefix, or distinct prompts sharing a common prefix collide onto the same id.
        id: key,
        // Caption the whole prompt — the first 80 chars are edit boilerplate, the beat is later.
        label: (galleryCardCaption(entry.prompt) || entry.prompt).slice(0, 80),
        parentPrompt: entry.prompt,
        entries: [entry],
        variants: {
          seeds: seed ? [seed] : [],
          cfgValues: cfg ? [cfg] : [],
          stepValues: steps ? [steps] : [],
        },
      });
      continue;
    }

    existing.entries.push(entry);
    if (seed && !existing.variants.seeds.includes(seed)) {
      existing.variants.seeds.push(seed);
    }
    if (cfg && !existing.variants.cfgValues.includes(cfg)) {
      existing.variants.cfgValues.push(cfg);
    }
    if (steps && !existing.variants.stepValues.includes(steps)) {
      existing.variants.stepValues.push(steps);
    }
  }

  return [...map.values()]
    .filter(
      group =>
        group.entries.length >= 2 ||
        group.variants.seeds.length >= 2 ||
        group.entries.some(entry => entry.tool === 'param-experiment')
    )
    .sort((a, b) => {
      const aParam = a.entries.some(entry => entry.tool === 'param-experiment') ? 1 : 0;
      const bParam = b.entries.some(entry => entry.tool === 'param-experiment') ? 1 : 0;
      if (aParam !== bParam) {
        return bParam - aParam;
      }
      return b.entries.length - a.entries.length;
    });
}
