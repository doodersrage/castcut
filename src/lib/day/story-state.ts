/**
 * A shot's story state (M8 T5, ROADMAP §5.4): what she carries or uses, what has changed about
 * her (a bandaged hand, wet hair), how she feels in this beat, and which day of the story it is —
 * set by the user on the shot, where nothing could be derived (shot-state.ts derives the rest:
 * who, look, clothing, place, time). It goes into the still's prompt beside the beat and onto
 * Cut's shot card. Story order is its own: the story day, not where a shot sits in the edit.
 * An item can carry over to the shots after it (T6). Pure.
 */

export const STORY_STATE_ITEMS_MAX = 8;
export const STORY_STATE_ITEM_MAX = 80;
export const STORY_STATE_EMOTION_MAX = 80;
export const STORY_DAY_MAX = 999;

export type StoryStateItem = {
  text: string;
  /** Holds in the shots after this one, in story order, until stated otherwise (T6). */
  carriesOver?: true;
};

export type ShotStoryState = {
  /** Things she carries or uses ("the red umbrella"). */
  carries?: StoryStateItem[];
  /** How she has changed ("left hand bandaged", "wet hair"). */
  changes?: StoryStateItem[];
  /** The beat's emotion ("anxious", "relieved"). */
  emotion?: string;
  /** Which day of the story (1, 2, …). */
  storyDay?: number;
};

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function normalizeItems(value: unknown): StoryStateItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: StoryStateItem[] = [];
  for (const raw of value) {
    const entry = typeof raw === 'string' ? { text: raw } : raw;
    if (!entry || typeof entry !== 'object') continue;
    const item = text((entry as { text?: unknown }).text, STORY_STATE_ITEM_MAX);
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push({
      text: item,
      ...((entry as { carriesOver?: unknown }).carriesOver === true ? { carriesOver: true } : {}),
    });
    if (out.length >= STORY_STATE_ITEMS_MAX) break;
  }
  return out;
}

/** A stored state, tidied; undefined when nothing is set. */
export function normalizeStoryState(raw: unknown): ShotStoryState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const entry = raw as Record<string, unknown>;
  const carries = normalizeItems(entry.carries);
  const changes = normalizeItems(entry.changes);
  const emotion = text(entry.emotion, STORY_STATE_EMOTION_MAX);
  const day =
    typeof entry.storyDay === 'number' && Number.isFinite(entry.storyDay)
      ? Math.min(STORY_DAY_MAX, Math.max(1, Math.floor(entry.storyDay)))
      : undefined;
  const state: ShotStoryState = {
    ...(carries.length ? { carries } : {}),
    ...(changes.length ? { changes } : {}),
    ...(emotion ? { emotion } : {}),
    ...(day ? { storyDay: day } : {}),
  };
  return Object.keys(state).length ? state : undefined;
}

/** "the red umbrella, a paper bag" → items (the editor's comma list), keeping carry-over marks. */
export function storyItemsFromText(
  value: string,
  previous: readonly StoryStateItem[] = []
): StoryStateItem[] {
  const marked = new Set(
    previous.filter(item => item.carriesOver).map(item => item.text.toLowerCase())
  );
  return normalizeItems(
    value.split(',').map(part => {
      const item = part.trim();
      return marked.has(item.toLowerCase()) ? { text: item, carriesOver: true } : { text: item };
    })
  );
}

/**
 * The state as the still prompt says it, written for a woman like the rest of the brief (a man
 * lead's prompt is swapped whole): "She carries the red umbrella. Keep visible: left hand
 * bandaged. She feels anxious." Empty when nothing is set.
 */
export function storyStateBeat(state: ShotStoryState | undefined): string {
  if (!state) return '';
  const list = (items?: StoryStateItem[]) => (items ?? []).map(item => item.text).join(', ');
  return [
    state.carries?.length ? `She carries ${list(state.carries)}.` : '',
    state.changes?.length ? `Keep visible: ${list(state.changes)}.` : '',
    state.emotion ? `She feels ${state.emotion}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The beat with the state after it (unchanged when no state is set). */
export function withStoryState(beat: string | undefined, state: ShotStoryState | undefined) {
  const said = storyStateBeat(state);
  if (!said) return beat;
  const words = beat?.trim();
  return words ? `${words.replace(/[.\s]+$/, '')}. ${said}` : said;
}
