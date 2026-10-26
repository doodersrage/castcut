/**
 * Missing media in Cut (M4 F3, ROADMAP §7.2): what the film would lose, found without an encode
 * — a shot's file that no longer answers (404 / 410), a Gallery render it points at that was
 * purged, a source that is gone (it plays on from its pin, R5) — and relinking a shot to other
 * media: a Gallery render or another take of its source. A relinked sourced shot is pinned to
 * the new media like "Use it here" (cut-pins.ts): its trim kept where it fits, the old media
 * remembered for "Back to the earlier take". Pure; the file check lives in cut-media-check.ts.
 */
import type { CutExtra } from './cut-room';
import type { CutShotEdits, KeyedShot } from './cut-plan';
import { cutShotPin, isSourcedCutKey, takeOfferedCutMedia, type CutPinState } from './cut-pins';

/** What a file check said about a URL. */
export type MediaUrlStatus = 'ok' | 'missing' | 'unknown';

export type MissingReason = 'file-missing' | 'gallery-purged' | 'source-gone';

export type MissingCutShot = {
  key: string;
  title: string;
  url: string;
  kind: 'still' | 'clip';
  reasons: MissingReason[];
  /** The film can't play it as it is (its file is gone). Otherwise a warning. */
  blocks: boolean;
};

export const MISSING_REASON_LABELS: Record<MissingReason, string> = {
  'file-missing': 'its file is gone',
  'gallery-purged': 'its Gallery render was removed',
  'source-gone': 'its source is gone (it plays the take it was cut with)',
};

/**
 * The film's shots that are missing media, or close to it. `galleryHas` answers whether a
 * Gallery id (an entry id or a prompt id) still exists; omitted, that isn't checked.
 */
export function missingCutMedia(input: {
  shots: readonly KeyedShot[];
  states?: Readonly<Record<string, CutPinState>>;
  urlStatus: ReadonlyMap<string, MediaUrlStatus>;
  galleryHas?: (id: string) => boolean;
}): MissingCutShot[] {
  const out: MissingCutShot[] = [];
  for (const shot of input.shots) {
    if (!shot.url) continue;
    const reasons: MissingReason[] = [];
    const file = input.urlStatus.get(shot.url);
    if (file === 'missing') reasons.push('file-missing');
    // A render gone from the Gallery whose file still plays is not missing anything: said only
    // when the file isn't known to be there.
    if (file !== 'ok' && shot.entryId && input.galleryHas && !input.galleryHas(shot.entryId)) {
      reasons.push('gallery-purged');
    }
    if (input.states?.[shot.key]?.state === 'source-gone') reasons.push('source-gone');
    if (!reasons.length) continue;
    out.push({
      key: shot.key,
      title: shot.title || 'Shot',
      url: shot.url,
      kind: shot.kind === 'clip' ? 'clip' : 'still',
      reasons,
      blocks: reasons.includes('file-missing'),
    });
  }
  // What blocks the film first.
  return out.sort((a, b) => Number(b.blocks) - Number(a.blocks));
}

export type RelinkMedia = Pick<KeyedShot, 'url' | 'kind' | 'entryId' | 'thumbUrl'> & {
  title?: string;
};

/**
 * A shot pointed at other media. A sourced shot is pinned to it (trim fitted, the old media kept
 * as its earlier take); an added Gallery shot has its media replaced. Text cards and copies'
 * originals aren't relinked here.
 */
export function relinkCutShot(
  state: { edits: CutShotEdits | undefined; extras: readonly CutExtra[] },
  key: string,
  media: RelinkMedia,
  options: {
    durationSec?: number | null;
    now?: number;
    /** The shot as it plays now: an unpinned one is pinned to it first, so the relink can go back. */
    current?: KeyedShot;
  } = {}
): { edits: CutShotEdits | undefined; extras: CutExtra[]; changed: boolean } {
  const extras = [...state.extras];
  if (isSourcedCutKey(key)) {
    let edits = state.edits;
    const edit = edits?.shots?.[key];
    if (!edit?.pin && options.current?.url) {
      edits = {
        ...edits,
        shots: {
          ...edits?.shots,
          [key]: { ...edit, pin: cutShotPin(options.current, options.now) },
        },
      };
    }
    const offered: KeyedShot = { ...media, key, title: media.title || 'Shot' };
    const result = takeOfferedCutMedia(edits, key, offered, {
      offeredDurationSec: options.durationSec,
      now: options.now,
    });
    // The source still holds the media that was relinked away from (a gone file): not offered
    // back as a "new take".
    const sourceUrl = options.current?.url;
    const pin = result.edits?.shots?.[key]?.pin;
    if (pin && sourceUrl && sourceUrl !== pin.url) {
      return {
        edits: {
          ...result.edits,
          shots: {
            ...result.edits!.shots,
            [key]: { ...result.edits!.shots![key]!, pin: { ...pin, declinedUrl: sourceUrl } },
          },
        },
        extras,
        changed: true,
      };
    }
    return { edits: result.edits, extras, changed: true };
  }
  const at = extras.findIndex(extra => extra.key === key);
  const extra = extras[at];
  if (!extra || extra.kind !== 'media') return { edits: state.edits, extras, changed: false };
  const { thumbUrl: _thumb, entryId: _entry, ...rest } = extra;
  extras[at] = {
    ...rest,
    url: media.url,
    shotKind: media.kind === 'clip' ? 'clip' : 'still',
    ...(media.thumbUrl ? { thumbUrl: media.thumbUrl } : {}),
    ...(media.entryId ? { entryId: media.entryId } : {}),
  };
  return { edits: state.edits, extras, changed: true };
}
