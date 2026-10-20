export type NsfwPresetCategory = 'mood' | 'setting' | 'style' | 'subject';

export type NsfwGeneratorPreset = {
  id: string;
  label: string;
  hints: string;
  category: NsfwPresetCategory;
  /** Optional mood tag merged into generation metadata. */
  mood?: string;
  /** When true, generation may include two consenting adults. */
  duo?: boolean;
};

export const NSFW_PRESET_CATEGORIES: {
  value: NsfwPresetCategory | 'all';
  label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'mood', label: 'Mood' },
  { value: 'setting', label: 'Setting' },
  { value: 'style', label: 'Style' },
  { value: 'subject', label: 'Subject' },
];

export const NSFW_GENERATOR_PRESETS: readonly NsfwGeneratorPreset[] = [
  {
    id: 'soft-romantic',
    label: 'Soft romantic',
    hints: 'tender romantic intimacy, gentle eye contact, warm skin tones, unhurried affection',
    category: 'mood',
    mood: 'romantic',
  },
  {
    id: 'passionate-close',
    label: 'Passionate close-up',
    hints: 'passionate close embrace, flushed skin, breathless energy, tight intimate framing',
    category: 'mood',
    mood: 'passionate',
  },
  {
    id: 'playful-tease',
    label: 'Playful tease',
    hints: 'playful flirtatious mood, mischievous smile, suggestive pose, lighthearted sensuality',
    category: 'mood',
    mood: 'playful',
  },
  {
    id: 'sensual-calm',
    label: 'Sensual calm',
    hints: 'slow sensual atmosphere, relaxed body language, confident poise, soft tactile detail',
    category: 'mood',
    mood: 'sensual',
  },
  {
    id: 'candlelit-bedroom',
    label: 'Candlelit bedroom',
    hints: 'candlelit bedroom, rumpled silk sheets, warm amber glow, private late-night mood',
    category: 'setting',
    mood: 'romantic',
  },
  {
    id: 'boudoir-studio',
    label: 'Boudoir studio',
    hints: 'boudoir photography set, velvet chaise, diffused window light, editorial intimacy',
    category: 'setting',
    mood: 'glamour',
  },
  {
    id: 'hotel-suite',
    label: 'Hotel suite',
    hints:
      'luxury hotel suite at night, city lights through sheer curtains, champagne haze, upscale mood',
    category: 'setting',
    mood: 'luxury',
  },
  {
    id: 'steamy-bathroom',
    label: 'Steamy bathroom',
    hints: 'steam-filled bathroom, fogged mirror, wet skin highlights, moody tiled surfaces',
    category: 'setting',
    mood: 'sensual',
  },
  {
    id: 'poolside-night',
    label: 'Poolside night',
    hints:
      'private pool at night, submerged shoulders, moonlit water ripples, warm skin against cool blue',
    category: 'setting',
    mood: 'playful',
  },
  {
    id: 'golden-hour-nude',
    label: 'Golden hour glow',
    hints:
      'golden hour backlight, luminous skin, soft lens flare, artistic implied nude silhouette',
    category: 'style',
    mood: 'cinematic',
  },
  {
    id: 'film-grain-intimate',
    label: 'Film grain intimate',
    hints:
      '35mm film grain, shallow depth of field, natural skin texture, candid intimate documentary feel',
    category: 'style',
    mood: 'cinematic',
  },
  {
    id: 'noir-shadows',
    label: 'Noir shadows',
    hints:
      'high-contrast noir lighting, venetian blind shadows, moody chiaroscuro on bare shoulders',
    category: 'style',
    mood: 'dramatic',
  },
  {
    id: 'editorial-glamour',
    label: 'Editorial glamour',
    hints:
      'high-fashion editorial framing, glossy skin highlights, confident gaze, polished magazine finish',
    category: 'style',
    mood: 'glamour',
  },
  {
    id: 'soft-focus-dream',
    label: 'Soft-focus dream',
    hints: 'ethereal soft focus, pastel haze, dreamy bloom, delicate fabric and skin detail',
    category: 'style',
    mood: 'dreamy',
  },
  {
    id: 'solo-portrait',
    label: 'Solo portrait',
    hints:
      'single adult subject, confident self-possessed pose, explicit anatomy where appropriate, hero framing',
    category: 'subject',
    mood: 'confident',
  },
  {
    id: 'solo-reclined',
    label: 'Reclined solo',
    hints:
      'reclined adult on bedding, relaxed limbs, inviting posture, intimate eye-line toward camera',
    category: 'subject',
    mood: 'sensual',
  },
  {
    id: 'couple-embrace',
    label: 'Couple embrace',
    hints:
      'two consenting adults in close embrace, intertwined hands, shared warmth, intimate chemistry',
    category: 'subject',
    mood: 'passionate',
    duo: true,
  },
  {
    id: 'couple-boudoir',
    label: 'Couple boudoir',
    hints:
      'boudoir duo on chaise, coordinated lingerie or implied nude, synchronized pose, shared spotlight',
    category: 'subject',
    mood: 'romantic',
    duo: true,
  },
  {
    id: 'shower-duo',
    label: 'Shower together',
    hints: 'couple under warm shower spray, water streaming over skin, steam, tactile closeness',
    category: 'subject',
    mood: 'sensual',
    duo: true,
  },
  {
    id: 'afterglow',
    label: 'Afterglow',
    hints:
      'post-intimacy afterglow, relaxed bodies, satisfied expressions, messy sheets, quiet morning light',
    category: 'mood',
    mood: 'tender',
    duo: true,
  },
  {
    id: 'dominant-poise',
    label: 'Dominant poise',
    hints:
      'commanding adult presence, chin lifted, direct unflinching gaze, controlled provocative posture',
    category: 'mood',
    mood: 'dominant',
  },
  {
    id: 'yielding-soft',
    label: 'Yielding softness',
    hints:
      'soft yielding mood, exposed neck and relaxed shoulders, trusting vulnerable expression, gentle submission',
    category: 'mood',
    mood: 'submissive',
  },
  {
    id: 'hungry-desire',
    label: 'Hungry desire',
    hints:
      'raw hungry desire, parted lips, intense eye contact, body leaning forward, urgent chemistry',
    category: 'mood',
    mood: 'lustful',
  },
  {
    id: 'lazy-morning',
    label: 'Lazy morning',
    hints:
      'sleepy morning intimacy, tangled hair, half-drawn sheets, soft window light, unhurried waking touch',
    category: 'mood',
    mood: 'tender',
  },
  {
    id: 'electric-tension',
    label: 'Electric tension',
    hints:
      'charged pre-kiss tension, almost-touching hands, parted lips, breath visible in cool air',
    category: 'mood',
    mood: 'anticipation',
    duo: true,
  },
  {
    id: 'mischievous-grin',
    label: 'Mischievous grin',
    hints:
      'mischievous grin, playful dare in the eyes, teasing partial undress, fun provocative energy',
    category: 'mood',
    mood: 'playful',
  },
  {
    id: 'slow-burn',
    label: 'Slow burn',
    hints:
      'slow-burn seduction, minimal movement, heavy eye contact, barely-there touch, restrained heat',
    category: 'mood',
    mood: 'sensual',
  },
  {
    id: 'reckless-passion',
    label: 'Reckless passion',
    hints:
      'reckless passionate energy, tousled hair, flushed cheeks, clothes askew, spontaneous urgency',
    category: 'mood',
    mood: 'passionate',
    duo: true,
  },
  {
    id: 'rooftop-night',
    label: 'Rooftop night',
    hints:
      'private rooftop at night, city bokeh behind bare shoulders, wind in hair, daring outdoor intimacy',
    category: 'setting',
    mood: 'cinematic',
  },
  {
    id: 'forest-clearing',
    label: 'Forest clearing',
    hints:
      'sun-dappled forest clearing, dappled light on skin, natural surroundings, secluded outdoor nude',
    category: 'setting',
    mood: 'natural',
  },
  {
    id: 'beach-dusk',
    label: 'Beach at dusk',
    hints: 'empty beach at dusk, wet skin from surf, warm sand, horizon glow on curves',
    category: 'setting',
    mood: 'romantic',
  },
  {
    id: 'dressing-room',
    label: 'Dressing room',
    hints:
      'theater dressing room mirror bulbs, scattered garments, mid-change vulnerability, backstage intimacy',
    category: 'setting',
    mood: 'glamour',
  },
  {
    id: 'library-after-hours',
    label: 'Library after hours',
    hints:
      'dim library after hours, leather armchair, open book forgotten, secretive tryst atmosphere',
    category: 'setting',
    mood: 'forbidden',
  },
  {
    id: 'sauna-wood',
    label: 'Sauna warmth',
    hints:
      'cedar sauna interior, sweat-sheened skin, warm wood panels, steam haze, close quarters heat',
    category: 'setting',
    mood: 'sensual',
  },
  {
    id: 'penthouse-view',
    label: 'Penthouse view',
    hints:
      'floor-to-ceiling penthouse windows, skyline at night, minimalist bed, luxury exhibitionist mood',
    category: 'setting',
    mood: 'luxury',
  },
  {
    id: 'vintage-parlor',
    label: 'Vintage parlor',
    hints: 'ornate vintage parlor, velvet drapes, antique mirror, old-world decadent atmosphere',
    category: 'setting',
    mood: 'dramatic',
  },
  {
    id: 'kitchen-morning',
    label: 'Kitchen morning',
    hints: 'sunlit kitchen counter, oversized shirt only, coffee steam, casual domestic sensuality',
    category: 'setting',
    mood: 'playful',
  },
  {
    id: 'garden-privacy',
    label: 'Walled garden',
    hints: 'private walled garden, overgrown roses, stone bench, hidden outdoor rendezvous',
    category: 'setting',
    mood: 'romantic',
    duo: true,
  },
  {
    id: 'polaroid-candid',
    label: 'Polaroid candid',
    hints:
      'instant-film polaroid aesthetic, slightly overexposed flash, candid unposed intimacy, nostalgic warmth',
    category: 'style',
    mood: 'candid',
  },
  {
    id: 'neon-afterdark',
    label: 'Neon after dark',
    hints:
      'neon pink and blue rim light, club-afterhours palette, glossy wet-look skin, urban night energy',
    category: 'style',
    mood: 'edgy',
  },
  {
    id: 'watercolor-nude',
    label: 'Watercolor nude',
    hints:
      'fine-art watercolor mood, soft bleeding edges, delicate flesh tones, painterly nude study',
    category: 'style',
    mood: 'artistic',
  },
  {
    id: 'studio-strobe',
    label: 'Studio strobe',
    hints:
      'hard studio strobe, crisp shadow edges, high-detail skin texture, professional nude study lighting',
    category: 'style',
    mood: 'editorial',
  },
  {
    id: 'monochrome-nude',
    label: 'Monochrome nude',
    hints:
      'black and white nude study, rich tonal range, sculptural shadows, timeless fine-art framing',
    category: 'style',
    mood: 'classic',
  },
  {
    id: 'vhs-retro',
    label: 'VHS retro',
    hints:
      '1980s VHS softness, tracking lines, warm analog color cast, nostalgic home-video intimacy',
    category: 'style',
    mood: 'retro',
  },
  {
    id: 'macro-skin',
    label: 'Macro skin detail',
    hints:
      'extreme close macro, goosebumps and pores visible, shallow focus on collarbone or hip curve',
    category: 'style',
    mood: 'tactile',
  },
  {
    id: 'candle-smoke',
    label: 'Candle & smoke',
    hints:
      'thin candle smoke wisps, warm tungsten glow, moody atmosphere, sensual low-key exposure',
    category: 'style',
    mood: 'atmospheric',
  },
  {
    id: 'mirror-self',
    label: 'Mirror reflection',
    hints:
      'full mirror reflection, subject watching themselves, dual-angle composition, voyeuristic self-possession',
    category: 'subject',
    mood: 'confident',
  },
  {
    id: 'window-sill',
    label: 'Window sill',
    hints:
      'perched on window sill, sheer curtain backlight, silhouette and revealed detail, contemplative nude',
    category: 'subject',
    mood: 'dreamy',
  },
  {
    id: 'kneeling-pose',
    label: 'Kneeling pose',
    hints:
      'kneeling adult on soft rug, arched back, hands on thighs, explicit frontal or three-quarter framing',
    category: 'subject',
    mood: 'sensual',
  },
  {
    id: 'standing-nude',
    label: 'Standing nude',
    hints:
      'full-length standing nude, weight on one hip, hands relaxed, unapologetic full-body explicit detail',
    category: 'subject',
    mood: 'confident',
  },
  {
    id: 'bathtub-soak',
    label: 'Bathtub soak',
    hints:
      'deep bathtub soak, bubbles parting at chest and knees, wet hair pinned up, relaxed explicit nudity',
    category: 'subject',
    mood: 'calm',
  },
  {
    id: 'lingerie-peel',
    label: 'Lingerie peel',
    hints:
      'mid-peel from lace lingerie, strap slipping off shoulder, fabric catching at hip, transitional explicit moment',
    category: 'subject',
    mood: 'teasing',
  },
  {
    id: 'couple-dancing',
    label: 'Couple slow dance',
    hints:
      'two adults slow dancing barely dressed, foreheads touching, hands tracing bare back, swaying intimacy',
    category: 'subject',
    mood: 'romantic',
    duo: true,
  },
  {
    id: 'couple-bed-laugh',
    label: 'Bed laughter',
    hints:
      'couple laughing in bed, candid joy, sheets around waists, natural unposed connection, warm morning light',
    category: 'subject',
    mood: 'playful',
    duo: true,
  },
  {
    id: 'couple-straddle',
    label: 'Straddling closeness',
    hints:
      'one adult straddling lap of another on bed, close eye contact, hands in hair, explicit intimate proximity',
    category: 'subject',
    mood: 'passionate',
    duo: true,
  },
  {
    id: 'back-arch',
    label: 'Arched back',
    hints:
      'dramatic arched back pose on bed, fingers gripping sheet, elongated torso, explicit side silhouette',
    category: 'subject',
    mood: 'dramatic',
  },
  {
    id: 'over-shoulder',
    label: 'Over-shoulder glance',
    hints:
      'over-shoulder glance toward camera, bare back dominant in frame, inviting look back, teasing exit pose',
    category: 'subject',
    mood: 'teasing',
  },
  {
    id: 'couple-fireplace',
    label: 'Fireplace warmth',
    hints:
      'couple bare by fireplace, firelight flicker on skin, intertwined on rug, cozy explicit warmth',
    category: 'subject',
    mood: 'tender',
    duo: true,
  },
  {
    id: 'silk-sheets',
    label: 'Silk sheet drape',
    hints:
      'single adult with silk sheet loosely draped, strategic reveal, luxurious fabric against skin',
    category: 'subject',
    mood: 'glamour',
  },
  {
    id: 'chair-straddle',
    label: 'Chair straddle',
    hints:
      'adult straddling backward on chair, bare back to camera, looking over shoulder, bold provocative pose',
    category: 'subject',
    mood: 'confident',
  },
  {
    id: 'whispered-secret',
    label: 'Whispered secret',
    hints:
      'lips near ear whisper, shiver response, hands at waist, conspiratorial intimate closeness',
    category: 'mood',
    mood: 'intimate',
    duo: true,
  },
  {
    id: 'confident-power',
    label: 'Confident power',
    hints:
      'unapologetic power pose, squared shoulders, direct eye contact, owning the frame completely',
    category: 'mood',
    mood: 'empowered',
  },
  {
    id: 'melting-touch',
    label: 'Melting touch',
    hints: 'melting under gentle touch, eyes half-closed, soft exhale, surrender to sensation',
    category: 'mood',
    mood: 'sensual',
  },
  {
    id: 'stolen-moment',
    label: 'Stolen moment',
    hints: 'hurried stolen moment, clothes still partly on, door ajar, thrill of almost caught',
    category: 'mood',
    mood: 'forbidden',
    duo: true,
  },
  {
    id: 'blissful-float',
    label: 'Blissful float',
    hints: 'blissful floating sensation, relaxed smile, post-pleasure haze, loose limbs on bedding',
    category: 'mood',
    mood: 'euphoric',
  },
  {
    id: 'cold-heat-contrast',
    label: 'Cold vs heat',
    hints:
      'contrast of cold air on skin and warm touch, goosebumps, sharp inhale, heightened sensitivity',
    category: 'mood',
    mood: 'intense',
  },
  {
    id: 'devoted-gaze',
    label: 'Devoted gaze',
    hints:
      'devoted adoring gaze upward, hands clasped, worshipful intimacy, focused attention on partner',
    category: 'mood',
    mood: 'tender',
    duo: true,
  },
  {
    id: 'wild-abandon',
    label: 'Wild abandon',
    hints:
      'wild abandon, hair wild, uninhibited movement, raw laughter or moan, unfiltered passion',
    category: 'mood',
    mood: 'uninhibited',
  },
  {
    id: 'quiet-anticipation',
    label: 'Quiet anticipation',
    hints: 'quiet anticipation before touch, still bodies, held breath, fingers hovering near skin',
    category: 'mood',
    mood: 'anticipation',
  },
  {
    id: 'sated-content',
    label: 'Sated content',
    hints:
      'deeply sated contentment, sleepy smile, tangled limbs, satisfied afterglow without hurry',
    category: 'mood',
    mood: 'content',
    duo: true,
  },
  {
    id: 'provocative-dare',
    label: 'Provocative dare',
    hints:
      'provocative dare in the eyes, chin tilted, challenging viewer to look closer, bold tease',
    category: 'mood',
    mood: 'defiant',
  },
  {
    id: 'lofty-attic',
    label: 'Loft attic',
    hints: 'converted loft attic, exposed beams, skylight rain, rumpled duvet on floor mattress',
    category: 'setting',
    mood: 'bohemian',
  },
  {
    id: 'yacht-cabin',
    label: 'Yacht cabin',
    hints: 'compact yacht cabin, porthole light, swaying sense of motion, nautical luxury tryst',
    category: 'setting',
    mood: 'luxury',
  },
  {
    id: 'desert-tent',
    label: 'Desert tent',
    hints: 'desert glamping tent, lantern glow, silk drapes, warm night air on bare skin',
    category: 'setting',
    mood: 'exotic',
  },
  {
    id: 'rainy-apartment',
    label: 'Rainy apartment',
    hints:
      'rain-streaked apartment window, grey daylight, radiator warmth, indoor all-day intimacy',
    category: 'setting',
    mood: 'cozy',
  },
  {
    id: 'greenhouse',
    label: 'Greenhouse',
    hints:
      'humid greenhouse at dusk, glass condensation, tropical plants, warm green-filtered nude light',
    category: 'setting',
    mood: 'natural',
  },
  {
    id: 'train-compartment',
    label: 'Sleeper train',
    hints:
      'private sleeper train compartment, passing landscape blur, compact bunk intimacy, vintage brass',
    category: 'setting',
    mood: 'romantic',
    duo: true,
  },
  {
    id: 'art-studio',
    label: 'Art studio',
    hints:
      'artist studio with easel and paint rags, north-light window, model pose on draped platform',
    category: 'setting',
    mood: 'artistic',
  },
  {
    id: 'wine-cellar',
    label: 'Wine cellar',
    hints:
      'stone wine cellar, candle on barrel, cool air on warm skin, secret underground rendezvous',
    category: 'setting',
    mood: 'forbidden',
  },
  {
    id: 'mountain-cabin',
    label: 'Mountain cabin',
    hints: 'snow outside mountain cabin window, roaring stove, fur throw, isolated winter warmth',
    category: 'setting',
    mood: 'cozy',
    duo: true,
  },
  {
    id: 'balcony-dawn',
    label: 'Balcony at dawn',
    hints:
      'high balcony at dawn, first light on bare shoulders, city waking below, risky exposure thrill',
    category: 'setting',
    mood: 'cinematic',
  },
  {
    id: 'tropical-veranda',
    label: 'Tropical veranda',
    hints: 'open tropical veranda, ceiling fan slow spin, linen sheet only, humid breeze on skin',
    category: 'setting',
    mood: 'relaxed',
  },
  {
    id: 'photo-darkroom',
    label: 'Photo darkroom',
    hints:
      'red-lit photo darkroom, developing trays, chemical smell implied, analog erotic process',
    category: 'setting',
    mood: 'retro',
  },
  {
    id: 'limousine',
    label: 'Limousine interior',
    hints:
      'partition-up limousine interior, leather seat, tinted windows, champagne flute, urban night crawl',
    category: 'setting',
    mood: 'luxury',
    duo: true,
  },
  {
    id: 'chalk-pastel-nude',
    label: 'Chalk pastel study',
    hints:
      'chalk pastel fine-art study, soft smudged edges, classical figure drawing mood, muted tones',
    category: 'style',
    mood: 'classical',
  },
  {
    id: 'infrared-glow',
    label: 'Infrared glow',
    hints:
      'false-color infrared glow, surreal white foliage outside window, otherworldly skin luminance',
    category: 'style',
    mood: 'surreal',
  },
  {
    id: 'double-exposure',
    label: 'Double exposure',
    hints:
      'double exposure overlay, body silhouette merged with city lights or florals, dreamy composite',
    category: 'style',
    mood: 'dreamy',
  },
  {
    id: 'high-key-white',
    label: 'High-key white',
    hints:
      'high-key white seamless backdrop, minimal shadows, clean clinical beauty, bright explicit detail',
    category: 'style',
    mood: 'minimal',
  },
  {
    id: 'low-key-amber',
    label: 'Low-key amber',
    hints: 'low-key single amber gel light, deep shadows, Rembrandt triangle on cheek and chest',
    category: 'style',
    mood: 'dramatic',
  },
  {
    id: 'prism-rainbow',
    label: 'Prism rainbow',
    hints:
      'prism rainbow streaks across bare torso, experimental light play, vivid color bands on skin',
    category: 'style',
    mood: 'experimental',
  },
  {
    id: 'tilt-shift-mini',
    label: 'Tilt-shift miniature',
    hints:
      'tilt-shift shallow band of focus, toy-like scene feel, playful scale distortion on nude figures',
    category: 'style',
    mood: 'playful',
  },
  {
    id: 'long-exposure-blur',
    label: 'Motion blur',
    hints:
      'long exposure motion blur on turning head or swaying hips, ghost trails, kinetic sensuality',
    category: 'style',
    mood: 'dynamic',
  },
  {
    id: 'contact-sheet',
    label: 'Contact sheet',
    hints:
      'contact sheet film strip layout mood, multiple poses in grid, editorial proof-sheet aesthetic',
    category: 'style',
    mood: 'editorial',
  },
  {
    id: 'oil-painting',
    label: 'Oil painting',
    hints: 'old master oil painting finish, rich impasto skin tones, museum-quality nude tableau',
    category: 'style',
    mood: 'classical',
  },
  {
    id: 'flash-paparazzi',
    label: 'Flash paparazzi',
    hints:
      'harsh on-camera flash, paparazzi candids mood, caught-off-guard explicit moment, high contrast',
    category: 'style',
    mood: 'candid',
  },
  {
    id: 'thermal-imprint',
    label: 'Thermal palette',
    hints:
      'thermal-camera color palette on skin, heat-map gradients, scientific-art erotic abstraction',
    category: 'style',
    mood: 'abstract',
  },
  {
    id: 'floor-perspective',
    label: 'Floor perspective',
    hints:
      'worm-eye view from floor, subject standing over camera, powerful towering explicit framing',
    category: 'subject',
    mood: 'dominant',
  },
  {
    id: 'all-fours',
    label: 'All fours',
    hints:
      'adult on all fours on bed, arched spine, looking back at camera, explicit rear three-quarter view',
    category: 'subject',
    mood: 'provocative',
  },
  {
    id: 'spread-relaxed',
    label: 'Spread relaxed',
    hints:
      'reclined adult with relaxed open pose on sofa, unhurried explicit display, confident eye contact',
    category: 'subject',
    mood: 'confident',
  },
  {
    id: 'wall-pin',
    label: 'Against the wall',
    hints:
      'adult pinned gently against wall, partner hands at wrists or waist, vertical explicit closeness',
    category: 'subject',
    mood: 'passionate',
    duo: true,
  },
  {
    id: 'lap-straddle-kiss',
    label: 'Lap kiss',
    hints:
      'straddling lap for deep kiss, hands in hair, seated explicit embrace, mid-air suspended feeling',
    category: 'subject',
    mood: 'passionate',
    duo: true,
  },
  {
    id: 'towel-drop',
    label: 'Towel drop',
    hints:
      'towel slipping at hip after shower, mid-step freeze, droplets on skin, caught-between moments',
    category: 'subject',
    mood: 'teasing',
  },
  {
    id: 'stockings-garter',
    label: 'Stockings & garter',
    hints:
      'stockings and garter belt only, adjusting strap, seated on vanity stool, retro pin-up explicit',
    category: 'subject',
    mood: 'retro',
  },
  {
    id: 'open-robe',
    label: 'Open robe',
    hints:
      'silk robe falling open while walking, nothing underneath, motion blur at hem, casual explicit reveal',
    category: 'subject',
    mood: 'effortless',
  },
  {
    id: 'couple-shower-glass',
    label: 'Shower glass',
    hints:
      'couple behind frosted shower glass, silhouettes merging, hand prints on steam, obscured explicit forms',
    category: 'subject',
    mood: 'sensual',
    duo: true,
  },
  {
    id: 'couple-massage-oil',
    label: 'Oil massage',
    hints:
      'couple oil massage on bed, glossy sheen on back and shoulders, slow hand trails, tactile ritual',
    category: 'subject',
    mood: 'sensual',
    duo: true,
  },
  {
    id: 'reading-nude',
    label: 'Reading nude',
    hints:
      'adult reading book while nude in armchair, legs draped over arm, casual intellectual explicit calm',
    category: 'subject',
    mood: 'relaxed',
  },
  {
    id: 'yoga-stretch',
    label: 'Yoga stretch',
    hints:
      'nude yoga stretch on mat, downward dog or warrior pose, athletic explicit anatomy, morning light',
    category: 'subject',
    mood: 'athletic',
  },
  {
    id: 'couple-breakfast-bed',
    label: 'Breakfast in bed',
    hints:
      'couple nude with breakfast tray in bed, coffee steam, crumbs on sheet, domestic explicit ease',
    category: 'subject',
    mood: 'playful',
    duo: true,
  },
  {
    id: 'hands-bound-soft',
    label: 'Soft bind',
    hints:
      ' wrists loosely bound with silk scarf to headboard, trusting expression, consensual restraint mood',
    category: 'subject',
    mood: 'submissive',
  },
  {
    id: 'blindfold-trust',
    label: 'Blindfold trust',
    hints:
      'silk blindfold, parted lips anticipating touch, heightened skin sensitivity, consensual sensory play',
    category: 'subject',
    mood: 'anticipation',
  },
  {
    id: 'feet-water-edge',
    label: 'Shoreline wade',
    hints: 'adult wading nude at shoreline, water at thighs, sunset reflection, wet skin gleam',
    category: 'subject',
    mood: 'natural',
  },
  {
    id: 'couple-hammock',
    label: 'Hammock together',
    hints:
      'couple tangled in outdoor hammock, woven shadows on skin, lazy sway, cramped intimate closeness',
    category: 'subject',
    mood: 'relaxed',
    duo: true,
  },
  {
    id: 'vanity-makeup-nude',
    label: 'Vanity nude',
    hints:
      'nude at vanity applying lipstick, mirror reflection double view, glamorous explicit routine',
    category: 'subject',
    mood: 'glamour',
  },
  {
    id: 'staircase-descent',
    label: 'Staircase descent',
    hints:
      'descending grand staircase nude, hand on railing, looking up at camera, cinematic entrance',
    category: 'subject',
    mood: 'dramatic',
  },
  {
    id: 'pillow-fight',
    label: 'Pillow fight',
    hints:
      'playful pillow fight mid-laugh, feathers floating, bare skin glimpses, chaotic joyful explicit fun',
    category: 'subject',
    mood: 'playful',
    duo: true,
  },
  {
    id: 'record-player',
    label: 'By the turntable',
    hints:
      'nude listening to vinyl, floor cushions, album cover art nearby, nostalgic slow evening mood',
    category: 'subject',
    mood: 'retro',
  },
  {
    id: 'corset-unlace',
    label: 'Corset unlace',
    hints: 'partner unlacing corset from behind, loosening panels, explicit partial undress ritual',
    category: 'subject',
    mood: 'teasing',
    duo: true,
  },
  {
    id: 'morning-stretch-bed',
    label: 'Morning stretch',
    hints:
      'stretching arms overhead in bed, sheet at waist, yawning or smiling, fresh explicit morning body',
    category: 'subject',
    mood: 'tender',
  },
  {
    id: 'pool-edge-sit',
    label: 'Pool edge sit',
    hints: 'sitting on pool edge, legs in water, leaning back on arms, explicit sunlit torso',
    category: 'subject',
    mood: 'summery',
  },
  {
    id: 'couple-tango',
    label: 'Tango dip',
    hints:
      'tango dip with minimal clothing, dramatic lean backward, intense eye contact, dance-floor explicit',
    category: 'subject',
    mood: 'dramatic',
    duo: true,
  },
  {
    id: 'window-rain-watch',
    label: 'Rain window watch',
    hints:
      'nude watching rain on window, forehead on glass, reflection overlay, contemplative explicit solitude',
    category: 'subject',
    mood: 'melancholic',
  },
  {
    id: 'body-chain-jewelry',
    label: 'Body chain',
    hints:
      'delicate body chain jewelry on bare skin, minimal adornment only, editorial explicit accessory focus',
    category: 'subject',
    mood: 'glamour',
  },
  {
    id: 'sunbeam-floor',
    label: 'Sunbeam on floor',
    hints:
      'lying in rectangular sunbeam on wooden floor, dust motes, warm patch on explicit nude form',
    category: 'subject',
    mood: 'peaceful',
  },
  {
    id: 'couple-bubble-bath',
    label: 'Bubble bath duo',
    hints:
      'couple in oversized bubble bath, foam on shoulders, champagne on tub edge, playful explicit soak',
    category: 'subject',
    mood: 'playful',
    duo: true,
  },
  {
    id: 'thunderstorm-bed',
    label: 'Thunderstorm in bed',
    hints:
      'couple clutching in bed during thunderstorm, flash-lit through curtains, fearful then intimate',
    category: 'subject',
    mood: 'intense',
    duo: true,
  },
] as const;

export function getNsfwGeneratorPreset(id: string): NsfwGeneratorPreset | undefined {
  const key = id.trim();
  return NSFW_GENERATOR_PRESETS.find(preset => preset.id === key);
}

export function nsfwPresetsForCategory(
  category: NsfwPresetCategory | 'all' = 'all'
): NsfwGeneratorPreset[] {
  if (category === 'all') {
    return [...NSFW_GENERATOR_PRESETS];
  }
  return NSFW_GENERATOR_PRESETS.filter(preset => preset.category === category);
}

export function filterNsfwPresetsByQuery(
  presets: readonly NsfwGeneratorPreset[],
  query: string
): NsfwGeneratorPreset[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...presets];
  }
  return presets.filter(preset => {
    const haystack = [preset.label, preset.hints, preset.mood, preset.category]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function resolveNsfwGeneratorPreset(
  id: string,
  userPresets: readonly NsfwGeneratorPreset[] = []
): NsfwGeneratorPreset | undefined {
  const key = id.trim();
  return userPresets.find(preset => preset.id === key) ?? getNsfwGeneratorPreset(key);
}

export function mergeNsfwPresetCatalog(
  userPresets: readonly NsfwGeneratorPreset[]
): NsfwGeneratorPreset[] {
  const builtinIds = new Set(NSFW_GENERATOR_PRESETS.map(preset => preset.id));
  const extras = userPresets.filter(preset => !builtinIds.has(preset.id));
  return [...extras, ...NSFW_GENERATOR_PRESETS];
}

export function pickRandomNsfwGeneratorPreset(
  userPresets: readonly NsfwGeneratorPreset[] = [],
  options?: { category?: NsfwPresetCategory | 'all'; duoOnly?: boolean }
): NsfwGeneratorPreset | undefined {
  let pool = mergeNsfwPresetCatalog(userPresets);
  if (options?.category && options.category !== 'all') {
    pool = pool.filter(preset => preset.category === options.category);
  }
  if (options?.duoOnly) {
    pool = pool.filter(preset => preset.duo === true);
  }
  if (pool.length === 0) {
    return undefined;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
