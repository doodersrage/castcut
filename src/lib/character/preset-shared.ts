import {
  CLOTHING_CATALOG_FIELD_KEYS,
  type ClothingCatalogFieldKey,
} from '../wardrobe/clothing-catalog-fields';
import type { SelectOption } from '../app/select-option';

export type CharacterHeadcount = '' | 'solo' | 'duo';

export type CharacterShotFraming =
  | ''
  | 'environmental-35mm'
  | 'medium-50mm'
  | 'closeup-85mm'
  | 'fullbody-24mm'
  | 'telephoto-135mm'
  | 'cinematic-anamorphic';

export type CharacterCameraAngle =
  '' | 'eye-level' | 'slight-low' | 'worms-eye' | 'high-overhead' | 'bird-eye' | 'dutch-tilt';

export type CharacterDepthOfField = '' | 'shallow-bokeh' | 'deep-focus' | 'tilt-shift';

export type CharacterLighting =
  | ''
  | 'golden-hour'
  | 'soft-overcast'
  | 'harsh-noon'
  | 'neon-night'
  | 'rim-lit'
  | 'window-daylight'
  | 'candlelight'
  | 'fluorescent'
  | 'bounce-fill';

export type CharacterAtmosphere =
  '' | 'clear-crisp' | 'light-rain' | 'fog-haze' | 'dust-particles' | 'falling-snow';

export type CharacterColorPalette =
  '' | 'warm-natural' | 'cool-desaturated' | 'high-contrast' | 'muted-earth' | 'monochrome';

export type CharacterAesthetic =
  | ''
  | 'contemporary'
  | 'nineties-film'
  | 'seventies-warm'
  | 'cyberpunk'
  | 'cottage-soft'
  | 'noir-dramatic';

export type CharacterFilmStock = '' | 'kodak-portra' | 'fuji-soft' | 'tri-x-bw' | 'clean-digital';

export type CharacterBodyType =
  | ''
  | 'athletic'
  | 'slender'
  | 'average'
  | 'curvy'
  | 'muscular'
  | 'stocky'
  | 'plus-strong'
  | 'androgynous-lean';

export type CharacterPosture =
  '' | 'weight-one-leg' | 'arms-crossed' | 'hands-pockets' | 'open-relaxed' | 'forward-lean';

export type CharacterEnergy = '' | 'confident' | 'vulnerable' | 'playful' | 'stoic' | 'mysterious';

export type CharacterExpression =
  | ''
  | 'neutral-calm'
  | 'subtle-smile'
  | 'intense-serious'
  | 'joyful-laugh'
  | 'tired-weary'
  | 'guarded-reserved'
  | 'surprised'
  | 'determined'
  | 'melancholic';

export type CharacterGaze =
  '' | 'candid' | 'direct' | 'downcast' | 'upward-hopeful' | 'sidelong' | 'eyes-closed';

export type CharacterMakeup =
  '' | 'bare-natural' | 'soft-glam' | 'bold-editorial' | 'smudged-grunge';

export type CharacterRealism =
  '' | 'raw-film' | 'natural-daylight' | 'soft-studio' | 'editorial-polished';

export type CharacterHairStyle =
  | ''
  | 'loose-wavy'
  | 'sleek-straight'
  | 'tight-curls'
  | 'short-textured'
  | 'buzz-cut'
  | 'messy-undone'
  | 'ponytail'
  | 'braids'
  | 'undercut-fade'
  | 'long-layered';

export type CharacterHandPose =
  '' | 'at-sides' | 'one-in-hair' | 'adjusting-cuff' | 'clasped-front';

export type CharacterPoseAction =
  | ''
  | 'perched'
  | 'cross-legged'
  | 'leaning'
  | 'standing-next'
  | 'kneeling-beside'
  | 'lounging'
  | 'gripping'
  | 'seated-at'
  | 'walking-along'
  | 'braced-on'
  | 'crouching-on'
  | 'stretched-on'
  | 'stepping-from';

export type CharacterDuoDynamic =
  | ''
  | 'facing-each-other'
  | 'side-by-side'
  | 'hand-on-shoulder'
  | 'mirrored-pose'
  | 'conversation-gesture';

export type CharacterPresetOptions = {
  headcount?: CharacterHeadcount;
  shotFraming?: CharacterShotFraming;
  cameraAngle?: CharacterCameraAngle;
  depthOfField?: CharacterDepthOfField;
  lighting?: CharacterLighting;
  atmosphere?: CharacterAtmosphere;
  colorPalette?: CharacterColorPalette;
  aesthetic?: CharacterAesthetic;
  filmStock?: CharacterFilmStock;
  bodyType?: CharacterBodyType;
  posture?: CharacterPosture;
  energy?: CharacterEnergy;
  expression?: CharacterExpression;
  gaze?: CharacterGaze;
  makeup?: CharacterMakeup;
  realism?: CharacterRealism;
  hairStyle?: CharacterHairStyle;
  hairColor?: string;
  handPose?: CharacterHandPose;
  poseAction?: CharacterPoseAction;
  poseTarget?: string;
  duoDynamic?: CharacterDuoDynamic;
  wardrobeCatalog?: string;
  footwearCatalog?: string;
  accessoriesCatalog?: string;
  wardrobe?: string;
  footwear?: string;
  accessories?: string;
  prop?: string;
};

export type CharacterSelectPresetKey = {
  [K in keyof CharacterPresetOptions]: CharacterPresetOptions[K] extends string | undefined
    ? CharacterPresetOptions[K] extends infer V
      ? V extends ''
        ? never
        : V extends string
          ? K
          : never
      : never
    : never;
}[keyof CharacterPresetOptions];

export type CharacterTextPresetKey =
  'poseTarget' | 'hairColor' | 'wardrobe' | 'footwear' | 'accessories' | 'prop';

export type CharacterClothingCatalogPresetKey = ClothingCatalogFieldKey;

export type { SelectOption };

export type CharacterPresetUiField =
  | {
      kind: 'select';
      key: keyof CharacterPresetOptions;
      label: string;
    }
  | {
      kind: 'text';
      key: CharacterTextPresetKey;
      label: string;
      placeholder?: string;
      requires?: 'poseAction';
    }
  | {
      kind: 'clothing-catalog';
      key: CharacterClothingCatalogPresetKey;
      label: string;
    };

export type CharacterPresetUiSection = {
  id: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  showWhen?: (options: CharacterPresetOptions) => boolean;
  fields: CharacterPresetUiField[];
};

export const CHARACTER_HEADCOUNT_OPTIONS: SelectOption<CharacterHeadcount>[] = [
  { value: '', label: 'Default (solo subject)' },
  {
    value: 'solo',
    label: '1 person (solitary)',
    script: 'A crisp, medium-wide photograph focusing strictly on one solitary human body,',
  },
  {
    value: 'duo',
    label: '2 people (interacting)',
    script:
      'A dynamic photograph of two people interacting naturally, splitting visual weight perfectly,',
  },
];

export const CHARACTER_SHOT_FRAMING_OPTIONS: SelectOption<CharacterShotFraming>[] = [
  { value: '', label: 'Default (no lens preset)' },
  {
    value: 'environmental-35mm',
    label: 'Environmental (35mm wide-angle)',
    script:
      'an environmental portrait captured on a 35mm f/2.8 lens, pulling the surrounding architecture and room geometry into sharp focus,',
  },
  {
    value: 'medium-50mm',
    label: 'Medium shot (50mm standard)',
    script:
      'a waist-up medium portrait captured on a 50mm f/1.8 lens, creating clean depth separation from the immediate background,',
  },
  {
    value: 'closeup-85mm',
    label: 'Tight close-up (85mm portrait)',
    script:
      'a tight close-up macro portrait captured on an 85mm f/1.4 lens, tracking fine facial details while maintaining realistic depth,',
  },
  {
    value: 'fullbody-24mm',
    label: 'Full body (24mm wide)',
    script:
      'a full-length figure study captured on a 24mm f/4 lens, keeping the entire body in frame with slight wide-angle perspective stretch,',
  },
  {
    value: 'telephoto-135mm',
    label: 'Compressed (135mm telephoto)',
    script:
      'a compressed portrait captured on a 135mm f/2 lens, flattening perspective and isolating the subject from the background,',
  },
  {
    value: 'cinematic-anamorphic',
    label: 'Cinematic (anamorphic widescreen)',
    script:
      'a cinematic 2.39:1 anamorphic portrait with oval bokeh, gentle edge distortion, and layered depth in the frame,',
  },
];

export const CHARACTER_CAMERA_ANGLE_OPTIONS: SelectOption<CharacterCameraAngle>[] = [
  { value: '', label: 'Default (natural angle)' },
  {
    value: 'eye-level',
    label: 'Eye level',
    script: 'shot at natural eye level with balanced horizon and approachable perspective,',
  },
  {
    value: 'slight-low',
    label: 'Slight low angle',
    script: 'shot from a slight low angle, giving the subject quiet stature without distortion,',
  },
  {
    value: 'worms-eye',
    label: "Worm's-eye (dramatic low)",
    script:
      "shot from a dramatic worm's-eye low angle, emphasizing height and sky behind the subject,",
  },
  {
    value: 'high-overhead',
    label: 'High / overhead',
    script:
      'shot from a high overhead angle, reading hair, shoulders, and spatial placement clearly,',
  },
  {
    value: 'bird-eye',
    label: "Bird's-eye (top-down)",
    script:
      "shot from a bird's-eye top-down angle, mapping body placement and surrounding floor detail,",
  },
  {
    value: 'dutch-tilt',
    label: 'Dutch tilt (dynamic)',
    script: 'shot with a subtle dutch tilt, adding kinetic tension while keeping anatomy readable,',
  },
];

export const CHARACTER_DEPTH_OF_FIELD_OPTIONS: SelectOption<CharacterDepthOfField>[] = [
  { value: '', label: 'Default (natural depth)' },
  {
    value: 'shallow-bokeh',
    label: 'Shallow bokeh',
    script:
      'with shallow depth of field, creamy background bokeh, and crisp focus locked on the subject,',
  },
  {
    value: 'deep-focus',
    label: 'Deep focus',
    script: 'with deep focus keeping subject and environment equally sharp and spatially readable,',
  },
  {
    value: 'tilt-shift',
    label: 'Tilt-shift miniature',
    script:
      'with tilt-shift lens character, selective focus bands, and a slightly miniature spatial read,',
  },
];

export const CHARACTER_LIGHTING_OPTIONS: SelectOption<CharacterLighting>[] = [
  { value: '', label: 'Default (no lighting preset)' },
  {
    value: 'golden-hour',
    label: 'Golden hour warmth',
    script: 'lit by warm golden-hour sunlight with long soft shadows and amber skin highlights,',
  },
  {
    value: 'soft-overcast',
    label: 'Soft overcast',
    script: 'lit by soft, even overcast daylight with gentle shadow falloff and true skin tones,',
  },
  {
    value: 'harsh-noon',
    label: 'Harsh midday sun',
    script: 'lit by harsh overhead midday sun with crisp shadows under brows, nose, and chin,',
  },
  {
    value: 'neon-night',
    label: 'Neon / night city',
    script:
      'lit by mixed neon and streetlight color with cyan-magenta rim accents and deep shadow pockets,',
  },
  {
    value: 'rim-lit',
    label: 'Rim-lit dramatic',
    script: 'lit with a strong back rim light separating the silhouette from a darker background,',
  },
  {
    value: 'window-daylight',
    label: 'Window daylight',
    script:
      'lit by soft directional daylight through a nearby window, with natural falloff across the face,',
  },
  {
    value: 'candlelight',
    label: 'Candlelight warm',
    script: 'lit by warm flickering candlelight with deep amber shadows and intimate falloff,',
  },
  {
    value: 'fluorescent',
    label: 'Fluorescent / clinical',
    script:
      'lit by cool overhead fluorescent light with slight green cast and flat institutional shadows,',
  },
  {
    value: 'bounce-fill',
    label: 'Bounce fill soft',
    script:
      'lit with a soft bounced key and gentle fill, keeping shadow detail under eyes and chin,',
  },
];

export const CHARACTER_ATMOSPHERE_OPTIONS: SelectOption<CharacterAtmosphere>[] = [
  { value: '', label: 'Default (clear air)' },
  {
    value: 'clear-crisp',
    label: 'Clear & crisp',
    script: 'in clear crisp air with sharp visibility and clean atmospheric separation,',
  },
  {
    value: 'light-rain',
    label: 'Light rain',
    script:
      'in lightly falling rain with wet surfaces, specular highlights, and fine droplets on skin and fabric,',
  },
  {
    value: 'fog-haze',
    label: 'Fog / haze',
    script: 'in soft fog or atmospheric haze that layers depth and mutes distant contrast,',
  },
  {
    value: 'dust-particles',
    label: 'Dust particles',
    script: 'with visible dust particles catching light beams and adding volumetric depth,',
  },
  {
    value: 'falling-snow',
    label: 'Falling snow',
    script: 'with gently falling snowflakes and cold breath-visible air around the subject,',
  },
];

export const CHARACTER_COLOR_PALETTE_OPTIONS: SelectOption<CharacterColorPalette>[] = [
  { value: '', label: 'Default (balanced color)' },
  {
    value: 'warm-natural',
    label: 'Warm natural',
    script: 'with a warm natural color palette, amber highlights, and earthy midtones,',
  },
  {
    value: 'cool-desaturated',
    label: 'Cool desaturated',
    script: 'with a cool desaturated palette, muted blues, and restrained saturation,',
  },
  {
    value: 'high-contrast',
    label: 'High contrast',
    script: 'with a high-contrast palette, deep shadows, bright speculars, and punchy separation,',
  },
  {
    value: 'muted-earth',
    label: 'Muted earth tones',
    script:
      'with muted earth-tone colors—olive, tan, rust, and stone gray—across wardrobe and environment,',
  },
  {
    value: 'monochrome',
    label: 'Monochrome / B&W',
    script:
      'rendered in rich monochrome with full tonal range from deep blacks to clean highlights,',
  },
];

export const CHARACTER_AESTHETIC_OPTIONS: SelectOption<CharacterAesthetic>[] = [
  { value: '', label: 'Default (contemporary)' },
  {
    value: 'contemporary',
    label: 'Contemporary clean',
    script: 'in a contemporary clean photographic style with modern wardrobe and setting cues,',
  },
  {
    value: 'nineties-film',
    label: '90s film snapshot',
    script:
      'in a 1990s film snapshot aesthetic with mild grain, flash falloff, and casual authenticity,',
  },
  {
    value: 'seventies-warm',
    label: '70s warm vintage',
    script:
      'in a 1970s warm vintage aesthetic with faded color, soft contrast, and period texture,',
  },
  {
    value: 'cyberpunk',
    label: 'Cyberpunk neon',
    script:
      'in a cyberpunk aesthetic with neon accents, wet reflective surfaces, and urban night energy,',
  },
  {
    value: 'cottage-soft',
    label: 'Cottagecore soft',
    script:
      'in a soft cottagecore aesthetic with natural textiles, gentle light, and pastoral calm,',
  },
  {
    value: 'noir-dramatic',
    label: 'Film noir',
    script: 'in a film noir aesthetic with hard shadow geometry, smoke, and dramatic chiaroscuro,',
  },
];

export const CHARACTER_FILM_STOCK_OPTIONS: SelectOption<CharacterFilmStock>[] = [
  { value: '', label: 'Default (no film stock)' },
  {
    value: 'kodak-portra',
    label: 'Kodak Portra',
    script:
      'emulating Kodak Portra color science with creamy skin tones, soft contrast, and fine grain,',
  },
  {
    value: 'fuji-soft',
    label: 'Fuji soft color',
    script:
      'emulating Fuji color film with slightly cooler greens, gentle contrast, and luminous highlights,',
  },
  {
    value: 'tri-x-bw',
    label: 'Tri-X black & white',
    script:
      'emulating Tri-X black-and-white film with gritty grain, deep blacks, and sharp tonal punch,',
  },
  {
    value: 'clean-digital',
    label: 'Clean digital',
    script: 'with clean modern digital capture, low noise, and precise micro-contrast,',
  },
];

export const CHARACTER_BODY_TYPE_OPTIONS: SelectOption<CharacterBodyType>[] = [
  { value: '', label: 'Default (no physique preset)' },
  {
    value: 'athletic',
    label: 'Athletic / cyclist',
    script: 'an athletic individual with a lean, endurance-toned physique and natural posture,',
  },
  {
    value: 'slender',
    label: 'Slender / petite',
    script: 'a person with a slender, lithe build and relaxed physical presence,',
  },
  {
    value: 'average',
    label: 'Average / natural',
    script: 'a person with a completely natural, un-exaggerated average build,',
  },
  {
    value: 'curvy',
    label: 'Curvy / full-figured',
    script: 'a person with a soft, full-figured silhouette and grounded, natural proportions,',
  },
  {
    value: 'muscular',
    label: 'Muscular / built',
    script: 'a person with a visibly muscular, well-defined build and confident physical presence,',
  },
  {
    value: 'stocky',
    label: 'Stocky / broad',
    script: 'a person with a broad-shouldered, stocky build and solid, grounded posture,',
  },
  {
    value: 'plus-strong',
    label: 'Plus-size / strong',
    script: 'a person with a plus-size, strong build and unapologetic natural proportions,',
  },
  {
    value: 'androgynous-lean',
    label: 'Androgynous / lean',
    script: 'a person with an androgynous, lean silhouette and balanced, understated proportions,',
  },
];

export const CHARACTER_POSTURE_OPTIONS: SelectOption<CharacterPosture>[] = [
  { value: '', label: 'Default (neutral stance)' },
  {
    value: 'weight-one-leg',
    label: 'Weight on one leg',
    script:
      'standing with weight shifted naturally onto one leg and relaxed asymmetry in the hips,',
  },
  {
    value: 'arms-crossed',
    label: 'Arms crossed',
    script: 'with arms crossed comfortably at the chest, shoulders relaxed and posture grounded,',
  },
  {
    value: 'hands-pockets',
    label: 'Hands in pockets',
    script: 'with hands tucked casually in pockets and shoulders dropped in an easy stance,',
  },
  {
    value: 'open-relaxed',
    label: 'Open & relaxed',
    script: 'with an open, relaxed posture, uncrossed limbs, and approachable body language,',
  },
  {
    value: 'forward-lean',
    label: 'Forward lean (engaged)',
    script: 'leaning slightly forward with engaged shoulders, reading attentive and present,',
  },
];

export const CHARACTER_ENERGY_OPTIONS: SelectOption<CharacterEnergy>[] = [
  { value: '', label: 'Default (neutral energy)' },
  {
    value: 'confident',
    label: 'Confident',
    script: 'radiating quiet confidence through posture, gaze, and unforced composure,',
  },
  {
    value: 'vulnerable',
    label: 'Vulnerable',
    script: 'radiating gentle vulnerability through softened posture and unguarded expression,',
  },
  {
    value: 'playful',
    label: 'Playful',
    script: 'radiating playful energy with lively micro-expression and relaxed movement,',
  },
  {
    value: 'stoic',
    label: 'Stoic',
    script: 'radiating stoic stillness with minimal expression and steady physical control,',
  },
  {
    value: 'mysterious',
    label: 'Mysterious',
    script:
      'radiating mysterious presence through partial shadow, restrained gesture, and withheld expression,',
  },
];

export const CHARACTER_EXPRESSION_OPTIONS: SelectOption<CharacterExpression>[] = [
  { value: '', label: 'Default (no expression preset)' },
  {
    value: 'neutral-calm',
    label: 'Neutral / calm',
    script:
      'with a relaxed, neutral expression and unforced facial muscles, reading calm and present,',
  },
  {
    value: 'subtle-smile',
    label: 'Subtle smile',
    script: 'with a subtle, asymmetric smile and softened eyes, reading warm but not posed,',
  },
  {
    value: 'intense-serious',
    label: 'Intense / serious',
    script: 'with a focused, serious expression, tightened jaw, and intent eyes,',
  },
  {
    value: 'joyful-laugh',
    label: 'Joyful laugh',
    script:
      'mid-laugh with raised cheeks, visible teeth, and crinkled eyes, capturing spontaneous joy,',
  },
  {
    value: 'tired-weary',
    label: 'Tired / weary',
    script: 'with tired, slightly heavy eyes and a weary, honest expression,',
  },
  {
    value: 'guarded-reserved',
    label: 'Guarded / reserved',
    script:
      'with a guarded, reserved expression and lips held neutral, reading private and self-contained,',
  },
  {
    value: 'surprised',
    label: 'Surprised',
    script: 'with a genuine surprised expression—raised brows, widened eyes, and parted lips,',
  },
  {
    value: 'determined',
    label: 'Determined',
    script: 'with a determined expression, set jaw, focused eyes, and forward intent,',
  },
  {
    value: 'melancholic',
    label: 'Melancholic',
    script:
      'with a melancholic expression, softened mouth, and distant emotional weight in the eyes,',
  },
];

export const CHARACTER_GAZE_OPTIONS: SelectOption<CharacterGaze>[] = [
  { value: '', label: 'Default (no gaze preset)' },
  {
    value: 'candid',
    label: 'Candid (looking away)',
    script:
      'with a thoughtful, unposed gaze looking slightly away from the lens, capturing an authentic moment,',
  },
  {
    value: 'direct',
    label: 'Direct eye contact',
    script:
      'making direct, engaging eye-contact with the lens, featuring subtle squinting and realistic pupil catchlights,',
  },
  {
    value: 'downcast',
    label: 'Downcast / introspective',
    script:
      'with a quiet, downcast gaze and relaxed eyelids, reading as introspective rather than posed,',
  },
  {
    value: 'upward-hopeful',
    label: 'Upward / hopeful',
    script: 'with an upward, hopeful gaze and lifted chin, catching light in the lower iris,',
  },
  {
    value: 'sidelong',
    label: 'Sidelong glance',
    script: 'with a sidelong glance from the corner of the eyes, reading observant and candid,',
  },
  {
    value: 'eyes-closed',
    label: 'Eyes closed (peaceful)',
    script: 'with eyes gently closed, relaxed eyelids, and peaceful facial stillness,',
  },
];

export const CHARACTER_MAKEUP_OPTIONS: SelectOption<CharacterMakeup>[] = [
  { value: '', label: 'Default (no makeup preset)' },
  {
    value: 'bare-natural',
    label: 'Bare / natural',
    script: 'with minimal bare-skin makeup, visible natural lip tone, and unfussy brows,',
  },
  {
    value: 'soft-glam',
    label: 'Soft glam',
    script:
      'with soft glam makeup— diffused eyeshadow, defined lashes, and polished but natural lips,',
  },
  {
    value: 'bold-editorial',
    label: 'Bold editorial',
    script: 'with bold editorial makeup— graphic liner, strong lip color, and deliberate contour,',
  },
  {
    value: 'smudged-grunge',
    label: 'Smudged grunge',
    script: 'with smudged grunge makeup— worn liner, muted lips, and imperfect lived-in finish,',
  },
];

export const CHARACTER_REALISM_OPTIONS: SelectOption<CharacterRealism>[] = [
  { value: '', label: 'Default (balanced skin detail)' },
  {
    value: 'raw-film',
    label: 'Raw film grit (hyper-realism)',
    script:
      'showcasing completely un-retouched skin textures, organic fine visible pores, and natural facial imperfections free of digital smoothing,',
  },
  {
    value: 'natural-daylight',
    label: 'Natural daylight',
    script:
      'showcasing believable skin texture with subtle pores and natural color variation under honest daylight,',
  },
  {
    value: 'soft-studio',
    label: 'Soft ambient / studio',
    script: 'showcasing smooth, clear skin under soft, diffused professional studio key lighting,',
  },
  {
    value: 'editorial-polished',
    label: 'Editorial polish',
    script:
      'showcasing refined editorial skin finish with controlled highlights and deliberate but believable retouching,',
  },
];

export const CHARACTER_HAIR_STYLE_OPTIONS: SelectOption<CharacterHairStyle>[] = [
  { value: '', label: 'Default (no hair style preset)' },
  {
    value: 'loose-wavy',
    label: 'Loose wavy',
    script: 'with loose wavy hair showing natural strand separation, flyaways, and soft volume,',
  },
  {
    value: 'sleek-straight',
    label: 'Sleek straight',
    script:
      'with sleek straight hair reflecting light in clean bands with individual strand detail,',
  },
  {
    value: 'tight-curls',
    label: 'Tight curls',
    script:
      'with tight, well-defined curls showing springy texture and dimensional shadow between coils,',
  },
  {
    value: 'short-textured',
    label: 'Short textured crop',
    script:
      'with a short textured crop showing crisp edge detail and visible scalp shadow at the part,',
  },
  {
    value: 'buzz-cut',
    label: 'Buzz cut',
    script: 'with a close buzz cut showing even stubble length and realistic scalp texture,',
  },
  {
    value: 'messy-undone',
    label: 'Messy / undone',
    script: 'with messy, undone hair falling naturally with tangled strands and imperfect volume,',
  },
  {
    value: 'ponytail',
    label: 'Ponytail / practical',
    script:
      'with a practical ponytail showing tension at the tie, loose flyaways, and natural scalp detail,',
  },
  {
    value: 'braids',
    label: 'Braids',
    script:
      'with braided hair showing interwoven strand detail, scalp lines, and dimensional texture,',
  },
  {
    value: 'undercut-fade',
    label: 'Undercut fade',
    script:
      'with an undercut fade showing clean clipper graduation and sharper edge contrast at the temples,',
  },
  {
    value: 'long-layered',
    label: 'Long layered',
    script:
      'with long layered hair falling in staggered lengths with visible movement and strand separation,',
  },
];

export const CHARACTER_HAND_POSE_OPTIONS: SelectOption<CharacterHandPose>[] = [
  { value: '', label: 'Default (natural hands)' },
  {
    value: 'at-sides',
    label: 'Relaxed at sides',
    script: 'with hands relaxed at the sides, fingers naturally curved and unposed,',
  },
  {
    value: 'one-in-hair',
    label: 'One hand in hair',
    script: 'with one hand lifted into the hair, fingers separated through strands naturally,',
  },
  {
    value: 'adjusting-cuff',
    label: 'Adjusting cuff / collar',
    script:
      'with one hand adjusting a cuff or collar, fingers pinching fabric with believable tension,',
  },
  {
    value: 'clasped-front',
    label: 'Clasped in front',
    script: 'with hands loosely clasped in front of the body, thumbs resting naturally,',
  },
];

export const CHARACTER_POSE_ACTION_OPTIONS: SelectOption<CharacterPoseAction>[] = [
  { value: '', label: 'Default (no pose anchor)' },
  {
    value: 'perched',
    label: 'Perched / sitting on edge',
    script: 'is perched casually on the exact edge of',
  },
  {
    value: 'cross-legged',
    label: 'Sitting cross-legged on',
    script: 'is sitting cross-legged on top of',
  },
  {
    value: 'leaning',
    label: 'Leaning casually against',
    script: 'is leaning back casually against',
  },
  {
    value: 'standing-next',
    label: 'Standing relaxed next to',
    script: 'is standing with weight naturally shifted next to',
  },
  {
    value: 'kneeling-beside',
    label: 'Kneeling beside',
    script: 'is kneeling naturally beside',
  },
  {
    value: 'lounging',
    label: 'Lounging on',
    script: 'is lounging comfortably on',
  },
  {
    value: 'gripping',
    label: 'Gripping / holding edge',
    script: 'is gripping the edge of',
  },
  {
    value: 'seated-at',
    label: 'Seated at',
    script: 'is seated naturally at',
  },
  {
    value: 'walking-along',
    label: 'Walking along',
    script: 'is mid-stride walking naturally along',
  },
  {
    value: 'braced-on',
    label: 'Braced with hands on',
    script: 'is braced with both hands resting on',
  },
  {
    value: 'crouching-on',
    label: 'Crouching on',
    script: 'is crouching low on',
  },
  {
    value: 'stretched-on',
    label: 'Stretched out on',
    script: 'is stretched out along',
  },
  {
    value: 'stepping-from',
    label: 'Stepping down from',
    script: 'is stepping down carefully from',
  },
];

export const CHARACTER_DUO_DYNAMIC_OPTIONS: SelectOption<CharacterDuoDynamic>[] = [
  { value: '', label: 'Default (natural interaction)' },
  {
    value: 'facing-each-other',
    label: 'Facing each other',
    script: 'positioned facing each other with open body language and shared eye-line,',
  },
  {
    value: 'side-by-side',
    label: 'Side by side',
    script: 'positioned side by side with aligned shoulders and complementary stances,',
  },
  {
    value: 'hand-on-shoulder',
    label: 'Hand on shoulder',
    script: "with one person's hand resting naturally on the other's shoulder,",
  },
  {
    value: 'mirrored-pose',
    label: 'Mirrored pose',
    script: "in mirrored complementary poses that echo each other's limb placement,",
  },
  {
    value: 'conversation-gesture',
    label: 'Mid-conversation gesture',
    script:
      'caught mid-conversation with expressive hand gesture and engaged eye contact between them,',
  },
];

export const CHARACTER_POSE_TARGET_PLACEHOLDERS: Record<
  Exclude<CharacterPoseAction, ''>,
  string
> = {
  perched: 'a cluttered electronics workbench',
  'cross-legged': 'a worn wooden floor',
  leaning: 'a weathered brick wall',
  'standing-next': 'a vintage motorcycle',
  'kneeling-beside': 'a low coffee table',
  lounging: 'a rumpled linen sofa',
  gripping: 'a metal railing',
  'seated-at': 'a small café table',
  'walking-along': 'a narrow cobblestone alley',
  'braced-on': 'a waist-high concrete ledge',
  'crouching-on': 'a flat river rock',
  'stretched-on': 'a sun-warmed window seat',
  'stepping-from': 'a short wooden stoop',
};

export const CHARACTER_PRESET_UI_SECTIONS: CharacterPresetUiSection[] = [
  {
    id: 'camera',
    title: 'Camera & scene',
    description: 'Lens, angle, light, weather, and color science.',
    defaultOpen: true,
    fields: [
      { kind: 'select', key: 'headcount', label: 'Subject headcount' },
      { kind: 'select', key: 'shotFraming', label: 'Lens & crop' },
      { kind: 'select', key: 'cameraAngle', label: 'Camera angle' },
      { kind: 'select', key: 'depthOfField', label: 'Depth of field' },
      { kind: 'select', key: 'lighting', label: 'Lighting' },
      { kind: 'select', key: 'atmosphere', label: 'Weather / air' },
      { kind: 'select', key: 'colorPalette', label: 'Color palette' },
      { kind: 'select', key: 'aesthetic', label: 'Aesthetic era' },
      { kind: 'select', key: 'filmStock', label: 'Film stock / capture' },
    ],
  },
  {
    id: 'look',
    title: 'Look & body',
    description: 'Physique, expression, hair, skin, and makeup.',
    fields: [
      { kind: 'select', key: 'bodyType', label: 'Body type / physique' },
      { kind: 'select', key: 'posture', label: 'Posture / stance' },
      { kind: 'select', key: 'energy', label: 'Energy / presence' },
      { kind: 'select', key: 'expression', label: 'Expression' },
      { kind: 'select', key: 'gaze', label: 'Gaze' },
      { kind: 'select', key: 'makeup', label: 'Makeup' },
      { kind: 'select', key: 'realism', label: 'Skin realism & texture' },
      { kind: 'select', key: 'hairStyle', label: 'Hair style' },
      {
        kind: 'text',
        key: 'hairColor',
        label: 'Hair color (optional)',
        placeholder: 'auburn red with dark roots',
      },
    ],
  },
  {
    id: 'pose',
    title: 'Pose & placement',
    description: 'Anchors limbs to surfaces; keeps anatomy grounded.',
    fields: [
      { kind: 'select', key: 'poseAction', label: 'Action anchor' },
      {
        kind: 'text',
        key: 'poseTarget',
        label: 'Object target',
        requires: 'poseAction',
      },
      { kind: 'select', key: 'handPose', label: 'Hand pose' },
      { kind: 'select', key: 'duoDynamic', label: 'Duo interaction' },
    ],
  },
  {
    id: 'wardrobe',
    title: 'Wardrobe & props',
    description:
      'Pick from the clothing library or type custom details—texture language is appended for custom text.',
    fields: [
      {
        kind: 'clothing-catalog',
        key: 'wardrobeCatalog',
        label: 'Wardrobe library',
      },
      {
        kind: 'text',
        key: 'wardrobe',
        label: 'Custom wardrobe (overrides library)',
        placeholder: 'dark blue pullover hoodie',
      },
      {
        kind: 'clothing-catalog',
        key: 'footwearCatalog',
        label: 'Footwear library',
      },
      {
        kind: 'text',
        key: 'footwear',
        label: 'Custom footwear (overrides library)',
        placeholder: 'scuffed white leather sneakers',
      },
      {
        kind: 'clothing-catalog',
        key: 'accessoriesCatalog',
        label: 'Accessories library',
      },
      {
        kind: 'text',
        key: 'accessories',
        label: 'Custom accessories (overrides library)',
        placeholder: 'matte black over-ear headphones',
      },
      {
        kind: 'text',
        key: 'prop',
        label: 'Hand prop',
        placeholder: 'steaming ceramic coffee mug',
      },
    ],
  },
];

export const SELECT_OPTION_REGISTRY: Record<string, SelectOption<string>[]> = {
  headcount: CHARACTER_HEADCOUNT_OPTIONS,
  shotFraming: CHARACTER_SHOT_FRAMING_OPTIONS,
  cameraAngle: CHARACTER_CAMERA_ANGLE_OPTIONS,
  depthOfField: CHARACTER_DEPTH_OF_FIELD_OPTIONS,
  lighting: CHARACTER_LIGHTING_OPTIONS,
  atmosphere: CHARACTER_ATMOSPHERE_OPTIONS,
  colorPalette: CHARACTER_COLOR_PALETTE_OPTIONS,
  aesthetic: CHARACTER_AESTHETIC_OPTIONS,
  filmStock: CHARACTER_FILM_STOCK_OPTIONS,
  bodyType: CHARACTER_BODY_TYPE_OPTIONS,
  posture: CHARACTER_POSTURE_OPTIONS,
  energy: CHARACTER_ENERGY_OPTIONS,
  expression: CHARACTER_EXPRESSION_OPTIONS,
  gaze: CHARACTER_GAZE_OPTIONS,
  makeup: CHARACTER_MAKEUP_OPTIONS,
  realism: CHARACTER_REALISM_OPTIONS,
  hairStyle: CHARACTER_HAIR_STYLE_OPTIONS,
  handPose: CHARACTER_HAND_POSE_OPTIONS,
  poseAction: CHARACTER_POSE_ACTION_OPTIONS,
  duoDynamic: CHARACTER_DUO_DYNAMIC_OPTIONS,
};

export const PRESET_SELECT_KEYS = Object.keys(
  SELECT_OPTION_REGISTRY
) as (keyof CharacterPresetOptions)[];

export const PRESET_TEXT_KEYS: CharacterTextPresetKey[] = [
  'hairColor',
  'wardrobe',
  'footwear',
  'accessories',
  'prop',
];

export const VALID_OPTION_VALUES = Object.fromEntries(
  PRESET_SELECT_KEYS.map(key => [
    key,
    new Set(SELECT_OPTION_REGISTRY[key].map(option => option.value)),
  ])
) as Record<string, Set<string>>;

export const CHARACTER_PRESET_FIELD_KEYS: (keyof CharacterPresetOptions)[] = [
  ...PRESET_SELECT_KEYS,
  'poseTarget',
  ...CLOTHING_CATALOG_FIELD_KEYS,
  ...PRESET_TEXT_KEYS,
];

export function scriptFor<T extends string>(
  options: SelectOption<T>[],
  value: T | undefined
): string | null {
  if (!value) {
    return null;
  }

  return options.find(option => option.value === value)?.script ?? null;
}

export function scriptForKey(
  key: keyof typeof SELECT_OPTION_REGISTRY,
  value: string | undefined
): string | null {
  if (!value) {
    return null;
  }

  return scriptFor(SELECT_OPTION_REGISTRY[key], value);
}

export function withArticle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return /^(?:a|an|the)\b/i.test(trimmed) ? trimmed : `a ${trimmed}`;
}

export function enrichPoseTarget(value: string): string {
  const base = withArticle(value);
  return `${base} featuring visible surface texture, tactile material detail, and believable wear`;
}

export function pickOption<T extends string>(
  raw: string | undefined,
  allowed: Set<string>
): T | '' {
  return raw && allowed.has(raw) ? (raw as T) : '';
}

export function textFieldIsActive(
  key: CharacterTextPresetKey,
  options: CharacterPresetOptions
): boolean {
  if (key === 'poseTarget') {
    return Boolean(options.poseAction && options.poseTarget);
  }

  return Boolean(options[key]);
}

export function countCharacterPresetSelections(options: CharacterPresetOptions): number {
  let count = 0;

  for (const key of PRESET_SELECT_KEYS) {
    if (key === 'poseAction') {
      continue;
    }

    if (options[key as keyof CharacterPresetOptions]) {
      count += 1;
    }
  }

  if (options.poseAction && options.poseTarget) {
    count += 1;
  }

  for (const key of PRESET_TEXT_KEYS) {
    if (textFieldIsActive(key, options)) {
      count += 1;
    }
  }

  for (const key of CLOTHING_CATALOG_FIELD_KEYS) {
    if (options[key]) {
      count += 1;
    }
  }

  return count;
}

export function hasCharacterPresetOptions(options: CharacterPresetOptions): boolean {
  return countCharacterPresetSelections(options) > 0;
}

export function hasPoseAnchor(options: CharacterPresetOptions): boolean {
  return Boolean(options.poseAction && options.poseTarget?.trim());
}

export function buildPoseAnchorLine(options: CharacterPresetOptions): string | null {
  if (!hasPoseAnchor(options)) {
    return null;
  }

  const action = scriptForKey('poseAction', options.poseAction);
  if (!action) {
    return null;
  }

  return `${action} ${enrichPoseTarget(options.poseTarget!)},`;
}

export function buildPoseAnchorClause(options: CharacterPresetOptions): string | null {
  const line = buildPoseAnchorLine(options);
  if (!line) {
    return null;
  }

  return line.replace(/,\s*$/, '').trim();
}

export const POSE_ACTION_KEYWORDS: Record<Exclude<CharacterPoseAction, ''>, string[]> = {
  perched: ['perched', 'edge of'],
  'cross-legged': ['cross legged', 'cross-legged'],
  leaning: ['leaning', 'against'],
  'standing-next': ['standing', 'next to'],
  'kneeling-beside': ['kneeling', 'beside'],
  lounging: ['lounging'],
  gripping: ['gripping', 'edge of'],
  'seated-at': ['seated', 'sitting'],
  'walking-along': ['mid stride', 'walking', 'along'],
  'braced-on': ['braced', 'hands resting'],
  'crouching-on': ['crouching'],
  'stretched-on': ['stretched', 'along'],
  'stepping-from': ['stepping', 'down from'],
};

export function normalizePresetMatchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function poseAnchorPresent(prompt: string, options: CharacterPresetOptions): boolean {
  if (!hasPoseAnchor(options)) {
    return false;
  }

  const normPrompt = normalizePresetMatchText(prompt);
  const targetWords =
    normalizePresetMatchText(options.poseTarget!)
      .match(/\b[a-z]{4,}\b/g)
      ?.filter(word => !/^(?:with|from|that|this|into|onto|upon)$/.test(word)) ?? [];

  if (targetWords.length > 0) {
    const targetHits = targetWords.filter(word => normPrompt.includes(word)).length;
    if (targetHits / targetWords.length < 0.5) {
      return false;
    }
  }

  const keywords =
    POSE_ACTION_KEYWORDS[options.poseAction as Exclude<CharacterPoseAction, ''>] ?? [];
  return keywords.some(keyword => normPrompt.includes(normalizePresetMatchText(keyword)));
}

export function stripConflictingPoseLanguage(text: string): string {
  return text
    .replace(/\btight portrait framing[^.!?]*/gi, ' ')
    .replace(/\bclose portrait under[^.!?]*/gi, ' ')
    .replace(/\bin a close portrait\b/gi, ' ')
    .replace(/\bshoulders and clothing edge into frame\b/gi, ' ')
    .replace(/\b(?:stands|standing|stood)\b/gi, ' ')
    .replace(/\bposes for a portrait\b/gi, ' ')
    .replace(/\bfull body visible from head to worn shoes\b/gi, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanPoseRemainder(remainder: string, options: CharacterPresetOptions): string {
  let cleaned = remainder
    .replace(/^[,.\s]+/, '')
    .replace(/^(?:who|that|which)\s+(?:is|was|are|were)\s+/i, '')
    .replace(/^(?:in a|at a|on a|under|with)\s+/i, '')
    .replace(/^(?:soft light|under soft light|directional light)\b[^,]*,?\s*/gi, '')
    .replace(/^(?:close portrait|portrait under)\b[^,]*,?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (options.poseTarget) {
    const targetStem = normalizePresetMatchText(
      options.poseTarget.replace(/^(?:a|an|the)\s+/i, '')
    );
    const targetWords = targetStem.match(/\b[a-z]{4,}\b/g) ?? [];
    if (targetWords.length > 0 && targetWords.every(word => cleaned.includes(word))) {
      cleaned = cleaned
        .replace(
          new RegExp(
            `(?:at|on|near|beside|by|around)\\s+(?:a\\s+)?${targetWords.join('|')}[^,]*,?`,
            'i'
          ),
          ''
        )
        .trim();
    }
  }

  return cleaned.replace(/^,\s*/, '').trim();
}

export function integratePoseAnchorIntoPrompt(
  prompt: string,
  options: CharacterPresetOptions
): string {
  const clause = buildPoseAnchorClause(options);
  if (!clause) {
    return prompt.trim();
  }

  let text = prompt.trim();
  if (poseAnchorPresent(text, options)) {
    return text;
  }

  text = stripConflictingPoseLanguage(text);

  const subjectMatch =
    text.match(
      /^((?:A|An|The)\s+[^,.!?]+?)(?=\s+(?:in|at|on|with|under|who|stands|is|was|are|wearing)\b)/i
    ) ?? text.match(/^((?:A|An|The)\s+(?:[a-z'-]+\s+){1,4}[a-z'-]+)/i);

  if (subjectMatch?.[1]) {
    const subject = subjectMatch[1].trim();
    const remainder = cleanPoseRemainder(text.slice(subject.length).trim(), options);
    const anchored = `${subject} ${clause}`;

    if (!remainder || remainder === '.') {
      return `${anchored}.`;
    }

    return `${anchored}, ${remainder}`
      .replace(/,\s*,/g, ', ')
      .replace(/,\s*\./g, '.')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return `${clause}. ${text}`.replace(/\s+/g, ' ').trim();
}

export function buildPoseAnchorUserDirective(options: CharacterPresetOptions): string | null {
  const clause = buildPoseAnchorClause(options);
  if (!clause) {
    return null;
  }

  return [
    `POSE ANCHOR (mandatory — overrides default framing): ${clause}.`,
    'Show enough body and object surface to read limb placement.',
    'Do not replace with standing, walking, close-up portrait cropping, or a generic static pose.',
  ].join(' ');
}
