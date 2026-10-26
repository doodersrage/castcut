/**
 * Per-shot state (M2 C3, ROADMAP §5.4): who is in a shot, in which look and clothing, where,
 * when, with which of their things, saying what — read from what its source already holds (a
 * Day slot, a Scene, a Story beat), never stored a second time. One shape for all three, so Cut
 * can show it on a shot's card and the cross-shot rules (C4) can compare shots. Pure: names come
 * through `resolve`.
 */
import type { CastProp } from '../character/os';
import { castPropMentioned } from '../cast/props';
import { dayPartOf, type DayPart } from '../day/parts';
import type { DaySlot } from '../day/planner';
import type { RoleplayStoryBeat } from '../story/roleplay';

export type ShotState = {
  castId?: string;
  castName?: string;
  /** The other people in it (partner, a third and fourth Cast), by name. */
  others: string[];
  look?: string;
  /** The look it uses: the slot's own, else the Cast's active one. */
  lookId?: string;
  /** What she wears: a kit's name, the clothing photo's words, or "Own clothing photo". */
  outfit?: string;
  /** The slot's own look / clothing was picked by hand: a change there is meant (C4). */
  changeStated?: boolean;
  shoes?: string;
  place?: string;
  time?: DayPart;
  /** Her things the shot names ("phone", "dog"). */
  props: string[];
  line?: string;
};

export type ShotStateResolve = {
  castName: (castId: string | undefined) => string | undefined;
  /** The look's name; no `lookId` = the Cast's active look. */
  lookName: (castId: string | undefined, lookId: string | undefined) => string | undefined;
  kitLabel: (wardrobeId: string) => string;
  /** The Cast's active look's id. */
  activeLookId?: (castId: string | undefined) => string | undefined;
  props: (castId: string | undefined) => CastProp[] | undefined;
};

/** Clothing set for the whole Day / Story / Scene (a kit, or a clothing photo and its words). */
export type ShotOutfit = {
  wardrobeId?: string;
  customGarmentImageUrl?: string;
  customGarmentDescription?: string;
  footwear?: string;
};

const clean = (value: string | null | undefined) => value?.trim() || undefined;

function outfitOf(
  kit: string | undefined,
  outfit: ShotOutfit | undefined,
  resolve: ShotStateResolve
) {
  const wardrobeId = clean(kit) ?? clean(outfit?.wardrobeId);
  if (wardrobeId && wardrobeId !== 'custom-garment') return resolve.kitLabel(wardrobeId);
  return (
    clean(outfit?.customGarmentDescription) ??
    (clean(outfit?.customGarmentImageUrl) ? 'Own clothing photo' : undefined)
  );
}

function propsIn(castId: string | undefined, text: string, resolve: ShotStateResolve): string[] {
  return (resolve.props(castId) ?? [])
    .filter(prop => castPropMentioned(prop, text))
    .map(prop => prop.name);
}

function withoutEmpty(state: ShotState): ShotState {
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => value !== undefined && value !== '')
  ) as ShotState;
}

/** A Day slot's shot, or a Scene's (its one slot, its own clothing and partner). */
export function slotShotState(
  input: {
    slot: DaySlot;
    castId?: string;
    partnerCharacterId?: string;
    outfit?: ShotOutfit;
  },
  resolve: ShotStateResolve
): ShotState {
  const { slot, castId } = input;
  const others = [input.partnerCharacterId, slot.thirdCastId, slot.fourthCastId]
    .map(id => (clean(id) ? resolve.castName(id) : undefined))
    .filter((name): name is string => Boolean(name));
  return withoutEmpty({
    castId: clean(castId),
    castName: resolve.castName(castId),
    others,
    look: resolve.lookName(castId, clean(slot.lookId)),
    lookId: clean(slot.lookId) ?? resolve.activeLookId?.(castId),
    outfit: outfitOf(slot.wardrobeId, input.outfit, resolve),
    changeStated: Boolean(clean(slot.lookId) || slot.outfitByHand) || undefined,
    shoes: clean(input.outfit?.footwear),
    place: clean(slot.location),
    time: dayPartOf(slot.id),
    props: propsIn(castId, `${slot.sceneHints ?? ''} ${slot.location ?? ''}`, resolve),
    line: clean(slot.line),
  });
}

/** A Story beat's shot: the story's Cast and clothing (beats don't keep a place or a time). */
export function storyShotState(
  beat: Pick<RoleplayStoryBeat, 'castId' | 'title' | 'blurb' | 'prompt' | 'line'>,
  story: { castId?: string; outfit?: ShotOutfit },
  resolve: ShotStateResolve
): ShotState {
  const castId = clean(beat.castId) ?? clean(story.castId);
  return withoutEmpty({
    castId,
    castName: resolve.castName(castId),
    others: [],
    look: resolve.lookName(castId, undefined),
    lookId: resolve.activeLookId?.(castId),
    outfit: outfitOf(undefined, story.outfit, resolve),
    shoes: clean(story.outfit?.footwear),
    props: propsIn(castId, `${beat.title ?? ''} ${beat.blurb ?? ''}`, resolve),
    line: clean(beat.line),
  });
}

/** One line for a shot's card: "Nora with Tomas · Main look · Linen sundress · kitchen · Morning". */
export function shotStateSummary(state: ShotState): string {
  const who = state.castName
    ? state.others.length
      ? `${state.castName} with ${state.others.join(' and ')}`
      : state.castName
    : state.others.join(' and ');
  const time = state.time ? state.time[0]!.toUpperCase() + state.time.slice(1) : undefined;
  return [
    who,
    state.look,
    state.outfit,
    state.shoes,
    state.place,
    time,
    state.props.length ? state.props.join(', ') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}
