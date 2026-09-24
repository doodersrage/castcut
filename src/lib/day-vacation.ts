/**
 * Day mood “Vacation” — travel-day poses + venues by time of day.
 *
 * Large catalog of vacation-themed beats. Biases seated / mid-stride /
 * reclining / dancing / climbing / waving so Outfit Keep standing plates
 * don’t freeze every still. No kneeling-on-bed / hands-and-knees.
 */

import type { DaySlotId } from '@/lib/day-planner';
import { dayPartOf, type DayPart } from '@/lib/day-parts';

export type DayVacationActivity =
  | 'hotel'
  | 'pool'
  | 'beach'
  | 'market'
  | 'cafe'
  | 'boat'
  | 'city'
  | 'rooftop'
  | 'spa'
  | 'airport'
  | 'pier'
  | 'drive';

/** Activities that fit each Day slot’s light and pace. */
export const DAY_SLOT_VACATION_ACTIVITIES: Record<DayPart, readonly DayVacationActivity[]> = {
  morning: ['hotel', 'pool', 'beach', 'cafe', 'city', 'airport', 'spa', 'drive'],
  afternoon: ['market', 'pool', 'beach', 'boat', 'cafe', 'city', 'pier', 'drive', 'spa'],
  evening: ['rooftop', 'cafe', 'boat', 'city', 'hotel', 'pier', 'drive'],
  night: ['hotel', 'rooftop', 'city', 'pool', 'spa', 'cafe'],
};

type VacationScene = {
  activity: DayVacationActivity;
  beat: string;
  setting: string;
};

/**
 * Matched beat + venue — lead with a clear Image 3 verb (SEATED, MID-STRIDE,
 * RECLINING, RELAXING, DANCING, CLIMBING, WAVING, PERCHED, STRETCHING).
 */
const VACATION_SCENES: Record<DayPart, readonly VacationScene[]> = {
  morning: [
    {
      activity: 'spa',
      beat: 'RELAXING on a spa chaise in a robe with eyes half-closed — cucumber water nearby, towel turban, soft steam, quiet morning reset',
      setting: 'resort spa lounge with soft towels, potted palms, and frosted morning windows',
    },
    {
      activity: 'pool',
      beat: 'RELAXING on a pool lounge with an iced drink on the side table — one knee raised, one-piece swimsuit, face tipped toward sunrise',
      setting: 'resort pool deck at sunrise with lounge chairs and palm shadows',
    },
    {
      activity: 'cafe',
      beat: 'SEATED at a café terrace sipping morning coffee — hips on the chair, knees bent, legs crossed, one elbow on the table, sunglasses pushed up, laughing off-frame — never standing beside the table',
      setting: 'sunlit seaside café terrace with white chairs and potted plants',
    },
    {
      activity: 'pool',
      beat: 'RECLINING on a pool lounge — body lying flat on the chaise, hips and back on the cushion, one knee raised, paperback on her stomach, one-piece swimsuit, morning sparkle on the water — never standing beside the lounge',
      setting: 'resort pool deck at sunrise with lounge chairs and palm reflections',
    },
    {
      activity: 'beach',
      beat: 'MID-STRIDE barefoot on wet sand swinging a tote — WALKING mid-step one foot clearly ahead, opposite arm swing, sundress hem lifting, half-turned glance toward the boardwalk — never both feet planted',
      setting: 'quiet morning shoreline with soft waves and empty boardwalk behind',
    },
    {
      activity: 'beach',
      beat: 'KICKING through the morning surf — sundress hem wet, arms out for balance, laughing into the spray',
      setting: 'shallow morning surf line with soft waves and empty boardwalk behind',
    },
    {
      activity: 'pool',
      beat: 'SWIMMING freestyle mid-stroke in the resort pool — swimsuit, head turned for a breath, morning sparkle',
      setting: 'resort lap lane at sunrise with lane ropes and palm reflections',
    },
    {
      activity: 'drive',
      beat: 'PEDALING a rental bike along the promenade — sundress, basket on the handlebars, morning sea breeze',
      setting: 'seaside bike path with palm shadows and morning promenade rail',
    },
    {
      activity: 'hotel',
      beat: 'SEATED cross-legged on the hotel carpet beside an open suitcase — packing a sundress, facing the window',
      setting: 'bright hotel room with open suitcase and city view through sheer curtains',
    },
    {
      activity: 'hotel',
      beat: 'WAVING from the hotel balcony rail in a sundress — one arm raised high overhead, weight on one hip against the rail, coffee in the other hand — never arms at her sides',
      setting: 'hotel balcony at sunrise with white rail and terracotta roofs beyond',
    },
    {
      activity: 'city',
      beat: 'MID-STRIDE rolling a suitcase through the lobby — one foot ahead, coat over one arm mid-swing, looking toward the exit doors',
      setting:
        'bright boutique hotel lobby with marble floor and morning light through glass doors',
    },
    {
      activity: 'city',
      beat: 'SEATED on a scooter saddle parked in the old town — weight shifted, checking a phone map',
      setting: 'sunlit cobblestone street with café awnings and morning delivery bikes',
    },
    {
      activity: 'airport',
      beat: 'SEATED at the gate with a boarding pass and iced coffee — travel hoodie, carry-on at her feet, window glare on the tarmac',
      setting: 'airport gate seating with jet bridges and morning light through huge windows',
    },
    {
      activity: 'beach',
      beat: 'RELAXING on a beach towel with a sunhat over her face — body lying on the towel, knees drawn up, sunscreen bottle beside her, morning breeze — never standing beside the towel',
      setting: 'quiet cove beach with soft dunes and empty morning umbrellas',
    },
    {
      activity: 'pool',
      beat: 'STRETCHING both arms overhead at the pool ladder — swimsuit on, dripping water, laughing into sunrise',
      setting: 'resort pool edge at sunrise with wet tiles and palm reflections',
    },
    {
      activity: 'drive',
      beat: 'SEATED in a convertible passenger seat with the map open — wind in hair, sunglasses on, coastal morning light',
      setting: 'open convertible on a coastal road with ocean cliffs and morning haze',
    },
    {
      activity: 'hotel',
      beat: 'RELAXING on the balcony with a breakfast tray — croissant in hand, robe over sleepwear, city waking below',
      setting: 'hotel balcony breakfast setup with linen and a small espresso cup',
    },
    {
      activity: 'cafe',
      beat: 'MID-STRIDE leaving a bakery with a paper bag of pastries — sundress, sunglasses dangling, cobblestone bounce',
      setting: 'narrow old-town bakery street with morning delivery bikes and chalk menus',
    },
    {
      activity: 'pier',
      beat: 'PERCHED on a pier piling with fishing line idle — sundress, toes above the water, morning harbor quiet',
      setting: 'wooden pier at sunrise with calm harbor water and distant boats',
    },
    {
      activity: 'beach',
      beat: 'MID-STRIDE collecting shells in a straw hat — WALKING mid-step one foot clearly ahead opposite arm swing, tote hanging on the back arm, head tipped looking DOWN at wet sand sparkle, three-quarter body not square to camera — never arms-at-sides fashion stand staring at the lens',
      setting: 'tide-pool shoreline with clear shallow water and morning light',
    },
  ],
  afternoon: [
    {
      activity: 'hotel',
      beat: 'RELAXING in a hammock between palms with a paperback — one leg dangling, sundress, dappled afternoon light, eyes half-lidded',
      setting: 'hotel garden hammock between palms with filtered afternoon sun',
    },
    {
      activity: 'spa',
      beat: 'RELAXING in an outdoor soaking tub with citrus slices — head tipped back, towel turban, palm shade, quiet reset',
      setting: 'resort outdoor spa tub with stone rim and afternoon palm shadows',
    },
    {
      activity: 'pool',
      beat: 'SEATED on the pool edge kicking water — legs dangling, torso twisted toward a splash, swimsuit on, laughing mid-kick',
      setting: 'bright resort pool with turquoise water and white cabanas',
    },
    {
      activity: 'beach',
      beat: 'RECLINING under a striped beach umbrella — body lying on the towel, hips and back on the sand towel, propped on elbows, knees drawn up, applying sunscreen — never standing',
      setting: 'busy afternoon beach with umbrellas and soft dune grass behind',
    },
    {
      activity: 'market',
      beat: 'MID-STRIDE twisting through a market stall aisle with a tote — short hem, holding up fruit to inspect',
      setting: 'busy outdoor market with striped awnings and fruit crates',
    },
    {
      activity: 'city',
      beat: 'CLIMBING museum steps mid-stride — hand on the railing, camera strap bouncing, looking up toward the entrance',
      setting: 'grand museum staircase with bright afternoon light through tall windows',
    },
    {
      activity: 'cafe',
      beat: 'PERCHED on a stone wall above the harbor — one knee up, sundress, camera raised framing the boats',
      setting: 'harbor overlook with terracotta roofs and afternoon haze',
    },
    {
      activity: 'beach',
      beat: 'MID-STRIDE carrying two gelato cones along the boardwalk — sundress, sunglasses, weaving past empty benches',
      setting: 'sunny boardwalk with gelato carts and soft dune grass',
    },
    {
      activity: 'beach',
      beat: 'TOSSING a beach ball on the sand — sundress or swimsuit, arms raised mid-catch, afternoon heat',
      setting: 'open afternoon beach with umbrellas and soft dune grass behind',
    },
    {
      activity: 'pool',
      beat: 'JUMPING mid-air off the pool ledge — swimsuit, knees tucked, laughing into turquoise water',
      setting: 'bright resort pool with white cabanas and splash-ready afternoon light',
    },
    {
      activity: 'beach',
      beat: 'REACHING for a volleyball at the net — swimsuit, one arm high, sand kicked up, afternoon game',
      setting: 'beach volleyball court with net posts and hot afternoon sand',
    },
    {
      activity: 'boat',
      beat: 'PADDLING a kayak mid-stroke — travel tank, paddle dipped, harbor water flashing',
      setting: 'calm harbor kayak lane with afternoon sun and distant ferry wake',
    },
    {
      activity: 'boat',
      beat: 'SEATED on a ferry bench with wind in her hair — pointing at the distant coastline, travel clothes',
      setting: 'small ferry deck with open water and distant coastline',
    },
    {
      activity: 'boat',
      beat: 'RELAXING on a paddleboard floating in calm water — one knee up, paddle across her lap, swimsuit, afternoon sun',
      setting: 'calm turquoise bay with distant sailboats and sun glitter',
    },
    {
      activity: 'market',
      beat: 'SEATED at a market stool trying on sunglasses from a vendor tray — tote at her feet, short hem, afternoon heat',
      setting: 'shaded market stall with mirrored trays and hanging scarves',
    },
    {
      activity: 'drive',
      beat: 'SEATED on a scooter mid-ride through the old town — hair streaming, sundress, laughing into the wind',
      setting: 'winding cobblestone lane with laundry lines and afternoon sun shafts',
    },
    {
      activity: 'pier',
      beat: 'MID-STRIDE along a wooden pier with an ice-cream cone — walking mid-step one foot ahead, sundress, ocean breeze, gulls overhead',
      setting: 'sunny fishing pier with bait shops and bright afternoon water',
    },
    {
      activity: 'beach',
      beat: 'RELAXING in a beach cabana on a daybed — knees tucked, tote open, striped shade cloth overhead',
      setting: 'beach cabana with daybeds, striped curtains, and hot afternoon sand beyond',
    },
    {
      activity: 'city',
      beat: 'SEATED on cathedral steps sketching in a travel notebook — sundress, camera beside her, afternoon shade',
      setting: 'stone cathedral steps with pigeons and soft afternoon shade',
    },
    {
      activity: 'pool',
      beat: 'RELAXING on a pool float mid-lounge — one arm trailing in the water, swimsuit, drink in a cup holder, turquoise water',
      setting: 'resort pool with floating loungers and white cabana backs',
    },
  ],
  evening: [
    {
      activity: 'pier',
      beat: 'RELAXING on a pier bench watching the sunset — evening dress, shoes kicked off, golden water below, quiet pause',
      setting: 'wooden pier at golden hour with silhouetted boats and warm sky',
    },
    {
      activity: 'rooftop',
      beat: 'SEATED on a rooftop bar stool toasting a glass toward the skyline — evening wear, string lights, golden hour',
      setting: 'rooftop bar at golden hour with string lights and city skyline',
    },
    {
      activity: 'rooftop',
      beat: 'DANCING alone on a terrace at blue hour — both arms raised overhead, one knee lifted mid-kick, hips mid-sway, evening wear — never arms hanging at her sides',
      setting: 'hotel terrace at blue hour with distant lights and a low wall railing',
    },
    {
      activity: 'hotel',
      beat: 'SEATED on the hotel bed edge unzipping evening shoes — facing the lamp, travel clothes half-ready for dinner',
      setting: 'dim hotel suite with warm lamp and city glow through the window',
    },
    {
      activity: 'city',
      beat: 'MID-STRIDE crossing a plaza with a clutch — evening dress, glancing at a fountain, golden hour on stone',
      setting: 'old-town plaza at golden hour with a fountain and café lights coming on',
    },
    {
      activity: 'beach',
      beat: 'DANCING barefoot at the shoreline at golden hour — sundress hem wet, both arms out mid-spin, one knee lifted, sunset behind — never a planted fashion stand',
      setting: 'evening shoreline with long shadows and warm sky flare',
    },
    {
      activity: 'city',
      beat: 'PEDALING a city bike past lit shopfronts — evening dress over bike shorts, basket clutch, dusk wind',
      setting: 'old-town bike lane at dusk with café lights and cobblestones',
    },
    {
      activity: 'pier',
      beat: 'REACHING for a pier railing mid-lean after a jog — evening wear light layers, windblown hair, golden water',
      setting: 'wooden pier at golden hour with silhouetted boats and warm sky',
    },
    {
      activity: 'boat',
      beat: 'SEATED at the bow rail of a sunset cruise — hair blown back, half-turned toward the wake, travel clothes',
      setting: 'sunset boat deck with orange sky and calm water',
    },
    {
      activity: 'cafe',
      beat: 'SEATED at a patio table at dusk — dress strap slipping, toasting toward the water, breeze on the hem',
      setting: 'candlelit patio restaurant overlooking the water at blue hour',
    },
    {
      activity: 'city',
      beat: 'MID-STRIDE pausing under a neon hotel sign — coat open over a short dress, waving a taxi down',
      setting: 'downtown hotel entrance at dusk with warm lobby spill and neon',
    },
    {
      activity: 'drive',
      beat: 'SEATED in a convertible at golden hour with a silk scarf — one arm on the door, laughing into the wind',
      setting: 'coastal overlook pullout with convertible and sunset cliffs',
    },
    {
      activity: 'boat',
      beat: 'WAVING from a water-taxi rail at dusk — one arm high overhead mid-wave, evening wear, harbor lights starting, wind on the hem — never a planted fashion stand',
      setting: 'small water taxi crossing a harbor at blue hour with lit quays',
    },
    {
      activity: 'cafe',
      beat: 'RELAXING at a wine-bar counter with a glass — evening dress, chin on hand, soft dusk through shutters',
      setting: 'narrow wine bar with wood counter and dusk light through open shutters',
    },
    {
      activity: 'city',
      beat: 'CLIMBING theater steps mid-stride in evening wear — clutch in hand, marquee glow, golden hour leftover',
      setting: 'grand theater entrance with lit marquee and evening crowd blur behind',
    },
    {
      activity: 'rooftop',
      beat: 'PERCHED on a rooftop ledge with a camera — evening wear, framing the skyline, string lights behind',
      setting: 'hotel rooftop ledge at blue hour with skyline and string lights',
    },
    {
      activity: 'hotel',
      beat: 'SEATED at the hotel vanity finishing earrings — evening dress unzipped halfway, soft lamp, travel night-out energy',
      setting: 'hotel vanity with warm lamp, jewelry dish, and city glow in the mirror',
    },
    {
      activity: 'beach',
      beat: 'MID-STRIDE along the shoreline at golden hour carrying sandals — mid-step one foot ahead opposite arm swing, sundress hem wet, looking toward the pier',
      setting: 'evening shoreline with long shadows and a distant pier silhouette',
    },
    {
      activity: 'market',
      beat: 'SEATED at a night-market stool sampling street noodles — evening wear, chopsticks raised, lantern glow',
      setting: 'lantern-lit night market alley with steam and paper lamps (early evening)',
    },
  ],
  night: [
    {
      activity: 'spa',
      beat: 'RELAXING on a late spa daybed in a robe — eye mask pushed up, quiet music, soft night lighting, deep exhale',
      setting: 'resort spa recovery lounge after dark with dim sconces and stacked towels',
    },
    {
      activity: 'hotel',
      beat: 'RELAXING upright against the hotel headboard with a room-service tray — sleepwear, soft lamp, dessert fork idle',
      setting: 'dark hotel room with a single warm lamp and night city lights through curtains',
    },
    {
      activity: 'pool',
      beat: 'RELAXING on a late-night pool lounge wrapped in a towel — knees drawn up, facing underwater lights',
      setting: 'resort pool after dark with underwater lights and empty deck chairs',
    },
    {
      activity: 'city',
      beat: 'SEATED at a sidewalk café table after dinner — elbows on the table, stirring a late espresso, streetlamp pools',
      setting: 'late sidewalk café with empty tables and warm streetlamp pools',
    },
    {
      activity: 'city',
      beat: 'MID-STRIDE down a hotel hallway checking a phone — evening dress, brass fixture glow, travel pace',
      setting: 'quiet boutique hotel hallway after dark with brass fixtures and carpet',
    },
    {
      activity: 'pool',
      beat: 'SWIMMING a quiet night lap under underwater lights — swimsuit, mid-stroke, still resort water',
      setting: 'resort pool after dark with underwater lights and empty deck chairs',
    },
    {
      activity: 'rooftop',
      beat: 'DANCING under rooftop string lights — both arms raised, one knee lifted mid-kick, hips mid-sway, evening wear, night wind on the terrace — never arms at her sides',
      setting: 'hotel terrace at night with string lights and a low wall railing',
    },
    {
      activity: 'city',
      beat: 'CLIMBING spiral stairs to a night overlook — evening dress, hand on the rail, city glitter below',
      setting: 'lit spiral stair to a night overlook with skyline beyond',
    },
    {
      activity: 'rooftop',
      beat: 'SEATED on a night terrace ledge with a drink — hip cocked against the rail, city lights bokeh, evening dress',
      setting: 'high hotel balcony at night with glittering skyline and warm interior spill',
    },
    {
      activity: 'rooftop',
      beat: 'WAVING from a night terrace toward someone off-frame — one arm raised high, weight shifted on the rail ledge, evening wear, string lights — never arms hanging at her sides',
      setting: 'hotel terrace at night with string lights and a low wall railing',
    },
    {
      activity: 'hotel',
      beat: 'RECLINING on the hotel sofa — body stretched along the cushions lying down, hips and back on the sofa, nightcap on the side table, slip or sleepwear, soft lamp — never sitting upright or standing',
      setting: 'hotel sitting area after dark with rumpled throw and a single bedside lamp glow',
    },
    {
      activity: 'cafe',
      beat: 'RELAXING in a jazz-bar booth with a cocktail — evening dress, chin on hand, stage lights soft in the background',
      setting: 'small jazz club booth with warm sconces and a distant stage glow',
    },
    {
      activity: 'pool',
      beat: 'DANCING barefoot on the pool deck under string lights — cover-up over swimsuit, both arms raised, one knee lifted, hips mid-sway — never a planted fashion stand',
      setting: 'resort pool deck at night with string lights and still water reflections',
    },
    {
      activity: 'city',
      beat: 'SEATED on a fountain rim after dinner with heels kicked off — evening dress, city lights, quiet plaza',
      setting: 'lit plaza fountain after dark with empty café chairs nearby',
    },
    {
      activity: 'hotel',
      beat: 'RELAXING on the balcony writing a postcard — sleepwear under a light robe, night city glitter, lamp spill from inside',
      setting: 'hotel balcony at night with postcard, pen, and glittering skyline',
    },
    {
      activity: 'boat',
      beat: 'RELAXING on a night ferry bench under a blanket — travel clothes, harbor lights sliding past, quiet crossing',
      setting: 'night ferry cabin bench with dark water and lit harbor windows',
    },
    {
      activity: 'rooftop',
      beat: 'MID-STRIDE across a rooftop garden path in evening wear — clutch in hand, fairy lights, night wind',
      setting: 'rooftop garden walkway at night with fairy lights and potted hedges',
    },
    {
      activity: 'city',
      beat: 'PERCHED on a fire-escape landing with takeout — evening dress, chopsticks, neon wash on brick',
      setting: 'narrow alley fire escape at night with neon spill and quiet street below',
    },
    {
      activity: 'hotel',
      beat: 'SEATED on the luggage bench in the elevator lobby — evening dress, shoes off, waiting for the lift, soft brass light',
      setting: 'boutique hotel elevator lobby after dark with brass fixtures and carpet',
    },
  ],
};

export function buildDayVacationBeatPresets(slotId: DaySlotId): string[] {
  return (VACATION_SCENES[dayPartOf(slotId)] ?? []).map(scene => scene.beat);
}

export function buildDayVacationSettingPresets(slotId: DaySlotId): string[] {
  const seen = new Set<string>();
  const settings: string[] = [];
  for (const scene of VACATION_SCENES[dayPartOf(slotId)] ?? []) {
    const key = scene.setting.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    settings.push(scene.setting);
  }
  return settings;
}

export const DAY_SLOT_VACATION_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: buildDayVacationBeatPresets('morning'),
  afternoon: buildDayVacationBeatPresets('afternoon'),
  evening: buildDayVacationBeatPresets('evening'),
  night: buildDayVacationBeatPresets('night'),
};

export const DAY_SLOT_VACATION_SETTING_PRESETS: Record<DayPart, string[]> = {
  morning: buildDayVacationSettingPresets('morning'),
  afternoon: buildDayVacationSettingPresets('afternoon'),
  evening: buildDayVacationSettingPresets('evening'),
  night: buildDayVacationSettingPresets('night'),
};

/** Office / grocery / bookstore boards that fight Vacation. */
export const DAY_VACATION_STALE_SETTING_RE =
  /\b(bookstore|office desk|grocery|warehouse|commuter|cubicle|spreadsheet|day planner|clipboard|suburban kitchen counter)\b/i;

export const DAY_VACATION_BEAT_CUE_RE =
  /\b(hotel|balcony|suitcase|pool|lounge|beach|umbrella|market|harbor|boat|rooftop|terrace|vacation|resort|ferry|sundress|scooter|patio|restaurant|museum|swim\w*|towel|elevator|rail(?:ing)?|travel|gelato|boardwalk|lobby|plaza|espresso|sunscreen|camera|seated|mid-stride|reclining|relaxing|dancing|climbing|waving|perched|stretching|kicking|paddling|pedaling|tossing|jumping|reaching|spa|airport|pier|convertible|hammock|cabana|paddleboard|ferry|postcard|jazz|fountain|shells|croissant|bakery|marquee|water-taxi|wine-bar|robe|chaise|daybed|bike|frisbee|volleyball)\b|caf[eé]/i;

export const DAY_VACATION_SETTING_CUE_RE =
  /\b(hotel|resort|pool|beach|shore|shoreline|harbor|ferry|rooftop|terrace|market|balcony|suite|cabana|boardwalk|skyline|cobblestone|museum|patio|restaurant|lounge|umbrella|dune|boat|deck|hallway|elevator|lobby|plaza|spa|airport|pier|convertible|hammock|cathedral|theater|jazz|fountain|cove|bay|garden|alley|gate|bakery|street|tub|chaise|daybed|quay|marquee|overlook|wine|bar|counter|shutter|lane|path|court|promenade|shadow|sky)\b|caf[eé]/i;

/** Lead pose class from a Vacation beat (SEATED, MID-STRIDE, …). */
export function vacationPoseClassFromBeat(beat: string | null | undefined): string {
  const lead = beat
    ?.trim()
    .match(
      /^(SEATED|MID-STRIDE|RECLINING|RELAXING|DANCING|CLIMBING|WAVING|PERCHED|STRETCHING|KICKING|PADDLING|PEDALING|TOSSING|JUMPING|REACHING|SWIMMING)\b/i
    );
  return lead?.[1]?.toUpperCase() ?? 'OTHER';
}

/**
 * Upright-ish Vacation classes that Keep full-body Image 1 freezes as a fashion stand.
 * Horizontal sit/lounge already unlock without a face crop; these need face-only Image 1
 * so Edit follows Image 3 (outfit rides Image 2 Keep/packshot).
 */
const VACATION_UPRIGHT_BODY_UNLOCK = new Set([
  'MID-STRIDE',
  'WAVING',
  'DANCING',
  'REACHING',
  'STRETCHING',
  'CLIMBING',
  'JUMPING',
  'KICKING',
  'TOSSING',
]);

export function dayVacationPoseNeedsBodyUnlock(poseClass?: string | null): boolean {
  return VACATION_UPRIGHT_BODY_UNLOCK.has((poseClass ?? '').toUpperCase());
}

/**
 * Map Suggestive prose beats onto an unlock class. Catalog lines rarely lead with
 * ALL-CAPS Vacation tokens (only STRETCHING / DANCING today), so lean / zip /
 * look-back / hip-cocked freezes never got a face-crop Image 1.
 */
export function suggestiveUnlockPoseClass(beat: string | null | undefined): string {
  const cls = vacationPoseClassFromBeat(beat);
  if (dayVacationPoseNeedsBodyUnlock(cls)) return cls;
  const hay = beat?.trim() || '';
  if (!hay) return 'OTHER';
  // Seated / lounge / kneel / lie already unlock without a face crop — unless the
  // line also asks for an upright freeze-prone action (zip, lean, look-back).
  const seatedLead =
    /^(SEATED|RECLINING|RELAXING|PERCHED|PADDLING|PEDALING|SWIMMING)\b/i.test(hay) ||
    /\b(sit(?:ting|s)?\s+on|seated\s+on|reclining|lying\s+on|kneeling\s+(?:on|upright)|perched\s+on)\b/i.test(
      hay
    );
  const uprightCue =
    /\b(lean(?:ing|s)?|zip(?:ping|s|ped)?|unzip(?:ping|s|ped)?|twist(?:ing|s)?|look(?:ing)?\s+back|over\s+(?:an?\s+|the\s+)?shoulder|doorway|mid-stride|mid-step|danc(?:e|es|ing)|stretch(?:es|ing)?|hip\s+cocked|weight\s+on\s+one\s+hip|neckline|shop\s+window|three-quarter)\b/i.test(
      hay
    );
  if (seatedLead && !uprightCue) return 'OTHER';
  if (/\b(danc(?:e|es|ing)|hips?\s+mid-?sway|mid-?sway)\b/i.test(hay)) return 'DANCING';
  if (/\b(stretch(?:es|ing)?)\b/i.test(hay)) return 'STRETCHING';
  if (/\b(mid-?stride|mid-?step|walking\s+barefoot)\b/i.test(hay)) return 'MID-STRIDE';
  if (
    /\b(twist(?:ing|s)?|zip(?:ping|s|ped)?|unzip(?:ping|s|ped)?|over\s+(?:an?\s+|the\s+)?shoulder|look(?:ing)?\s+back)\b/i.test(
      hay
    )
  ) {
    return 'LOOK_BACK';
  }
  if (
    /\b(lean(?:ing|s)?|doorway|jamb|rail(?:ing)?|hip\s+cocked|weight\s+on\s+one\s+hip|neckline|shop\s+window|three-quarter)\b/i.test(
      hay
    )
  ) {
    return 'LEAN';
  }
  return 'OTHER';
}

/** Suggestive Keep upright freeze — face-crop Image 1 when true. */
export function daySuggestivePoseNeedsBodyUnlock(beat?: string | null): boolean {
  const cls = suggestiveUnlockPoseClass(beat);
  return dayVacationPoseNeedsBodyUnlock(cls) || cls === 'LOOK_BACK' || cls === 'LEAN';
}

/**
 * Vacation or Suggestive clothed-heat upright unlock.
 * On Edit-2511 (pose-sticky VL), Keep as Image 1 freezes sit/lounge beats as a
 * standing white-void plate too — face-break every clothed-heat beat on those stacks.
 */
export function dayClothedHeatPoseNeedsBodyUnlock(
  beat: string | null | undefined,
  mood: string | null | undefined,
  options?: { poseStickyModel?: boolean }
): boolean {
  const m = (mood ?? '').trim().toLowerCase();
  if (m !== 'suggestive' && m !== 'vacation') return false;
  // Edit-2511 VL anchors body pose from Image 1 — horizontal RELAXING/SEATED still
  // copy the Keep stand + white void unless face-crop Image 1 unlocks Image 3.
  if (options?.poseStickyModel) return true;
  if (m === 'suggestive') return daySuggestivePoseNeedsBodyUnlock(beat);
  return dayVacationPoseNeedsBodyUnlock(vacationPoseClassFromBeat(beat));
}

/**
 * Pose class for face-break leads + Image 3 stance reinforce (Vacation ALL-CAPS
 * lead, or Suggestive prose mapped class).
 */
export function clothedHeatUnlockPoseClass(
  beat: string | null | undefined,
  mood: string | null | undefined
): string {
  const m = (mood ?? '').trim().toLowerCase();
  if (m === 'suggestive') return suggestiveUnlockPoseClass(beat);
  return vacationPoseClassFromBeat(beat);
}

/**
 * Pick a matched vacation beat + venue for a daypart.
 * Prefers unused pose classes so a day doesn’t stack three MID-STRIDEs.
 */
export function pickDayVacationScenePair(
  slotId: DaySlotId,
  options?: {
    usedBeats?: Set<string>;
    usedLocations?: Set<string>;
    usedPoseClasses?: Set<string>;
    random?: () => number;
  }
): { beat: string; setting: string; activity: DayVacationActivity; poseClass: string } | null {
  const random = options?.random ?? Math.random;
  const scenes = [...(VACATION_SCENES[dayPartOf(slotId)] ?? [])];
  if (scenes.length === 0) {
    return null;
  }
  for (let i = scenes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = scenes[i]!;
    scenes[i] = scenes[j]!;
    scenes[j] = tmp;
  }
  const usedBeats = options?.usedBeats ?? new Set<string>();
  const usedLocations = options?.usedLocations ?? new Set<string>();
  const usedPoseClasses = options?.usedPoseClasses ?? new Set<string>();
  const unused = scenes.filter(
    scene =>
      !usedBeats.has(scene.beat.toLowerCase()) &&
      !usedLocations.has(scene.setting.trim().toLowerCase())
  );
  const basePool = unused.length > 0 ? unused : scenes;
  const freshClass = basePool.filter(
    scene => !usedPoseClasses.has(vacationPoseClassFromBeat(scene.beat))
  );
  const pool = freshClass.length > 0 ? freshClass : basePool;
  const pick = pool[Math.floor(random() * pool.length)]!;
  return {
    beat: pick.beat,
    setting: pick.setting,
    activity: pick.activity,
    poseClass: vacationPoseClassFromBeat(pick.beat),
  };
}

/**
 * Class-specific stance directive — Keep try-ons are standing plates; name the
 * required silhouette so CFG-1 cannot freeze PERCHED/RELAXING/REACHING as stand.
 */
export function vacationStanceDirective(poseClass: string | null | undefined): string {
  switch ((poseClass ?? '').toUpperCase()) {
    case 'PERCHED':
      return 'PERCHED = hips planted on the ledge/piling/wall/stool with knees bent and weight seated on that surface — never standing square-on beside it with arms at her sides';
    case 'RELAXING':
      return 'RELAXING = LYING DOWN on the towel/lounge/daybed/hammock — hips and back ON that surface, knees drawn up or soft, head near one end — NOT standing on her feet beside it; never an upright standing fashion plate with arms at her sides';
    case 'RECLINING':
      return 'RECLINING = LYING DOWN stretched along a lounge/chaise/daybed/sofa/towel — hips and back ON that surface, knees bent or one knee raised — NOT sitting upright reading, NOT perched on the edge, NOT standing beside the furniture';
    case 'REACHING':
      return 'REACHING = one arm stretched high or out with torso elongated and clear weight shift — never square-on standing with both arms hanging at her sides';
    case 'STRETCHING':
      return 'STRETCHING = arms overhead or wide with an arched torso and weight shift — never square-on standing with arms at her sides';
    case 'SEATED':
      return 'SEATED = hips firmly ON a chair/bench/stool/saddle with knees bent at ~90° and feet off a planted stand — never standing square-on with both legs straight and arms at her sides';
    case 'MID-STRIDE':
      return 'MID-STRIDE = FULL BODY captured mid-step walking — one foot clearly ahead of the other with visible gap, opposite arm swing (one arm forward, other trailing with tote/bag if the beat names one), torso leaning into the walk, head following the beat (looking down at sand/shells when written) — NEVER both feet planted parallel, NEVER arms hanging symmetrically at her sides, NEVER a square-on mid-thigh catalog portrait staring at the lens';
    case 'DANCING':
      return 'DANCING = mid-dance alone — BOTH arms raised overhead or one high and one out, one knee lifted mid-kick or mid-step, hips mid-sway, three-quarter torso twist — NEVER both arms hanging at her sides, NEVER both feet planted parallel facing the lens';
    case 'CLIMBING':
      return 'CLIMBING = ascending with one foot up and hands on rail/steps — never standing flat-footed';
    case 'WAVING':
      return 'WAVING = one arm raised HIGH overhead in a clear wave, torso half-turned or leaning, weight shifted onto one leg with the other foot stepped — NEVER both arms hanging at her sides, NEVER a square-on planted fashion stand facing the lens';
    case 'LOOK_BACK':
      return 'LOOK_BACK / ZIP-TWIST = torso twisted three-quarter looking over a shoulder, back arched, both hands on her own dress zipper behind her back or adjusting straps — NEVER square-on facing the lens with arms at her sides';
    case 'LEAN':
      return 'LEAN = weight into a doorway/rail/sill with hip cocked and asymmetric arms, three-quarter body angle — NEVER a planted catalog stand with arms at her sides';
    case 'KICKING':
      return 'KICKING = roundhouse/side kick with one leg locked straight nearly horizontal at hip height, toes pointed out, arms wide — never both feet planted fashion-stand, never a yoga tree pose with foot tucked on the calf';
    case 'JUMPING':
      return 'JUMPING = both feet off the ground mid-air with knees tucked and arms overhead — never a planted stand or T-pose';
    case 'SWIMMING':
      return 'SWIMMING = body in water mid-stroke or float — never dry standing on deck';
    case 'PADDLING':
    case 'PEDALING':
      return `${(poseClass ?? '').toUpperCase()} = seated with hands on paddle/bars and knees bent — never standing beside the craft`;
    case 'TOSSING':
      return 'TOSSING = throwing arm cocked behind the head or follow-through with a thrown object — never arms-at-sides stand';
    default:
      return 'match the beat stance from Image 3 — seated, mid-stride, reclining, relaxing, reaching, dancing, climbing, or waving as written — never a stiff square-on standing catalog pose with arms at her sides';
  }
}

/** Keep unlock lead keyed to the beat pose class (standing try-on must die). */
export function buildDayVacationKeepPoseUnlock(poseClass?: string | null): string {
  const cls = (poseClass ?? '').toUpperCase();
  const stance = vacationStanceDirective(poseClass);
  const critical =
    cls === 'DANCING'
      ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her DANCING instead: both arms raised or one arm high, one knee lifted mid-step, hips swaying. If she is standing square-on with arms at her sides the edit FAILED. '
      : cls === 'MID-STRIDE'
        ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her WALKING mid-step FULL BODY with one foot clearly ahead, opposite arm swing, and feet visible in frame. Planted parallel feet, arms hanging at her sides, or a mid-thigh portrait staring at the lens mean the edit FAILED. '
        : cls === 'WAVING'
          ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her WAVING with one arm raised high overhead and clear weight shift. Arms hanging at her sides or a square-on stand mean the edit FAILED. '
          : cls === 'CLIMBING'
            ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her CLIMBING with one foot up and hands on the rail. Flat-footed square-on means the edit FAILED. '
            : cls === 'JUMPING'
              ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her JUMPING with both feet off the ground and knees tucked. Planted feet or a T-pose mean the edit FAILED. '
              : cls === 'KICKING'
                ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her KICKING with one leg locked straight nearly horizontal (roundhouse/side kick). Both feet planted fashion-stand or a yoga tree pose means the edit FAILED. '
                : cls === 'TOSSING'
                  ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her TOSSING with the throwing arm cocked behind her head. Arms at her sides mean the edit FAILED. '
                  : cls === 'SEATED' || cls === 'PERCHED'
                    ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her SEATED with hips on a seat and knees bent. Standing on both feet means the edit FAILED. '
                    : cls === 'RECLINING' || cls === 'RELAXING'
                      ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show her LYING DOWN on the lounge/towel. Standing beside it means the edit FAILED. '
                      : cls === 'REACHING' || cls === 'STRETCHING'
                        ? 'CRITICAL: Image 1 is a standing fashion plate — the output MUST show an arm stretched high with clear weight shift. Arms hanging at her sides means the edit FAILED. '
                        : '';
  return (
    'Edit Image 1. IDENTITY CRITICAL: keep the SAME woman as Image 1 — same face, bone structure, eyes, nose, mouth, and exact hair color and length. Inventing a different beauty face or restyling her hair means the edit FAILED. Keep the worn outfit, garments, colors, fabric, and clothing silhouette from Image 1. ' +
    critical +
    'Image 1 is a standing try-on plate — discard that standing fashion stance entirely. ' +
    `Mandatory new stance: ${stance}. ` +
    'Do not preserve body pose, standing stance, arm or hand positions, camera angle, or background — aggressively refactor into the beat pose. ' +
    'Keep who she is and what she is wearing from Image 1; replace pose and scene only.'
  );
}

/**
 * Face-crop Image 1 unlock copy for upright Vacation/Suggestive beats.
 * MID-STRIDE already needed a dedicated lead; DANCING/WAVING collapse to a
 * fashion stand under the generic face-break text.
 */
export function buildDayVacationClothedFaceBreakLeads(
  poseClass: string | null | undefined,
  platePath: 'keep' | 'cast',
  mood?: string | null,
  options?: { garmentDescription?: string | null; hasOutfitImage?: boolean }
): { preamble: string; image1: string } {
  const cls = (poseClass ?? '').toUpperCase();
  const suggestive = (mood ?? '').trim().toLowerCase() === 'suggestive';
  const garmentDesc = options?.garmentDescription?.trim() || '';
  const hasOutfitImage = options?.hasOutfitImage === true;
  // When Image 2 is attached, lock from that plate. Otherwise dress from garment
  // text — full-body Keep cutouts teach studio voids on Edit-2511.
  const outfitFrom = hasOutfitImage
    ? suggestive
      ? platePath === 'keep'
        ? 'CLOTHING LOCK CRITICAL: wear the EXACT Outfit Keep garment from Image 2 — same cut, colors, print, fabric, and coverage (if Image 2 is a dress/robe/lingerie set, she wears that). NEVER invent a bikini, swimsuit, nude, bare midriff, or a different outfit. Ignore Image 2 pose, room, and background only.'
        : 'CLOTHING LOCK CRITICAL: wear the EXACT Image 2 garment — same cut, colors, print, fabric, and coverage. NEVER invent a bikini, swimsuit, nude, bare midriff, or a different outfit. Ignore Image 2 standing pose and room only.'
      : platePath === 'keep'
        ? 'Dress the Outfit Keep kit from Image 2 (garment colors/cut only — ignore Image 2 pose, room, and background).'
        : 'Dress her from Image 2 garment colors/cut only; ignore Image 2 standing pose and room.'
    : garmentDesc
      ? suggestive
        ? `CLOTHING LOCK CRITICAL: wear this EXACT outfit — ${garmentDesc} — same cut, colors, print, fabric, and coverage. NEVER invent a bikini, swimsuit, nude, bare midriff, or a different outfit.`
        : `Dress her in this outfit only — ${garmentDesc} (exact cut, colors, print, fabric).`
      : suggestive
        ? 'CLOTHING LOCK CRITICAL: keep her fully clothed in the day outfit described in the beat/notes — NEVER invent a bikini, swimsuit, nude, or bare midriff.'
        : 'Dress her in the day outfit described in the beat/notes (clothes stay on).';
  const outfitImage1 = hasOutfitImage
    ? suggestive
      ? 'exact Image 2 garment (same print/cut/coverage) — inventing a bikini, swimsuit, or stripping her means the edit FAILED'
      : 'outfit colors from Image 2 only'
    : garmentDesc
      ? suggestive
        ? `exact outfit (${garmentDesc}) — inventing a bikini, swimsuit, or stripping her means the edit FAILED`
        : `wearing ${garmentDesc}`
      : suggestive
        ? 'exact clothed day outfit from the beat — inventing a bikini or stripping her means the edit FAILED'
        : 'clothed day outfit from the beat';
  const identityLock =
    'IDENTITY CRITICAL: the finished still must show the SAME woman as the Image 1 face crop — identical face shape, hair color and length, eye color, nose, and mouth; inventing a different beauty face means the edit FAILED. Exactly one woman in frame — never a second person. ';
  if (cls === 'MID-STRIDE') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY mid-stride walk from Image 3: one foot clearly ahead, opposite arm swing, both feet visible in frame, torso in motion. CRITICAL: never a mid-thigh square-on fashion stand with arms at her sides staring at the lens. ' +
        outfitFrom +
        ' Follow the beat action and SETTING (looking down at sand/shells, tote, straw hat when written).',
      image1: `Image 1 = face likeness only — invent FULL BODY mid-stride matching Image 3 (feet visible, one foot ahead, arm swing); never a mid-thigh catalog portrait; ${outfitImage1}.`,
    };
  }
  if (cls === 'DANCING') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY mid-dance from Image 3: BOTH arms raised high overhead, one knee lifted mid-step, hips mid-sway, torso twisted — never arms hanging at her sides. CRITICAL: a square-on fashion stand with both feet planted and arms at her sides means the edit FAILED. ' +
        outfitFrom +
        ' Follow the beat action and SETTING (terrace, string lights, evening wear when written).',
      image1: `Image 1 = face likeness only — invent FULL BODY dancing matching Image 3 (both arms overhead, one knee lifted, hip sway); never a planted fashion stand; ${outfitImage1}.`,
    };
  }
  if (cls === 'WAVING') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY wave from Image 3: one arm raised HIGH overhead mid-wave, clear weight shift onto one leg, torso half-turned — never both arms hanging at her sides. CRITICAL: a square-on fashion stand means the edit FAILED. ' +
        outfitFrom +
        ' Follow the beat action and SETTING.',
      image1: `Image 1 = face likeness only — invent FULL BODY waving matching Image 3 (one arm high overhead, weight shift); never a planted fashion stand; ${outfitImage1}.`,
    };
  }
  if (cls === 'LOOK_BACK') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY look-back / zip-twist from Image 3: torso twisted three-quarter, looking over a shoulder, back arched, both hands on her own dress zipper behind her back (or adjusting straps) — NEVER square-on facing the lens with arms at her sides. CRITICAL: a planted fashion stand means the edit FAILED. ' +
        outfitFrom +
        ' Follow the beat action and SETTING (mirror, dress zipper/straps when written — never invent a bikini).',
      image1: `Image 1 = face likeness only — invent FULL BODY zip-twist / look-back matching Image 3 (torso twisted, over-shoulder glance, hands on zipper behind her); never a planted fashion stand; ${outfitImage1}.`,
    };
  }
  if (cls === 'LEAN') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY lean from Image 3: weight into a doorway/rail/sill, hip cocked, asymmetric arms, three-quarter body angle — NEVER a square-on planted catalog stand with arms at her sides. CRITICAL: a fashion stand means the edit FAILED. ' +
        outfitFrom +
        ' Follow the beat action and SETTING (doorway, balcony rail, lingerie/robe when written).',
      image1: `Image 1 = face likeness only — invent FULL BODY leaning matching Image 3 (hip cocked into doorway/rail, asymmetric arms); never a planted fashion stand; ${outfitImage1}.`,
    };
  }
  if (cls === 'REACHING') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY reach from Image 3: one arm stretched HIGH overhead or out, torso elongated with clear weight shift — never both arms hanging at her sides. CRITICAL: a square-on fashion stand means the edit FAILED. ' +
        outfitFrom +
        ' Follow the beat action and SETTING.',
      image1: `Image 1 = face likeness only — invent FULL BODY reaching matching Image 3 (one arm high, weight shift); never a planted fashion stand; ${outfitImage1}.`,
    };
  }
  if (cls === 'STRETCHING') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY stretch from Image 3: BOTH arms raised overhead, arched torso, weight on one hip — never arms at her sides. CRITICAL: a square-on fashion stand means the edit FAILED. ' +
        outfitFrom +
        ' Follow the beat action and SETTING.',
      image1: `Image 1 = face likeness only — invent FULL BODY stretching matching Image 3 (both arms overhead, arched torso); never a planted fashion stand; ${outfitImage1}.`,
    };
  }
  if (cls === 'CLIMBING') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY climb from Image 3: one foot up on a step, hands on the rail or steps — never flat-footed square-on. CRITICAL: a square-on fashion stand means the edit FAILED. ' +
        outfitFrom +
        ' Follow the beat action and SETTING.',
      image1: `Image 1 = face likeness only — invent FULL BODY climbing matching Image 3 (one foot up, hands on rail); never a planted fashion stand; ${outfitImage1}.`,
    };
  }
  if (cls === 'JUMPING') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY jump from Image 3: BOTH FEET CLEARLY OFF THE GROUND mid-air with knees tucked, BOTH arms raised overhead (not a T-pose), sand/water BELOW her soles with a clear empty gap — her shadow on the ground must sit BELOW her feet. CRITICAL: any planted foot on sand/deck/pool ledge means the edit FAILED — float her higher. ' +
        outfitFrom +
        ' Follow the beat action and SETTING.',
      image1: `Image 1 = face likeness only — invent FULL BODY jumping matching Image 3 (both feet off the ground, knees tucked, arms overhead, air under soles); never a planted T-pose or fashion stand; ${outfitImage1}.`,
    };
  }
  if (cls === 'KICKING') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY roundhouse/side kick from Image 3: kicking leg locked STRAIGHT and nearly HORIZONTAL at hip height with toes pointed out toward the horizon, support leg planted, BOTH arms flung wide for balance — NEVER a yoga tree-pose with the foot tucked against the calf, NEVER a hand resting on the bent knee, NEVER both feet planted fashion-stand. CRITICAL: a square-on fashion stand or tree pose means the edit FAILED. ' +
        outfitFrom +
        ' Follow the beat action and SETTING.',
      image1: `Image 1 = face likeness only — invent FULL BODY kicking matching Image 3 (straight horizontal kicking leg, other planted, arms wide); never a planted fashion stand or yoga tree pose; ${outfitImage1}.`,
    };
  }
  if (cls === 'TOSSING') {
    return {
      preamble:
        'Edit Image 1. Image 1 is a FACE CROP only — keep facial likeness only. ' +
        identityLock +
        'Invent a FULL BODY toss from Image 3: throwing arm cocked BEHIND her head or in follow-through with a beach ball/frisbee leaving her hand, opposite arm forward, clear weight shift onto the back foot — never arms-at-sides stand and never a hand casually resting on her hip. CRITICAL: a square-on fashion stand means the edit FAILED. ' +
        outfitFrom +
        ' Follow the beat action and SETTING.',
      image1: `Image 1 = face likeness only — invent FULL BODY tossing matching Image 3 (throwing arm cocked behind head, object in flight, weight shift); never a planted fashion stand; ${outfitImage1}.`,
    };
  }
  return {
    preamble:
      'Edit Image 1. Image 1 is a FACE CROP only (head/shoulders) — keep facial likeness only. ' +
      identityLock +
      'Invent the full body pose from Image 3 and the beat. CRITICAL: Image 1 has no standing body — do not invent a square-on fashion stand with arms at her sides. ' +
      outfitFrom +
      ' BACKGROUND CRITICAL: invent the full SETTING venue behind her (depth, props, lighting) — blank white or a missing background means the edit FAILED. Aggressively match Image 3 stance and the SETTING backdrop.',
    image1: `Image 1 = face likeness only (cropped head/shoulders) — invent full body matching Image 3 plus the SETTING venue behind her; never a white void or standing fashion plate; ${outfitImage1}.`,
  };
}

/**
 * Vacation prompt locks — never name sex-act nouns in the positive
 * (CFG-1 Rapid latches onto "doggy" / "mid-sex" even inside "never …").
 */
export function buildDayVacationPromptLocks(input: {
  beat?: string | null;
  setting?: string | null;
}): { moodLine: string; poseLock: string; keepUnlock: string; poseClass: string } {
  const beat = input.beat?.trim() || 'vacation travel pose';
  const poseClass = vacationPoseClassFromBeat(beat);
  const stance = vacationStanceDirective(poseClass);
  const loungeBody =
    poseClass === 'RECLINING' || poseClass === 'RELAXING'
      ? ' BODY: she is LYING DOWN — head, spine, and hips on the lounge/towel surface, knees drawn up — NEVER on her feet, NEVER standing beside the furniture, NEVER an upright chair-sit reading pose.'
      : poseClass === 'DANCING'
        ? ' BODY: mid-dance — both arms raised overhead, one knee lifted mid-step, hips swaying — NEVER both arms hanging at her sides, NEVER a planted fashion stand.'
        : poseClass === 'MID-STRIDE'
          ? ' BODY: WALKING mid-step FULL BODY — one foot clearly ahead of the other, opposite arm swing, torso leaning into the walk, follow beat gaze (looking down at sand/shells when written) — NEVER both feet planted parallel, NEVER arms hanging at her sides, NEVER a square-on mid-thigh catalog stand staring at the lens.'
          : poseClass === 'WAVING'
            ? ' BODY: WAVING — one arm raised HIGH overhead, torso half-turned, weight on one leg — NEVER both arms hanging at her sides, NEVER a planted square-on fashion stand.'
            : poseClass === 'REACHING'
              ? ' BODY: REACHING — one arm stretched HIGH, torso elongated, clear weight shift — NEVER both arms hanging at her sides, NEVER a planted fashion stand.'
              : poseClass === 'STRETCHING'
                ? ' BODY: STRETCHING — both arms overhead, arched torso, weight on one hip — NEVER arms at her sides, NEVER a planted fashion stand.'
                : poseClass === 'CLIMBING'
                  ? ' BODY: CLIMBING — one foot up on a step, hands on the rail — NEVER flat-footed square-on with arms at her sides.'
                  : poseClass === 'JUMPING'
                    ? ' BODY: JUMPING — both feet off the ground mid-air with knees tucked and arms overhead — NEVER a planted T-pose or fashion stand.'
                    : poseClass === 'KICKING'
                      ? ' BODY: KICKING — roundhouse/side kick with one leg locked straight nearly horizontal at hip height, arms flung wide — NEVER both feet planted fashion-stand or a yoga tree pose.'
                      : poseClass === 'TOSSING'
                        ? ' BODY: TOSSING — throwing arm cocked behind the head or follow-through with object in flight, clear weight shift — NEVER arms-at-sides stand.'
                        : poseClass === 'SEATED' || poseClass === 'PERCHED'
                          ? ' BODY: SEATED — hips on the seat, knees bent — NEVER standing on both feet with arms at her sides.'
                          : '';
  return {
    poseClass,
    keepUnlock: buildDayVacationKeepPoseUnlock(poseClass),
    poseLock:
      `POSE LOCK: ${stance}.${loungeBody} Match Image 3 silhouette exactly. ` +
      'Image 1 Keep is a standing try-on — discard that standing fashion stance; never freeze as a square-on standing catalog model with arms at her sides.',
    moodLine:
      `MOOD: vacation travel day — follow the beat body stance exactly (${beat.slice(0, 80)}); ` +
      `lively resort energy — ${stance}; ` +
      'keep travel clothes or swimsuit as the beat says; one woman alone in frame; ' +
      'never hands-and-knees or rear-presenting on a bed; never invent a man or second adult; ' +
      'never a stiff square-on standing catalog pose; never office/grocery/bookstore stills.',
  };
}
