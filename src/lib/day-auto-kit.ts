/**
 * Day "No kit picked — the planner chooses one": with no kit, no clothing photo and the Cast
 * plate (a plain underwear base) as Image 1, the prompt only said "replace clothing with this
 * slot's catalog wardrobe kit" and nothing supplied one — Rapid kept the underwear.
 * Live (Rapid AIO, 2 moods × 3 seeds, seated beats): no kit 6/6 in beige underwear at the café
 * table / terrace; an everyday or vacation kit as the Image 2 packshot 6/6 dressed.
 */

import { categoryLabel } from '@/lib/clothing-catalog-fields';
import { normalizeDayMood, type DayMood } from '@/lib/day-planner';
import { dayPartOf } from '@/lib/day-parts';
import { dayThemeOf } from '@/lib/day-themes';

export type DayAutoKitOption = { value: string; label: string; group?: string };

const EVERYDAY_KIT_RE =
  /\b(jeans|denim jacket|t-shirt|tee|sweater|cardigan|casual|streetwear|athleisure|hoodie|chinos?|shirt dress|slip dress|wrap dress|romper|jumpsuit|knit dress|sweater dress|weekend)\b/i;
const VACATION_KIT_RE =
  /\b(sundress|linen|summer|resort|romper|maxi dress|shorts|halter|sarong|slip dress|wrap dress|kaftan|tropical)\b/i;
/** Costume, work and formal kits read as a job or a party, not a day out. */
const NOT_A_DAY_OUT_RE =
  /\b(costume|uniform|robes?|gi|hakama|armou?r|wizard|ringmaster|chef|doctor|nurse|police|monk|judogi|karate|samurai|apron|rain gear|scrubs|overalls?|business|suit|tuxedo|gown|wetsuit|utility)\b/i;

/** Moods that dress from a kit. Sport has its own kit line; heat and adult moods keep their own. */
export function dayMoodWantsAutoKit(mood: DayMood | string | null | undefined): boolean {
  const normalized = normalizeDayMood(mood);
  return normalized === 'everyday' || normalized === 'vacation';
}

function hashString(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A full-outfit kit for this slot and mood that has a real packshot. Stable for the same slot and
 * salt; avoids kits already on other slots so a Day doesn't wear one outfit all day.
 */
export function pickDayAutoKit(input: {
  options: DayAutoKitOption[];
  dayMood: DayMood | string | null | undefined;
  slotId: string;
  /** Varies the pick between Days (e.g. the Cast id). */
  salt?: string;
  hasPackshot: (wardrobeId: string) => boolean;
  exclude?: Array<string | null | undefined>;
}): string | undefined {
  if (!dayMoodWantsAutoKit(input.dayMood)) {
    return undefined;
  }
  // Themes dress from their own pool (cocktail dresses, costumes…) — the "not a day out"
  // filter would drop exactly those.
  // Date night / Night out dress casually by day and go out in the evening.
  const themeKit = dayThemeOf(input.dayMood);
  const theme =
    themeKit?.eveningKitOnly && dayOutfitBlock(input.slotId, input.dayMood) !== 'evening'
      ? null
      : themeKit;
  const moodRe =
    theme?.kitRe ??
    (normalizeDayMood(input.dayMood) === 'vacation' ? VACATION_KIT_RE : EVERYDAY_KIT_RE);
  const outfits = categoryLabel('outfit');
  const kits = (re: RegExp, costumesOk: boolean) =>
    input.options.filter(
      option =>
        option.value &&
        option.group === outfits &&
        re.test(option.label) &&
        (costumesOk || !NOT_A_DAY_OUT_RE.test(option.label)) &&
        input.hasPackshot(option.value)
    );
  // The catalog list is filtered to the lead's gender: a theme pool of dresses is empty for a
  // man — dress him from everyday wear rather than leave the plate's underwear on.
  let pool = kits(moodRe, Boolean(theme));
  if (pool.length === 0 && theme) {
    pool = kits(EVERYDAY_KIT_RE, false);
  }
  if (pool.length === 0) {
    return undefined;
  }
  const taken = new Set(input.exclude?.map(id => id?.trim()).filter(Boolean));
  const fresh = pool.filter(option => !taken.has(option.value));
  const candidates = fresh.length > 0 ? fresh : pool;
  const index = hashString(`${input.salt ?? ''}\0${input.slotId}`) % candidates.length;
  return candidates[index]?.value;
}

/**
 * Outfit arc: which slots wear the same clothes. Morning and afternoon share one outfit and
 * evening and night another — a Day used to change clothes for every still. Vacation keeps one
 * per slot (beach in the morning, dinner at night); null means no sharing.
 */
export function dayOutfitBlock(
  slotId: string,
  dayMood: DayMood | string | null | undefined
): 'day' | 'evening' | null {
  if (normalizeDayMood(dayMood) === 'vacation') {
    return null;
  }
  const part = dayPartOf(slotId);
  return part === 'evening' || part === 'night' ? 'evening' : 'day';
}

/**
 * The block's outfit for this slot: the kit the block's first dressed slot wears (in slot order),
 * unless that slot is this one. The first slot sets the outfit; the rest follow it.
 */
export function dayOutfitArcKit(
  slots: Array<{ id: string; wardrobeId?: string | null }>,
  slotId: string,
  dayMood: DayMood | string | null | undefined
): string | undefined {
  const block = dayOutfitBlock(slotId, dayMood);
  if (!block) {
    return undefined;
  }
  const lead = slots.find(
    slot => slot.wardrobeId?.trim() && dayOutfitBlock(slot.id, dayMood) === block
  );
  return lead && lead.id !== slotId ? lead.wardrobeId?.trim() : undefined;
}
