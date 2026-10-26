/**
 * The renders the film uses (R1b, M0 audit 2026-10-25): every Scene take, every Day slot's still
 * and clip (also on a Day parked under another Cast), every Story beat's takes (the open story
 * and the saved ones), the shots added in Cut and the media its shots are pinned to (its versions
 * too). Their Gallery entries keep
 * their stored graph and stay through the local cap and Archive & purge
 * (gallery/reference-sources.ts, gallery/protected-ids.ts).
 *
 * The saved data is walked whole, not field by field — like the media clean-up's scan of stored
 * rows (media-cleanup-server.ts) — so a take field added later (a fix history, a new angle) is
 * covered without a list to keep in step. Only id- and URL-shaped strings count: words never
 * match an entry.
 */
import { loadSettingsCache } from '../settings/cache';
import { loadRoleplayLibrary } from '../story/roleplay-library';

const MAX_VALUE_CHARS = 2048;
/** Deep enough for any take list; bounds a malformed blob. */
const MAX_DEPTH = 12;

/** A prompt id, entry id or media URL — one token, no spaces. */
function referenceShaped(value: string): boolean {
  return value.length >= 4 && value.length <= MAX_VALUE_CHARS && !/\s/.test(value);
}

/** Every reference-shaped string in `value`, depth-first. */
export function referenceValuesIn(value: unknown, into: string[] = [], depth = 0): string[] {
  if (typeof value === 'string') {
    if (referenceShaped(value)) into.push(value);
  } else if (value && typeof value === 'object' && depth < MAX_DEPTH) {
    for (const item of Array.isArray(value) ? value : Object.values(value)) {
      referenceValuesIn(item, into, depth + 1);
    }
  }
  return into;
}

type ProductionData = {
  day?: { stills?: unknown; parkedDays?: unknown } | null;
  scene?: { scenes?: unknown; stills?: unknown } | null;
  story?: unknown;
  cut?: { extras?: unknown; versions?: unknown; options?: unknown } | null;
  savedStories?: unknown;
};

/** The references in the film's saved data (pure). */
export function productionReferenceValues(data: ProductionData): string[] {
  const out: string[] = [];
  referenceValuesIn(data.day?.stills, out);
  referenceValuesIn(data.day?.parkedDays, out);
  referenceValuesIn(data.scene?.scenes, out);
  referenceValuesIn(data.scene?.stills, out);
  referenceValuesIn(data.story, out);
  referenceValuesIn(data.cut?.extras, out);
  referenceValuesIn(data.cut?.versions, out);
  // The edit's shot pins (cut-pins.ts): the media a pinned shot plays.
  referenceValuesIn(data.cut?.options, out);
  referenceValuesIn(data.savedStories, out);
  return out;
}

/** The registered source: this browser's film data now. */
export function playGalleryReferences(): string[] {
  const tools = loadSettingsCache().tools;
  return productionReferenceValues({
    day: tools.day,
    scene: tools.scene,
    story: tools.roleplay?.story,
    cut: tools.cut,
    savedStories: loadRoleplayLibrary().map(session => session.snapshot.story),
  });
}
