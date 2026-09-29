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
import {
  parseIntimateLayout,
  resolveSoloMasturbationPoseKind,
  type IntimateLayout,
  type SoloMasturbationPoseKind,
} from './day-pose-guide';
import { stripNegatedClauses } from './negated-clauses';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import {
  RAPID_DUO_RECIPE_MARK,
  RAPID_SOLO_RECIPE_MARK,
  RAPID_SUGGESTIVE_RECIPE_MARK,
  RAPID_VACATION_RECIPE_MARK,
} from './rapid-duo-recipe-mark';

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
  /\b(?:sixty[- ]nine|69|face[- ]sitting(?:\s+(?:a|her)\s+partner)?|sitting\s+on\s+(?:his|her|their)\s+face)\b/gi;

export {
  isRapidDuoRecipePrompt,
  RAPID_DUO_RECIPE_MARK,
  RAPID_SOLO_RECIPE_MARK,
  RAPID_SUGGESTIVE_RECIPE_MARK,
  RAPID_VACATION_RECIPE_MARK,
} from './rapid-duo-recipe-mark';

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
      // "Both lie on their sides" put her on her back with him beside her head (live
      // 2026-09-28, most seeds on v23); placing each body in turn gave 6/6 real spooning.
      return `Spooning, seen from the front. The woman lies on her side on ${on('bed')}, turned toward the camera, her head on her lower arm and her hip up; the man lies on his side right behind her, his chest pressed against her back and his face just behind her shoulder; he penetrates her from behind as she lifts her top leg, bent at the knee, his hand holding it up under her thigh. Both faces in frame.`;
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
    case 'facesit':
      // Rapid cannot draw a 69, and on v23 face-sitting came back as a kiss or cowgirl too
      // (live 2026-09-28: 0/8 across wordings, with and without the guide). The seated oral
      // pose lands every time, so the oral beat stays readable (guide: day-slot-pose.ts).
      return `Full-body view, both faces in frame. The woman sits on the edge of the ${/\b(?:couch|sofa|living[- ]room)\b/i.test(beat) ? 'couch' : 'bed'}, leaning back on her hands with her thighs spread; the man kneels on the floor between her thighs with his mouth on her vulva, licking her, his hands on her thighs.`;
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
  const room = recipeRoom(beat, surface, input.setting, input.timeOfDay);
  return [
    RAPID_DUO_RECIPE_MARK,
    body,
    // "doggy" paints literal dogs on Qwen stacks; a 69 / face-sit beat renders as seated oral.
    `Moment: ${beat
      .replace(/\bdoggy(?:[- ]?style)?\b/gi, 'from behind')
      .replace(
        layout === 'sixty_nine' || layout === 'facesit' ? RAPID_ORAL_FALLBACK_RE : /$^/,
        'oral sex'
      )}.`,
    room,
    input.nude === false ? clothedLine(input.outfitImage) : NUDE,
    descriptorLine(input.descriptor),
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
    return 'She lies face-down on a pile of clean laundry and towels on the floor, hips pressed into it, face turned toward the camera.';
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
      return `She lies on her back on ${on('bed')}, head on the pillow, knees bent and thighs spread wide.`;
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
  return [
    RAPID_SOLO_RECIPE_MARK,
    'One woman alone, masturbating.',
    soloPlacement(kind, beat, surface),
    soloHands(beat, input.toy === true, kind),
    ownGaze ? null : 'Eyes half-closed, looking down at her body.',
    `Moment: ${beat}.`,
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
  const surface = rapidDuoSurface(beat);
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
  const named =
    beat.match(VACATION_CLOTHES_RE)?.[1] ??
    (/\b(?:pool|swim\w*|float\w*|surf|paddleboard|beach\s+(?:towel|umbrella)|towel)\b/i.test(beat)
      ? 'swimsuit'
      : undefined);
  const clothes = named
    ? `She wears ${withArticle(named.replace(/^(?:travel\s+)?clothes$/i, 'travel clothes'))}.`
    : input.outfitImage
      ? `She wears the outfit from the ${input.outfitImage} image.`
      : input.outfitFromFirst
        ? 'She wears the outfit from the first image.'
        : outfitWords(input.outfit)
          ? `She wears ${withArticle(outfitWords(input.outfit))}.`
          : 'She wears a light summer outfit.';
  const moment = beat.replace(/^([A-Z][A-Z-]+)\b/, word => word.toLowerCase());
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

/** His clothes for a clothed couple beat — the beat only ever dresses her. */
function partnerClothes(beat: string): string {
  if (/\b(?:evening|dinner|rooftop|bar|hotel|candlelit|night\s+out)\b/i.test(beat)) {
    return 'a dark button-up shirt and trousers';
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
}): string | null {
  const raw = input.beat?.trim();
  if (!raw) {
    return null;
  }
  const beat = stripNegatedClauses(raw)
    .replace(/\bCast\b/g, 'she')
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;—-])(?:\s*[,;—-])+/g, '$1')
    .replace(/[\s,;—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const hers = input.outfitImage
    ? `the outfit from the ${input.outfitImage} image`
    : input.outfitFromFirst
      ? 'the outfit from the first image'
      : (outfitWords(input.outfit) ?? suggestiveBeatClothes(beat) ?? 'a flirty dress');
  return [
    RAPID_SUGGESTIVE_RECIPE_MARK,
    'A woman and a man together, both fully clothed, affectionate.',
    `Moment: ${beat}.`,
    `She wears ${withArticle(hers)}; he wears ${partnerClothes(beat)}.`,
    recipeRoom(beat, rapidDuoSurface(beat), input.setting, input.timeOfDay),
    descriptorLine(input.descriptor),
    input.faceOnly === false && !input.outfitFromFirst && !input.outfitImage
      ? 'Keep her face from the first image, not its clothes; the man has his own face.'
      : 'Keep her face from the first image; the man has his own face.',
    input.poseGuide
      ? `Match their two bodies to the ${input.poseGuide === true ? 'second' : input.poseGuide} image (pose map).`
      : null,
    'Photorealistic photograph, natural skin.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\.\./g, '.');
}
