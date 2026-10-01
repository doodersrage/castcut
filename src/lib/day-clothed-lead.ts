/**
 * Opening lines for clothed Day stills on the long brief. Rapid follows the first lines, and the
 * brief opens on "the SAME woman… her full body" — so two-person beats lost the partner and
 * outdoor beats came out barefoot. Live A/B (2026-09-30, Date night, same seeds): partner kept
 * 10/10 with the TWO PEOPLE line (was 4/10); shoes 4/4 outdoors with the footwear line (was 1/4).
 */

import { isDayAdultMood, normalizeDayMood } from '@/lib/day-planner';
import { dayWeatherIsOutdoor } from '@/lib/day-weather';
import { pickDistinctSubjects } from '@/lib/variation-seed';

/** Marks on the body ride into every still and read as wounds ("a faded scar on one forearm"). */
const BODY_MARK_CLAUSE_RE =
  /,?\s*(?:and\s+)?(?:an?\s+)?[^,]*\b(?:scar|tattoo|birthmark|burn|bruise|wound|mole)s?\b[^,]*/gi;

/** A composed stranger's look without body marks ("a Latina woman in her forties with …"). */
export function pickCompanionLook(gender: 'man' | 'woman' | 'any' = 'any', face = false): string {
  const look =
    pickDistinctSubjects(1, gender === 'man' ? 'men' : gender === 'woman' ? 'women' : 'any')[0] ??
    'a stranger';
  const clean = look
    .replace(BODY_MARK_CLAUSE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Face and hair only for a companion — the body clauses fought the pose map.
  return face ? clean.split(/, and a body\b/)[0]!.trim() : clean;
}

export function dayClothedLeadLines(input: {
  beat?: string | null;
  setting?: string | null;
  headcount: number;
  dayMood: unknown;
  adult: boolean;
  /**
   * Who the second person is: the chosen partner's own description, else a fresh composed look.
   * A bare "different person" still drew her twin in the same dress (4/4); a concrete look gave
   * distinct faces 4/4 and their own clothes 2/4 (live A/B 2026-09-30).
   */
  companionLook?: string | null;
  /**
   * Her outfit (kit label). With two people, "OUTFIT: she wears …" was read as either of them —
   * the lead fell back to the plate's underwear while the other model wore the kit (2/4, live).
   */
  leadOutfit?: string | null;
  /** The partner's own kit. Named here so a later pass does not invent a substitute outfit. */
  partnerOutfit?: string | null;
}): string[] {
  const beat = input.beat?.trim();
  const mood = normalizeDayMood(input.dayMood);
  if (input.adult || isDayAdultMood(mood) || !beat) {
    return [];
  }
  const lines: string[] = [];
  if (input.headcount >= 2) {
    const who = /\bfriend\b/i.test(beat)
      ? 'her friend'
      : /\bmodels?\b/i.test(beat)
        ? 'the other model'
        : 'her partner';
    const outfitName = (label: string | null | undefined) =>
      label
        ?.trim()
        .replace(/[.\s]+$/, '')
        .replace(/^[A-Z](?=[a-z])/, letter => letter.toLowerCase());
    const outfit = outfitName(input.leadOutfit);
    const partnerOutfit = outfitName(input.partnerOutfit);
    // A partner on a romantic beat is a man unless one was chosen (a man lead's prompt is swapped
    // afterwards, so his partner reads as a woman); friends can be anyone.
    const look = (
      input.companionLook?.trim() || pickCompanionLook(who === 'her partner' ? 'man' : 'any', true)
    ).replace(/[.\s]+$/, '');
    // A named partner kit replaces "in their own different clothes" — that phrase was rewritten
    // into a generic black sweater and overrode the partner's wardrobe.
    const clothes = partnerOutfit ? '' : ', in their own different clothes';
    lines.push(
      `TWO PEOPLE in this photo: she${outfit ? ` (wearing ${outfit})` : ''} and ${who}${partnerOutfit ? ` (wearing ${partnerOutfit})` : ''} — ${look}${clothes} — are both fully in frame, together — ${beat.replace(/[.\s]+$/, '')}.`
    );
  }
  // Vacation keeps the beach barefoot; Sport has its own footwear line.
  // …unless the beat is about the shoes ("heels in one hand", barefoot on the sand).
  const beatOwnsFeet =
    /\b(?:barefoot|bare feet|heels in (?:one |her )?hands?|shoes? in (?:one |her )?hands?|(?:kick|kicking|took|taking) off (?:her )?(?:heels|shoes))\b/i.test(
      beat
    );
  if (mood === 'everyday' && !beatOwnsFeet && dayWeatherIsOutdoor(input.setting ?? '')) {
    lines.push('She wears shoes that suit the outfit (outdoors — never barefoot).');
  }
  return lines;
}

/**
 * Catalog full-outfit names carry generated fit words. "Cropped" and "low-rise" read as a bare
 * midriff or bare legs on Rapid — a "cropped cream tuxedo" came out as a jacket over the plate's
 * underwear (2/2, live 2026-09-30). Drop them from the name the prompt uses; the kit is unchanged.
 */
export function dayOutfitPromptName(label: string | null | undefined): string {
  return (label ?? '')
    .replace(/\b(?:cropped|low-rise)\s+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
