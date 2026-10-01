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
  /** A pose ControlNet may be guessed from ComfyUI's list (Klein: only a mapped one). */
  poseControlNetGuessable: boolean;
  /**
   * Where the pose map goes. 'vision' = seen by the text encoder only (Rapid AIO / Edit 2511
   * VL-only guides); 'reference' = a full reference image (Qwen-Image 2.1 has no VL-only
   * input); 'none' = left out, pose from the words.
   */
  mapDelivery: {
    solo: 'vision' | 'reference' | 'none';
    duoClothed: 'vision' | 'reference' | 'none';
    /** 2.1 painted nude duo maps (fused bodies, a third person, detached anatomy). */
    duoNude: 'vision' | 'reference' | 'none';
  };
  /**
   * Two-person penetration stills render on this engine instead (2.1 can't draw them: fused,
   * role-swapped or "beside the act" with every map / ControlNet / LoRA tried).
   */
  penetrationEngine?: string;
  /** Queues on this engine's graph, then converts (Qwen-Image 2.1 → Rapid AIO NSFW edit). */
  graphBaseModel?: string;
};

const NONE: ReadonlySet<string> = new Set();

const BASE: PoseModelProfile = {
  family: 'generic',
  outlineGrayGuide: false,
  rapidGraph: false,
  sameSexLayouts: false,
  seatedOralFallback: false,
  poseStickyClothed: false,
  avoidedLayouts: NONE,
  namePartnerOutfit: false,
  dressWhenNoOutfit: false,
  poseControlNetGuessable: true,
  mapDelivery: { solo: 'vision', duoClothed: 'vision', duoNude: 'vision' },
};

export const POSE_MODEL_PROFILES: Record<PoseModelFamily, PoseModelProfile> = {
  generic: BASE,
  'rapid-aio': {
    ...BASE,
    family: 'rapid-aio',
    outlineGrayGuide: true,
    rapidGraph: true,
    sameSexLayouts: true,
    seatedOralFallback: true,
  },
  'qwen-edit-2511': {
    ...BASE,
    family: 'qwen-edit-2511',
    outlineGrayGuide: true,
    poseStickyClothed: true,
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
    mapDelivery: { solo: 'reference', duoClothed: 'reference', duoNude: 'none' },
    penetrationEngine: 'qwen-rapid-aio-edit-nsfw',
    graphBaseModel: 'qwen-rapid-aio-edit-nsfw',
  },
  klein: {
    ...BASE,
    family: 'klein',
    avoidedLayouts: new Set(['hug']),
    plainPostureBase: 'stand',
    namePartnerOutfit: true,
    poseControlNetGuessable: false,
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
