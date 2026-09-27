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
import { parseIntimateLayout, type IntimateLayout } from './day-pose-guide';
import { stripNegatedClauses } from './negated-clauses';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import { RAPID_DUO_RECIPE_MARK } from './rapid-duo-recipe-mark';

export { isRapidDuoRecipePrompt, RAPID_DUO_RECIPE_MARK } from './rapid-duo-recipe-mark';

const SURFACE_RE =
  /\b(?:on|onto|against|over|across|in|into|off|at)\s+(?:the|a|an|his|her|their)\s+((?:(?:arm|edge|foot|end)\s+of\s+the\s+(?:bed|couch|sofa|chair))|(?:(?!(?:at|on|in|of|the|a|an|to|by|with)\b)[\w’'-]+\s+){0,2}?(?:bed(?:\s+edge)?|daybed|couch|sofa|armchair|chair|sink|counter|desk|table|wall|floor|rug|shower|window|door|fridge|wardrobe|cabinet|stairs|bench|vanity|dresser|mattress|sheets))\b/i;

/** The furniture the beat puts them on ("the hotel armchair", "the bathroom sink"). */
export function rapidDuoSurface(beat: string): string | null {
  const match = stripNegatedClauses(beat).match(SURFACE_RE)?.[1]?.trim();
  if (!match) {
    return null;
  }
  const noun = match.replace(/\s+/g, ' ').toLowerCase();
  return noun === 'sheets' || noun === 'mattress' ? 'bed' : noun;
}

/** She gives ("she goes down on him", "giving her partner oral") vs he gives ("going down on her"). */
function sheGivesOral(beat: string): boolean {
  return (
    /\b(?:she|her)\s+(?:goes|going|went)\s+down\s+on\s+(?:him|her\s+partner|a\s+partner)\b|\bgiving\s+(?:him|her\s+partner|a\s+partner)\s+(?:oral|head|a\s+blow)|\bbetween\s+his\s+(?:legs|knees|thighs)\b|\b(?:blow\s*job|fellatio|sucking\s+(?:him|his))\b/i.test(
      beat
    ) &&
    !/\b(?:down\s+on\s+her\b(?!\s+partner)|between\s+her\s+thighs|mouth\s+on\s+her\b|cunnilingus)/i.test(
      beat
    )
  );
}

function placement(layout: IntimateLayout, beat: string, surface: string | null): string | null {
  const on = (fallback: string) => `the ${surface ?? fallback}`;
  switch (layout) {
    case 'missionary':
      return `Side view, both faces in frame. The woman lies on her back on ${on('bed')} with her legs spread and wrapped around him; the man lies on top of her, his chest over her chest and his hips between her thighs, propped up on his forearms, his penis inside her; their faces close, looking at each other.`;
    case 'mating_press':
      return `The woman lies on her back on ${on('bed')} with her knees pulled up toward her shoulders; the man kneels over her between her legs, leaning his weight onto the backs of her thighs, his penis inside her; both faces in frame.`;
    case 'straddle':
      return `Wide shot, both faces in frame. The man lies flat on his back on ${on('bed')}; the woman kneels astride his hips with her knees on either side of him, sitting down on his penis and riding him, her hands on his chest, looking down at him.`;
    case 'reverse_straddle':
      return `Reverse cowgirl, camera in front of the woman. The woman is closest to the camera, facing the lens, sitting on the lap of the man who sits back on ${on('couch')} behind her; her back rests against his chest, legs spread, riding his penis; his face is behind her shoulder and his hands on her hips.`;
    case 'bent':
      return `The woman stands bent forward over ${on('bed edge')}, hands braced on it, hips pushed back; the man stands close behind her holding her hips, penetrating her from behind. She looks back over her shoulder.`;
    case 'standing':
      // Story's standing guide is two upright bodies side by side — say how they join.
      return `Both stand. The woman leans forward with her hands braced on ${on('wall')}, hips pushed back; the man stands close behind her holding her hips, penetrating her from behind; she looks back over her shoulder.`;
    case 'prone':
      return `The woman lies flat on her stomach on ${on('bed')}, face turned to the side on the pillow; the man lies on top of her back, propped up on his arms, penetrating her from behind.`;
    case 'spoon':
      return `Both lie on their sides on ${on('bed')}, facing the camera, both faces in frame: the man lies behind the woman with his chest against her back and one arm around her waist, penetrating her from behind; her top leg is lifted over his.`;
    case 'scissors':
      return `The woman and the man sit on ${on('bed')} facing each other, each leaning back on their hands, their legs scissored together so their hips press together mid-sex; both faces in frame.`;
    case 'wall':
      return /\b(?:partner\s+behind|from\s+behind)\b/i.test(beat)
        ? `The woman stands facing ${on('wall')} with her palms flat against it and her hips pushed back; the man stands pressed against her back, penetrating her from behind; she looks back over her shoulder. Both standing on the floor.`
        : `The woman stands with her back pressed flat against ${on('wall')}, one leg lifted and hooked around his hip; the man stands facing her, pressed against her, holding her lifted thigh, his penis inside her. Both standing on the floor.`;
    case 'lift':
      return `Wide shot, both faces in frame. The man stands holding the woman up by her thighs, facing each other chest to chest; her legs are wrapped around his waist and her arms around his neck, her face beside his, his penis inside her.`;
    case 'oral':
      return sheGivesOral(beat)
        ? `The man sits on the edge of ${on('bed')}; the woman kneels on the floor between his knees with his penis in her mouth, holding it at the base, looking up at him.`
        : !/\bkneel/i.test(beat)
          ? `The woman lies on her back on ${on('bed')} with her thighs spread and knees bent; the man lies between her thighs with his mouth on her vulva, licking her, his hands on her thighs. She arches her back, eyes closed.`
          : // The oral guide always draws her upright and him kneeling — the text must agree, or
            // Rapid falls back to penetration. At a bed/couch she sits on its edge; else she stands.
            /\b(?:bed|mattress|sheets|couch|sofa|chair|armchair|counter|desk|table)\b/i.test(beat)
            ? `Full-body view, both faces in frame. The woman sits on the edge of the ${surface?.replace(/^(?:edge|foot|end|arm) of the /, '') ?? 'bed'}, leaning back on her hands with her thighs spread; the man kneels on the floor between her thighs with his mouth on her vulva, licking her, his hands on her thighs.`
            : `Full-body view, both faces in frame. The woman stands with her back against ${on('wall')}, one leg lifted over his shoulder; the man kneels on the floor in front of her with his mouth on her vulva, licking her, his hands on her thighs. She looks down at him.`;
    case 'sixty_nine':
    // Rapid cannot draw a 69 — every wording and ControlNet Union came back as a kiss, and
    // "facing his feet" muddled the bodies. Face-sitting keeps the mutual-oral beat readable.
    // falls through
    case 'facesit':
      return `Full-length side view from across the room, her whole body from head to knees in frame and his head visible. The man lies on his back on ${on('bed')}; the woman kneels upright astride his face, sitting on his mouth, facing up his body with her hands on his chest, her head tipped back.`;
    case 'kneeling':
      return `Both kneel upright on ${on('bed')} facing each other, bodies pressed together mid-sex, her arms around his neck and his hands on her hips; both faces in frame.`;
    case 'lap':
      return `The man sits on ${on('chair')}; the woman sits on his lap facing him, straddling him with her knees on either side of his hips, riding his penis, her arms around his neck.`;
    default:
      return null;
  }
}

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
 * Compact Rapid duo prompt, or null when the beat has no drawable two-person layout
 * (afterglow / undress / generic) — callers keep the full brief then.
 */
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
}): string | null {
  const beat = input.beat?.trim();
  if (!beat) {
    return null;
  }
  const layout = parseIntimateLayout(beat);
  if (!layout) {
    return null;
  }
  const surface = rapidDuoSurface(beat);
  const body = placement(layout, beat, surface);
  if (!body) {
    return null;
  }
  const beatNamesPlace =
    Boolean(
      surface && !/^(?:(?:unmade |rumpled |hotel )?(?:bed|daybed)|bed edge|sheets)$/i.test(surface)
    ) ||
    /\b(?:bathroom|kitchen|hallway|hotel|office|laundry|living[- ]room|shower|fridge|car|balcony|elevator)\b/i.test(
      beat
    );
  const room =
    !beatNamesPlace && input.setting?.trim()
      ? `Room: ${input.setting.trim()}.`
      : input.timeOfDay?.trim()
        ? `${input.timeOfDay.trim()[0]!.toUpperCase()}${input.timeOfDay.trim().slice(1)} light.`
        : null;
  return [
    RAPID_DUO_RECIPE_MARK,
    body,
    // "doggy" paints literal dogs on Qwen stacks.
    `Moment: ${beat.replace(/\bdoggy(?:[- ]?style)?\b/gi, 'from behind')}.`,
    room,
    input.nude === false ? clothedLine(input.outfitImage) : NUDE,
    input.descriptor?.trim() ? `The woman: ${input.descriptor.trim()}.` : null,
    'Keep her face from the first image.',
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
  });
}
