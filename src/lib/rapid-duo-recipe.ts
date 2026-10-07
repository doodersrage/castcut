/**
 * Compact duo sex recipe for Qwen Rapid AIO Edit (NSFW) Day stills.
 *
 * Rapid is CFG-1 and 6-step: the full Day brief (~9k chars of POSE LOCK / DUO ACT / BODIES /
 * HEADCOUNT / FOREGROUND locks) drowned the beat, and every duo still collapsed to the same
 * reclining couple on a bed. Live A/B (2026-09-27, same face + seeds): a ~600-char plain
 * description of where each body is put wall, bent-over, missionary, reverse cowgirl, doggy,
 * prone, oral and blowjob beats right on almost every seed — the long brief got none of them.
 *
 * Keep each placement concrete (who lies/sits/stands where, facing which way, what touches
 * what). Do not add "never …" locks: CFG 1 has no negative, and naming a thing summons it.
 */
import { herToHisHim, masculineClothes, swapDayPromptGender } from '@/lib/day-lead-gender';
import { dayPartnerRecipeLine, type DayPartner, type DayPartnerNoun } from '@/lib/day-partner';
import {
  parseIntimateLayout,
  resolveSoloMasturbationPoseKind,
  type IntimateLayout,
  type SoloMasturbationPoseKind,
} from './day-pose-guide';
import { SUGGESTIVE_COVERAGE_LINE } from './clothed-coverage';
import { stripNegatedClauses } from './negated-clauses';
import { poseSurfaces, sceneSurfaces, sceneVenue, surfaceFitsVenue } from './scene-surface';
import {
  isFloorSurface,
  ORAL_SEAT_RE,
  oralSeat,
  rapidDuoSurface,
  sheGivesOral,
} from './rapid-oral-pose';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import {
  RAPID_DUO_RECIPE_MARK,
  RAPID_SOLO_RECIPE_MARK,
  RAPID_SUGGESTIVE_RECIPE_MARK,
  DAY_CLOTHED_RECIPE_MARK,
  RAPID_VACATION_RECIPE_MARK,
} from './rapid-duo-recipe-mark';

/** Scissoring words in a beat — the still renders the missionary pose instead (Rapid can't draw it). */
export const RAPID_SCISSORS_FALLBACK_RE =
  /\bscissor(?:ing|ed|s)?(?:\s+(?:position|pose|style))?\b/gi;

const WEARABLE_RE =
  /\b(?:hoodie|jacket|coat|blazer|dress|gown|robe|cloak|cape|shirt|t-shirt|blouse|top|tank|sweater|cardigan|bikini|swimsuit|lingerie|bra|panties|underwear|straps?|skirt|shorts|pants|trousers|jeans|leggings|stockings|socks|sleeves?(?!\s+tattoo)|boots?|shoes|heels|sneakers|hat|beanie|hood|gloves?|scarf|belt|harness|armou?r|mask|goggles|glasses|sunglasses|jewel(?:le)?ry|necklace|earrings?|bracelets?|rings?|piercings?|backpack|bag|drones?|gadgets?|headphones|outfit|costume|uniform|garments?|clothes|clothing)\b/i;

/**
 * The Cast descriptor with clothing and props taken out. Recipes name the clothes (or say nude)
 * themselves; a descriptor like "a half-mushroom humanoid draped in a mossy hoodie, glowing
 * cap-drones humming where sleeves end, bikini straps woven from bioluminescent mycelium" put a
 * hoodie and glowing wires on every nude still and pulled the face off the Cast (live 2026-09-29).
 */
export function recipeBodyDescriptor(descriptor: string | null | undefined): string {
  const text = descriptor?.trim().replace(/\.+$/, '') ?? '';
  if (!text) return '';
  return text
    .split(/\s*[,;]\s*/)
    .map(clause =>
      // "… draped in a mossy hoodie" / "wearing a red coat" → keep the body before it.
      clause.replace(
        /\s+(?:draped|dressed|clad|wrapped|wearing|in)\b(?:\s+in)?\s+(?:a|an|the|her|his|their)?\s*[^,;]*$/i,
        match => (WEARABLE_RE.test(match) ? '' : match)
      )
    )
    .filter(clause => clause.trim() && !WEARABLE_RE.test(clause))
    .join(', ')
    .trim();
}

function descriptorLine(descriptor: string | null | undefined): string | null {
  const body = recipeBodyDescriptor(descriptor);
  return body ? `The woman: ${body}.` : null;
}

/** 69 / face-sit wording — Rapid renders these beats as seated oral (recipe + guide). */
export const RAPID_ORAL_FALLBACK_RE =
  /\b(?:sixty[- ]nine|69|face[- ]sitting(?:\s+(?:a|her)\s+partner)?|sitting\s+on\s+(?:his|her|their|her girlfriend's|his boyfriend's)\s+face)\b/gi;

export {
  isRapidDuoRecipePrompt,
  RAPID_DUO_RECIPE_MARK,
  RAPID_SOLO_RECIPE_MARK,
  RAPID_SUGGESTIVE_RECIPE_MARK,
  RAPID_VACATION_RECIPE_MARK,
} from './rapid-duo-recipe-mark';

export { rapidDuoSurface } from './rapid-oral-pose';

/** Windows, glass doors and mirrors — a back-to-the-glass pose turns into a sill perch. */
function isGlassSurface(surface: string | null): boolean {
  return /\b(?:window|glass|mirror)\b/i.test(surface ?? '');
}

/**
 * "the edge of the couch", from a surface that may already name its edge: "bed edge" made "the
 * edge of the bed edge", and "edge of the bed" made "the edge of the edge of the bed".
 */
function edgeOf(surface: string | null, fallback: string): string {
  const seat = (surface ?? fallback)
    .replace(/^(?:edge|foot|end|arm)\s+of\s+the\s+/i, '')
    .replace(/\s+edge$/i, '');
  return `the edge of the ${seat}`;
}

/** Where a lying head rests: a cushion on a couch, else a pillow. */
function headRest(surface: string | null): string {
  return /\b(?:couch|sofa|settee|loveseat)\b/i.test(surface ?? '') ? 'a cushion' : 'the pillow';
}

function placement(layout: IntimateLayout, beat: string, surface: string | null): string | null {
  const on = (fallback: string) => `the ${surface ?? fallback}`;
  switch (layout) {
    case 'missionary':
      // "Side view… propped up on his forearms" knelt him upright at her side 3/3 (and once
      // beside her, user report); naming the position and his face-down body put him on top 3/3
      // (live A/B on the user's night still, 2026-10-01). A foot-of-bed camera broke anatomy 3/3.
      // Keep "Side view": without it the camera went overhead and upside down, and his body
      // vanished, 6/6 on the user's Raunchy night still (bed-collapse gag); with it, side-on and
      // on top 3/3 with the gag intact (2026-10-01).
      // "Both faces in frame" alone laid him head to head with her, his body running the other
      // way (an upside-down kiss) — the user's missionary stills 0/3 right on replay. Placing
      // both heads at the same end and his legs behind him: 4/4 (live A/B 2026-10-04).
      return `Side view, missionary position, both faces in frame. The woman lies face up along ${on('bed')}, her head on ${headRest(surface)} at one end; the man lies face down on top of her, his head beside her head at the same end, his chest over her chest, his hips between her thighs and his legs stretched out behind him; he props himself on his elbows; she wraps her legs around his waist; his penis inside her; their faces close.`;
    case 'mating_press':
      // "Side view" first: without a camera anchor 1/3 flipped overhead and upside down (user's
      // Raunchy still); with it, side-on 3/3 (2026-10-01).
      // Her legs placed (calves on his shoulders) and her head on the pillow: the user's mating
      // press still replayed 0/4 (no legs up, two head to head), placed 2/4 (live A/B 2026-10-04).
      return `Side view, both faces in frame. The woman lies on her back along ${on('bed')}, her head on ${headRest(surface)}, her knees pulled up toward her shoulders and her calves resting on his shoulders; the man kneels upright between her legs, facing her, leaning forward over her with his hands on ${on('bed')} beside her shoulders, his penis inside her.`;
    case 'straddle':
      // "Wide shot" with no camera side shot from his head: his face upside down at the bottom
      // and her squatting over his chest, 4/4 on the user's cowgirl still. "Side view" alone put
      // her kneeling beside him (2/4); each knee placed, one on the far side of his body: 4/4
      // astride (live A/B 2026-10-04). A mocap-composed straddle map changed nothing.
      return `Side view, wide shot, both faces in frame. The man lies flat on his back along ${on('bed')}, his head on ${headRest(surface)} and his legs stretched out straight; the woman sits upright on top of him, straddling his hips: her near knee on ${on('bed')} beside his hip, her other knee on the far side of his body, her thighs over his hips and her bottom resting on his pelvis, his penis inside her, riding him; her hands on his chest, looking down at his face.`;
    case 'reverse_straddle':
      return `Reverse cowgirl, camera in front of the woman. The woman is closest to the camera, facing the lens, sitting on the lap of the man who sits back on ${on('couch')} behind her; her back rests against his chest, legs spread, riding his penis; his face is behind her shoulder and his hands on her hips.`;
    case 'bent':
      // A rug or floor is no edge to bend over ("stands bent forward over the rug"): on all fours
      // there, as the bent map draws an unsupported bend (hands down, rear partner kneeling).
      return isFloorSurface(surface)
        ? `The woman is on all fours on ${on('floor')}, hips raised, back arched; the man kneels close behind her holding her hips, penetrating her from behind. She looks back over her shoulder.`
        : `The woman stands bent forward over ${on('bed edge')}, hands braced on it, hips pushed back; the man stands close behind her holding her hips, penetrating her from behind. She looks back over her shoulder.`;
    case 'standing':
      // Story's standing guide is two upright bodies side by side — say how they join.
      return `Both stand. The woman leans forward with her hands braced on ${on('wall')}, hips pushed back; the man stands close behind her holding her hips, penetrating her from behind; she looks back over her shoulder.`;
    case 'prone':
      // The side-view map can't say which way she faces: face-up 2/3 (03092). Back and buttocks
      // up, breasts in the sheets (as the solo prone line) → face-down 3/3 (2026-10-07).
      return `The woman lies flat on her stomach on ${on('bed')}, seen from the side: her bare back and buttocks up, her breasts pressed into the sheets, her face turned toward the camera on the pillow; the man lies on top of her back, his chest over her back, propped up on his arms, penetrating her from behind.`;
    case 'spoon':
      // "Lifts her top leg … his hand holding it up" put the leg straight up at the ceiling 3/3
      // (03082); the knee drawn forward stayed natural 3/3, the act still in view (2026-10-07).
      // "Both lie on their sides" put her on her back with him beside her head (live
      // 2026-09-28, most seeds on v23); placing each body in turn gave 6/6 real spooning.
      return `Spooning, seen from the front. The woman lies on her side on ${on('bed')}, turned toward the camera, her head on her lower arm and her hip up; the man lies on his side right behind her, his chest pressed against her back and his face just behind her shoulder; he penetrates her from behind; her top knee is drawn forward and up toward her chest, her foot resting on the bed in front of her, his hand on her hip. Both faces in frame.`;
    case 'scissors':
      return `The woman and the man sit on ${on('bed')} facing each other, each leaning back on their hands, their legs scissored together so their hips press together mid-sex; both faces in frame.`;
    case 'wall':
      // Glass: back-to-the-window face-to-face put her perched on the sill, twisted, with a
      // reflection clone 3/3; facing the glass from behind (as the wall map draws it) was clean
      // 3/3 (live A/B on the user's hotel-window still, 2026-10-01).
      return /\b(?:partner\s+behind|from\s+behind)\b/i.test(beat) || isGlassSurface(surface)
        ? // Side view, no map (rapidAdultSkipsPoseGuide): front-on they posed side by side.
          `Side view, both bodies in profile. The woman stands facing ${on('wall')}, her palms flat on it and her hips pushed back toward him; the man stands directly behind her, his chest against her back and his hips against her buttocks, penetrating her from behind, his hands on her hips; she turns her head to look back at him. No gap between their bodies.`
        : // "one leg lifted and hooked around his hip" drew the lifted foot sticking out behind
          // his back — a third leg on most seeds. Placing each leg: two clear legs 8/8, joined,
          // facing each other 6/8. Putting his hand on the wall stood him apart (live 2026-09-29).
          `Side view, both bodies in profile, facing each other. The woman leans her back against ${on('wall')}; the man stands chest to chest against her, his hips between her thighs, penetrating her; her left leg is hooked around his hip and his hand holds it under the knee; their faces close, both in profile. No gap between their bodies.`;
    case 'lift':
      return `Wide shot, both faces in frame. The man stands holding the woman up by her thighs, facing each other chest to chest; her legs are wrapped around his waist and her arms around his neck, her face beside his, his penis inside her.`;
    case 'oral':
      // He goes down on her: "Full-body view, both faces in frame" laid him on his back on the
      // floor under her with his face upside down, to show it (the user's stills; replay 3/4
      // wrong). A side view with his face in profile, kneeling upright: 4/4 (live A/B 2026-10-04),
      // the wording that kept two women whole (placementTwoWomen).
      return sheGivesOral(beat)
        ? isFloorSurface(surface)
          ? `Full-body view, both faces in frame. The man stands; the woman kneels on ${on('floor')} in front of him with his penis in her mouth, holding it at the base, looking up at him.`
          : `The man sits on ${edgeOf(surface, 'bed')}; the woman kneels on the floor between his knees with his penis in her mouth, holding it at the base, looking up at him.`
        : !/\bkneel/i.test(beat)
          ? // "She lies on her back … he lies between her thighs" disagreed with the kneel-up map;
            // seated on the edge, words and map agree (oralReceiverSeated). Live A/B: see CHANGELOG.
            `Side view, exactly two people. The woman sits on ${edgeOf(oralSeat(beat, surface), 'bed')}, feet on the floor, leaning back on her hands with her thighs spread; the man kneels upright on the floor between her knees, his back straight, his face in profile pressed to her vulva, licking her, his hands on her thighs. She looks down at him.`
          : // At a bed/couch she sits on its edge (the oral map draws that seated pose too —
            // oralReceiverSeated, rapid-oral-pose.ts); else she stands.
            ORAL_SEAT_RE.test(beat)
            ? `Side view, exactly two people. The woman sits on ${edgeOf(surface, 'bed')}, feet on the floor, leaning back on her hands with her thighs spread; the man kneels upright on the floor between her knees, his back straight, his face in profile pressed to her vulva, licking her, his hands on her thighs. She looks down at him.`
            : // Placing each of her legs: "one leg lifted over his shoulder" often left the lifted
              // leg reading as a third limb behind him; with each leg placed both bodies came out
              // whole with two clear legs, 8/8 seeds (live 2026-09-29).
              `Full-body view, both faces in frame. The woman stands with her back against ${on('wall')}. Her right foot is flat on the floor; her left leg rests over his right shoulder, her calf down his back. The man kneels on the floor in front of her with his mouth on her vulva, his hands holding her hips. She looks down at him.`;
    case 'sixty_nine':
    case 'facesit':
      // Rapid cannot draw a 69, and on v23 face-sitting came back as a kiss or cowgirl too
      // (live 2026-09-28: 0/8 across wordings, with and without the guide). The seated oral
      // pose lands every time, so the oral beat stays readable (guide: day-slot-pose.ts).
      return `Side view, exactly two people. The woman sits on the edge of the ${/\b(?:couch|sofa|living[- ]room)\b/i.test(beat) ? 'couch' : 'bed'}, feet on the floor, leaning back on her hands with her thighs spread; the man kneels upright on the floor between her knees, his back straight, his face in profile pressed to her vulva, licking her, his hands on her thighs. She looks down at him.`;
    case 'kneeling':
      return `Both kneel upright on ${on('bed')} facing each other, bodies pressed together mid-sex, her arms around his neck and his hands on her hips; both faces in frame.`;
    case 'lap':
      // Front-on, Rapid turned her to the camera and buried him under her 3/3 (03085); side view
      // with both faces in profile kept them chest to chest 3/3 (2026-10-07).
      return `Side view of ${on('chair')}. The man sits in it, his face in profile; the woman sits on his lap facing him, chest to chest, straddling him with her knees on either side of his hips, riding his penis, her arms around his neck — her face in profile too, his whole body visible under her.`;
    default:
      return null;
  }
}

/**
 * The same layouts for two women (Day "Partner" is a woman): the drawn geometry stays, the act
 * becomes fingering, grinding or oral. Live (2026-09-30): "fucking her from behind with a
 * strap-on" summoned a man as a third person, and naming a harness put one on the oral still.
 * The lead is "the woman", the partner always "her girlfriend" (two "her"s blur on Rapid).
 */
function placementTwoWomen(
  layout: IntimateLayout,
  beat: string,
  surface: string | null
): string | null {
  const on = (fallback: string) => `the ${surface ?? fallback}`;
  const gf = 'her girlfriend';
  switch (layout) {
    case 'missionary':
      // Two women on top of each other merged into one body (live, 2026-10-01); side by side
      // kept two whole bodies 4/4.
      return `Side view, both faces in frame. The woman lies on her back on ${on('bed')} with her knees up and apart; ${gf} lies on her side right next to her, propped up on one elbow, her body alongside hers — two separate bodies side by side — one hand between her thighs, fingering her; their faces close, looking at each other.`;
    case 'mating_press':
      return `The woman lies on her back on ${on('bed')} with her knees pulled up toward her shoulders; ${gf} kneels over her between her legs, holding the backs of her thighs, her mouth on her vulva, licking her; both faces in frame.`;
    case 'straddle':
      return `Wide shot, both faces in frame. ${cap(gf)} lies flat on her back on ${on('bed')}; the woman kneels astride her girlfriend's hips with her knees on either side, grinding down on her, hands on her girlfriend's chest, looking down at her.`;
    case 'reverse_straddle':
      return `Camera in front of the woman. The woman is closest to the camera, facing the lens, sitting on the lap of ${gf}, who sits back on ${on('couch')} behind her; her back rests against her girlfriend's chest, legs spread; ${gf}'s hand is between her thighs, fingering her; ${gf}'s face is behind her shoulder.`;
    case 'bent':
      // "Pressed close behind" hid her girlfriend inside her silhouette (phantom limbs); beside
      // her hip gave two whole bodies 4/4 (live A/B 2026-10-01).
      return `${isFloorSurface(surface) ? `The woman is on all fours on ${on('floor')}, hips raised, back arched; ${gf} kneels` : `The woman stands bent forward over ${on('bed edge')}, hands braced on it, hips pushed back; ${gf} stands`} at her side next to her hip — two separate bodies side by side, a gap between their torsos — one hand on her lower back and the other between her thighs from behind, fingering her. She looks back over her shoulder at her.`;
    case 'standing':
      return `Both stand. The woman leans forward with her hands braced on ${on('wall')}, hips pushed back; ${gf} stands at her side next to her hip — two separate bodies side by side, a gap between their torsos — one hand on her lower back and the other between her thighs from behind, fingering her; she looks back over her shoulder at her.`;
    case 'prone':
      return `The woman lies flat on her stomach on ${on('bed')}, face turned to the side on the pillow; ${gf} lies along her side, pressed against her back, one hand between her thighs from behind, fingering her, kissing her shoulder.`;
    case 'spoon':
      return `Spooning, seen from the front. The woman lies on her side on ${on('bed')}, turned toward the camera, her head on her lower arm and her hip up; ${gf} lies on her side right behind her, chest pressed against her back and face just behind her shoulder, one hand reaching around between her thighs, fingering her as she lifts her top leg. Both faces in frame.`;
    case 'scissors':
      return `The woman and ${gf} sit on ${on('bed')} facing each other, each leaning back on their hands, their legs scissored together so their bare vulvas press and grind together; both faces in frame.`;
    case 'wall':
      return /\b(?:partner\s+behind|from\s+behind)\b/i.test(beat) || isGlassSurface(surface)
        ? `The woman stands facing ${on('wall')} with her palms flat against it and her hips pushed back; ${gf} stands pressed against her back, one hand between her thighs from behind, fingering her; she looks back over her shoulder. Both standing on the floor.`
        : `The woman stands with her back pressed flat against ${on('wall')}. Her right foot is flat on the floor; her left knee is raised to her girlfriend's hip. ${cap(gf)} stands pressed chest to chest against her, kissing her, one hand between her thighs, fingering her.`;
    case 'lift':
      // Chest to chest with her legs wrapped, the hidden hand came out as a penis (3/4) or one
      // merged body; beside her knee, with the softened Moment below, two whole women 4/4 (live
      // A/B 2026-10-01). Either change alone still drew a penis, a man or a third woman.
      return `Wide shot, both faces in frame. The woman sits on ${on('counter')} with her thighs apart, leaning back on one hand; ${gf} stands beside her knee, turned toward her — two separate bodies, a gap between their hips — kissing her, one hand between her thighs, fingering her vulva.`;
    case 'oral':
    case 'sixty_nine':
    case 'facesit':
      return sheGivesOral(beat, { sameSexWording: false })
        ? isFloorSurface(surface)
          ? // Standing, two women knelt face to face and kissed (6/6); seating the receiver on a
            // chair gave the oral geometry 3/3 (live A/B 2026-10-01).
            `Full-body view, both faces in frame. ${cap(gf)} sits on a chair, leaning back with her thighs spread; the woman kneels on ${on('floor')} between her girlfriend's thighs with her mouth on her vulva, licking her, looking up at her.`
          : `Side view, exactly two women. ${cap(gf)} sits on ${edgeOf(surface, 'bed')}, leaning back on her hands with her thighs spread; the woman kneels on the floor between her girlfriend's thighs, her face in profile pressed to her vulva, licking her, hands on her girlfriend's thighs. ${cap(gf)} looks down at her.`
        : // "Both faces in frame" with one face buried drew a third woman to show it (4/8); a
          // side view with the licker in profile kept two women 8/8 (live A/B 2026-10-01). On a
          // floor surface the receiver sits on the couch / bed — "the edge of the rug" isn't a seat.
          `Side view, exactly two women. The woman sits on ${
            isFloorSurface(surface)
              ? `the edge of the ${/\b(?:couch|sofa|living[- ]room|rug)\b/i.test(`${beat} ${surface}`) ? 'couch' : 'bed'}`
              : edgeOf(surface, 'bed')
          }, leaning back on her hands with her thighs spread; ${gf} kneels on ${
            isFloorSurface(surface) ? on('floor') : 'the floor'
          } between her thighs, her face in profile pressed to her vulva, licking her, hands on her thighs. She looks down at her girlfriend.`;
    case 'kneeling':
      return `Both kneel upright on ${on('bed')} facing each other, bodies pressed together, kissing, each with a hand between the other's thighs; both faces in frame.`;
    case 'lap':
      // "Sits on her girlfriend's lap facing her" sat them side by side (0/3); naming one on top of
      // the other and two separate bodies put one on the other's lap 3/3 (Rapid, 2026-10-06).
      // Front-on she turned to the camera with her girlfriend behind her (2/2, 2026-10-07); a side
      // view with both faces in profile, as for a man, sat them face to face 3/3.
      return `Side view of ${on('chair')}. ${cap(gf)} sits in it, her face in profile; the woman sits on her lap facing her, chest to chest, straddling her with her knees on either side of her girlfriend's hips, arms around her neck — her face in profile too, kissing; ${gf}'s hand between her thighs, fingering her. Two separate bodies, both faces in frame.`;
    default:
      return null;
  }
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Beat wording for two women: the partner is "her girlfriend", the penis her fingers. */
export function twoWomenBeat(beat: string): string {
  return beat
    .replace(/\b(?:a|her|the)\s+(?:partner|man|boyfriend|lover)\b/gi, 'her girlfriend')
    .replace(/\bpartner(?:'s)?\b/gi, match =>
      match.endsWith("'s") ? "her girlfriend's" : 'her girlfriend'
    )
    .replace(/\bhis\b/gi, "her girlfriend's")
    .replace(/\b(?:him|he)\b/gi, 'her girlfriend')
    .replace(
      /\b(?:(?:her girlfriend's|a|the)\s+)?(?:penis|cock|dick|strap-on)\b/gi,
      "her girlfriend's fingers"
    )
    .replace(/\b(?:a\s+)?blow\s*job\b/gi, 'oral sex')
    .replace(/\bboth adults\b/gi, 'both women');
}

/**
 * The lift beat for two women: "picked up and fucked by her girlfriend … legs wrapped around
 * her" drew a penis or a man even with the bodies placed apart (live A/B 2026-10-01).
 */
function twoWomenLiftBeat(beat: string): string {
  return beat
    .replace(/\b(?:picked up|lifted(?: up)?) and fucked by\b/gi, 'fingered by')
    .replace(/\blifted onto her girlfriend\b/gi, 'fingered by her girlfriend on the counter')
    .replace(/\bfucked\b/gi, 'fingered')
    .replace(/\s*(?:—|,)\s*legs wrapped around her girlfriend(?:'s waist)?\s*(?:—|,)?\s*/gi, ' — ')
    .replace(/\s*—\s*$/, '');
}

const NUDE_TWO_WOMEN =
  'Both women are completely nude — bare breasts with nipples visible and bare vulvas on both; zero fabric on either body.';

/**
 * Two men (a man Cast lead with a man partner). Same geometry as each layout: the lead is "the
 * man" (first image) in the receiving place, the partner always "his boyfriend".
 */
function placementTwoMen(
  layout: IntimateLayout,
  beat: string,
  surface: string | null
): string | null {
  const on = (fallback: string) => `the ${surface ?? fallback}`;
  const bf = 'his boyfriend';
  switch (layout) {
    case 'missionary':
    case 'mating_press':
      return `Side view, both faces in frame. The man lies on his back on ${on('bed')} with his knees raised and legs around ${bf}; ${bf} kneels between his thighs, leaning over him on his arms, his penis inside the man; their faces close, looking at each other.`;
    case 'straddle':
      return `Wide shot, both faces in frame. ${cap(bf)} lies on his back on ${on('bed')}; the man kneels astride his boyfriend's hips, knees on either side, sitting down on his boyfriend's penis and riding him, hands on his boyfriend's chest.`;
    case 'lap':
      // Seated, as the couple's lap is: shared with the straddle it laid his boyfriend on his
      // back "on the armchair".
      return `${cap(bf)} sits on ${on('chair')}; the man sits on his boyfriend's lap facing him, straddling him with his knees on either side of his hips, riding his boyfriend's penis, arms around his neck.`;
    case 'reverse_straddle':
      return `Camera in front of the man. The man is closest to the camera, facing the lens, sitting on the lap of ${bf}, who sits back on ${on('couch')} behind him, riding his boyfriend's penis; ${bf}'s hands on his hips and face behind his shoulder.`;
    case 'bent':
    case 'standing':
    case 'wall':
      return layout === 'bent' && isFloorSurface(surface)
        ? `The man is on all fours on ${on('floor')}, hips raised; ${bf} kneels close behind him holding his hips, penetrating him from behind. He looks back over his shoulder.`
        : layout === 'wall'
          ? // Side view without the map (rapidAdultSkipsPoseGuide): front-on they posed apart.
            `Side view, both bodies in profile. The man stands facing ${on('wall')}, his palms flat on it and his hips pushed back toward ${bf}; ${bf} stands directly behind him, his chest against the man's back and his hips against his buttocks, penetrating him from behind, his hands on his hips; the man turns his head to look back at him. No gap between their bodies.`
          : `The man stands bent forward with his hands braced on ${on('bed edge')}, hips pushed back; ${bf} stands close behind him holding his hips, penetrating him from behind. He looks back over his shoulder.`;
    case 'prone':
      return `The man lies flat on his stomach on ${on('bed')}, face turned to the side on the pillow; ${bf} lies on top of his back, propped up on his arms, penetrating him from behind.`;
    case 'spoon':
      return `Spooning, seen from the front. The man lies on his side on ${on('bed')}, turned toward the camera, head on his lower arm; ${bf} lies on his side right behind him, chest pressed against his back and face just behind his shoulder, penetrating him from behind. Both faces in frame.`;
    case 'scissors':
    case 'kneeling':
      return `Both men kneel upright on ${on('bed')} facing each other, chests pressed together, kissing, each stroking the other's erect penis; both faces in frame.`;
    case 'lift':
      return `Wide shot, both faces in frame. The man sits on ${edgeOf(surface, 'counter')} with his legs wrapped around ${bf}, who stands between his thighs chest to chest, penetrating him; arms around each other.`;
    case 'oral':
    case 'sixty_nine':
    case 'facesit':
      // Seated: a side view with his boyfriend kneeling. "Full-body view, both faces in frame"
      // drew no contact (0/3, live 2026-10-06); the side view did (3/3). Rapid put the first
      // image's face on the receiver in all 9 side-view renders, even with the lead named as
      // the one kneeling and each face tied to its image, so the words say what it draws.
      // On the floor the receiver stands against the wall, same side view: contact 3/3, the
      // boyfriend kneeling as drawn (the old full-body line had him kneel while the text said the
      // lead did).
      return isFloorSurface(surface)
        ? `Side view, exactly two men. The man stands, his back against the wall; ${bf} kneels on ${on('floor')} in front of him, his face in profile at the man's hips with the man's penis in his mouth, holding it at the base. The man looks down at him.`
        : `Side view, exactly two men. The man sits on ${edgeOf(surface, 'bed')}, leaning back on his hands with his knees apart; ${bf} kneels on the floor between his knees, his face in profile at the man's lap with the man's penis in his mouth, holding it at the base. The man looks down at him.`;
    default:
      return null;
  }
}

/** Beat wording for two men: the lead is "he", the partner "his boyfriend". */
export function twoMenBeat(beat: string): string {
  return herToHisHim(
    masculineClothes(beat)
      .replace(/\b(?:a|her|the)\s+(?:partner|man|boyfriend|lover|girlfriend)\b/gi, 'his boyfriend')
      .replace(/\bpartner(?:'s)?\b/gi, match =>
        match.endsWith("'s") ? "his boyfriend's" : 'his boyfriend'
      )
      .replace(/\bhis\b(?!\s+boyfriend)/gi, "his boyfriend's")
      .replace(/\b(?:him|he)\b/gi, 'his boyfriend')
      .replace(/\bshe\b/gi, 'he')
      .replace(/\bherself\b/gi, 'himself')
      .replace(/\b(?:pussy|vulva|clit|breasts?|nipples?)\b/gi, 'body')
  );
}

const NUDE_TWO_MEN =
  'Both men are completely nude — bare chests and bare penises; zero fabric on either body.';

const NUDE =
  'Both are completely nude — her bare breasts with nipples visible and bare vulva, his bare chest and penis; zero fabric on either body.';

/** Clothed sex ("clothes open"): name the outfit image, or Image 1's underwear plate wins. */
function clothedLine(outfitImage: RecipeImage | null | undefined): string {
  return outfitImage
    ? `She wears the outfit from the ${outfitImage} image, pushed open: top pulled up over her bare breasts, bottoms pulled down around her thighs; his trousers open. Only that outfit — the first image's underwear is not worn.`
    : 'Clothes pushed open as the beat says: her top pulled up over her bare breasts and bottoms pulled down around her thighs; his trousers open.';
}

export type RecipeImage = 'second' | 'third';

/**
 * The planner's room only when the beat names no place of its own — a "kitchen floor … toaster"
 * beat under a "steamy bathroom" setting rendered a bathroom with a toaster in it.
 */
function recipeRoom(
  beat: string,
  surface: string | null,
  setting: string | null | undefined,
  timeOfDay: string | null | undefined
): string | null {
  const beatNamesPlace =
    Boolean(
      surface && !/^(?:(?:unmade |rumpled |hotel )?(?:bed|daybed)|bed edge|sheets)$/i.test(surface)
    ) ||
    /\b(?:bathroom|kitchen|hallway|hotel|office|laundry|living[- ]room|shower|fridge|car|balcony|elevator|windowsill|couch|sofa|doorway|bathtub|tub|patio|terrace|rooftop|garden|street|sidewalk|neon|bar|shop\s+window)\b/i.test(
      beat
    );
  // A bed beat under a bed-less room ("on her back on the bed" + "steamy bathroom") paints both.
  const bedBeat = /\b(?:bed|mattress|sheets|pillow)\b/i.test(beat);
  const roomFits =
    !bedBeat || /\b(?:bed(?:room)?|hotel|suite|sheets|mattress|motel|cabin)\b/i.test(setting ?? '');
  if (!beatNamesPlace && roomFits && setting?.trim()) {
    return `Room: ${setting.trim()}.`;
  }
  const light = timeOfDay?.trim();
  // "Night light." reads as a nightlight; skip it when the beat already names its light or time
  // ("… in afternoon light" + "Morning light." contradicted each other).
  if (
    !light ||
    /\b(?:morning|afternoon|evening|dusk|dawn|sunrise|sunset|golden[- ]hour|night|after\s+dark|midnight|light|sunlit|sunlight|glow|neon)\b/i.test(
      beat
    )
  ) {
    return null;
  }
  return /^night$/i.test(light)
    ? 'Night-time, lamp light.'
    : `${light[0]!.toUpperCase()}${light.slice(1)} light.`;
}

/**
 * Compact Rapid duo prompt, or null when the beat has no drawable two-person layout
 * (afterglow / undress / generic) — callers keep the full brief then.
 */
/**
 * Raunchy beats say "laughing" ("both scramble laughing", "face-plants laughing"). At CFG 1 Rapid
 * paints wide-open cackles on both faces mid-sex, and the open mouth costs face match. Same-seed
 * replays (Day Raunchy 01040/01046/01109 × 2 seeds): "lips closed, amused" + a glance at the
 * interruption kept the gag with calm faces — face distance 0.915 laughing, 0.965 "smile", 0.901 this.
 */
export function calmSexLaughter(beat: string): string {
  return beat
    .replace(
      /\bboth\s+(scramble|freeze)\s+laughing\b/gi,
      'both $1, glancing at the interruption, lips closed, amused'
    )
    .replace(
      /\b(face-plants?)\s+laughing\b/gi,
      '$1, both glancing at each other, lips closed, amused'
    )
    .replace(/\blaughing\s+(mid-(?:thrust|act|sex))\b/gi, 'lips closed, amused $1')
    .replace(/\bmid-laugh\b/gi, 'amused, lips closed')
    .replace(/\b(?:laughing|laughs?)\b/gi, 'amused, lips closed');
}

/** Two-person sex layouts a recipe can place (a map's layout outranks the beat's words). */
const DRAWN_DUO_LAYOUTS: ReadonlySet<IntimateLayout> = new Set<IntimateLayout>([
  'missionary',
  'mating_press',
  'straddle',
  'reverse_straddle',
  'bent',
  'prone',
  'spoon',
  'scissors',
  'standing',
  'wall',
  'lift',
  'oral',
  'sixty_nine',
  'facesit',
  'kneeling',
  'lap',
]);

export function buildRapidDuoRecipe(input: {
  beat: string | null | undefined;
  /** Planner indoor setting — used as the room only when the beat names no place. */
  setting?: string | null;
  timeOfDay?: string | null;
  /** Descriptor ("white woman in her 30s athletic build") so the invented body matches the Cast. */
  descriptor?: string | null;
  /** Pose map attached — `true` means the second encoder image. */
  poseGuide?: boolean | RecipeImage;
  /** Default true. False: clothed sex (Story "clothes open" beats keep their outfit). */
  nude?: boolean;
  /** Clothed only: the encoder image holding the outfit packshot. */
  outfitImage?: RecipeImage | null;
  /** A Cast member as the man (Day "Partner"), with the encoder image holding his face. */
  partner?: { partner: DayPartner; image: RecipeImage } | null;
  /** The Cast lead (default a woman). A man lead takes the man's place, or two-men layouts. */
  lead?: DayPartnerNoun;
  /**
   * The sex layout the pose map draws, when it is known and differs from the beat's words (Story:
   * the writer's structured pose draws the map, the blurb is prose). Words and map then agree.
   */
  layout?: IntimateLayout | null;
}): string | null {
  const beat = input.beat?.trim();
  if (!beat) {
    return null;
  }
  const layout =
    (input.layout && DRAWN_DUO_LAYOUTS.has(input.layout) ? input.layout : null) ??
    parseIntimateLayout(beat);
  if (!layout) {
    return null;
  }
  const surface = rapidDuoSurface(beat);
  const leadMan = input.lead === 'man';
  const partnerNoun = input.partner?.partner.noun ?? (leadMan ? 'woman' : 'man');
  const twoWomen = !leadMan && partnerNoun === 'woman';
  const twoMen = leadMan && partnerNoun === 'man';
  // Rapid cannot draw scissoring (seated or lying, it came back odd — user report 2026-10-05):
  // like 69 / face-sit → seated oral, scissors renders as the close missionary pose, which lands
  // (8/8 couple, 4/4 two women side by side). Two men keep their kneeling recipe.
  const drawn: IntimateLayout = layout === 'scissors' && !twoMen ? 'missionary' : layout;
  const body = twoWomen
    ? placementTwoWomen(drawn, beat, surface)
    : twoMen
      ? placementTwoMen(drawn, beat, surface)
      : placement(drawn, beat, surface);
  if (!body) {
    return null;
  }
  const room = recipeRoom(beat, surface, input.setting, input.timeOfDay);
  return [
    RAPID_DUO_RECIPE_MARK,
    body,
    // "doggy" paints literal dogs on Qwen stacks; a 69 / face-sit beat renders as seated oral.
    `Moment: ${calmSexLaughter(
      twoWomen
        ? layout === 'lift'
          ? twoWomenLiftBeat(twoWomenBeat(beat))
          : twoWomenBeat(beat)
        : twoMen
          ? twoMenBeat(beat)
          : beat
    )
      // "lips closed" fought "in her mouth" — the oral still came out as a kiss (live 2026-09-30).
      .replace(
        layout === 'oral' || layout === 'sixty_nine' || layout === 'facesit'
          ? /amused, lips closed/g
          : /$^/,
        'eyes smiling'
      )
      .replace(/\bdoggy(?:[- ]?style)?\b/gi, 'from behind')
      .replace(
        layout === 'sixty_nine' || layout === 'facesit' ? RAPID_ORAL_FALLBACK_RE : /$^/,
        'oral sex'
      )
      .replace(layout === 'scissors' ? RAPID_SCISSORS_FALLBACK_RE : /$^/, 'making love')
      .replace(input.nude === false ? /$^/ : WORN_CLOTHES_CLAUSE_RE, '')
      .replace(MEAL_TIME_RE, '')}.`,
    room,
    input.nude === false
      ? twoMen
        ? 'Clothes pushed open as the beat says: both men with shirts open and trousers pulled down.'
        : twoWomen
          ? clothedLine(input.outfitImage).replace(
              /his trousers open/,
              "her girlfriend's clothes pushed open too"
            )
          : clothedLine(input.outfitImage)
      : twoWomen
        ? NUDE_TWO_WOMEN
        : twoMen
          ? NUDE_TWO_MEN
          : NUDE,
    leadMan
      ? descriptorLine(input.descriptor)?.replace(/^The woman:/, 'The man:')
      : descriptorLine(input.descriptor),
    input.partner
      ? dayPartnerRecipeLine(
          input.partner.partner,
          input.partner.image,
          twoWomen ? 'her girlfriend' : twoMen ? 'his boyfriend' : undefined,
          leadMan ? 'man' : 'woman'
        )
      : leadMan
        ? "Keep the man's face from the first image; the woman has her own face."
        : 'Keep her face from the first image.',
    // Rapid 69 beats get a face-sitting guide (day-slot-pose.ts), matching the fallback above.
    input.poseGuide
      ? `Match the two bodies in the ${input.poseGuide === true ? 'second' : input.poseGuide} image (pose map).`
      : null,
    'Photorealistic photograph, natural skin.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\.\./g, '.');
}

/**
 * Story still on Rapid AIO: the compact recipe for a duo sex beat, or null (other models, solo
 * or non-sex beats) — the caller keeps its normal prompt then. Image slots follow
 * `buildRoleplayQueueStillOptions`: Image 2 packshot (when kept), Image 3 pose guide.
 */
export function buildStoryRapidDuoRecipe(input: {
  model: string | null | undefined;
  title?: string | null;
  blurb?: string | null;
  /** Beat dropped its garment packshot (nude sex beat). */
  omitGarment: boolean;
  hasGarmentImage: boolean;
  hasPoseGuide: boolean;
  /**
   * The layout the beat's pose map draws (its pose key's first part). The writer's structured
   * pose draws the map while the blurb is prose: "standing with her back against a filing cabinet
   * … a slow reverse straddle" drew a standing map under a lying-straddle recipe, and the stills
   * came out as three poses at once.
   */
  guideLayout?: string | null;
}): string | null {
  if (!isQwenRapidAioModel(input.model ?? undefined)) {
    return null;
  }
  const beat = input.blurb?.trim() || input.title?.trim();
  if (!beat) {
    return null;
  }
  const outfitImage: RecipeImage | null = input.hasGarmentImage ? 'second' : null;
  return buildRapidDuoRecipe({
    beat,
    nude: input.omitGarment,
    outfitImage,
    // The encoder packs images in order — no packshot means the guide is the second image.
    poseGuide: input.hasPoseGuide ? (outfitImage ? 'third' : 'second') : false,
    layout: input.hasPoseGuide ? (input.guideLayout as IntimateLayout | null | undefined) : null,
  });
}

/**
 * Story's clothed two-person stills on Rapid AIO: Day's compact couple recipe instead of the long
 * brief. Replaying three Story duo stills two seeds each, the brief drew a third (or fourth)
 * person in 2 of 6 (and 2 of the 3 originals); the compact recipe 0 of 6.
 */
export function buildStoryClothedDuoRecipe(input: {
  model: string | null | undefined;
  title?: string | null;
  blurb?: string | null;
  /** Image 1 is the dressed plate: the outfit is the one she has on there. */
  fromDressedPlate: boolean;
  hasGarmentImage: boolean;
  hasPoseGuide: boolean;
  lead?: DayPartnerNoun;
}): string | null {
  if (!isQwenRapidAioModel(input.model ?? undefined)) {
    return null;
  }
  const beat = input.blurb?.trim() || input.title?.trim();
  if (!beat) {
    return null;
  }
  const outfitImage: RecipeImage | null =
    input.hasGarmentImage && !input.fromDressedPlate ? 'second' : null;
  return buildCompactDayDuoRecipe({
    beat,
    outfitImage,
    outfitFromFirst: input.fromDressedPlate,
    poseGuide: input.hasPoseGuide ? (input.hasGarmentImage ? 'third' : 'second') : false,
    lead: input.lead,
  });
}

/** Where her body is, per solo stance — the same stances the solo pose guide draws. */
function soloPlacement(
  kind: SoloMasturbationPoseKind,
  beat: string,
  surface: string | null
): string {
  const on = (fallback: string) => `the ${surface ?? fallback}`;
  if (/\bwindowsill\b/i.test(beat)) {
    return 'She sits on the windowsill with her back against the window frame, thighs apart, facing the camera.';
  }
  // Places the stance table has no furniture for — say them, or the bed fallback wins.
  if (/\bbath(?:tub)?\b/i.test(beat) && !/\bbathroom\b/i.test(beat)) {
    return 'She sits in a bathtub full of bubbles, leaning back, one knee hooked over the rim, facing the camera.';
  }
  if (/\blaundry\b/i.test(beat)) {
    // Back-up wording, as the prone recipe: "face-down … face turned toward the camera" came out
    // face-up and upside down 3/3; naming back and buttocks up, 3/3 on her stomach (2026-10-07).
    return 'She lies flat on her stomach on a pile of clean laundry and towels on the floor, seen from the side: her bare back and buttocks up, her breasts pressed into the towels, her hips grinding down into them, her head turned toward the camera.';
  }
  if (/\bfridge\b/i.test(beat)) {
    return 'She stands at the open fridge in its light, one foot up on the crisper drawer, facing the camera.';
  }
  if (/\bminibar\b/i.test(beat)) {
    return 'She leans back against the hotel minibar, hips at its edge, thighs apart, facing the camera.';
  }
  if (/\bkitchen\s+floor\b/i.test(beat)) {
    return 'She sits on the kitchen floor, leaning back against the cabinets, knees pulled up and apart, facing the camera.';
  }
  if (/\b(?:astride|straddl\w*)\s+(?:a\s+)?pillow\b/i.test(beat)) {
    return 'She kneels astride a pillow on the bed, grinding her hips down onto it, facing the camera.';
  }
  switch (kind) {
    case 'on_back':
      // Say what the Image 3 guide draws (day-pose-guide.ts on_back: one thigh folded toward the
      // chest, the other knee out). "Knees bent and thighs spread wide" drew both legs spread
      // plus the guide's raised leg — a third leg on 5/5 renders of one beat, 0/4 with this line.
      // "Ankles near her shoulders" / "knees pulled up": the guide raises both legs (legsHigh in
      // day-pose-guide.ts) — the one-knee line twisted her (live 2026-10-07); this, 3/3 clean.
      return SOLO_LEGS_HIGH_RE.test(beat)
        ? `She lies on her back on ${on('bed')}, head on the pillow, both knees pulled up toward her chest, feet in the air — two legs only.`
        : `She lies on her back on ${on('bed')}, head on the pillow, one knee drawn up toward her chest and the other leg bent out to the side — two legs only.`;
    case 'side_lying':
      return `She lies on her side on ${on('bed')}, bottom leg straight and top knee raised high, facing the camera.`;
    case 'prone':
      // Live 2026-09-27: "face-down … cheek on the pillow" rendered her on her back 3/3 (the
      // side-view guide can't say which way she faces); naming back-up/breasts-down got 3/4.
      return `She lies stretched out flat on her stomach on ${on('bed')}, legs straight out behind her, her whole body flat on the mattress, seen from the side: her bare back and buttocks up, her breasts pressed into the sheets, her hips pressing down into the mattress, her head on the pillow turned to the side.`;
    case 'kneeling':
      return `She kneels upright on ${on('bed')} with her knees apart and her torso straight up, facing the camera.`;
    case 'all_fours':
      return /\bbent\s+over\b/i.test(beat)
        ? `She stands bent forward over ${on('foot of the bed')}, chest down on it and hips pushed back toward the camera, looking back over her shoulder.`
        : `She is on all fours on ${on('bed')}, hips raised high toward the camera, looking back over her shoulder.`;
    case 'standing':
      return /\bwall\b/i.test(beat)
        ? `She stands with her back against ${on('wall')}, one knee bent, facing the camera.`
        : /\bshower\b/i.test(beat)
          ? 'She stands in the shower with one foot up on the ledge, facing the camera.'
          : 'She stands upright with one knee bent, facing the camera.';
    case 'lean':
      // A kitchen sink is a counter — "sink" alone drew a bathroom vanity and mirror.
      return /\bkitchen\b/i.test(beat) && /\bsink\b/i.test(beat)
        ? 'She leans back against the kitchen counter beside the sink, hips at its edge, thighs apart, facing the camera.'
        : /\bsink\b/i.test(beat)
          ? 'She sits on the edge of the bathroom sink, leaning back against the mirror, thighs apart, facing the camera.'
          : `She leans back against ${on('counter')}, hips at its edge, thighs apart, facing the camera.`;
    case 'seated':
    default:
      return `She sits on ${on('bed edge')}, leaning back on one hand with her thighs spread, facing the camera.`;
  }
}

/** Her hands, in the beat's own count — "both hands between her thighs" must not get a breast. */
function soloHands(beat: string, toy: boolean, kind?: SoloMasturbationPoseKind): string {
  if (toy) {
    // A bright colour keeps the toy an object: "realistic" flesh tones rendered as her own penis.
    // Saying where the toy goes ("halfway inside … angled into her body") put its tip in her on
    // 3/3 on-back seeds, against 1/3 for "its tip pushed into her vagina".
    return /\bone\s+hand\b/i.test(beat)
      ? 'One hand is braced on the bed; the other grips only the base of a bright purple silicone dildo pushed halfway inside her vagina between her spread thighs, angled into her body.'
      : 'A bright purple silicone dildo is pushed halfway inside her vagina between her spread thighs, angled into her body; both of her hands grip only its base, the rest of the toy hidden inside her.';
  }
  if (/\bboth\s+hands\b/i.test(beat)) {
    return 'Both of her hands are between her thighs, her fingers on her vulva.';
  }
  if (/\bfist\s+in\s+the\s+sheets\b/i.test(beat)) {
    return 'One hand is between her thighs with her fingers on her vulva; the other hand grips the sheets.';
  }
  if (/\breach(?:es|ing)?\s+back\b/i.test(beat)) {
    return 'One hand reaches back between her thighs, her fingers on her vulva; the other is braced on the bed.';
  }
  if (kind === 'side_lying') {
    // Side-lying with the top knee up: a loose "hand between her thighs" rendered as a second
    // person's hand reaching in (live 2026-09-28, 3/4). Anchor both arms to her own body (4/4).
    return 'Her top arm reaches down across her own belly to her vulva, her fingers between her thighs; her bottom arm is folded under her head.';
  }
  if (kind === 'standing' || kind === 'lean') {
    // Standing, a hand "between her thighs" floated off her body and Rapid filled the gap with a
    // penis (2/3 replays of 03074); cupping the vulva, 0/3 (2026-10-07).
    return 'One hand cups her bare vulva between her thighs, her fingers parting her labia; the other hand rests on her breast.';
  }
  return 'One hand is between her thighs with her fingers on her vulva; the other hand rests on her breast.';
}

/** "a low-rise slip dress" — outfit labels come without an article. */
function withArticle(outfit: string | null | undefined): string | null {
  const text = outfit?.trim();
  if (!text) return null;
  if (
    /^(?:a|an|the|her|his|some)\b/i.test(text) ||
    /[^s]s$/i.test(text.split(/\s+/).pop() ?? '') ||
    /(?:wear|clothes|lingerie)$/i.test(text) ||
    /^(?:lingerie|sleepwear|evening\s+wear)\b/i.test(text)
  ) {
    return text;
  }
  return `${/^[aeiu]|^o(?!ne\b)/i.test(text) ? 'an' : 'a'} ${text}`;
}

/**
 * Compact solo self-touch recipe for Rapid AIO Edit (NSFW) Day stills — the solo twin of
 * {@link buildRapidDuoRecipe}. The 8–13k solo brief missed prone, dildo and hands on Rapid
 * (live 2026-09-27); the duo lesson is the same: say where the body is, plainly, once.
 */
export function buildRapidSoloRecipe(input: {
  beat: string | null | undefined;
  setting?: string | null;
  timeOfDay?: string | null;
  descriptor?: string | null;
  /** Pose map attached — `true` means the second encoder image. */
  poseGuide?: boolean | RecipeImage;
  /** Beat names a dildo / vibrator. */
  toy?: boolean;
  /**
   * Clothes stay on, pushed open ("clothes half off"): the outfit to name. Omit for nude beats.
   * Without it these beats fell back to the long brief, whose bedroom lock drew over the
   * beat's own couch.
   */
  clothedOutfit?: string | null;
}): string | null {
  const raw = input.beat?.trim();
  if (!raw) {
    return null;
  }
  // Negated locks ("never both hands flat on the sill") summon what they name at CFG 1, and
  // "Cast" is app vocabulary, not a word the image model knows.
  const beat = stripNegatedClauses(raw)
    .replace(/\bCast\s+alone\b/gi, 'alone')
    // Toy beats say "realistic penis-shaped dildo … the tip of the penis … shaft": Rapid drew a
    // penis growing from her (live 2026-09-28, 6/6). Call it the toy it is.
    .replace(/\b(?:realistic\s+)?penis-shaped\s+/gi, '')
    .replace(/\b(?:tip|head)\s+of\s+the\s+penis\b/gi, 'tip of the dildo')
    .replace(/,?\s*shaft\s+entering\s+her\s+vagina\b/gi, '')
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;—-])(?:\s*[,;—-])+/g, '$1')
    .replace(/[\s,;—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const surface = rapidDuoSurface(beat);
  const kind = resolveSoloMasturbationPoseKind(beat);
  const ownGaze =
    kind === 'all_fours' ||
    /\b(?:looking\s+(?:back|up)|over\s+(?:her|a)\s+shoulder|head\s+tipped\s+back|eyes|biting)\b/i.test(
      beat
    );
  const placement = soloPlacement(kind, beat, surface);
  // The on-her-back line already says where each leg is (as the guide draws them); "knees apart"
  // left in the Moment gave her a third leg 2/3 (and 0/3 without it, live 2026-10-07).
  const legsSet = /two legs only/.test(placement) ? beat.replace(SOLO_LEG_SPREAD_RE, '') : beat;
  // Nude: clothes the beat still names ("in lingerie") drew underwear 2/3 beside "completely nude"
  // (0/3 without, 03069). The clothes-half-off route keeps them.
  const moment = (
    input.clothedOutfit === undefined ? legsSet.replace(SOLO_WORN_CLOTHES_RE, '') : legsSet
  ).replace(MEAL_TIME_RE, '');
  return [
    RAPID_SOLO_RECIPE_MARK,
    'One woman alone, masturbating.',
    placement,
    soloHands(beat, input.toy === true, kind),
    ownGaze ? null : 'Eyes half-closed, looking down at her body.',
    `Moment: ${calmSexLaughter(moment)}.`,
    recipeRoom(beat, surface, input.setting, input.timeOfDay),
    input.clothedOutfit !== undefined
      ? `She wears ${withArticle(input.clothedOutfit) ?? 'her outfit'}, pulled down off her breasts and pushed up around her waist — bare breasts with nipples visible and bare vulva.`
      : 'She is completely nude — bare breasts with nipples visible and bare vulva; zero fabric on her body.',
    descriptorLine(input.descriptor),
    'Keep her face from the first image.',
    input.poseGuide
      ? `Match her body to the ${input.poseGuide === true ? 'second' : input.poseGuide} image (pose map).`
      : null,
    'Photorealistic photograph, natural skin.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\.\./g, '.');
}

const LOOK_BACK_RE = /\b(?:looking\s+back|over\s+(?:her|a|one)\s+shoulder)\b/i;

/** Where a clothed Suggestive beat puts her body — stand, lean, sit, kneel, lie — said once. */
function suggestivePlacement(beat: string): string {
  const b = beat.toLowerCase();
  // The beat's own furniture or ground (a bath mat, a blanket) before the bed fallback.
  const surface =
    rapidDuoSurface(beat) ??
    poseSurfaces(beat)[0]
      ?.phrase.replace(/^\w+\s+(?:the|a|an|her|his|their)\s+/i, '')
      .toLowerCase() ??
    null;
  const lookBack = LOOK_BACK_RE.test(beat) ? ', looking back over her shoulder at the camera' : '';
  const lean = /\bdoor(?:way|frame|\s+jamb|\s+frame)?\b|\bjamb\b/.test(b)
    ? 'the doorframe'
    : /\b(?:window)?sill\b/.test(b)
      ? 'the windowsill'
      : /\bwindow\s+frame\b/.test(b)
        ? 'the window frame'
        : /\brail(?:ing)?\b/.test(b)
          ? 'the railing'
          : /\bcounter\b/.test(b)
            ? 'the counter'
            : /\bwall\b/.test(b)
              ? 'the wall'
              : null;
  if (/\b(?:lying|lies|lounging|reclining|sprawled|lying\s+back)\b/.test(b)) {
    const how = /\bon\s+her\s+stomach\b/.test(b)
      ? ' on her stomach'
      : /\bon\s+her\s+side\b/.test(b)
        ? ' on her side'
        : /\bback\b/.test(b)
          ? ' back'
          : '';
    return `She lies${how} on the ${surface ?? (/\bcouch\b/.test(b) ? 'couch' : /\bdaybed\b/.test(b) ? 'daybed' : 'bed')}${lookBack}.`;
  }
  if (/\bkneel/.test(b)) {
    return `She kneels upright on the ${surface ?? (/\brug\b/.test(b) ? 'rug' : 'bed')}${lookBack}.`;
  }
  if (/\b(?:sitting|seated|perched|sits)\b/.test(b)) {
    const seat = /\bwindowsill\b/.test(b)
      ? 'windowsill'
      : /\bchair\s+backwards\b/.test(b)
        ? 'a chair turned backwards, straddling it'
        : /\b(?:couch|chair)\s+arm|arm\s+of\s+(?:a|the)\s+(?:\w+\s+)?(?:couch|chair)\b/.test(b)
          ? 'arm of the ' + (/\bchair\b/.test(b) ? 'chair' : 'couch')
          : /\bbathtub\b/.test(b)
            ? 'edge of the bathtub'
            : /\bstool\b/.test(b)
              ? 'bar stool'
              : /\bfloor\b/.test(b)
                ? 'floor'
                : (surface ?? 'bed edge');
    return `She sits on ${/^a\s/.test(seat) ? seat : `the ${seat}`}${lookBack}.`;
  }
  if (/\bshop\s+window\b/.test(b)) {
    return 'She stands on the sidewalk at a shop window, body angled three-quarter to the glass, adjusting her neckline.';
  }
  if (/\bdanc/.test(b)) {
    return `She dances, both arms raised overhead, one knee lifted, hips mid-sway${lookBack}.`;
  }
  if (/\b(?:zip|unzip|buttoning|dressing)\w*/.test(b) && !lean) {
    return `She stands with her torso twisted, both hands at her dress behind her back${lookBack || ', looking over her shoulder'}.`;
  }
  if (/\b(?:walking|mid-step|mid-stride|pausing)\b/.test(b)) {
    return `She walks mid-step${lookBack}.`;
  }
  if (/\bstretch/.test(b)) {
    return `She stands stretching${lean ? ` in ${lean === 'the doorframe' ? 'the doorway' : `front of ${lean}`}` : ''}, one arm overhead, hip cocked${lookBack}.`;
  }
  if (lean) {
    return `She stands leaning on ${lean}, weight on one hip${lookBack}.`;
  }
  return `She stands with her weight on one hip${lookBack}.`;
}

/**
 * A lying couple's stance, said before the beat. The duo recipe had none, so "lying face to face
 * on the rumpled bed" went out as the beat alone and came back seated (Edit 2511, with or without
 * a pose drawing): both lying 1/3 → 3/3 with this sentence (2026-10-06). "He lies on his back;
 * she lies on top of him" was tried for the on-top beat and changed nothing, so it isn't said.
 * Null for every other beat — those render as written.
 */
export function suggestiveDuoPlacement(beat: string): string | null {
  const b = beat.toLowerCase();
  const surface = rapidDuoSurface(beat) ?? (/\bcouch\b/.test(b) ? 'couch' : 'bed');
  if (/\bface\s+to\s+face\b/.test(b) && /\b(?:lying|lie|lies|in\s+bed)\b/.test(b)) {
    return `Both lie on their sides on the ${surface}, facing each other, heads on the pillows.`;
  }
  return null;
}

/** "in lingerie", "in her underwear", "in a silk robe" — what a nude solo beat says she wears. */
const SOLO_WORN_CLOTHES_RE =
  /\s+in\s+(?:her\s+|a\s+|an\s+)?(?:[\w-]+\s+)?(?:lingerie|underwear|panties|bra|robe|nightie|nightgown|slip|teddy|bodysuit|stockings)\b/gi;

/**
 * "after dinner" / "after lunch": Rapid laid plates of food in the foreground of sex stills (2/3
 * replays of 03073, 0/3 without). The room and light lines already carry the time of day.
 */
const MEAL_TIME_RE = /\s+after\s+(?:dinner|lunch|brunch|breakfast)\b/gi;

/** Leg-spread words in a beat ("knees apart", "thighs spread wide", "knees flopped open"). */
const SOLO_LEG_SPREAD_RE =
  /,?\s*(?:with\s+)?(?:her\s+)?(?:knees|legs|thighs)\s+(?:flopped\s+|falling\s+|wide\s+)?(?:apart|spread(?:\s+wide)?|open(?:\s+wide)?|parted|wide(?:\s+open)?)\b/gi;

/** Same test as the on_back guide's legsHigh (day-pose-guide.ts synthesizeSoloMasturbationFigure). */
const SOLO_LEGS_HIGH_RE = /\bankles?\s+near|knees\s+pulled\s+up|shoulders\b/i;

/**
 * Clothes a nude duo beat still names ("cocktail dress around her waist", "dress pushed up"). The
 * recipe says "completely nude"; with both, Rapid drew underwear or a skirt at the waist 3/3,
 * and 0/3 with the clause gone (2026-10-07).
 */
const WORN_CLOTHES_CLAUSE_RE =
  /,?\s*(?:her\s+|his\s+)?(?:[\w-]+\s+)?(?:dress|skirt|shirt|top|robe|slip|lingerie|panties|underwear)\s+(?:pushed|hiked|bunched|rucked|pulled)?\s*(?:up\s+)?(?:around\s+(?:her|his)\s+(?:waist|hips|ankles)|pushed\s+up|hiked\s+up|half[- ]off)\b/gi;

const CLOTHES_RE =
  /\bin\s+(?!his\b)((?:(?:a|an|her)\s+)?(?:(?!\bin\b)[^,;—.])*?\b(?:sleepwear|robe|lingerie|shirt|dress|slip|camisole|shorts|panties|wear|sundress|towel wrap)\b(?:(?!\bin\b)[^,;—.])*?)(?=\s+(?:by|on|at|during|after|eating|pouring|facing|hugging|removing|with)\b|[,;—.]|$)/i;

/** The outfit a clothed beat names ("in lingerie under an open shirt"), or null. */
export function suggestiveBeatClothes(beat: string): string | null {
  const text = stripNegatedClauses(beat);
  const named = text.match(CLOTHES_RE)?.[1]?.trim();
  if (named) {
    return named;
  }
  // "unzipping a dress halfway — lingerie visible", "short hem riding up", "dress strap slipping".
  const lingerie = /\blingerie\b/i.test(text);
  if (/\bdress\b|\bhem\b/i.test(text)) {
    const dress = /\bshort\s+hem\b/i.test(text) ? 'a short dress' : 'a dress';
    return lingerie ? `${dress} over lingerie` : dress;
  }
  if (lingerie) {
    return 'lingerie';
  }
  return /\bneckline\b/i.test(text) ? 'a low-cut top' : null;
}

/**
 * Compact clothed Suggestive recipe for Rapid AIO Edit Day stills. The ~6–7k Suggestive brief
 * (live 2026-09-29, v23) told Rapid to wear a "Keep/Image 2 outfit" that was not attached and a
 * "catalog wardrobe kit" that did not exist, so it invented bikinis and rompers; its zip-twist
 * header moved sill and window beats onto the bed; one coffee beat cloned a second woman.
 * The same stills replayed with this (~500 chars) kept the beat's room, pose and clothes.
 */
export function buildRapidSuggestiveRecipe(input: {
  beat: string | null | undefined;
  setting?: string | null;
  timeOfDay?: string | null;
  descriptor?: string | null;
  poseGuide?: boolean | RecipeImage;
  /** A garment packshot is attached (second image). */
  outfitImage?: RecipeImage | null;
  /** Slot outfit label; the beat's own clothes when absent. */
  outfit?: string | null;
  /** First image is a face crop (not a full plate whose clothes could leak). */
  faceOnly?: boolean;
  /** First image is an Outfit Keep plate: its clothes are the outfit. */
  outfitFromFirst?: boolean;
}): string | null {
  const raw = input.beat?.trim();
  if (!raw) {
    return null;
  }
  const beat = stripNegatedClauses(raw)
    .replace(/\bCast\s+alone\b/gi, 'alone')
    // "in a shop window reflection" drew the reflection as a second woman (live 2026-09-29, 3/3).
    .replace(/\bin\s+(?:a|the)\s+shop\s+window\s+reflection\b/gi, 'at a shop window')
    // A mirror got a second, front-facing "reflection" that reads as another woman (3/3).
    .replace(/\s+in\s+(?:a|the)\s+mirror\b/gi, '')
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;—-])(?:\s*[,;—-])+/g, '$1')
    .replace(/[\s,;—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const clothes = input.outfitImage
    ? `She wears the outfit from the ${input.outfitImage} image.`
    : input.outfitFromFirst
      ? 'She wears the outfit from the first image.'
      : outfitWords(input.outfit)
        ? `She wears ${withArticle(outfitWords(input.outfit))}.`
        : suggestiveBeatClothes(beat)
          ? `She wears ${suggestiveBeatClothes(beat)}.`
          : 'She is dressed as the moment says.';
  return [
    RAPID_SUGGESTIVE_RECIPE_MARK,
    'One woman alone, clothed.',
    suggestivePlacement(beat),
    clothes,
    // Suggestive stays clothed; said in the positive (CFG 1), see clothed-coverage.ts.
    SUGGESTIVE_COVERAGE_LINE,
    `Moment: ${beat}.`,
    recipeRoom(beat, rapidDuoSurface(beat), input.setting, input.timeOfDay),
    descriptorLine(input.descriptor),
    input.faceOnly === false && !input.outfitFromFirst
      ? 'Keep her face from the first image, not its clothes.'
      : 'Keep her face from the first image.',
    input.poseGuide
      ? `Match her body to the ${input.poseGuide === true ? 'second' : input.poseGuide} image (pose map).`
      : null,
    'Photorealistic photograph, natural skin.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\.\./g, '.');
}

/**
 * Vacation beats lead with their pose class ("SWIMMING freestyle …"). Say that body plainly:
 * the long brief's shared tail ("mid-dance both arms raised overhead …") floated a freestyle
 * swimmer on her back with her arms up and turned "KICKING through the surf" into a high kick.
 */
function vacationPlacement(beat: string): string | null {
  const b = beat.toLowerCase();
  const lounge =
    b.match(
      /\b(spa chaise|chaise|pool lounge|lounger|daybed|hammock|beach towel|sand towel|towel(?!\s+turban)|sofa|bed|pool float|float)\b/
    )?.[1] ?? null;
  const seat = rapidDuoSurface(beat);
  // "SEATED at a café table / the vanity": on a chair at it, not on top of it.
  const seatPhrase = !seat
    ? ''
    : /\b(?:table|desk|vanity|counter)$/.test(seat)
      ? ` on a chair at the ${seat}`
      : /\b(?:door|window|wall|floor)$/.test(seat) &&
          !/\b(?:stone|harbor|harbour)\s+wall$/.test(seat)
        ? ''
        : ` on the ${seat}`;
  const cls = beat
    .match(
      /^(SEATED|MID-STRIDE|RECLINING|RELAXING|DANCING|CLIMBING|WAVING|PERCHED|STRETCHING|KICKING|PADDLING|PEDALING|TOSSING|JUMPING|REACHING|SWIMMING)\b/i
    )?.[1]
    ?.toUpperCase();
  switch (cls) {
    case 'SWIMMING':
      return 'She swims face-down in the water, one arm reaching forward out of the water mid-stroke, head turned to the side for a breath.';
    case 'PEDALING':
      return 'She rides a bicycle, sitting on the saddle, both hands on the handlebars, feet on the pedals, full body and bike in frame.';
    case 'PADDLING':
      return 'She sits in a kayak on the water, holding the paddle with both hands, one blade dipped in the water.';
    case 'KICKING':
      return 'She walks through ankle-deep surf, kicking up a splash of water with one foot, arms out for balance.';
    case 'MID-STRIDE':
      return 'She walks mid-step, one foot ahead of the other, arms swinging, full body in frame.';
    case 'CLIMBING':
      // "one foot on the next step" stood her at the foot of the stairs; side view + a high
      // knee got the step up 3/3 (live 2026-09-29).
      return 'She walks up the stairs mid-step, seen from the side: one foot lifted onto the next step, knee bent high, body leaning forward, one hand on the rail.';
    case 'WAVING':
      return 'She stands waving, one arm raised high overhead, weight on one hip.';
    case 'DANCING':
      return 'She dances, both arms raised, one knee lifted, hips mid-sway.';
    case 'STRETCHING':
      return 'She stands stretching both arms overhead, weight on one leg.';
    case 'JUMPING':
      return 'She jumps mid-air, knees tucked up, both feet off the ground.';
    case 'TOSSING':
    case 'REACHING':
      return 'She stands reaching up with one arm high, the other arm out.';
    case 'RECLINING':
      // "RECLINING on the hotel bed on her side, head propped on one hand": "lies back … hips and
      // back on it" contradicted the beat and Rapid drew her on her front, feet up, 2/2; saying
      // the side got her on her side, head propped, 2/2 (pose report card 2026-10-03, Nora).
      if (/\bon\s+her\s+side\b/.test(b)) {
        return `She lies on her side on the ${lounge ?? 'lounge'}${
          /\bpropped\b/.test(b) ? ', head propped on one hand' : ''
        }, legs along it.`;
      }
      return `She lies back on the ${lounge ?? 'lounge'}, hips and back on it, one knee raised.`;
    case 'SEATED':
    case 'PERCHED':
      return `She sits${seatPhrase}, knees bent.`;
    case 'RELAXING':
      if (/\bfloat/.test(b)) {
        return 'She floats on her back on the water, arms out.';
      }
      if (/\bon\s+her\s+stomach\b/.test(b)) {
        return `She lies on her stomach on the ${lounge ?? 'beach towel'}.`;
      }
      if (lounge && !/\bbench\b/.test(b)) {
        return `She lies back on the ${lounge}, relaxed.`;
      }
      if (/\b(?:booth|counter|bench|upright|tub|paddleboard)\b/.test(b)) {
        return 'She sits, relaxed, as the moment says.';
      }
      return null;
    default:
      return null;
  }
}

/** "outfit-relaxed-fit-fuchsia-wrap-dress" (a kit id when the label is not loaded) → words. */
function outfitWords(outfit: string | null | undefined): string | null {
  const text = outfit?.trim();
  if (!text) {
    return null;
  }
  const words = /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(text)
    ? text.replace(/^(?:outfit|kit|look)-/, '').replace(/-/g, ' ')
    : text;
  // Kit labels carry trouser fit words: "low-rise powder blue slip dress" rendered a bodysuit
  // or underwear 9/9 on Rapid, "powder blue slip dress" a dress 6/6 (live 2026-09-29).
  return /\b(?:dress|gown|robe|romper|jumpsuit|playsuit)\b/i.test(words)
    ? words.replace(/\b(?:low|mid|high)[- ]rise\s+/gi, '')
    : words;
}

const VACATION_CLOTHES_RE =
  /\b((?:one-piece\s+|two-piece\s+)?swimsuit|bikini|sundress|evening\s+(?:dress|wear)|(?:short|slip|cocktail|maxi|wrap)\s+dress|dress|robe|sleepwear|travel\s+(?:clothes|hoodie|tank)|linen\s+shirt|silk\s+shirt|cover-up\s+over\s+(?:a\s+)?swimsuit)\b/i;

/** Clothes a scene needs whatever the Day's outfit is (the pool wants its swimsuit). */
const VACATION_SCENE_CLOTHES_RE = /\b(?:swimsuit|bikini|robe|sleepwear)\b/i;

/**
 * A Vacation scene that dresses her itself, whatever the Day's outfit is: it names a swimsuit,
 * robe or sleepwear, or it is a water / beach-lounging scene that names no clothes (a swimsuit).
 * Such a still cannot start from the dressed plate — the plate wears the picked outfit.
 */
export function vacationBeatDressesItself(beat: string | null | undefined): boolean {
  const text = beat ?? '';
  const named = text.match(VACATION_CLOTHES_RE)?.[1];
  if (named) return VACATION_SCENE_CLOTHES_RE.test(named);
  return /\b(?:pool|swim\w*|float\w*|surf|paddleboard|beach\s+(?:towel|umbrella)|towel)\b/i.test(
    text
  );
}

/**
 * Compact Vacation recipe for Rapid AIO Edit Day stills — the clothed twin of the Suggestive one.
 * The ~6–8k Vacation brief (live 2026-09-29, v23) named the auto kit by its id
 * ("outfit-relaxed-fit-fuchsia-wrap-dress") with no packshot attached, so Rapid put swimsuits
 * on café beats and sundresses in the pool, cloned a second woman beside a bike, and its shared
 * dance tail lifted arms on swimmers.
 */
export function buildRapidVacationRecipe(input: {
  beat: string | null | undefined;
  setting?: string | null;
  timeOfDay?: string | null;
  descriptor?: string | null;
  poseGuide?: boolean | RecipeImage;
  outfitImage?: RecipeImage | null;
  outfit?: string | null;
  faceOnly?: boolean;
  outfitFromFirst?: boolean;
}): string | null {
  const raw = input.beat?.trim();
  if (!raw) {
    return null;
  }
  const beat = stripNegatedClauses(raw)
    .replace(/\bCast\s+alone\b/gi, 'alone')
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;—-])(?:\s*[,;—-])+/g, '$1')
    .replace(/[\s,;—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // The beat's own clothes first: a pool beat wants its swimsuit, whatever kit the Day picked.
  // Water and beach-lounging beats that name no clothes wear a swimsuit, not the day's kit.
  // A garment the scene needs (swimsuit, robe, sleepwear) always wins. A passing "sundress" or
  // "dress" — about 30 of the 110 Vacation scenes say one — only dresses her when the Day has no
  // outfit of its own: with a clothing photo or kit picked it used to overrule it ("she wears a
  // sundress"), and the chosen dress was lost.
  const beatClothes = beat.match(VACATION_CLOTHES_RE)?.[1];
  const hasDayOutfit = Boolean(
    input.outfitImage || input.outfitFromFirst || outfitWords(input.outfit)
  );
  const deferToDayOutfit =
    Boolean(beatClothes) && hasDayOutfit && !VACATION_SCENE_CLOTHES_RE.test(beatClothes ?? '');
  const named = deferToDayOutfit
    ? undefined
    : (beatClothes ??
      (/\b(?:pool|swim\w*|float\w*|surf|paddleboard|beach\s+(?:towel|umbrella)|towel)\b/i.test(beat)
        ? 'swimsuit'
        : undefined));
  const clothes = named
    ? `She wears ${withArticle(named.replace(/^(?:travel\s+)?clothes$/i, 'travel clothes'))}.`
    : input.outfitImage
      ? `She wears the outfit from the ${input.outfitImage} image.`
      : input.outfitFromFirst
        ? 'She wears the outfit from the first image.'
        : outfitWords(input.outfit)
          ? `She wears ${withArticle(outfitWords(input.outfit))}.`
          : 'She wears a light summer outfit.';
  const moment = (
    deferToDayOutfit
      ? // The moment must not name a different garment than the one she is dressed in.
        beat.replace(
          new RegExp(
            String.raw`(?:\b(?:an?|the|her)\s+)?(?:short\s+)?` + VACATION_CLOTHES_RE.source,
            'gi'
          ),
          'her outfit'
        )
      : beat
  ).replace(/^([A-Z][A-Z-]+)\b/, word => word.toLowerCase());
  return [
    RAPID_VACATION_RECIPE_MARK,
    'One woman alone on vacation.',
    vacationPlacement(beat),
    clothes,
    `Moment: ${moment}.`,
    input.setting?.trim() ? `Place: ${input.setting.trim()}.` : null,
    descriptorLine(input.descriptor),
    input.faceOnly === false && !input.outfitFromFirst && !input.outfitImage
      ? 'Keep her face from the first image, not its clothes.'
      : 'Keep her face from the first image.',
    input.poseGuide
      ? `Match her body to the ${input.poseGuide === true ? 'second' : input.poseGuide} image (pose map).`
      : null,
    'Photorealistic photograph, natural skin.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\.\./g, '.');
}

/**
 * Adult layouts on Rapid whose pose map fights the words, so the still is made from the words
 * alone (live replays):
 * - spoon — the flat map with the lifted-leg wording tangled legs (03054: 1/3 → 0/3).
 * - prone — the side-view map can't say face-down; with it she came face-up 3/4, without 0/4.
 * - wall — the map draws two people standing straight side by side, and they posed beside each
 *   other (8 of 12 sweep beats, both seeds); no map + side-view wording, in contact 4/4; two men
 *   the same (2/2). Two women in contact 2/2 with the map, so they keep it.
 * Klein spoon already runs without one.
 */
export function rapidAdultSkipsPoseGuide(input: {
  model: string | null | undefined;
  adultMood: boolean;
  beat: string | null | undefined;
  /** Same-sex pairs: two women kept the wall map (in contact 2/2 with it); two men posed apart. */
  pairing?: 'two-women' | 'two-men' | null;
}): boolean {
  if (!input.adultMood || !/rapid/i.test(input.model ?? '')) return false;
  const layout = parseIntimateLayout(input.beat ?? '');
  return (
    layout === 'spoon' || layout === 'prone' || (layout === 'wall' && input.pairing !== 'two-women')
  );
}

const WALKING_RE = /\b(?:walk(?:s|ing)?|stroll(?:s|ing)?|wander(?:s|ing)?)\b/i;
const HAND_IN_HAND_RE =
  /\b(?:hand[- ]in[- ]hand|hold(?:s|ing)?\s+hands|fingers\s+(?:laced|interlaced|linked)|hands\s+(?:linked|joined))\b/i;

/**
 * Walking hand in hand on Edit 2511: the hold_hands pose map draws two people standing still, and
 * "match their bodies to the pose map" froze every walk into a posed side-by-side portrait (0/3).
 * Without the map and with a side-on stride line, 3/3 walked mid-stride (live 2026-10-07).
 */
export function dayWalkingHandInHandBeat(beat: string | null | undefined): boolean {
  const text = beat ?? '';
  return WALKING_RE.test(text) && HAND_IN_HAND_RE.test(text);
}

export function dayWalkingDuoSkipsPoseGuide(
  model: string | null | undefined,
  beat: string | null | undefined
): boolean {
  return (
    /\b(?:qwen-image-edit-2511|qwen_image_edit_2511)/i.test(model ?? '') &&
    dayWalkingHandInHandBeat(beat)
  );
}

const WALKING_DUO_LINE =
  'They walk past the camera, seen from the side in three-quarter view, both mid-stride — one foot lifted off the ground, arms swinging, looking at each other and laughing. Candid photo caught in motion.';

/**
 * Compact two-person recipe for clothed Everyday / Vacation / Sport / themed Day stills (Qwen
 * Edit 2511): the Suggestive couple recipe's shape without the "affectionate" framing, under the
 * Day mark. Who is who, what each wears, the moment and the place — once each.
 */
export function buildCompactDayDuoRecipe(
  input: Parameters<typeof buildRapidSuggestiveDuoRecipe>[0]
): string | null {
  const recipe = buildRapidSuggestiveDuoRecipe(input);
  // A friends beat stays friends: the couple recipe names a same-sex partner "his boyfriend" /
  // "her girlfriend", and two men walking with coffees were drawn holding hands.
  const friends =
    /\bfriends?\b/i.test(input.beat ?? '') &&
    !/\b(?:date|dating|kiss\w*|romantic|lover|boyfriend|girlfriend|husband|wife|couple)\b/i.test(
      input.beat ?? ''
    );
  if (!recipe) return null;
  // Every Day pair is written as a Day photo, not the Suggestive couple: "affectionate" under the
  // Suggestive mark made a friend beat ("clinking glasses with a friend at the wine bar") a date.
  const day = recipe
    .replace(RAPID_SUGGESTIVE_RECIPE_MARK, DAY_CLOTHED_RECIPE_MARK)
    .replace('both fully clothed, affectionate.', 'both fully clothed, both fully in frame.')
    .replace(/\bwears a flirty dress\b/, 'wears everyday clothes')
    // Vacation beats lead with a CAPS stance word; the room line keeps only indoor rooms.
    .replace(/Moment: ([A-Z][A-Z-]+)\b/, (_, word: string) => `Moment: ${word.toLowerCase()}`)
    .replace(
      ' Photorealistic photograph',
      input.setting?.trim() && !recipe.includes(input.setting.trim())
        ? ` Place: ${input.setting.trim().replace(/[.\s]+$/, '')}. Photorealistic photograph`
        : ' Photorealistic photograph'
    );
  const moving =
    dayWalkingHandInHandBeat(input.beat) && !input.poseGuide
      ? day.replace(/(Moment: [^.]*\.)/, `$1 ${WALKING_DUO_LINE}`)
      : day;
  return friends
    ? moving
        .replace(/\b(boy|girl)friend\b/g, 'friend')
        // A beat typed for a man lead ("from his friend") comes through the two-men rewrite
        // as "his friend's friend".
        .replace(/\b(his|her) friend's friend\b/g, '$1 friend')
    : moving;
}

/**
 * A beat that has her lying down ("lying on the rug", "propped back on her elbows on the grass").
 * Not a sprawl in a chair — that is a sit.
 */
export function beatLiesDown(beat: string | null | undefined): boolean {
  const text = stripNegatedClauses(beat ?? '');
  return (
    /\b(?:lying|lies|laying|reclining)\b|\bpropped\s+back\s+on\s+(?:her|both)\s+elbows\b/i.test(
      text
    ) ||
    (/\bsprawled\b/i.test(text) && !/\b(?:arm)?chair\b/i.test(text))
  );
}

/** What she lies on: the beat's furniture, else a blanket, towel or the grass. */
function lyingSurface(beat: string): string | null {
  return (
    rapidDuoSurface(beat) ??
    stripNegatedClauses(beat)
      .match(
        /\b(?:on|onto|across|in)\s+(?:the|a|an|her)\s+((?:[\w-]+\s+)?(?:blanket|towel|grass|lawn|sand|mat|hammock|lounger|deck|dock|pier|meadow))\b/i
      )?.[1]
      ?.toLowerCase() ??
    null
  );
}

/**
 * A lying beat as a whole-body sentence. "She lies on her back." alone came out sitting up on
 * Qwen-Image 2.1 (Day Everyday, live 2026-10-03): the body has to be said horizontal, along the
 * surface, with the head down on it.
 */
function lyingPlacement(beat: string): string | null {
  const b = stripNegatedClauses(beat).toLowerCase();
  if (!beatLiesDown(b)) return null;
  const surface = lyingSurface(beat);
  const on = surface ? ` on the ${surface}` : '';
  const along = surface ? ' along it' : '';
  // The beat's own legs win ("one knee up", "ankles crossed", "feet up on the armrest").
  const legs = /\b(?:knees?|ankles?|feet|legs?)\b/.test(b) ? '' : ', legs stretched out';
  if (/\b(?:lying|lies|laying)\s+on\s+her\s+side\b/.test(b)) {
    return `She lies on her side${on}, whole body horizontal${along}, head propped on one hand — not sitting.`;
  }
  if (/\b(?:lying|lies|laying)\s+(?:on\s+her\s+(?:stomach|front)|face[\s-]down)\b/.test(b)) {
    return `She lies on her stomach${on}, whole body horizontal${along}, propped on her forearms — not sitting.`;
  }
  if (/\bpropped\s+(?:back\s+|up\s+)?on\s+(?:her|both)\s+elbows\b/.test(b)) {
    return `She lies back${on}, propped up on both elbows, whole body horizontal${along}${legs} — not sitting.`;
  }
  return `She lies flat on her back${on}, whole body horizontal, head resting ${surface ? 'on it' : 'down'}${legs} — not sitting.`;
}

/** A plain-words stance for an everyday beat ("sitting on a park bench …"), when it names one. */
function everydayPlacement(beat: string, setting?: string | null): string | null {
  const b = beat.toLowerCase();
  const seat = rapidDuoSurface(beat);
  const lying = lyingPlacement(beat);
  if (lying) return lying;
  if (/\bkneel(?:s|ing)?\b/.test(b)) {
    // "on the floor" outdoors read as a room (a kneel on the park lawn, the pavement).
    const venue = sceneVenue(setting);
    const kneel = venue && !surfaceFitsVenue('floor', venue) ? sceneSurfaces(setting)?.kneel : null;
    return `She kneels ${kneel ?? 'on the floor'}.`;
  }
  if (/\b(?:crouch|squat)(?:es|s|ing|ting)?\b/.test(b)) return 'She crouches low, knees bent deep.';
  if (/\b(?:sitting|sits|seated|perched)\b/.test(b)) {
    // "sitting at the counter": on a stool at it, not up on top of it.
    const atIt =
      seat &&
      /\b(?:table|desk|counter)$/.test(seat) &&
      new RegExp(String.raw`\bat\s+(?:the|a|an)\s+${seat}\b`, 'i').test(beat);
    if (atIt)
      return `She sits on a ${/counter$/.test(seat) ? 'stool' : 'chair'} at the ${seat}, knees bent.`;
    if (seat && !/\b(?:door|window|wall|floor)$/.test(seat))
      return `She sits on the ${seat}, knees bent.`;
    // A seat the furniture list does not name ("on the fountain's edge", "on a low step" — the
    // Setting's own seat, scene-surface.ts): said as the beat says it.
    const own =
      /\b(?:sitting|sits|seated|perched)\s+(?:cross-legged\s+)?((?:on|in)\s+(?:the|a|an)\s+[\w’'-]+(?:\s+[\w’'-]+){0,2}?)(?=\s+(?:with|eating|reading|taking|after|under|at|to|in|and)\b|[,.;—]|$)/i.exec(
        beat
      )?.[1];
    return `She sits${own && !/\b(?:door|window|wall|floor)$/i.test(own) ? ` ${own}` : ''}, knees bent.`;
  }
  if (/\b(?:walking|walks|strolling|mid-stride|striding)\b/.test(b)) {
    return 'She walks mid-step, one foot ahead of the other, full body in frame.';
  }
  if (/\b(?:running|jogging|sprinting)\b/.test(b)) {
    return 'She runs mid-stride, one knee driving forward, arms pumping, full body in frame.';
  }
  return null;
}

/**
 * Compact recipe for clothed Everyday / Sport / themed Day stills on Qwen Edit 2511 — the same
 * shape as the Vacation one. The ~5k brief lost the pose on 2511 (see pose-model-profile:
 * compactClothedRecipes); stating the stance, the clothes, the moment and the place once held it.
 */
export function buildCompactDayRecipe(input: {
  beat: string | null | undefined;
  setting?: string | null;
  descriptor?: string | null;
  poseGuide?: boolean | RecipeImage;
  outfitImage?: RecipeImage | null;
  outfit?: string | null;
  faceOnly?: boolean;
  outfitFromFirst?: boolean;
  /**
   * Sport days: what she wears for the sport ("climbing sportswear and climbing shoes"). Sport
   * replaces the Day outfit, and the still is mid-action, not a posed portrait.
   */
  sportKit?: string | null;
}): string | null {
  const raw = input.beat?.trim();
  if (!raw) {
    return null;
  }
  const beat = stripNegatedClauses(raw)
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;—-])(?:\s*[,;—-])+/g, '$1')
    .replace(/[\s,;—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // A kit can arrive as a full description: keep its first sentence, as plain words.
  const kit = outfitWords(input.outfit)
    ?.split(/(?<=[.!?])\s+/)[0]
    ?.replace(/[.\s]+$/, '')
    .replace(/^(?:an?|the)\s+/i, '')
    .replace(/^[A-Z](?=[a-z])/, letter => letter.toLowerCase());
  const sportKit = input.sportKit?.trim();
  const clothes = sportKit
    ? `She wears ${sportKit}.`
    : input.outfitImage
      ? `She wears the outfit from the ${input.outfitImage} image.`
      : input.outfitFromFirst
        ? 'She wears the outfit from the first image.'
        : kit
          ? `She wears ${withArticle(kit)}.`
          : 'She wears everyday clothes.';
  const moment = beat.replace(/^([A-Z][A-Z-]+)\b/, word => word.toLowerCase());
  return [
    DAY_CLOTHED_RECIPE_MARK,
    sportKit ? 'One woman alone, mid-action, playing sport.' : 'One woman alone.',
    vacationPlacement(beat) ?? everydayPlacement(beat, input.setting),
    clothes,
    `Moment: ${moment}.`,
    input.setting?.trim() ? `Place: ${input.setting.trim()}.` : null,
    descriptorLine(input.descriptor),
    input.faceOnly === false && !input.outfitFromFirst && !input.outfitImage
      ? 'Keep her face from the first image, not its clothes.'
      : 'Keep her face from the first image.',
    input.poseGuide
      ? `Match her body to the ${input.poseGuide === true ? 'second' : input.poseGuide} image (pose map).`
      : null,
    'Photorealistic photograph, natural skin.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\.\./g, '.');
}

/** His clothes for a clothed couple beat — the beat only ever dresses her. */
function partnerClothes(beat: string, noun: DayPartnerNoun = 'man'): string {
  if (/\b(?:evening|dinner|rooftop|bar|hotel|candlelit|night\s+out)\b/i.test(beat)) {
    return noun === 'woman' ? 'a dark evening dress' : 'a dark button-up shirt and trousers';
  }
  if (
    /\b(?:sleepwear|pajamas?|pyjamas?|sleep\s+shirt|oversized\s+shirt|bed|(?<!picnic\s)blanket|covers)\b/i.test(
      beat
    )
  ) {
    return 'a T-shirt and sleep pants';
  }
  return 'a casual shirt and jeans';
}

/**
 * Compact clothed couple recipe for Rapid Suggestive with "Duo · companions" on. The long
 * Suggestive brief says "never invent a man" in five places, so a couple beat had nothing to
 * stand on; this names both people, both outfits, and whose face is kept.
 */
export function buildRapidSuggestiveDuoRecipe(input: {
  beat: string | null | undefined;
  setting?: string | null;
  timeOfDay?: string | null;
  descriptor?: string | null;
  poseGuide?: boolean | RecipeImage;
  outfitImage?: RecipeImage | null;
  outfit?: string | null;
  faceOnly?: boolean;
  outfitFromFirst?: boolean;
  /** A Cast member as the second person (Day "Partner"), with the encoder image holding the face. */
  partner?: { partner: DayPartner; image: RecipeImage } | null;
  /**
   * The Cast lead (default a woman). The couple is written for this pair — two women, two men,
   * or either way round — so the finished prompt is not gender-swapped afterwards.
   */
  lead?: DayPartnerNoun;
}): string | null {
  const raw = input.beat?.trim();
  if (!raw) {
    return null;
  }
  const leadMan = input.lead === 'man';
  const lead: 'man' | 'woman' = leadMan ? 'man' : 'woman';
  const partnerNoun: DayPartnerNoun = input.partner?.partner.noun ?? (leadMan ? 'woman' : 'man');
  const sameSex = partnerNoun === lead;
  const cleaned = stripNegatedClauses(raw)
    .replace(/\bCast\b/g, 'she')
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;—-])(?:\s*[,;—-])+/g, '$1')
    .replace(/[\s,;—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Beats are written for a woman with a man: two women / two men name the partner instead of
  // "him", and a man lead takes her part.
  const beat = sameSex
    ? leadMan
      ? twoMenBeat(cleaned)
      : twoWomenBeat(cleaned)
    : leadMan
      ? masculineClothes(swapDayPromptGender(cleaned))
      : cleaned;
  const leadWears = input.outfitImage
    ? `the outfit from the ${input.outfitImage} image`
    : input.outfitFromFirst
      ? 'the outfit from the first image'
      : (outfitWords(input.outfit) ??
        (leadMan ? null : suggestiveBeatClothes(cleaned)) ??
        (leadMan ? 'a fitted shirt and trousers' : 'a flirty dress'));
  // One name for a same-sex partner in every line — "another woman" up top, "her girlfriend" in
  // the beat and "the other woman" in the face line read as three people (3 women 6/6 → 4/6).
  const sameSexName = leadMan ? 'his boyfriend' : 'her girlfriend';
  const other =
    partnerNoun === 'person' ? 'another person' : sameSex ? sameSexName : `a ${partnerNoun}`;
  const otherWears =
    partnerNoun === 'person'
      ? 'the other wears'
      : sameSex
        ? `${sameSexName} wears`
        : partnerNoun === 'man'
          ? 'he wears'
          : 'she wears';
  const leadPronoun = leadMan ? 'He' : 'She';
  const leadPossessive = leadMan ? 'his' : 'her';
  const otherWho =
    partnerNoun === 'person' ? 'the other person' : sameSex ? sameSexName : `the ${partnerNoun}`;
  const otherPossessive = partnerNoun === 'man' ? 'his' : partnerNoun === 'woman' ? 'her' : 'their';
  const descriptor = descriptorLine(input.descriptor);
  return [
    RAPID_SUGGESTIVE_RECIPE_MARK,
    `A ${lead} and ${other} together, both fully clothed, affectionate.`,
    suggestiveDuoPlacement(beat),
    `Moment: ${beat}.`,
    `${leadPronoun} wears ${withArticle(leadWears)}; ${otherWears} ${partnerClothes(beat, partnerNoun)}.`,
    recipeRoom(beat, rapidDuoSurface(beat), input.setting, input.timeOfDay),
    leadMan ? descriptor?.replace(/^The woman:/, 'The man:') : descriptor,
    input.partner
      ? dayPartnerRecipeLine(input.partner.partner, input.partner.image, otherWho, lead)
      : input.faceOnly === false && !input.outfitFromFirst && !input.outfitImage
        ? `Keep ${leadPossessive} face from the first image, not its clothes; ${otherWho} has ${otherPossessive} own face.`
        : `Keep ${leadPossessive} face from the first image; ${otherWho} has ${otherPossessive} own face.`,
    input.poseGuide
      ? `Match their two bodies to the ${input.poseGuide === true ? 'second' : input.poseGuide} image (pose map).`
      : null,
    'Photorealistic photograph, natural skin.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\.\./g, '.');
}
