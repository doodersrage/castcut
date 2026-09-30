import type { ExperimentGroup } from './experiment-groups';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

const DEFAULT_WINDOW_MS = 45_000;
const MIN_BATCH = 3;

function runId(entries: ComfyGalleryEntry[]): string {
  const first = entries[0];
  // Keyed on the first entry's own (already-unique) id rather than a
  // tool-name + timestamp string truncated to 32 chars: several tools in
  // this app have names long enough (e.g. "wan-video-rapid-aio", 19 chars)
  // that the old scheme left only ~8 leading digits of the 13-digit
  // queuedAt epoch-ms value before truncation -- any two batches of the
  // same tool queued within the same ~100-second bucket collided on id.
  // That id is used directly as both the React row key and the lookup key
  // for collapse/winner state, so a collision made two unrelated batches
  // silently share (and clobber) each other's expand/collapse + winner UI
  // state, and could cause React to drop one of the rows entirely.
  return `run-${first?.id ?? 'batch'}`;
}

/**
 * Group entries queued in a tight window with the same tool (seed sweeps,
 * scheduled batches, param grids) even when prompts differ.
 */
export function groupGalleryQueueRuns(
  entries: ComfyGalleryEntry[],
  windowMs = DEFAULT_WINDOW_MS
): ExperimentGroup[] {
  const eligible = entries.filter(
    entry => entry.status === 'completed' || entry.status === 'running'
  );
  const byTool = new Map<string, ComfyGalleryEntry[]>();
  for (const entry of eligible) {
    const key = entry.tool ?? '';
    const list = byTool.get(key);
    if (list) {
      list.push(entry);
    } else {
      byTool.set(key, [entry]);
    }
  }

  const clusters: ComfyGalleryEntry[][] = [];
  for (const list of byTool.values()) {
    const sorted = [...list].sort((a, b) => a.queuedAt - b.queuedAt);
    let current: ComfyGalleryEntry[] = [];
    let windowStart = 0;
    for (const entry of sorted) {
      if (current.length === 0 || entry.queuedAt - windowStart <= windowMs) {
        if (current.length === 0) {
          windowStart = entry.queuedAt;
        }
        current.push(entry);
        continue;
      }
      if (current.length >= MIN_BATCH) {
        clusters.push(current);
      }
      current = [entry];
      windowStart = entry.queuedAt;
    }
    if (current.length >= MIN_BATCH) {
      clusters.push(current);
    }
  }

  return clusters.map(group => {
    const seeds = [
      ...new Set(
        group
          .map(entry => (entry.queueParams?.seed != null ? String(entry.queueParams.seed) : ''))
          .filter(Boolean)
      ),
    ];
    const started = new Date(group[0]!.queuedAt);
    const timeLabel = started.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      id: runId(group),
      label: `Batch · ${timeLabel} · ${group[0]?.tool ?? 'queue'} · ${group.length} jobs`,
      parentPrompt: group[0]?.prompt ?? '',
      entries: group,
      variants: {
        seeds,
        cfgValues: [
          ...new Set(
            group
              .map(entry => (entry.queueParams?.cfg != null ? String(entry.queueParams.cfg) : ''))
              .filter(Boolean)
          ),
        ],
        stepValues: [
          ...new Set(
            group
              .map(entry =>
                entry.queueParams?.steps != null ? String(entry.queueParams.steps) : ''
              )
              .filter(Boolean)
          ),
        ],
      },
    };
  });
}

/** Gap that ends a Film run — Day stills land ~1 min apart, clips a few minutes after. */
const FILM_RUN_GAP_MS = 10 * 60_000;

/**
 * Film runs: one Cast lead's stills and clips queued in one sitting (a Day, a Story, an
 * Outfit session). The 45 s batch window above split a Day run into singles, so its stills
 * interleaved with everything else and the run could not be reviewed as a whole.
 */
export function groupGalleryFilmRuns(
  entries: ComfyGalleryEntry[],
  options?: { gapMs?: number; nameFor?: (characterId: string) => string | undefined }
): ExperimentGroup[] {
  const gapMs = options?.gapMs ?? FILM_RUN_GAP_MS;
  const byCharacter = new Map<string, ComfyGalleryEntry[]>();
  for (const entry of entries) {
    const characterId = entry.characterId?.trim();
    if (!characterId || entry.status === 'error') {
      continue;
    }
    const list = byCharacter.get(characterId);
    if (list) {
      list.push(entry);
    } else {
      byCharacter.set(characterId, [entry]);
    }
  }
  const runs: ExperimentGroup[] = [];
  for (const [characterId, list] of byCharacter) {
    const sorted = [...list].sort((a, b) => a.queuedAt - b.queuedAt);
    let current: ComfyGalleryEntry[] = [];
    const flush = () => {
      if (current.length >= MIN_BATCH) {
        runs.push(filmRunGroup(current, characterId, options?.nameFor?.(characterId)));
      }
      current = [];
    };
    for (const entry of sorted) {
      const last = current[current.length - 1];
      if (last && entry.queuedAt - last.queuedAt > gapMs) {
        flush();
      }
      current.push(entry);
    }
    flush();
  }
  return runs;
}

function isClipEntry(entry: ComfyGalleryEntry): boolean {
  return entry.tool === 'video' || entry.derivedKind === 'i2v' || entry.derivedKind === 't2v';
}

function filmRunGroup(
  group: ComfyGalleryEntry[],
  characterId: string,
  name: string | undefined
): ExperimentGroup {
  const started = new Date(group[0]!.queuedAt);
  const when = `${started.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${started.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const clips = group.filter(isClipEntry).length;
  const stills = group.length - clips;
  const counts = [
    stills ? `${stills} still${stills === 1 ? '' : 's'}` : '',
    clips ? `${clips} clip${clips === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    id: `film-run-${group[0]!.id}`,
    kind: 'run',
    characterId,
    // Name first when known here; the block re-resolves it at render (the roster hydrates late).
    label: [name?.trim(), when, counts].filter(Boolean).join(' · '),
    parentPrompt: group[0]?.prompt ?? '',
    entries: group,
    variants: { seeds: [], cfgValues: [], stepValues: [] },
  };
}

/** Stills in a run worth another take: rated 2★ or lower, or a missed pose / face check. */
export function filmRunMisses(entries: readonly ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  return entries.filter(
    entry =>
      entry.status === 'completed' &&
      !isClipEntry(entry) &&
      ((entry.reviewRating != null && entry.reviewRating <= 2) ||
        entry.playChecks?.poseMiss === true ||
        entry.playChecks?.faceMiss === true)
  );
}

/** First still in the run still waiting for a rating (review starts there). */
export function firstUnreviewedInRun(
  entries: readonly ComfyGalleryEntry[]
): ComfyGalleryEntry | undefined {
  return (
    entries.find(entry => entry.status === 'completed' && !entry.reviewRating) ??
    entries.find(entry => entry.status === 'completed')
  );
}
