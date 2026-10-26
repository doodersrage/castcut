/**
 * Cut pins its media (R5, M0 audit D3). A Cut shot used to be looked up live from its source on
 * every render — the scene's kept take, the Day slot's still — so keeping another take or
 * redoing a slot silently changed that shot, its copies and every saved version, with the old
 * trims on new media, and un-keeping the take dropped it.
 *
 * Now a shot is pinned to the media it was cut with when it is edited, when a version is saved
 * and when the film is rendered (`CutShotEdit.pin`). A pinned shot plays its pin; when its
 * source offers something else, that is an offer — use it here, use it for every copy, or keep
 * this one — never a swap. A pinned shot whose source is gone (the scene deleted, its take let
 * go) keeps playing, marked. An unpinned shot follows its source as before. Pure.
 */
import type { CutShotEdit, CutShotEdits, CutShotPin, KeyedShot } from './cut-plan';
import { splitCutRoomKey } from './cut-room';

export type CutPinState =
  /** Unpinned: plays whatever its source holds now. */
  | { state: 'follows' }
  /** Plays its pin, and the source holds the same (or a declined) media. */
  | { state: 'pinned' }
  /** Plays its pin; the source now offers `offered`. */
  | { state: 'new-take'; offered: KeyedShot }
  /** Plays its pin; the source is gone. */
  | { state: 'source-gone' };

/** Only shots that come from a source are pinned: added shots hold their own media already. */
export function isSourcedCutKey(key: string): boolean {
  return splitCutRoomKey(key).source !== 'added';
}

/** The source shot a key stands for: a copy ("day:morning~2") is its original's. */
export function cutSourceKeyOf(key: string): string {
  return key.replace(/~\d+$/, '');
}

export function cutShotPin(shot: KeyedShot, now = Date.now()): CutShotPin {
  return {
    url: shot.url,
    kind: shot.kind === 'clip' ? 'clip' : 'still',
    ...(shot.entryId ? { entryId: shot.entryId } : {}),
    ...(shot.thumbUrl ? { thumbUrl: shot.thumbUrl } : {}),
    ...(shot.title ? { title: shot.title } : {}),
    at: now,
  };
}

/** The shot as its pin plays it: the pin's media, the source's words. */
function withPinMedia(shot: KeyedShot, pin: CutShotPin): KeyedShot {
  const { thumbUrl: _thumb, entryId: _entry, ...rest } = shot;
  return {
    ...rest,
    url: pin.url,
    kind: pin.kind,
    ...(pin.thumbUrl ? { thumbUrl: pin.thumbUrl } : {}),
    ...(pin.entryId ? { entryId: pin.entryId } : {}),
  };
}

/**
 * The film's shots with their pins applied, and each sourced shot's state. `isSourceGone` says
 * whether a key's source no longer exists at all — not merely sits outside this cut (another
 * Cast's Day, another Story): only those come back from their pins.
 */
export function pinnedCutShots(input: {
  shots: KeyedShot[];
  edits?: CutShotEdits | null;
  isSourceGone?: (sourceKey: string) => boolean;
}): { shots: KeyedShot[]; states: Record<string, CutPinState> } {
  const edits = input.edits?.shots ?? {};
  const states: Record<string, CutPinState> = {};
  const present = new Set<string>();
  const shots = input.shots.map(shot => {
    present.add(shot.key);
    if (!isSourcedCutKey(shot.key)) return shot;
    const pin = edits[shot.key]?.pin;
    if (!pin?.url) {
      states[shot.key] = { state: 'follows' };
      return shot;
    }
    const offered = shot.url !== pin.url && shot.url !== pin.declinedUrl;
    states[shot.key] = offered ? { state: 'new-take', offered: shot } : { state: 'pinned' };
    return shot.url === pin.url ? shot : withPinMedia(shot, pin);
  });
  for (const [key, edit] of Object.entries(edits)) {
    const pin = edit?.pin;
    if (!pin?.url || present.has(key) || !isSourcedCutKey(key)) continue;
    if (!input.isSourceGone?.(cutSourceKeyOf(key))) continue;
    states[key] = { state: 'source-gone' };
    shots.push({
      key,
      title: pin.title || 'Shot',
      url: pin.url,
      kind: pin.kind,
      ...(pin.thumbUrl ? { thumbUrl: pin.thumbUrl } : {}),
      ...(pin.entryId ? { entryId: pin.entryId } : {}),
    });
  }
  return { shots, states };
}

function withEdit(edits: CutShotEdits | undefined, key: string, edit: CutShotEdit): CutShotEdits {
  return { ...edits, shots: { ...edits?.shots, [key]: edit } };
}

/** What an edit says about the shot, apart from its pin and whether it is in the film. */
function editedPart(edit: CutShotEdit | undefined): string {
  if (!edit) return '';
  const { pin: _pin, include: _include, ...rest } = edit;
  return Object.keys(rest).length ? JSON.stringify(rest) : '';
}

/**
 * Pin the shots an edit just shaped (a trim, a hold, a caption, framing, speed…), to the media
 * they play now. Leaving a shot out or moving it pins nothing. Same object when none.
 */
export function pinEditedCutShots(
  before: CutShotEdits | undefined,
  after: CutShotEdits | undefined,
  shots: readonly KeyedShot[],
  now = Date.now()
): CutShotEdits | undefined {
  let next = after;
  for (const [key, edit] of Object.entries(after?.shots ?? {})) {
    if (!edit || edit.pin || !isSourcedCutKey(key)) continue;
    const changed = editedPart(edit);
    if (!changed || changed === editedPart(before?.shots?.[key])) continue;
    const shot = shots.find(entry => entry.key === key);
    if (shot?.url) next = withEdit(next, key, { ...edit, pin: cutShotPin(shot, now) });
  }
  return next;
}

/** Pin every sourced shot of the film not pinned yet (a version saved, the film rendered). */
export function pinAllCutShots(
  edits: CutShotEdits | undefined,
  shots: readonly KeyedShot[],
  now = Date.now()
): CutShotEdits | undefined {
  let next = edits;
  for (const shot of shots) {
    if (!isSourcedCutKey(shot.key) || !shot.url || next?.shots?.[shot.key]?.pin) continue;
    next = withEdit(next, shot.key, { ...next?.shots?.[shot.key], pin: cutShotPin(shot, now) });
  }
  return next;
}

/** A clip's trim does not carry over to other media: it was set against the old clip's length. */
function withoutTrim(edit: CutShotEdit): { edit: CutShotEdit; trimReset: boolean } {
  if (edit.trimStartSec === undefined && edit.trimEndSec === undefined) {
    return { edit, trimReset: false };
  }
  const { trimStartSec: _start, trimEndSec: _end, ...rest } = edit;
  return { edit: rest, trimReset: true };
}

/**
 * "Use it here" (`everywhere`: and on every copy of its source shot, in this edit — saved
 * versions keep theirs): the shot is pinned to what its source offers now. `trimReset` says a
 * trim was dropped.
 */
export function takeOfferedCutMedia(
  edits: CutShotEdits | undefined,
  key: string,
  offered: KeyedShot,
  options: { everywhere?: boolean; now?: number } = {}
): { edits: CutShotEdits | undefined; keys: string[]; trimReset: boolean } {
  const source = cutSourceKeyOf(key);
  const keys = options.everywhere
    ? [
        ...new Set([
          key,
          ...Object.keys(edits?.shots ?? {}).filter(entry => cutSourceKeyOf(entry) === source),
        ]),
      ]
    : [key];
  let next = edits;
  let trimReset = false;
  for (const entry of keys) {
    const current = next?.shots?.[entry] ?? {};
    // Copies that already play the offered media (or follow the source) are left as they are.
    if (entry !== key && (!current.pin || current.pin.url === offered.url)) continue;
    const trimmed = withoutTrim(current);
    trimReset ||= trimmed.trimReset;
    next = withEdit(next, entry, {
      ...trimmed.edit,
      pin: cutShotPin({ ...offered, key: entry }, options.now),
    });
  }
  return { edits: next, keys, trimReset };
}

/** "Keep this one": no offer while the source holds `offeredUrl`. */
export function declineOfferedCutMedia(
  edits: CutShotEdits | undefined,
  key: string,
  offeredUrl: string
): CutShotEdits | undefined {
  const current = edits?.shots?.[key];
  if (!current?.pin) return edits;
  return withEdit(edits, key, { ...current, pin: { ...current.pin, declinedUrl: offeredUrl } });
}

/** Pin a shot to what it plays now, or unpin it so it follows its source again. */
export function toggleCutShotPin(
  edits: CutShotEdits | undefined,
  shot: KeyedShot,
  now = Date.now()
): CutShotEdits | undefined {
  const current = edits?.shots?.[shot.key] ?? {};
  if (current.pin) {
    const { pin: _pin, ...rest } = current;
    return withEdit(edits, shot.key, rest);
  }
  return withEdit(edits, shot.key, { ...current, pin: cutShotPin(shot, now) });
}
