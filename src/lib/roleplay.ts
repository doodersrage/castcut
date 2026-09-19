import { ROLEPLAY_ARCHETYPES, type RoleplayArchetype } from './roleplay-archetypes';
import { lastCompletedRoleplayStillUrl } from './roleplay-gallery-takes';
import {
  POSE_GUIDE_ACTION_LOCK,
  POSE_GUIDE_ARCHIVE_BENT_LOCK,
  POSE_GUIDE_CABINET_DRAWER_LOCK,
  POSE_GUIDE_CHAIR_BENT_LOCK,
  POSE_GUIDE_DOGGY_LOCK,
  POSE_GUIDE_DRAWER_AFTERGLOW_LOCK,
  POSE_GUIDE_EDIT_PROMPT_LINE,
  POSE_GUIDE_PIANO_ORAL_LOCK,
  POSE_GUIDE_WALL_CONTACT_LOCK,
  POSE_GUIDE_WALL_STANDING_LOCK,
  poseGuidePromptBlock,
  withPoseGuideEditPrompt,
} from '@/lib/pose-guide-prompt';
import {
  isLegacyAdultMetaBlurb,
  intimateTextDefaultsToNude,
  intimateTextImpliesAct,
  intimateTextImpliesCabinetDrawer,
  intimateTextImpliesSurfaceBent,
  reinforceIntimateStillPrompt,
} from '@/lib/intimate-prompt-clarify';
import { parseIntimateLayout, type IntimateLayout } from '@/lib/day-pose-guide';
import type { SessionLoraStrengthOverrides } from '@/lib/lora-stack';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  DEFAULT_RENDER_REALISM_MODE,
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from '@/lib/render-realism';

export type RoleplayTone =
  | 'silly'
  | 'cinematic'
  | 'cozy'
  | 'chaotic'
  | 'noir'
  | 'romantic'
  | 'horror'
  | 'deadpan'
  | 'epic'
  | 'dreamy'
  | 'gritty'
  | 'melancholy';

export type RoleplayContentId = 'clean' | 'pg13' | 'suggestive' | 'sultry' | 'explicit' | 'raunchy';

export type RoleplayContentGroup = 'sfw' | 'adult';

export type RoleplayPlayAs = 'text' | 'photo';

export type RoleplayBio = {
  name: string;
  look: string;
  personality: string;
  catchphrase?: string;
};

export type RoleplaySceneKind = 'plot' | 'ending';

export type RoleplayScene = {
  id: string;
  title: string;
  blurb: string;
  kind?: RoleplaySceneKind;
};

export type RoleplayStillStatus = 'writing' | 'queued' | 'running' | 'completed' | 'error';

export type RoleplayStillTake = {
  promptId?: string;
  imageUrl?: string;
  stillStatus?: RoleplayStillStatus;
};

export type RoleplayClipTake = {
  clipPromptId?: string;
  clipUrl?: string;
  clipStatus?: RoleplayStillStatus;
};

export type RoleplayStoryBeat = RoleplayScene & {
  at: number;
  prompt?: string;
  promptId?: string;
  imageUrl?: string;
  stillStatus?: RoleplayStillStatus;
  /** All still takes for this beat; `promptId` / `imageUrl` / `stillStatus` mirror the shown take. */
  stillTakes?: RoleplayStillTake[];
  stillTakeIndex?: number;
  /** I2V / extend clip queued from this beat. */
  clipPromptId?: string;
  clipUrl?: string;
  clipStatus?: RoleplayStillStatus;
  /** All clip takes for this beat; `clipPromptId` / `clipUrl` / `clipStatus` mirror the shown take. */
  clipTakes?: RoleplayClipTake[];
  clipTakeIndex?: number;
};

export const MAX_ROLEPLAY_STILL_TAKES = 8;
export const MAX_ROLEPLAY_CLIP_TAKES = 8;

export const ROLEPLAY_TONES: Array<{ id: RoleplayTone; label: string; hint: string }> = [
  { id: 'silly', label: 'Silly', hint: 'Jokes, bits, and cartoon physics' },
  { id: 'cinematic', label: 'Cinematic', hint: 'Movie stills, dramatic light' },
  { id: 'cozy', label: 'Cozy', hint: 'Warm, low-stakes, soft lighting' },
  { id: 'chaotic', label: 'Chaotic', hint: 'Too many plots, all of them now' },
  { id: 'noir', label: 'Noir', hint: 'Hard shadows, wet streets, mystery' },
  { id: 'romantic', label: 'Romantic', hint: 'Lingering looks, tender heat' },
  { id: 'horror', label: 'Horror', hint: 'Dread, uncanny, isolated quiet' },
  { id: 'deadpan', label: 'Deadpan', hint: 'Dry, understated, no wink' },
  { id: 'epic', label: 'Epic', hint: 'Mythic scale, heroic framing' },
  { id: 'dreamy', label: 'Dreamy', hint: 'Soft surreal, liminal glow' },
  { id: 'gritty', label: 'Gritty', hint: 'Lived-in, handheld, documentary' },
  { id: 'melancholy', label: 'Melancholy', hint: 'Quiet, bittersweet, overcast' },
];

const ROLEPLAY_TONE_IDS = new Set<string>(ROLEPLAY_TONES.map(entry => entry.id));

const ROLEPLAY_TONE_LINES: Record<RoleplayTone, string> = {
  silly: 'Tone: silly — jokes, cartoon physics, committed nonsense.',
  cinematic: 'Tone: cinematic still — dramatic light, movie framing.',
  cozy: 'Tone: cozy and low-stakes — warm light, soft humor.',
  chaotic: 'Tone: chaotic bit — too many plots, physical comedy, still readable as one image.',
  noir: 'Tone: noir — hard shadows, wet streets, mystery, rain-and-cigarette mood.',
  romantic: 'Tone: romantic — lingering looks, tender heat, dusk or candlelight.',
  horror: 'Tone: horror — dread, uncanny staging, isolated subject, wrong quiet.',
  deadpan: 'Tone: deadpan — dry, understated, no winking at the camera.',
  epic: 'Tone: epic — mythic scale, heroic framing, weather as drama.',
  dreamy: 'Tone: dreamy — soft surreal, liminal glow, slightly unmoored from physics.',
  gritty: 'Tone: gritty — lived-in, handheld, documentary dirt and wear.',
  melancholy: 'Tone: melancholy — quiet, bittersweet, overcast, held breath.',
};

export function roleplayToneLine(tone: RoleplayTone): string {
  return ROLEPLAY_TONE_LINES[tone] ?? ROLEPLAY_TONE_LINES.silly;
}

export function roleplayToneTemperature(tone: RoleplayTone): number {
  if (tone === 'cozy' || tone === 'melancholy' || tone === 'deadpan' || tone === 'noir') {
    return 0.7;
  }
  return 0.95;
}

export const ROLEPLAY_CONTENT: Array<{
  id: RoleplayContentId;
  label: string;
  hint: string;
  group: RoleplayContentGroup;
}> = [
  { id: 'clean', label: 'Clean', hint: 'All-ages, no innuendo', group: 'sfw' },
  { id: 'pg13', label: 'PG-13', hint: 'Weird and fun, keep it mild', group: 'sfw' },
  { id: 'suggestive', label: 'Suggestive', hint: 'Heat and innuendo, fade to black', group: 'sfw' },
  {
    id: 'sultry',
    label: 'Sultry',
    hint: 'Erotic: skin, undress, sexual heat as the point of the still',
    group: 'adult',
  },
  {
    id: 'explicit',
    label: 'Explicit',
    hint: 'Full NSFW: nudity, sex, anatomy named in the still',
    group: 'adult',
  },
  {
    id: 'raunchy',
    label: 'Raunchy',
    hint: 'Crude sexual comedy — vulgar and graphic, not fade-to-black',
    group: 'adult',
  },
];

export const ROLEPLAY_PLAY_AS: Array<{ id: RoleplayPlayAs; label: string; hint: string }> = [
  { id: 'text', label: 'From bio', hint: 'Invent the look from the bio' },
  {
    id: 'photo',
    label: 'From photo',
    hint: 'Play as yourself or a generated still — img2img from this reference',
  },
];

export const ROLEPLAY_SETTING_PRESETS: Array<{ id: string; label: string; setting: string }> = [
  {
    id: 'neon-alley',
    label: 'Neon alley',
    setting: 'rain-slick cyberpunk alley with neon reflections',
  },
  {
    id: 'tavern',
    label: 'Tavern',
    setting: 'candlelit tavern with sticky wood tables and a roaring hearth',
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    setting: 'sunlit suburban kitchen with breakfast clutter on the counters',
  },
  {
    id: 'forest',
    label: 'Forest',
    setting: 'misty pine forest path after rainfall',
  },
  {
    id: 'rooftop',
    label: 'Rooftop',
    setting: 'rooftop garden overlooking a sprawling city at golden hour',
  },
  {
    id: 'station',
    label: 'Station',
    setting: 'marble train station concourse at midnight',
  },
  {
    id: 'beach',
    label: 'Beach',
    setting: 'volcanic black sand beach with driftwood at dusk',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    setting: 'orbital station observation deck above Earth',
  },
  {
    id: 'cafe',
    label: 'Café',
    setting: 'busy sidewalk café terrace with chalkboard menus and passing traffic',
  },
  {
    id: 'library',
    label: 'Library',
    setting: 'quiet public library reading room with tall windows and oak tables',
  },
  {
    id: 'market',
    label: 'Market',
    setting: 'open-air farmers market with produce stalls and striped awnings',
  },
  {
    id: 'park',
    label: 'Park',
    setting: 'leafy city park path with benches and distant playground noise',
  },
  {
    id: 'bookstore',
    label: 'Bookstore',
    setting: 'independent bookstore aisle with warm lamps and crowded shelves',
  },
  {
    id: 'diner',
    label: 'Diner',
    setting: 'chrome late-night diner booth with neon sign glow through the window',
  },
  {
    id: 'gym',
    label: 'Gym',
    setting: 'bright neighborhood gym floor with mirrors and free weights',
  },
  {
    id: 'subway',
    label: 'Subway',
    setting: 'underground subway platform with tiled walls and approaching train lights',
  },
  {
    id: 'balcony',
    label: 'Balcony',
    setting: 'small apartment balcony overlooking quiet residential streets',
  },
  {
    id: 'office',
    label: 'Office',
    setting: 'open-plan office corner desk with monitors and afternoon window light',
  },
  {
    id: 'bathroom',
    label: 'Bathroom',
    setting: 'steamy bathroom after a shower with fogged mirror and towel rail',
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    setting: 'sunlit bedroom with rumpled sheets and morning light through sheer curtains',
  },
  {
    id: 'living-room',
    label: 'Living room',
    setting: 'cozy living-room couch edge with warm lamp light and a low coffee table',
  },
  {
    id: 'hallway',
    label: 'Hallway',
    setting: 'quiet apartment hallway with a single warm wall sconce',
  },
  {
    id: 'laundry',
    label: 'Laundry',
    setting: 'basement laundry room with humming machines and folding table clutter',
  },
  {
    id: 'garage',
    label: 'Garage',
    setting: 'residential garage with a half-open door and oil-stained concrete',
  },
  {
    id: 'museum',
    label: 'Museum',
    setting: 'sunlit museum lobby with a large colorful mural, ticket desk, and skylight shadows',
  },
  {
    id: 'gallery',
    label: 'Art gallery',
    setting: 'white-wall art gallery with spotlit canvases and polished concrete floors',
  },
  {
    id: 'theater',
    label: 'Theater lobby',
    setting: 'velvet-curtained theater lobby with brass fixtures and soft house lights',
  },
  {
    id: 'cinema',
    label: 'Cinema',
    setting: 'empty cinema aisle with glowing exit signs and silver screen glow',
  },
  {
    id: 'hotel-lobby',
    label: 'Hotel lobby',
    setting: 'hotel lobby lounge with low music and polished marble floors',
  },
  {
    id: 'hotel-room',
    label: 'Hotel room',
    setting: 'high-floor hotel room with city view windows and crisp white bedding',
  },
  {
    id: 'wine-bar',
    label: 'Wine bar',
    setting: 'neighborhood wine bar booth with candlelight and low chatter',
  },
  {
    id: 'cocktail-bar',
    label: 'Cocktail bar',
    setting: 'dim cocktail bar with mirrored back bar and amber bottle glow',
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    setting: 'rain-damp sidewalk outside a lit restaurant window at dinner hour',
  },
  {
    id: 'bakery',
    label: 'Bakery',
    setting: 'corner bakery with glass pastry cases and warm bread smell in the air',
  },
  {
    id: 'grocery',
    label: 'Grocery',
    setting: 'grocery store produce aisle under cool fluorescent light',
  },
  {
    id: 'convenience',
    label: 'Convenience store',
    setting: 'corner convenience store exterior under harsh sodium light',
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    setting: 'bright pharmacy aisle with fluorescent lights and glass-front coolers',
  },
  {
    id: 'salon',
    label: 'Salon',
    setting: 'hair salon chair facing a mirror wall with soft vanity bulbs',
  },
  {
    id: 'yoga',
    label: 'Yoga studio',
    setting: 'yoga studio with mats rolled and east-facing windows',
  },
  {
    id: 'pool',
    label: 'Pool',
    setting: 'outdoor hotel pool deck with loungers and shimmering blue water',
  },
  {
    id: 'spa',
    label: 'Spa',
    setting: 'quiet spa lounge with stone floors, towels, and soft steam haze',
  },
  {
    id: 'pier',
    label: 'Pier',
    setting: 'sunset pier railing with long shadows and cool wind off the water',
  },
  {
    id: 'boardwalk',
    label: 'Boardwalk',
    setting: 'riverside boardwalk with bikes and midday glare on the water',
  },
  {
    id: 'bridge',
    label: 'Bridge',
    setting: 'rain-slick bridge walkway with car headlights streaking past',
  },
  {
    id: 'marina',
    label: 'Marina',
    setting: 'quiet marina dock with bobbing sailboats and gulls overhead',
  },
  {
    id: 'lake',
    label: 'Lakeside',
    setting: 'still lakeside dock at blue hour with pine silhouettes across the water',
  },
  {
    id: 'mountain',
    label: 'Mountain trail',
    setting: 'rocky mountain trail overlook with wind and distant ridgelines',
  },
  {
    id: 'desert',
    label: 'Desert',
    setting: 'sun-bleached desert highway pull-off with heat shimmer and sparse scrub',
  },
  {
    id: 'greenhouse',
    label: 'Greenhouse',
    setting: 'glass greenhouse aisle with humid air and hanging ferns',
  },
  {
    id: 'garden',
    label: 'Garden',
    setting: 'walled courtyard garden with climbing vines and a stone bench',
  },
  {
    id: 'campus',
    label: 'Campus',
    setting: 'college campus quad with brick buildings and autumn trees',
  },
  {
    id: 'classroom',
    label: 'Classroom',
    setting: 'empty classroom with afternoon light across desks and a chalkboard',
  },
  {
    id: 'studio-loft',
    label: 'Studio loft',
    setting: 'industrial loft studio with tall windows, exposed brick, and a worktable',
  },
  {
    id: 'recording',
    label: 'Recording booth',
    setting: 'padded recording booth with a mic stand and soft LED meter glow',
  },
  {
    id: 'photo-studio',
    label: 'Photo studio',
    setting: 'photo studio seamless backdrop with softbox light and cable clutter',
  },
  {
    id: 'warehouse',
    label: 'Warehouse',
    setting: 'abandoned warehouse interior with dusty shafts of light through broken glass',
  },
  {
    id: 'parking',
    label: 'Parking garage',
    setting: 'concrete parking garage level with fluorescent strips and painted columns',
  },
  {
    id: 'elevator',
    label: 'Elevator',
    setting: 'mirrored elevator interior with brushed steel panels and soft overhead light',
  },
  {
    id: 'airport',
    label: 'Airport',
    setting: 'airport departure lounge with floor-to-ceiling windows and taxiing planes',
  },
  {
    id: 'bus-stop',
    label: 'Bus stop',
    setting: 'rainy bus stop shelter with a glowing timetable and wet pavement',
  },
  {
    id: 'tram',
    label: 'Tram',
    setting: 'vintage tram car interior with wooden seats and city blur through windows',
  },
  {
    id: 'ferry',
    label: 'Ferry deck',
    setting: 'open ferry deck railing with harbor wind and distant skyline',
  },
  {
    id: 'arcade',
    label: 'Arcade',
    setting: 'neon arcade floor with blinking cabinets and carpet patterns',
  },
  {
    id: 'bowling',
    label: 'Bowling alley',
    setting: 'bowling alley lane approach with glowing pins and scored overhead screens',
  },
  {
    id: 'carnival',
    label: 'Carnival',
    setting: 'night carnival midway with string lights, rides, and popcorn carts',
  },
  {
    id: 'stadium',
    label: 'Stadium',
    setting: 'empty stadium concourse with team colors and distant field lights',
  },
  {
    id: 'church',
    label: 'Chapel',
    setting: 'quiet stone chapel aisle with stained glass light and wooden pews',
  },
  {
    id: 'cemetery',
    label: 'Cemetery',
    setting: 'foggy cemetery path with iron gates and weathered headstones',
  },
  {
    id: 'fire-escape',
    label: 'Fire escape',
    setting: 'metal fire escape landing overlooking a narrow brick alley',
  },
  {
    id: 'penthouse',
    label: 'Penthouse',
    setting: 'glass-walled penthouse living room overlooking a glittering night skyline',
  },
  {
    id: 'cabin',
    label: 'Cabin',
    setting: 'wood cabin interior with a stone fireplace and snow visible through the panes',
  },
  {
    id: 'motel',
    label: 'Motel',
    setting: 'roadside motel room with patterned curtains and a buzzing neon vacancy sign outside',
  },
];

export function resolveRoleplaySetting(
  setting?: string | null,
  lockedLocation?: string | null
): string {
  return setting?.trim() || lockedLocation?.trim() || '';
}

export function rollRoleplaySetting(exclude?: string | null): string {
  const skip = exclude?.trim() ?? '';
  const pool = ROLEPLAY_SETTING_PRESETS.filter(entry => entry.setting !== skip);
  const pickFrom = pool.length > 0 ? pool : ROLEPLAY_SETTING_PRESETS;
  const index = Math.floor(Math.random() * pickFrom.length);
  return pickFrom[index]?.setting ?? ROLEPLAY_SETTING_PRESETS[0]!.setting;
}

export function formatRoleplaySettingCue(input: {
  setting?: string | null;
  hasReferenceImage?: boolean;
  isolatedSubject?: boolean;
  phase: 'bio' | 'scenes' | 'prompt';
  continuing?: boolean;
}): string {
  const setting = input.setting?.trim() ?? '';
  const photo = Boolean(input.hasReferenceImage);
  const isolated = photo && Boolean(input.isolatedSubject);

  if (input.phase === 'bio') {
    if (setting && photo) {
      return `Seeded setting: ${setting}. Look describes the person and costume only — not the photo's background. They may be placed in this setting.`;
    }
    if (setting) {
      return `Seeded setting: ${setting}. The look can mention this place.`;
    }
    if (photo) {
      return `Look describes the person and costume only. Do not copy the reference photo's background, furniture, or lighting.`;
    }
    return '';
  }

  if (input.phase === 'scenes') {
    if (setting && input.continuing) {
      return `Seeded setting: ${setting}. Stay in this place or its immediate surroundings, but vary the room, weather, crowd, or hour so the four stills do not look identical.`;
    }
    if (setting) {
      return `Seeded setting: ${setting}. All four opening options happen in or around this place, in different rooms, hours, or weather.`;
    }
    if (photo) {
      return `Do not reuse the reference photo's location. Invent a fitting place for this character.`;
    }
    return '';
  }

  if (isolated && setting) {
    return `The reference is the subject isolated on a blank white backdrop. Replace the white with ${setting}. Keep the person's face, hair, and body identity. Replace the photo's clothing with this beat's outfit. Do not keep a studio void.`;
  }
  if (isolated) {
    return `The reference is the subject isolated on a blank white backdrop. Invent a full environment around them. Keep face, hair, and body identity only. Replace the photo's clothing. Do not keep the white background.`;
  }
  if (setting && photo) {
    return `Replace the scene with ${setting}. Keep the person's face, hair, and body identity from the reference. Discard the photo's clothing, background, furniture, and lighting.`;
  }
  if (setting) {
    return `This still is set in: ${setting}.`;
  }
  if (photo) {
    return `Discard the reference photo's background and clothing. Place them in the beat's setting in the beat's outfit. Keep face, hair, and body identity only.`;
  }
  return '';
}

/** From photo: scene/part wardrobe replaces the reference outfit. */
export function formatRoleplayWardrobeCue(input: {
  hasReferenceImage?: boolean;
  phase: 'bio' | 'scenes' | 'prompt';
  wardrobeLabel?: string;
  garmentDescription?: string;
  hasGarmentReference?: boolean;
}): string {
  if (!input.hasReferenceImage) {
    return '';
  }
  const kit = input.wardrobeLabel?.trim();
  const garment = input.garmentDescription?.trim();
  const hasPackshot = input.hasGarmentReference === true;
  if (input.phase === 'bio') {
    return `Clothes in look come from the part and setting, not the photo. Keep face, hair, and body from the reference; wardrobe is the role (coat, armor, gown, kit) — do not copy the photo's shirt, jacket, jeans, shoes, or uniform.`;
  }
  if (input.phase === 'scenes') {
    if (hasPackshot || kit || garment) {
      return [
        "When a beat's outfit matters, name the garments in the blurb so the still can replace the photo's clothes.",
        kit ? `Locked kit: ${kit}.` : null,
        garment ? `Clothing packshot shows: ${garment}.` : null,
      ]
        .filter(Boolean)
        .join(' ');
    }
    return `When a beat's outfit matters, name the garments in the blurb so the still can replace the photo's clothes.`;
  }
  if (hasPackshot) {
    return [
      'Image 2 is a clothing-only packshot — apply that exact outfit (silhouette, color, fabric, accessories) to the subject.',
      'Keep face, hair, and body identity from Image 1 only.',
      garment ? `Visible garments: ${garment}.` : null,
      kit ? `Kit label: ${kit}.` : null,
      "Ignore Image 2 layout; do not keep the photo's street clothes unless this beat explicitly keeps them.",
    ]
      .filter(Boolean)
      .join(' ');
  }
  return [
    `Replace the reference photo's clothing with the outfit in this beat (and the character look if the beat does not name clothes).`,
    kit ? `Prefer this locked kit when the beat is vague: ${kit}.` : null,
    garment ? `Garment cue: ${garment}.` : null,
    `Keep face, hair, and body identity only. Do not keep the photo's street clothes, uniform, or shoes unless this beat explicitly keeps them. If the beat names different clothes than the look, the beat's clothes win.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Image 3 stick-figure line — same wording Day uses for pose unlock. */
export const ROLEPLAY_POSE_GUIDE_PROMPT_LINE = POSE_GUIDE_EDIT_PROMPT_LINE;

/** From photo: crude Image 3 pose guide (Day parity). */
export function formatRoleplayPoseGuideCue(input: {
  hasReferenceImage?: boolean;
  phase: 'bio' | 'scenes' | 'prompt';
  hasPoseGuide?: boolean;
  realismMode?: RenderRealismMode;
}): string {
  if (!input.hasReferenceImage || input.hasPoseGuide === false) {
    return '';
  }
  if (input.phase === 'prompt') {
    const mode = normalizeRenderRealismMode(input.realismMode ?? DEFAULT_RENDER_REALISM_MODE);
    return `${poseGuidePromptBlock(mode)} Describe the beat's action (and any second person) so the still can match that stance.`;
  }
  if (input.phase === 'scenes') {
    return 'Vary pose and stance between options — stills get a mannequin pose guide on Image 3 (two figures when the beat is a duo).';
  }
  return '';
}

/** Append Image 3 pose cue + realism lock when queueing a photo still (idempotent). */
export function withRoleplayPoseGuidePrompt(
  prompt: string,
  enabled: boolean,
  realismMode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE,
  model?: string | null
): string {
  const reinforced = reinforceIntimateStillPrompt(prompt);
  const withPose = withPoseGuideEditPrompt(reinforced, enabled, realismMode, { model });
  if (!enabled || !withPose) {
    return withPose;
  }
  // Prefer literary/compact beat text — lock boilerplate must not retarget layout.
  const layout =
    parseIntimateLayout(
      /^(Behind|Doggy|Chair bent|Piano oral|Cabinet drawer|Drawer afterglow):|Rear wall press|Chaise lower:/i.test(
        reinforced
      )
        ? reinforced
        : prompt
    ) ?? parseIntimateLayout(reinforced);
  // Lead with action lock so instruction-edit models don't preserve Image 1 standing pose.
  let next = withPose;
  if (layout && !withPose.startsWith(POSE_GUIDE_ACTION_LOCK.slice(0, 24))) {
    next = `${POSE_GUIDE_ACTION_LOCK}\n${withPose}`;
  }
  if (
    layout === 'wall' &&
    !/STANDING upright with feet flat|STANDING upright sex against the wall|Wall duo: exactly two|Rear wall press/i.test(
      next
    )
  ) {
    next = `${POSE_GUIDE_WALL_STANDING_LOCK}\n${next}`;
  }
  if (
    layout === 'wall' &&
    /\b(throat|collarbone|vagina|core|nape)\b/i.test(reinforced) &&
    !/Same facing, partner strictly behind|Partner behind only:|Both standing upright, feet on the floor|Partner stands behind the lead|Rear wall press|hand at her throat/i.test(
      next
    )
  ) {
    next = `${POSE_GUIDE_WALL_CONTACT_LOCK}\n${next}`;
  }
  if (
    (layout === 'oral' || /^Piano oral:/i.test(reinforced)) &&
    /\bpiano\b/i.test(reinforced) &&
    !/Piano oral:|kneels BESIDE|kneeling ON the piano bench/i.test(next)
  ) {
    next = `${POSE_GUIDE_PIANO_ORAL_LOCK}\n${next}`;
  }
  if (
    (layout === 'afterglow' || /^Drawer afterglow:/i.test(reinforced)) &&
    /\bdrawer\b/i.test(reinforced) &&
    !/Drawer afterglow: exactly TWO nude adults/i.test(next)
  ) {
    next = `${POSE_GUIDE_DRAWER_AFTERGLOW_LOCK}\n${next}`;
  } else if (
    layout === 'bent' &&
    (intimateTextImpliesCabinetDrawer(reinforced) || /^Cabinet drawer:/i.test(reinforced)) &&
    !/Cabinet drawer: exactly TWO nude adults/i.test(next)
  ) {
    next = `${POSE_GUIDE_CABINET_DRAWER_LOCK}\n${next}`;
  } else if (
    layout === 'bent' &&
    /Chair bent:/i.test(reinforced) &&
    !/Chair bent: two adults standing|folded over chair/i.test(next)
  ) {
    next = `${POSE_GUIDE_CHAIR_BENT_LOCK}\n${next}`;
  } else if (
    layout === 'bent' &&
    intimateTextImpliesSurfaceBent(reinforced) &&
    (/\bthroat\b/i.test(reinforced) || /\bledger|archive\b/i.test(reinforced)) &&
    !/Archive bent:/i.test(next)
  ) {
    next = `${POSE_GUIDE_ARCHIVE_BENT_LOCK}\n${next}`;
  } else if (
    layout === 'bent' &&
    !intimateTextImpliesCabinetDrawer(reinforced) &&
    !/^Cabinet drawer:/i.test(reinforced) &&
    !/Behind duo:|Archive bent:|Cabinet drawer:|Doggy duo:|gripping her hips only|Chair bent:|^Behind:|^Doggy:/im.test(
      next
    )
  ) {
    next = `${POSE_GUIDE_DOGGY_LOCK}\n${next}`;
  }
  return next;
}

/** Clarify euphemisms then optionally attach Image 3 pose cues (Story stills). */
export function prepareRoleplayStillPrompt(
  prompt: string,
  options?: { poseGuide?: boolean; realismMode?: RenderRealismMode }
): string {
  const reinforced = reinforceIntimateStillPrompt(prompt);
  if (options?.poseGuide) {
    return withRoleplayPoseGuidePrompt(
      reinforced,
      true,
      options.realismMode ?? DEFAULT_RENDER_REALISM_MODE
    );
  }
  return reinforced;
}

const KEEP_GARMENT_INTIMATE_LAYOUTS: ReadonlySet<IntimateLayout> = new Set(['undress']);

/**
 * Drop Image 2 when an intimate beat implies nude (no wardrobe words).
 * Lingerie / half-dressed / kit packshots still attach when the beat names clothes.
 */
export function storyBeatOmitsGarmentPackshot(
  beat: { title?: string; blurb?: string; prompt?: string } | null | undefined
): boolean {
  const haystack = [beat?.title, beat?.blurb, beat?.prompt].filter(Boolean).join(' · ');
  const layout = parseIntimateLayout(haystack);
  if (!layout || KEEP_GARMENT_INTIMATE_LAYOUTS.has(layout)) {
    return false;
  }
  return intimateTextDefaultsToNude(haystack);
}

/** Cap IP-Adapter when Image 3 intimate layouts need body freedom (face stays). */
export const STORY_INTIMATE_POSE_IDENTITY_LOCK_CAP = 0.45;

/**
 * Soften face lock further on nude/sex beats that drop the garment packshot —
 * high IP + lingerie-tinted reference invents beige bras over FULLY NUDE.
 */
export const STORY_ADULT_NUDE_IDENTITY_LOCK_CAP = 0.12;

/**
 * Cap SNOFS / NSFW sex-LoRA strength on intimate + Image 3 stills so pose-guide
 * layouts can vary. Bare high SNOFS + "sex" collapses every beat to one pose.
 */
export const STORY_INTIMATE_SNOFS_STRENGTH_CAP = 0.45;

const SNOFS_LORA_ID_RE = /snofs|sex.?nudes|other.?fun.?stuff/i;

/** True when a LoRA library id/label/filename looks like Qwen_SNOFS (or cousins). */
export function loraEntryLooksLikeSnofs(entry: {
  id?: string;
  label?: string;
  tokenValue?: string;
  filename?: string;
}): boolean {
  return SNOFS_LORA_ID_RE.test(
    [entry.id, entry.label, entry.tokenValue, entry.filename].filter(Boolean).join(' ')
  );
}

/**
 * Dip SNOFS-like LoRAs on intimate Image 3 stills so pose-guide layouts can vary
 * instead of every beat collapsing to the LoRA's default sex pose.
 */
export function storyIntimateSnofsStrengthOverrides(options: {
  beat?: { title?: string; blurb?: string; prompt?: string } | null;
  hasPoseGuide?: boolean;
  sessionActiveLoraIds?: string[] | null;
  library?: Array<{ id: string; label?: string; tokenValue?: string }> | null;
}): SessionLoraStrengthOverrides | undefined {
  if (!options.hasPoseGuide || !options.beat) {
    return undefined;
  }
  const haystack = [options.beat.title, options.beat.blurb, options.beat.prompt]
    .filter(Boolean)
    .join(' · ');
  if (!parseIntimateLayout(haystack) && !intimateTextImpliesAct(haystack)) {
    return undefined;
  }
  const ids = (options.sessionActiveLoraIds ?? []).map(id => id.trim()).filter(Boolean);
  if (!ids.length) {
    return undefined;
  }
  const library: Array<{ id: string; label?: string; tokenValue?: string }> =
    options.library ??
    (loadComfyUiSettings().loraLibrary ?? []).map(entry => ({
      id: entry.id,
      label: entry.label,
      tokenValue: entry.tokenValue,
    }));
  const overrides: SessionLoraStrengthOverrides = {};
  for (const id of ids) {
    const entry = library.find(item => item.id === id);
    if ((entry && loraEntryLooksLikeSnofs(entry)) || SNOFS_LORA_ID_RE.test(id)) {
      overrides[id] = {
        strengthModel: STORY_INTIMATE_SNOFS_STRENGTH_CAP,
        strengthClip: STORY_INTIMATE_SNOFS_STRENGTH_CAP,
      };
    }
  }
  return Object.keys(overrides).length ? overrides : undefined;
}

/**
 * Soften face-lock strength on intimate stills so stance can change without
 * losing Cast likeness. Nude beats (omit garment) get a harder soft-cap even
 * without Image 3 — lingerie-tinted refs otherwise win over FULLY NUDE.
 */
export function storyIdentityLockStrengthForBeat(
  base: number | null | undefined,
  options: {
    beat?: { title?: string; blurb?: string; prompt?: string } | null;
    hasPoseGuide?: boolean;
    omitGarment?: boolean;
  }
): number | undefined {
  const strength =
    typeof base === 'number' && Number.isFinite(base) ? Math.max(0, Math.min(1, base)) : undefined;
  const effective = strength ?? 0.75;
  const omitGarment =
    options.omitGarment === true ||
    (options.beat ? storyBeatOmitsGarmentPackshot(options.beat) : false);
  if (omitGarment) {
    return Math.min(effective, STORY_ADULT_NUDE_IDENTITY_LOCK_CAP);
  }
  if (!options.hasPoseGuide || !options.beat) {
    return strength;
  }
  const haystack = [options.beat.title, options.beat.blurb, options.beat.prompt]
    .filter(Boolean)
    .join(' · ');
  if (!parseIntimateLayout(haystack) && !intimateTextImpliesAct(haystack)) {
    return strength;
  }
  return Math.min(effective, STORY_INTIMATE_POSE_IDENTITY_LOCK_CAP);
}

/**
 * Still retry: new seed + slight denoise jitter so merges/soft takes don't repeat.
 * Keeps denoise in the strong-edit band (≥0.94) so Image 3 pose still wins.
 */
export function storyStillRetryQueueParamsBase(): {
  seed: string;
  denoise: number;
} {
  return {
    seed: String(Math.floor(Math.random() * 2 ** 32)),
    denoise: Number((0.94 + Math.random() * 0.06).toFixed(3)),
  };
}

/**
 * Prefer the beat's intimate action over a soft LLM standing tableau.
 * Puts reinforced blurb first so Qwen Edit changes pose instead of decorating the Cast plate.
 */
export function storyStillPromptSource(input: {
  llmPrompt: string;
  blurb?: string | null;
  title?: string | null;
}): string {
  const llm = input.llmPrompt.trim();
  const blurb = input.blurb?.trim() || '';
  const haystack = [input.title, blurb, llm].filter(Boolean).join(' · ');
  const intimate = Boolean(parseIntimateLayout(haystack)) || intimateTextImpliesAct(haystack);
  if (intimate && blurb) {
    const action = reinforceIntimateStillPrompt(blurb);
    // Compact wall/chaise/chair/doggy recipes already encode the full beat — appending the LLM
    // standing tableau reintroduces literary bait and prompt bloat.
    if (
      (/Rear wall press/i.test(action) ||
        /Chaise lower:/i.test(action) ||
        /^Chair bent:/i.test(action) ||
        /^Behind:/i.test(action) ||
        /^Doggy:/i.test(action)) &&
      /Exactly two adults/i.test(action)
    ) {
      return action;
    }
    // Avoid duplicating if LLM already echoed the blurb.
    if (llm.toLowerCase().includes(blurb.slice(0, 40).toLowerCase())) {
      return reinforceIntimateStillPrompt(`${action}\n${llm}`);
    }
    return reinforceIntimateStillPrompt(
      `${action}\nKeep face identity from the reference. Change pose and wardrobe to match this beat — not a standing fashion portrait.\n${llm}`
    );
  }
  if (isLegacyAdultMetaBlurb(blurb)) {
    return `${llm}\n${blurb}`;
  }
  return llm;
}

export function normalizeRoleplayIsolateSubject(value: unknown): boolean {
  return value !== false && value !== 'false' && value !== 0;
}

const ROLEPLAY_CONTENT_ALIASES: Record<string, RoleplayContentId> = {
  clean: 'clean',
  'all-ages': 'clean',
  allages: 'clean',
  wholesome: 'clean',
  sfw: 'clean',
  pg13: 'pg13',
  'pg-13': 'pg13',
  pg: 'pg13',
  mild: 'pg13',
  suggestive: 'suggestive',
  teasing: 'suggestive',
  spicy: 'suggestive',
  sultry: 'sultry',
  adult: 'sultry',
  sexy: 'sultry',
  sensual: 'sultry',
  explicit: 'explicit',
  nsfw: 'explicit',
  xxx: 'explicit',
  raunchy: 'raunchy',
  crude: 'raunchy',
  dirty: 'raunchy',
};

const LEGACY_ADULT_TONES = new Set(['sultry', 'adult', 'sexy', 'nsfw']);

export const CUSTOM_ROLEPLAY_PERSONA_ID = 'custom';

// Built-in persona archetypes live in roleplay-archetypes.ts; re-exported
// here unchanged so existing external imports from '@/lib/roleplay' keep working.
export {
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_ARCHETYPE_FEATURED_IDS,
  type RoleplayArchetype,
} from './roleplay-archetypes';

export function normalizeRoleplayTone(value: string | null | undefined): RoleplayTone {
  const trimmed = String(value ?? '')
    .trim()
    .toLowerCase();
  if (ROLEPLAY_TONE_IDS.has(trimmed)) {
    return trimmed as RoleplayTone;
  }
  return 'silly';
}

export function normalizeRoleplayContent(value: string | null | undefined): RoleplayContentId {
  const trimmed = String(value ?? '')
    .trim()
    .toLowerCase();
  return ROLEPLAY_CONTENT_ALIASES[trimmed] ?? 'pg13';
}

export function isRoleplayAdultContent(content: RoleplayContentId): boolean {
  return content === 'sultry' || content === 'explicit' || content === 'raunchy';
}

/** When the NSFW env lockout is off, adult ratings fall back to PG-13. */
export function clampRoleplayContentForAdultGate(
  content: RoleplayContentId,
  adultEnabled: boolean
): RoleplayContentId {
  if (!adultEnabled && isRoleplayAdultContent(content)) {
    return 'pg13';
  }
  return content;
}

export function normalizeRoleplayPlayAs(value: string | null | undefined): RoleplayPlayAs {
  const trimmed = String(value ?? '')
    .trim()
    .toLowerCase();
  if (
    trimmed === 'photo' ||
    trimmed === 'image' ||
    trimmed === 'img2img' ||
    trimmed === 'i2i' ||
    trimmed === 'reference'
  ) {
    return 'photo';
  }
  return 'text';
}

export function lastRoleplayStillImage(
  story: RoleplayStoryBeat[] | null | undefined
): { url: string; title: string } | null {
  for (let index = (story ?? []).length - 1; index >= 0; index -= 1) {
    const beat = story?.[index];
    if (!beat) {
      continue;
    }
    const url = lastCompletedRoleplayStillUrl(beat) || beat.imageUrl?.trim();
    if (!url) {
      continue;
    }
    return { url, title: beat.title.trim() || 'Still' };
  }
  return null;
}

export function resolveRoleplayToneAndContent(
  tone?: string | null,
  content?: string | null,
  options?: { adultEnabled?: boolean }
): { tone: RoleplayTone; content: RoleplayContentId } {
  const rawTone = String(tone ?? '')
    .trim()
    .toLowerCase();
  const hasContent = String(content ?? '').trim().length > 0;
  const resolved =
    !hasContent && LEGACY_ADULT_TONES.has(rawTone)
      ? {
          tone: 'silly' as const,
          content: normalizeRoleplayContent(rawTone === 'nsfw' ? 'explicit' : 'sultry'),
        }
      : {
          tone: normalizeRoleplayTone(rawTone),
          content: normalizeRoleplayContent(content),
        };
  if (options?.adultEnabled === false) {
    return {
      tone: resolved.tone,
      content: clampRoleplayContentForAdultGate(resolved.content, false),
    };
  }
  return resolved;
}

export function parseRoleplayAllowGore(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

export function getRoleplayArchetype(id: string | null | undefined): RoleplayArchetype | undefined {
  const key = String(id ?? '').trim();
  return ROLEPLAY_ARCHETYPES.find(entry => entry.id === key);
}

export function resolveRoleplayPersonaPrompt(
  personaId: string | null | undefined,
  customPersona?: string
): string {
  if (personaId === CUSTOM_ROLEPLAY_PERSONA_ID) {
    return customPersona?.trim() || 'an unexpected character with a secret inner life';
  }
  return (
    getRoleplayArchetype(personaId)?.prompt ??
    customPersona?.trim() ??
    ROLEPLAY_ARCHETYPES[0].prompt
  );
}

export function isRoleplayBioComplete(bio: Partial<RoleplayBio> | null | undefined): boolean {
  return Boolean(bio?.name?.trim() && bio.look?.trim() && bio.personality?.trim());
}

export function parseRoleplayBioFromText(
  text: string,
  fallbackName?: string | null
): RoleplayBio | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const labeled = (label: string): string => {
    const match = trimmed.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, 'im'));
    return match?.[1]?.trim() ?? '';
  };
  let name = labeled('name') || labeled('character');
  let look = labeled('look') || labeled('appearance');
  let personality = labeled('personality') || labeled('bio');
  const catchphrase = labeled('catchphrase') || labeled('phrase');
  if (!name || !look || !personality) {
    const lines = trimmed
      .split(/\n+/)
      .map(line =>
        line.replace(/^(name|look|appearance|personality|bio|catchphrase)\s*:\s*/i, '').trim()
      )
      .filter(Boolean);
    if (!name) {
      name = lines[0] ?? '';
    }
    if (!look) {
      look = lines[1] ?? '';
    }
    if (!personality) {
      personality = lines
        .slice(name && look ? 2 : 1)
        .join(' ')
        .trim();
    }
  }
  name = normalizeRoleplayCharacterName(name || fallbackName);
  look = look.trim();
  personality = personality.trim();
  if (!name || !look || !personality) {
    return null;
  }
  return {
    name,
    look: look.slice(0, 800),
    personality: personality.slice(0, 800),
    ...(catchphrase ? { catchphrase: catchphrase.slice(0, 160) } : {}),
  };
}

export function formatRoleplayBio(bio: RoleplayBio): string {
  const catchphrase = bio.catchphrase?.trim();
  return [
    bio.name.trim(),
    bio.look.trim(),
    bio.personality.trim(),
    catchphrase ? `Catchphrase: ${catchphrase}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function slugRoleplayExportPart(value: string, fallback = 'beat'): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

export function roleplayStillBasename(title: string, index: number): string {
  const n = String(index + 1).padStart(2, '0');
  return `${n}-${slugRoleplayExportPart(title)}`;
}

export function formatRoleplayStoryMarkdown(input: {
  bio?: RoleplayBio | null;
  story: RoleplayStoryBeat[];
  tone?: string;
  content?: string;
  personaLabel?: string;
  stillFilenames?: Array<string | null | undefined>;
  clipFilenames?: Array<string | null | undefined>;
  filmFilename?: string | null;
}): string {
  const name = input.bio?.name.trim() || 'Untitled story';
  const tone = input.tone?.trim();
  const content = input.content?.trim();
  const persona = input.personaLabel?.trim();
  const lines: string[] = [`# ${name}`, ''];
  if (persona) {
    lines.push(`Part: ${persona}`, '');
  }
  if (tone) {
    lines.push(`Tone: ${tone}`, '');
  }
  if (content) {
    lines.push(`Content: ${content}`, '');
  }
  if (input.bio) {
    lines.push('## Character', '', formatRoleplayBio(input.bio), '');
  }
  if (input.story.length === 0) {
    lines.push('_No beats yet._', '');
    return lines.join('\n').trim() + '\n';
  }
  lines.push('## Story', '');
  input.story.forEach((beat, index) => {
    lines.push(`### ${index + 1}. ${beat.title.trim() || 'Beat'}`, '');
    if (beat.blurb.trim()) {
      lines.push(beat.blurb.trim(), '');
    }
    const stillName = input.stillFilenames?.[index]?.trim();
    if (stillName) {
      lines.push(`Still: \`stills/${stillName}\``, '');
    } else if (beat.stillStatus && beat.stillStatus !== 'completed') {
      lines.push(`Still: _${beat.stillStatus}_`, '');
    } else {
      lines.push('Still: _not captured_', '');
    }
    const clipName = input.clipFilenames?.[index]?.trim();
    if (clipName) {
      lines.push(`Clip: \`clips/${clipName}\``, '');
    } else if (beat.clipStatus && beat.clipStatus !== 'completed') {
      lines.push(`Clip: _${beat.clipStatus}_`, '');
    }
    if (beat.prompt?.trim()) {
      lines.push('Prompt:', '', '```', beat.prompt.trim(), '```', '');
    }
  });
  const filmName = input.filmFilename?.trim();
  if (filmName) {
    lines.push('## Film', '', `Assembled: \`${filmName}\``, '');
  }
  return lines.join('\n').trim() + '\n';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function slugId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return `${slug || 'scene'}-${index + 1}`;
}

export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? trimmed).trim();
  const objectStart = raw.search(/[{[]/);
  if (objectStart < 0) {
    return null;
  }
  const opener = raw[objectStart];
  const closer = opener === '[' ? ']' : '}';
  const end = raw.lastIndexOf(closer);
  if (end <= objectStart) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(objectStart, end + 1));
  } catch {
    return null;
  }
}

export const MAX_ROLEPLAY_CHARACTER_NAME = 40;

export function normalizeRoleplayCharacterName(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ROLEPLAY_CHARACTER_NAME);
}

/** Only the Character name field locks a name. An existing bible must not. */
export function resolveRoleplayLockedCharacterName(
  characterName?: string | null
): string | undefined {
  return normalizeRoleplayCharacterName(characterName) || undefined;
}

const FRESH_ROLEPLAY_NAMES = [
  'Ivy Finch',
  'Rook Vale',
  'Sable Quinn',
  'Juniper Moss',
  'Theo Lark',
  'Nico Bramble',
  'Wren Hollow',
  'Pax Meridian',
  'Lumen Crowe',
  'Harlow Vetch',
];

export function normalizeAvoidedRoleplayNames(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = normalizeRoleplayCharacterName(value);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function pickFreshRoleplayName(
  avoid: Array<string | null | undefined> = [],
  pick: (max: number) => number = max => Math.floor(Math.random() * max)
): string {
  const blocked = new Set(normalizeAvoidedRoleplayNames(avoid).map(name => name.toLowerCase()));
  const pool = FRESH_ROLEPLAY_NAMES.filter(name => !blocked.has(name.toLowerCase()));
  const choices = pool.length > 0 ? pool : FRESH_ROLEPLAY_NAMES;
  return (
    choices[Math.max(0, Math.min(choices.length - 1, pick(choices.length)))] ?? 'The Unexpected'
  );
}

export function applyRoleplayCharacterName(
  bio: RoleplayBio,
  characterName?: string | null
): RoleplayBio {
  const name = normalizeRoleplayCharacterName(characterName);
  if (!name || bio.name === name) {
    return bio;
  }
  return { ...bio, name };
}

export function parseRoleplayBio(
  payload: unknown,
  fallback?: RoleplayBio,
  characterName?: string | null
): RoleplayBio {
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const name = readString(record?.name);
  const look = readString(record?.look) || readString(record?.appearance);
  const personality = readString(record?.personality) || readString(record?.bio);
  const catchphrase = readString(record?.catchphrase) || undefined;
  if (name && look && personality) {
    return applyRoleplayCharacterName(
      { name, look, personality, ...(catchphrase ? { catchphrase } : {}) },
      characterName
    );
  }
  if (fallback) {
    return applyRoleplayCharacterName(fallback, characterName);
  }
  return applyRoleplayCharacterName(ROLEPLAY_ARCHETYPES[0].templateBio, characterName);
}

export function parseRoleplayScenes(payload: unknown): RoleplayScene[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? Array.isArray((payload as { scenes?: unknown }).scenes)
        ? (payload as { scenes: unknown[] }).scenes
        : []
      : [];
  const scenes: RoleplayScene[] = [];
  for (const [index, row] of rows.entries()) {
    if (typeof row === 'string' && row.trim()) {
      scenes.push({ id: slugId(row, index), title: row.trim(), blurb: row.trim() });
      continue;
    }
    if (!row || typeof row !== 'object') {
      continue;
    }
    const record = row as Record<string, unknown>;
    const title = readString(record.title) || readString(record.name);
    const blurb = readString(record.blurb) || readString(record.summary) || title;
    if (!title) {
      continue;
    }
    scenes.push({
      id: slugId(title, index),
      title,
      blurb,
      ...(record.kind === 'ending' || record.kind === 'plot' ? { kind: record.kind } : {}),
    });
  }
  return scenes.slice(0, 6);
}

export function templateRoleplayBio(
  personaId: string | null | undefined,
  customPersona?: string,
  characterName?: string | null,
  options?: { fresh?: boolean; avoidNames?: Array<string | null | undefined> }
): RoleplayBio {
  const archetype = getRoleplayArchetype(personaId);
  const base = archetype
    ? archetype.templateBio
    : {
        name: 'The Unexpected',
        look: resolveRoleplayPersonaPrompt(personaId, customPersona),
        personality: 'Here for a good time and a slightly confusing plot.',
        catchphrase: 'Okay but what if we made it weirder.',
      };
  const locked = resolveRoleplayLockedCharacterName(characterName);
  if (locked) {
    return applyRoleplayCharacterName(base, locked);
  }
  if (options?.fresh) {
    return {
      ...base,
      name: pickFreshRoleplayName([base.name, ...(options.avoidNames ?? [])]),
    };
  }
  return base;
}

export const ROLEPLAY_INTRO_SCENE_ID = 'intro-first-look';

function clipRoleplayWords(value: string, maxWords: number): string {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, Math.max(1, maxWords)).join(' ');
}

export function clipRoleplayTitle(value: string, maxWords = 6): string {
  return clipRoleplayWords(value.replace(/[:—–|/]+/g, ' '), maxWords) || 'Next beat';
}

export function roleplaySceneTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

const ROLEPLAY_SCENE_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'from',
  'into',
  'after',
  'during',
  'still',
  'you',
  'your',
  'they',
  'their',
  'this',
  'that',
  'than',
  'just',
  'what',
  'them',
  'then',
  'when',
  'who',
  'are',
  'was',
  'were',
  'has',
  'had',
  'have',
  'but',
  'not',
  'out',
  'off',
  'over',
  'under',
  'again',
  'next',
  'now',
  'too',
  'only',
  'same',
  'place',
  'moment',
  'beat',
  'scene',
]);

const ROLEPLAY_TITLE_DECOR = [
  'right after',
  'fallout from',
  'worse than',
  'double down on',
  'caught during',
  'bargain after',
  'escape from',
  'reveal during',
  'next room',
  'hours later',
  'uninvited guest',
  'wardrobe change',
  'night shift',
  'opposite play',
  'in public',
  'setpiece stunt',
];

export function roleplaySceneContentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 3 && !ROLEPLAY_SCENE_STOPWORDS.has(word))
  );
}

export function roleplaySceneTokenOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.min(left.size, right.size);
}

export function roleplaySceneCoreTitle(title: string): string {
  let next = title
    .trim()
    .toLowerCase()
    .replace(/[:—–|/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const prefix of ROLEPLAY_TITLE_DECOR) {
    if (next === prefix || next.startsWith(`${prefix} `)) {
      next = next.slice(prefix.length).trim();
      break;
    }
  }
  return next;
}

export function roleplayScenesTooSimilar(
  left: { title: string; blurb?: string },
  right: { title: string; blurb?: string }
): boolean {
  const leftBlurb = left.blurb?.trim().toLowerCase() ?? '';
  const rightBlurb = right.blurb?.trim().toLowerCase() ?? '';
  if (leftBlurb && leftBlurb === rightBlurb) {
    return true;
  }
  const leftCore = roleplaySceneCoreTitle(left.title);
  const rightCore = roleplaySceneCoreTitle(right.title);
  if (leftCore && leftCore === rightCore) {
    return true;
  }
  const leftTitle = roleplaySceneContentTokens(leftCore || left.title);
  const rightTitle = roleplaySceneContentTokens(rightCore || right.title);
  if (
    leftTitle.size >= 2 &&
    rightTitle.size >= 2 &&
    roleplaySceneTokenOverlap(leftTitle, rightTitle) >= 0.67
  ) {
    return true;
  }
  const leftAll = roleplaySceneContentTokens(`${left.title} ${left.blurb ?? ''}`);
  const rightAll = roleplaySceneContentTokens(`${right.title} ${right.blurb ?? ''}`);
  return (
    leftAll.size >= 5 && rightAll.size >= 5 && roleplaySceneTokenOverlap(leftAll, rightAll) >= 0.78
  );
}

export function usedRoleplaySceneTitles(story: Array<{ title: string }> | undefined): Set<string> {
  return new Set(
    (story ?? [])
      .flatMap(beat => [roleplaySceneTitleKey(beat.title), roleplaySceneCoreTitle(beat.title)])
      .filter(Boolean)
  );
}

export function lastRoleplayPlotBeat(
  story: RoleplayStoryBeat[] | undefined
): RoleplayStoryBeat | undefined {
  return (story ?? [])
    .filter(beat => beat.id !== ROLEPLAY_INTRO_SCENE_ID && beat.kind !== 'ending')
    .at(-1);
}

export const MAX_ROLEPLAY_REJECTED_SCENES = 24;

/** Keep unpicked cards across rolls so later forks do not resurface. */
export function mergeRoleplayRejectedScenes(
  prior: RoleplayScene[] | undefined,
  offered: RoleplayScene[] | undefined,
  chosen?: Pick<RoleplayScene, 'title'> | null
): RoleplayScene[] {
  const chosenKey = chosen ? roleplaySceneTitleKey(chosen.title) : '';
  const chosenCore = chosen ? roleplaySceneCoreTitle(chosen.title) : '';
  const next: RoleplayScene[] = [];
  const seen = new Set<string>();
  for (const scene of [...(prior ?? []), ...(offered ?? [])]) {
    const title = scene.title.trim();
    if (!title) {
      continue;
    }
    const key = roleplaySceneTitleKey(title);
    const core = roleplaySceneCoreTitle(title);
    if (!key || key === chosenKey || (chosenCore && core === chosenCore) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (core) {
      seen.add(core);
    }
    next.push({
      id: scene.id?.trim() || key,
      title,
      blurb: scene.blurb?.trim() || title,
    });
  }
  return next.slice(-MAX_ROLEPLAY_REJECTED_SCENES);
}

export function formatRoleplayAvoidedScenes(
  scenes: Array<{ title: string; blurb?: string }> | undefined
): string {
  const lines = (scenes ?? [])
    .map(scene => {
      const title = scene.title.trim();
      if (!title) {
        return '';
      }
      const blurb = scene.blurb?.trim();
      return blurb ? `- ${title} — ${blurb}` : `- ${title}`;
    })
    .filter(Boolean);
  if (lines.length === 0) {
    return '';
  }
  return `Already offered or played (do not repeat or paraphrase):\n${lines.join('\n')}`;
}

export function formatRoleplayStoryDigest(story: RoleplayStoryBeat[] | undefined): string {
  const recent = (story ?? []).slice(-8);
  const variety =
    'Four options must look like four different photographs: change the action, the place or time of day, and the pose. Do not offer the same tableau with a new verb.';
  const phase = roleplayStoryPhase(story);
  if (recent.length === 0) {
    return [
      'Story so far: nothing yet — this is the opening beat. Write four opening options.',
      variety,
    ].join('\n');
  }
  const lines = recent.map((beat, index) => `${index + 1}. ${beat.title} — ${beat.blurb}`);
  const lastPlot = lastRoleplayPlotBeat(story);
  const played = formatRoleplayAvoidedScenes(
    (story ?? []).filter(beat => beat.id !== ROLEPLAY_INTRO_SCENE_ID)
  );
  if (phase === 'complete') {
    return [
      `Story so far:\n${lines.join('\n')}`,
      'This episode already ended. Do not write more scenes.',
    ].join('\n');
  }
  if (!lastPlot) {
    return [
      `Story so far:\n${lines.join('\n')}`,
      'Write four opening plot options — first things that can happen to this character.',
      variety,
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (phase === 'finale') {
    return [
      `Story so far:\n${lines.join('\n')}`,
      `Last chosen beat (end from here): ${lastPlot.title} — ${lastPlot.blurb}`,
      played,
      'Write four mutually exclusive ENDINGS — last stills, not new plot forks. Resolution, twist, fade-out, or aftermath. The story stops after the player picks one.',
      variety,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    `Story so far:\n${lines.join('\n')}`,
    `Last chosen beat (continue from here): ${lastPlot.title} — ${lastPlot.blurb}`,
    played,
    'Follow from that pick, but move the story: new room, later hour, new arrival, wardrobe change, or opposite tactic. Not four angles on the same still.',
    variety,
  ]
    .filter(Boolean)
    .join('\n');
}

type RoleplayContinuationFork = {
  titlePrefix: string;
  blurb: (name: string, last: RoleplayStoryBeat) => string;
};

const ROLEPLAY_CONTINUATION_FORKS: RoleplayContinuationFork[] = [
  {
    titlePrefix: 'Next room',
    blurb: (name, last) =>
      `${name} leaves "${last.title}" for an adjoining space, still carrying the problem: ${clipRoleplayWords(last.blurb, 14)}`,
  },
  {
    titlePrefix: 'Hours later',
    blurb: (name, last) =>
      `Later the same day, ${name} is somewhere else dealing with the fallout of ${last.title.toLowerCase()}.`,
  },
  {
    titlePrefix: 'Uninvited guest',
    blurb: (name, last) =>
      `A new person walks in on ${name} after ${last.title.toLowerCase()} and changes the power dynamic.`,
  },
  {
    titlePrefix: 'Wardrobe change',
    blurb: (name, last) =>
      `${name} changes clothes or gear after ${last.title.toLowerCase()} — new silhouette, same trouble.`,
  },
  {
    titlePrefix: 'Night shift',
    blurb: (name, last) =>
      `Light and weather flip. ${name} is still living with ${last.title.toLowerCase()}, but the still looks like a different movie.`,
  },
  {
    titlePrefix: 'Opposite play',
    blurb: (name, last) =>
      `${name} tries the opposite tactic of ${last.title.toLowerCase()} and it immediately complicates.`,
  },
  {
    titlePrefix: 'In public',
    blurb: (name, last) =>
      `The private mess of ${last.title.toLowerCase()} spills into a crowded or exposed place.`,
  },
  {
    titlePrefix: 'Setpiece stunt',
    blurb: (name, last) =>
      `${name} attempts a big physical bit that only makes sense because of ${last.title.toLowerCase()}.`,
  },
];

/** Adult template forks — used when rating is sultry/explicit/raunchy so fallbacks stay sexual. */
const ROLEPLAY_ADULT_CONTINUATION_FORKS: RoleplayContinuationFork[] = [
  {
    titlePrefix: 'Clothes off',
    blurb: (name, _last) =>
      `${name} peeling clothes off with a distinct adult partner — bare skin, hands on zippers, lingerie half on.`,
  },
  {
    titlePrefix: 'Against the wall',
    blurb: (name, _last) =>
      `${name} pinned to a wall by a distinct adult partner — standing sex, one leg hooked, clothes shoved aside.`,
  },
  {
    titlePrefix: 'On the bed',
    blurb: (name, _last) =>
      `${name} and a distinct adult partner naked on a bed — missionary sex, sheets kicked down, two different faces clear.`,
  },
  {
    titlePrefix: 'Oral interruption',
    blurb: (name, _last) =>
      `A distinct adult partner kneeling for oral sex on ${name} — head between thighs, nude bodies, close framing.`,
  },
  {
    titlePrefix: 'From behind',
    blurb: (name, _last) =>
      `${name} on hands and knees with a distinct adult partner behind her in rear-entry sex — gripping hips, nude, mid-thrust, camera behind them.`,
  },
  {
    titlePrefix: 'Straddle',
    blurb: (name, _last) =>
      `${name} straddling a distinct adult partner cowgirl-style — nude, riding, hands on chest, face toward camera.`,
  },
  {
    titlePrefix: 'Caught mid-sex',
    blurb: (name, _last) =>
      `${name} mid-fuck with a distinct adult partner when a door opens — bodies still joined, startled faces, sheets tangled.`,
  },
  {
    titlePrefix: 'Threesome offer',
    blurb: (name, _last) =>
      `${name} with two distinct adult partners — three nude bodies on a bed, hands and mouths, three different faces.`,
  },
  {
    titlePrefix: 'Morning after heat',
    blurb: (name, _last) =>
      `Morning window light on ${name} naked in bed with a distinct adult partner — another round starting, soft sheets.`,
  },
  {
    titlePrefix: 'Public risk',
    blurb: (name, _last) =>
      `${name} having quick standing sex with a distinct adult partner in a half-hidden public spot — clothes open, risk of being seen.`,
  },
];

const ROLEPLAY_ENDING_FORKS: RoleplayContinuationFork[] = [
  {
    titlePrefix: 'Last light',
    blurb: (name, last) =>
      `${name} at dusk after ${last.title.toLowerCase()} — the trouble is over, the face is readable, the place is emptying.`,
  },
  {
    titlePrefix: 'Walk away',
    blurb: (name, last) =>
      `${name} leaves ${last.title.toLowerCase()} for good, one look back, no one following.`,
  },
  {
    titlePrefix: 'Aftermath',
    blurb: (name, last) =>
      `Morning after ${last.title.toLowerCase()}: ${name} in the wreckage or the quiet, clothes and light telling the ending.`,
  },
  {
    titlePrefix: 'Credits pose',
    blurb: (name, last) =>
      `${name} holds still for a last portrait that resolves ${last.title.toLowerCase()} — no new plot, just the landing.`,
  },
  {
    titlePrefix: 'Door closes',
    blurb: (name, last) =>
      `The door on ${last.title.toLowerCase()} shuts with ${name} on the other side. Story over.`,
  },
  {
    titlePrefix: 'One last look',
    blurb: (name, last) =>
      `${name} looks at what ${last.title.toLowerCase()} cost, then the frame holds and fades.`,
  },
];

const ROLEPLAY_ADULT_ENDING_FORKS: RoleplayContinuationFork[] = [
  {
    titlePrefix: 'Spent together',
    blurb: (name, _last) =>
      `${name} and a distinct adult partner sweaty and naked in bed — soft afterglow, limbs tangled, quiet light.`,
  },
  {
    titlePrefix: 'One more round',
    blurb: (name, _last) =>
      `${name} starting one last round of sex with a distinct adult partner — climax pose, nude, close and intense.`,
  },
  {
    titlePrefix: 'Walk of shame glow',
    blurb: (name, _last) =>
      `${name} leaving after sex — mussed hair, flushed skin, clothes half on, satisfied expression.`,
  },
  {
    titlePrefix: 'Tangled sheets',
    blurb: (name, _last) =>
      `Tangled sheets and ${name}'s bare body — empty room, morning light, no new plot.`,
  },
  {
    titlePrefix: 'Kiss goodbye',
    blurb: (name, _last) =>
      `${name} in a deep nude kiss with a distinct adult partner — bodies pressed close, then fade.`,
  },
  {
    titlePrefix: 'Alone and glowing',
    blurb: (name, _last) =>
      `${name} alone and nude after sex — flushed, quiet bedroom, soft erotic portrait.`,
  },
];

const ROLEPLAY_ADULT_OPENING_SCENES: Array<{ title: string; blurb: string }> = [
  {
    title: 'Heat at the door',
    blurb:
      'Two consenting adults in a doorway — charged eye contact, jackets coming off, skin showing, close enough to kiss.',
  },
  {
    title: 'Wrong bed, right night',
    blurb:
      'Two adults half-naked in a bed that is not theirs — sheets low, morning or night light, obvious sexual heat.',
  },
  {
    title: 'Strip the costume',
    blurb:
      'Clothes coming off mid-scene — lingerie, bare chest, hands on zippers, erotic undressing not a polite portrait.',
  },
  {
    title: 'Private demonstration',
    blurb:
      'A closed-door lesson turning sexual — nude posing, touching, or sex starting, two adults, readable bodies.',
  },
];

function roleplayForksForContent(
  content: RoleplayContentId | undefined,
  kind: 'continue' | 'ending'
): RoleplayContinuationFork[] {
  if (content && isRoleplayAdultContent(content)) {
    return kind === 'ending' ? ROLEPLAY_ADULT_ENDING_FORKS : ROLEPLAY_ADULT_CONTINUATION_FORKS;
  }
  return kind === 'ending' ? ROLEPLAY_ENDING_FORKS : ROLEPLAY_CONTINUATION_FORKS;
}
function uniqueRoleplayTitle(title: string, used: Set<string>): string {
  const base = clipRoleplayTitle(title);
  if (!used.has(roleplaySceneTitleKey(base))) {
    return base;
  }
  const stem = clipRoleplayWords(base, 5);
  for (const suffix of ['next', 'again', 'now', 'too']) {
    const candidate = clipRoleplayTitle(`${stem} ${suffix}`);
    if (!used.has(roleplaySceneTitleKey(candidate))) {
      return candidate;
    }
  }
  return stem;
}

export function continueRoleplayScenes(
  last: RoleplayStoryBeat,
  story?: RoleplayStoryBeat[],
  characterName?: string,
  avoid?: Array<{ title: string; blurb?: string }>,
  content?: RoleplayContentId
): RoleplayScene[] {
  const name = characterName?.trim() || 'You';
  const used = usedRoleplaySceneTitles([...(story ?? []), ...(avoid ?? [])]);
  const forks = roleplayForksForContent(content, 'continue');
  const start = ((story?.length ?? 0) + (avoid?.length ?? 0)) % forks.length;
  const rotated = [...forks.slice(start), ...forks.slice(0, start)];
  const scenes: RoleplayScene[] = [];
  for (const fork of rotated) {
    if (scenes.length >= 4) {
      break;
    }
    const title = uniqueRoleplayTitle(fork.titlePrefix, used);
    const scene = {
      id: slugId(title, scenes.length),
      title,
      blurb: fork.blurb(name, last),
    };
    if (
      [...(story ?? []), ...(avoid ?? []), ...scenes].some(prior =>
        roleplayScenesTooSimilar(scene, prior)
      )
    ) {
      continue;
    }
    used.add(roleplaySceneTitleKey(title));
    used.add(roleplaySceneCoreTitle(title));
    scenes.push(scene);
  }
  return scenes;
}

export function continueRoleplayEndings(
  last: RoleplayStoryBeat,
  story?: RoleplayStoryBeat[],
  characterName?: string,
  avoid?: Array<{ title: string; blurb?: string }>,
  content?: RoleplayContentId
): RoleplayScene[] {
  const name = characterName?.trim() || 'You';
  const used = usedRoleplaySceneTitles([...(story ?? []), ...(avoid ?? [])]);
  const forks = roleplayForksForContent(content, 'ending');
  const start = ((story?.length ?? 0) + (avoid?.length ?? 0)) % forks.length;
  const rotated = [...forks.slice(start), ...forks.slice(0, start)];
  const scenes: RoleplayScene[] = [];
  for (const fork of rotated) {
    if (scenes.length >= 4) {
      break;
    }
    const title = uniqueRoleplayTitle(fork.titlePrefix, used);
    const scene: RoleplayScene = {
      id: slugId(title, scenes.length),
      title,
      blurb: fork.blurb(name, last),
      kind: 'ending',
    };
    if (
      [...(story ?? []), ...(avoid ?? []), ...scenes].some(prior =>
        roleplayScenesTooSimilar(scene, prior)
      )
    ) {
      continue;
    }
    used.add(roleplaySceneTitleKey(title));
    used.add(roleplaySceneCoreTitle(title));
    scenes.push(scene);
  }
  return scenes;
}

export function filterFreshRoleplayScenes(
  scenes: RoleplayScene[],
  story?: RoleplayStoryBeat[],
  avoid?: Array<{ title: string; blurb?: string }>
): RoleplayScene[] {
  const priors = [...(story ?? []), ...(avoid ?? [])];
  const used = usedRoleplaySceneTitles(priors);
  const seen = new Set<string>();
  const fresh: RoleplayScene[] = [];
  for (const scene of scenes) {
    const key = roleplaySceneTitleKey(scene.title);
    const core = roleplaySceneCoreTitle(scene.title);
    if (!key || used.has(key) || used.has(core) || seen.has(key) || seen.has(core)) {
      continue;
    }
    if ([...priors, ...fresh].some(prior => roleplayScenesTooSimilar(scene, prior))) {
      continue;
    }
    seen.add(key);
    if (core) {
      seen.add(core);
    }
    fresh.push(scene);
  }
  return fresh;
}

export function mergeRoleplaySceneOptions(
  preferred: RoleplayScene[],
  fallback: RoleplayScene[],
  story?: RoleplayStoryBeat[],
  limit = 4,
  avoid?: Array<{ title: string; blurb?: string }>
): RoleplayScene[] {
  const freshPreferred = filterFreshRoleplayScenes(preferred, story, avoid);
  const used = new Set([
    ...usedRoleplaySceneTitles([...(story ?? []), ...(avoid ?? [])]),
    ...freshPreferred.map(scene => roleplaySceneTitleKey(scene.title)),
    ...freshPreferred.map(scene => roleplaySceneCoreTitle(scene.title)),
  ]);
  const merged = [...freshPreferred];
  for (const extra of fallback) {
    if (merged.length >= limit) {
      break;
    }
    const key = roleplaySceneTitleKey(extra.title);
    const core = roleplaySceneCoreTitle(extra.title);
    if (!key || used.has(key) || used.has(core)) {
      continue;
    }
    if (
      [...(story ?? []), ...(avoid ?? []), ...merged].some(prior =>
        roleplayScenesTooSimilar(extra, prior)
      )
    ) {
      continue;
    }
    used.add(key);
    if (core) {
      used.add(core);
    }
    merged.push(extra);
  }
  return merged.slice(0, limit);
}

export function templateRoleplayScenes(
  personaId: string | null | undefined,
  customPersona?: string,
  story?: RoleplayStoryBeat[],
  characterName?: string,
  avoid?: Array<{ title: string; blurb?: string }>,
  content?: RoleplayContentId
): RoleplayScene[] {
  const phase = roleplayStoryPhase(story);
  if (phase === 'complete') {
    return [];
  }
  const lastPlot = lastRoleplayPlotBeat(story);
  if (phase === 'finale' && lastPlot) {
    return continueRoleplayEndings(lastPlot, story, characterName, avoid, content);
  }
  if (lastPlot) {
    return continueRoleplayScenes(lastPlot, story, characterName, avoid, content);
  }
  if (content && isRoleplayAdultContent(content)) {
    return filterFreshRoleplayScenes(
      ROLEPLAY_ADULT_OPENING_SCENES.map((row, index) => ({
        id: slugId(row.title, index),
        title: row.title,
        blurb: row.blurb,
      })),
      story,
      avoid
    );
  }
  const archetype = getRoleplayArchetype(personaId);
  const rows = archetype?.templateScenes ?? [
    {
      title: 'A door appears',
      blurb: `${resolveRoleplayPersonaPrompt(personaId, customPersona)} finds a door that was not there yesterday.`,
    },
    { title: 'Wrong weather', blurb: 'The sky is doing a bit. You decide to match its energy.' },
    {
      title: 'Side quest, unsolicited',
      blurb: 'A stranger hands you a quest and also a sandwich.',
    },
    { title: 'Quiet victory pose', blurb: 'Nothing happened, so you pose like it did.' },
  ];
  return filterFreshRoleplayScenes(
    rows.map((row, index) => ({
      id: slugId(row.title, index),
      title: row.title,
      blurb: row.blurb,
    })),
    story,
    avoid
  );
}

export function roleplayIntroScene(bio: RoleplayBio): RoleplayScene {
  const name = bio.name.trim() || 'the character';
  const look = bio.look.trim() || name;
  return {
    id: ROLEPLAY_INTRO_SCENE_ID,
    title: 'First look',
    blurb: `${name} in an establishing portrait: ${look}. Three-quarter or full figure, readable face or equivalent, one clear setting that matches the vibe, no extra plot yet.`,
  };
}

/** Plot scenes after first look, before the closing still. Intro + 10 + ending = 12 panels. */
export const MAX_ROLEPLAY_PLOT_BEATS = 10;
/** Intro + plot + one ending. Slack for older 12-beat sessions. */
export const MAX_ROLEPLAY_STORY_BEATS = 12;
/** How much story the scene/prompt LLM is allowed to see. */
export const MAX_ROLEPLAY_STORY_CONTEXT = 12;

export type RoleplayStoryPhase = 'open' | 'mid' | 'finale' | 'complete';

export function isRoleplayEndingBeat(
  beat: Pick<RoleplayStoryBeat, 'kind' | 'id'> | undefined
): boolean {
  return beat?.kind === 'ending';
}

export function roleplayPlotBeatCount(story: RoleplayStoryBeat[] | undefined): number {
  return (story ?? []).filter(beat => beat.id !== ROLEPLAY_INTRO_SCENE_ID && beat.kind !== 'ending')
    .length;
}

export function roleplayStoryPhase(story: RoleplayStoryBeat[] | undefined): RoleplayStoryPhase {
  if ((story ?? []).some(beat => beat.kind === 'ending')) {
    return 'complete';
  }
  if (roleplayPlotBeatCount(story) >= MAX_ROLEPLAY_PLOT_BEATS) {
    return 'finale';
  }
  if (roleplayPlotBeatCount(story) === 0) {
    return 'open';
  }
  return 'mid';
}

export function formatRoleplayStoryProgress(story: RoleplayStoryBeat[] | undefined): {
  phase: RoleplayStoryPhase;
  heading: string;
  hint: string;
  rollLabel: string;
  rerollLabel: string;
} {
  const phase = roleplayStoryPhase(story);
  const plot = roleplayPlotBeatCount(story);
  if (phase === 'complete') {
    return {
      phase,
      heading: 'The end',
      hint: 'This episode is over. Download the story, cut a film, or start another with this cast.',
      rollLabel: 'The end',
      rerollLabel: 'The end',
    };
  }
  if (phase === 'finale') {
    return {
      phase,
      heading: 'How does it end?',
      hint: 'Four closing stills. Pick one and the reel stops — earlier panels stay.',
      rollLabel: 'Roll four endings',
      rerollLabel: 'Reroll four endings',
    };
  }
  if (phase === 'open') {
    return {
      phase,
      heading: 'What happens next?',
      hint: `Tap a beat to start the plot. ${MAX_ROLEPLAY_PLOT_BEATS} scenes, then an ending.`,
      rollLabel: 'Roll four scenes',
      rerollLabel: 'Reroll four scenes',
    };
  }
  return {
    phase,
    heading: 'What happens next?',
    hint: `Plot ${plot} of ${MAX_ROLEPLAY_PLOT_BEATS}. After that, four endings close the episode.`,
    rollLabel: 'Roll four scenes',
    rerollLabel: 'Reroll four scenes',
  };
}

/** Short user-facing reason Story Roll / queue is blocked, or null when ready. */
export function roleplayQueueBlockReason(input: {
  hasCharacter: boolean;
  hasBio: boolean;
  playAsPhoto?: boolean;
  hasPlate?: boolean;
  isolateSubject?: boolean;
  isolatePending?: boolean;
}): string | null {
  if (!input.hasCharacter) {
    return 'Pick a Cast lead on Film first.';
  }
  if (!input.hasBio) {
    return 'Set a character bible on Cast before rolling scenes.';
  }
  if (input.playAsPhoto && !input.hasPlate) {
    return 'Add a look plate on Cast (From photo) before queuing stills.';
  }
  if (input.playAsPhoto && input.isolateSubject && input.isolatePending) {
    return 'Wait for plate isolate on white to finish.';
  }
  return null;
}

/** Short status line for Cast · plate · beats/clips chrome. */
export function storySessionStatusLine(input: {
  characterName?: string | null;
  hasCharacter: boolean;
  hasPlate: boolean;
  hasWardrobe?: boolean;
  completedStills?: number;
  completedClips?: number;
  beatTotal?: number;
}): string {
  const lead = input.hasCharacter ? input.characterName?.trim() || 'Cast lead' : 'No Cast lead';
  const plate = input.hasPlate ? 'plate ready' : 'no plate';
  const wardrobe = input.hasWardrobe ? 'kit' : null;
  const stills = Math.max(0, input.completedStills ?? 0);
  const clips = Math.max(0, input.completedClips ?? 0);
  const beats = Math.max(0, input.beatTotal ?? 0);
  const progress =
    beats > 0
      ? `${stills}/${beats} stills · ${clips} clip${clips === 1 ? '' : 's'}`
      : `${stills} stills · ${clips} clip${clips === 1 ? '' : 's'}`;
  return [lead, plate, wardrobe, progress].filter(Boolean).join(' · ');
}

export function countRoleplayCompletedStills(story: RoleplayStoryBeat[] | undefined): number {
  return (story ?? []).filter(
    beat => beat.stillStatus === 'completed' && Boolean(beat.imageUrl?.trim())
  ).length;
}

export function countRoleplayCompletedClips(story: RoleplayStoryBeat[] | undefined): number {
  return (story ?? []).filter(
    beat => beat.clipStatus === 'completed' && Boolean(beat.clipUrl?.trim())
  ).length;
}

/**
 * Lightbox slides for Story reel stills/clips with a preview URL (beat order).
 * `openBeatId` selects the starting slide when that beat has a preview.
 */
export function buildStoryProgressLightboxState(
  story: RoleplayStoryBeat[],
  openBeatId: string,
  previewUrlForBeat: (beat: RoleplayStoryBeat) => string | null | undefined
): {
  images: string[];
  titles: string[];
  beatIds: string[];
  prompts: Array<string | undefined>;
  index: number;
  title: string;
} | null {
  const slides = story
    .map(beat => {
      const url = previewUrlForBeat(beat)?.trim();
      if (!url) {
        return null;
      }
      return {
        beatId: beat.id,
        url,
        title: beat.title.trim() || beat.id,
        prompt: beat.prompt?.trim() || undefined,
      };
    })
    .filter(
      (
        slide
      ): slide is { beatId: string; url: string; title: string; prompt: string | undefined } =>
        slide != null
    );
  if (slides.length === 0) {
    return null;
  }
  const openId = openBeatId.trim();
  const index = Math.max(
    0,
    slides.findIndex(slide => slide.beatId === openId)
  );
  return {
    images: slides.map(slide => slide.url),
    titles: slides.map(slide => slide.title),
    beatIds: slides.map(slide => slide.beatId),
    prompts: slides.map(slide => slide.prompt),
    index,
    title: slides[index]?.title ?? 'Story still',
  };
}

/** LLM cue when adult content + Solo/Duo/Mixed mix is set (mirrors Day intimateMix). */
export function roleplayIntimateMixLine(
  content: RoleplayContentId,
  intimateMix: import('./day-planner').DayIntimateMix | string | null | undefined
): string {
  if (!isRoleplayAdultContent(content)) {
    return '';
  }
  const mix = typeof intimateMix === 'string' ? intimateMix.trim().toLowerCase() : '';
  if (mix === 'solo') {
    return 'Intimate mix: SOLO only — exactly one adult on camera (self-touch, undress, solo heat). Never invent a partner.';
  }
  if (mix === 'duo') {
    return 'Intimate mix: DUO only — partner scenes with a distinct second adult (different face from the Cast lead). Never solo-only options.';
  }
  return 'Intimate mix: MIXED — include both solo and duo options across the four cards.';
}

export function capRoleplayStoryBeats(story: RoleplayStoryBeat[] | undefined): RoleplayStoryBeat[] {
  const beats = story ?? [];
  if (beats.length <= MAX_ROLEPLAY_STORY_BEATS) {
    return beats;
  }
  const introIndex = beats.findIndex(beat => beat.id === ROLEPLAY_INTRO_SCENE_ID);
  if (introIndex < 0) {
    return beats.slice(-MAX_ROLEPLAY_STORY_BEATS);
  }
  const intro = beats[introIndex];
  const withoutIntro = beats.filter((_, index) => index !== introIndex);
  return [intro, ...withoutIntro.slice(-(MAX_ROLEPLAY_STORY_BEATS - 1))];
}

export function appendRoleplayStoryBeat(
  story: RoleplayStoryBeat[] | undefined,
  scene: RoleplayScene,
  extras?: Partial<
    Pick<
      RoleplayStoryBeat,
      'prompt' | 'promptId' | 'imageUrl' | 'stillStatus' | 'stillTakes' | 'stillTakeIndex' | 'kind'
    >
  >
): RoleplayStoryBeat[] {
  const current = story ?? [];
  if (roleplayStoryPhase(current) === 'complete') {
    return current;
  }
  const kind: RoleplaySceneKind | undefined =
    roleplayStoryPhase(current) === 'finale' || scene.kind === 'ending' || extras?.kind === 'ending'
      ? 'ending'
      : scene.kind === 'plot' || extras?.kind === 'plot'
        ? 'plot'
        : undefined;
  const next: RoleplayStoryBeat = {
    ...scene,
    at: Date.now(),
    ...extras,
    ...(kind ? { kind } : {}),
  };
  return capRoleplayStoryBeats([...current, next]);
}

export function patchRoleplayStoryBeat(
  story: RoleplayStoryBeat[] | undefined,
  match: Pick<RoleplayStoryBeat, 'id' | 'at'>,
  patch: Partial<RoleplayStoryBeat>
): RoleplayStoryBeat[] {
  return (story ?? []).map(beat =>
    beat.id === match.id && beat.at === match.at ? { ...beat, ...patch } : beat
  );
}

// Gallery take management (still/clip takes, retry/patch helpers, queue-result
// merging) lives in roleplay-gallery-takes.ts; re-exported here unchanged so
// existing importers are unaffected.
export type { RoleplayGalleryStill } from './roleplay-gallery-takes';
export {
  roleplayStillTakes,
  roleplayStillTakeIndex,
  shownRoleplayStillTake,
  lastCompletedRoleplayStillUrl,
  roleplayBeatPromptIds,
  roleplayStoryPromptIds,
  roleplayStillHasInFlightTake,
  canRetryRoleplayStill,
  selectRoleplayStillTakePatch,
  beginRoleplayStillRetryPatch,
  roleplayClipTakes,
  roleplayClipTakeIndex,
  roleplayClipHasInFlightTake,
  canRetryRoleplayClip,
  selectRoleplayClipTakePatch,
  beginRoleplayClipRetryPatch,
  roleplayClipQueueResultPatch,
  roleplayStillQueueResultPatch,
  mergeRoleplayStoryStills,
} from './roleplay-gallery-takes';
