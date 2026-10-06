/**
 * The pose system is model-agnostic: a still's pose is a layout + skeletons (day-pose-guide),
 * a headcount and a beat in words. What differs per model is how that pose is *delivered* — the
 * map's drawing style, whether the map goes in as a vision-only hint / a reference image / not at
 * all, which wording template carries the bodies, which layouts the model can't draw — and those
 * answers live here, one profile per model family, each backed by live A/B notes.
 *
 * Callers ask `poseProfileForModel(model)` instead of testing model ids.
 */

export type PoseModelFamily =
  'rapid-aio' | 'qwen-edit-2511' | 'qwen-image-2.1' | 'klein' | 'generic';

export type PoseModelProfile = {
  family: PoseModelFamily;
  /**
   * Legacy (non-OpenPose) guides drawn as thin gray outlines on white — neon fills painted
   * magenta lines into Rapid AIO / Edit-2511 stills.
   */
  outlineGrayGuide: boolean;
  /**
   * Queues on the Rapid AIO edit graph (Qwen-Image 2.1 builds it, then the renderer converts):
   * compact "where each body goes" recipes instead of the ~9k-char brief (the long brief collapsed
   * every Rapid duo into the same reclining couple), face-break identity routing, Rapid locks.
   * Qwen-Image 2.1 was A/B'd on exactly these recipes.
   */
  rapidGraph: boolean;
  /**
   * Every Day still uses the short "where the body is" recipes instead of the ~4–7k-char brief,
   * without the rest of the Rapid graph: clothed solo and two-person stills, with or without a
   * pose map, and the adult moods (Rapid's adult recipes). Edit 2511 Lightning,
   * live A/B on the user's own graphs (2026-10-01), Vacation: the brief held the pose about 2/8
   * (seated, climbing and lying came out standing or sitting); the recipe plus a mandatory-outfit
   * line got pose and dress 7/7. Without that line the recipe kept the plate's underwear 3/8.
   */
  compactDayRecipes: boolean;
  /**
   * Everyday (and the themes built on it) solo clothed stills use the short Day recipe instead of
   * the long brief, on the Rapid graph. Rapid AIO, pose sweep 2026-10-01 (16 action beats, two
   * seeds): the brief rendered a standing portrait in the right place and dropped the action —
   * walking, running, arms up, cooking, reading, the camera, the laptop — about 1 beat in 14; the
   * recipe got 30 of 32 with the exact dress and scene. The price is likeness on the face-match
   * score: 0.48 for the brief's near-frontal portraits against 0.61–0.64 for the recipe's action
   * shots (the brief with the action stated first: 0.57, but the outfit drifted in 8 of 32).
   * Face finish is the fix for likeness; a wrong picture has none.
   */
  compactEverydayRecipe: boolean;
  /** Two-women / two-men / man-lead adult duo layouts exist for this model. */
  sameSexLayouts: boolean;
  /** No 69 / face-sitting: those beats render as seated oral (and the guide is drawn so). */
  seatedOralFallback: boolean;
  /** Clothed Edit-2511 keeps the plate's stance unless the body is unlocked in words. */
  poseStickyClothed: boolean;
  /** Layouts the model can't draw as two people → drawn as their plain posture. */
  avoidedLayouts: ReadonlySet<string>;
  plainPostureBase?: 'stand';
  /**
   * Clothed duos: name the partner's own clothes — the lead's outfit leaked onto the partner
   * (Klein spoon 6/6; Qwen-Image 2.1 hand-in-hand / hug / selfie).
   */
  namePartnerOutfit: boolean;
  /**
   * Clothed stills with no named outfit ("this slot's catalog wardrobe kit"): say she is dressed.
   * Rapid invents clothes; Qwen-Image 2.1 kept the undressed plate's underwear (dressed 2/2 with
   * the line).
   */
  dressWhenNoOutfit: boolean;
  /**
   * Where the pose map goes. 'vision' = seen by the text encoder only (Rapid AIO / Edit 2511
   * VL-only guides); 'reference' = a full reference image; 'none' = left out, pose from the words.
   */
  mapDelivery: {
    /**
     * 2.1: 'none' for the planner's own one-person maps. On a face-crop Day still the map was
     * painted as the body — a stiff figure, an extra or folded leg in 3 of 6 beats; without it
     * and with the short recipe, 5 of 6 beats were natural and right, the closest likeness of
     * any engine (InsightFace distance 0.055) at 21 s a still (Pruna, 2026-10-01). A pose the
     * player drew or took from a photo is still sent: on a full-body plate (Outfit) 2.1 followed
     * those maps exactly and ignored the pose without them.
     */
    solo: 'vision' | 'reference' | 'none';
    duoClothed: 'vision' | 'reference' | 'none';
    /**
     * 2.1 VAE-encodes every reference, so a duo pose map is painted as a person: fused bodies,
     * a third figure, a bare arm in the gap. Clothed and nude maps both stay out; the pose is
     * in the words.
     */
    duoNude: 'vision' | 'reference' | 'none';
  };
  /**
   * Two-person penetration stills render on this engine instead (2.1 can't draw them: fused,
   * role-swapped or "beside the act" with every map / ControlNet / LoRA tried).
   */
  penetrationEngine?: string;
  /**
   * Adult nude Day stills render on this engine instead, when it is installed. Edit 2511 gets the
   * layout right with the short recipes but keeps underwear on (live 2026-10-01: 4/4 layouts,
   * briefs or a bra left in most) — the base model is not an adult one.
   */
  adultEngine?: string;
  /**
   * Day's clothed two-person stills render on this engine instead (for that still only). Set for
   * Qwen-Image 2.1, which fuses a clothed pair (see qwen-image-21-renderer: isClothedDuoStill).
   * The plain Rapid engine, not 2.1's own NSFW graph base: on the NSFW checkpoint the same
   * beats came out in lace two-pieces and bodysuits instead of the named dress.
   */
  clothedDuoEngine?: string;
  /**
   * The Cast is dressed once (clothing + shoes on the look plate, day-dress-plate.ts) and clothed
   * stills use that plate:
   * - `plate`: as Image 1, the starting image (Edit 2511 — it re-poses a full plate from the
   *   recipe; live 8/8 exact dress and shoes with the pose held).
   * - `clothing`: in the clothing image's place, with the face crop still Image 1 (Rapid AIO —
   *   a full plate as Image 1 freezes upright poses there; as the clothing reference, live
   *   2026-10-02: 8/8 poses held, exact dress, likeness 0.58 → 0.46 — and Qwen-Image 2.1, same
   *   test: 8/8 poses, exact dress, shoes wherever feet show, likeness 0.05 → 0.09).
   *   2.1 lying solo stills, replay 2026-10-03 (4 beats × 2 seeds, Pruna 8): the dressed plate as
   *   Image 1 with the face crop as Image 2 was one clean body 8/8 like the current order, but
   *   farther on the face (mean 0.30 vs 0.23, closer in 2 of 8); the plate alone 0.43. Kept as is.
   */
  dressPlate?: 'plate' | 'clothing';
  /** Queues on this engine's graph, then converts (Qwen-Image 2.1 → Rapid AIO NSFW edit). */
  graphBaseModel?: string;
  /**
   * A one-person lying still on a face crop renders on a landscape canvas, when an OUTFIT line
   * names her clothes. Qwen-Image 2.1, Day Everyday lying beats (live 2026-10-03): on the
   * portrait face-crop canvas she sat up; landscape with the outfit line and a whole-body pose
   * sentence, 9/9 lying and dressed — landscape without the outfit line drew her nude 2 of 3.
   * Off for every engine since: through the app the landscape canvas drew a twin (a second copy
   * of her) 2 of 3, and a replay A/B gave portrait 6/6 clean against landscape 4/6 (the face crop
   * is centred on the canvas and was pasted into the sky); the outfit line and the whole-body
   * sentence alone hold the pose and the clothes. Kept as a switch for engines that need it.
   */
  wideLyingSolo: boolean;
  /**
   * One-person sport briefs get the layout's cue after the ACTION sentence for the layouts in
   * SPORT_ACTION_CUE_LAYOUTS (pose-coaching.ts) — Rapid AIO kicked for a punch without it (pose
   * report card 2026-10-03).
   */
  sportActionCue: boolean;
};

const NONE: ReadonlySet<string> = new Set();

const BASE: PoseModelProfile = {
  family: 'generic',
  outlineGrayGuide: false,
  rapidGraph: false,
  compactDayRecipes: false,
  compactEverydayRecipe: false,
  sameSexLayouts: false,
  seatedOralFallback: false,
  poseStickyClothed: false,
  avoidedLayouts: NONE,
  namePartnerOutfit: false,
  dressWhenNoOutfit: false,
  mapDelivery: { solo: 'vision', duoClothed: 'vision', duoNude: 'vision' },
  wideLyingSolo: false,
  sportActionCue: false,
};

export const POSE_MODEL_PROFILES: Record<PoseModelFamily, PoseModelProfile> = {
  generic: BASE,
  'rapid-aio': {
    ...BASE,
    family: 'rapid-aio',
    outlineGrayGuide: true,
    rapidGraph: true,
    sportActionCue: true,
    compactEverydayRecipe: true,
    sameSexLayouts: true,
    seatedOralFallback: true,
    dressPlate: 'clothing',
  },
  'qwen-edit-2511': {
    ...BASE,
    family: 'qwen-edit-2511',
    outlineGrayGuide: true,
    poseStickyClothed: true,
    compactDayRecipes: true,
    adultEngine: 'qwen-rapid-aio-edit-nsfw',
    dressPlate: 'plate',
  },
  'qwen-image-2.1': {
    ...BASE,
    family: 'qwen-image-2.1',
    outlineGrayGuide: true,
    rapidGraph: true,
    sameSexLayouts: true,
    seatedOralFallback: true,
    namePartnerOutfit: true,
    dressWhenNoOutfit: true,
    compactEverydayRecipe: true,
    clothedDuoEngine: 'qwen-rapid-aio-edit',
    dressPlate: 'clothing',
    mapDelivery: { solo: 'none', duoClothed: 'none', duoNude: 'none' },
    penetrationEngine: 'qwen-rapid-aio-edit-nsfw',
    graphBaseModel: 'qwen-rapid-aio-edit-nsfw',
    wideLyingSolo: false,
  },
  klein: {
    ...BASE,
    family: 'klein',
    avoidedLayouts: new Set(['hug']),
    plainPostureBase: 'stand',
    namePartnerOutfit: true,
  },
};

/** Model id → pose family. */
export function poseModelFamily(model: string | null | undefined): PoseModelFamily {
  const id = String(model ?? '')
    .trim()
    .toLowerCase();
  if (!id) return 'generic';
  if (id.startsWith('qwen-image-2.1')) return 'qwen-image-2.1';
  if (id.startsWith('qwen-rapid-aio-')) return 'rapid-aio';
  if (id.includes('qwen-image-edit-2511')) return 'qwen-edit-2511';
  if (id.includes('flux-2-klein')) return 'klein';
  return 'generic';
}

export function poseProfileForModel(model: string | null | undefined): PoseModelProfile {
  return POSE_MODEL_PROFILES[poseModelFamily(model)];
}
