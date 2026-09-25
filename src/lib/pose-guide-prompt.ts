/**
 * Shared Image 3 mannequin pose-guide edit cues for Day / Story.
 * Flat filled figures unlock pose only — wording must block diagram/style bleed into stills.
 */

import {
  DEFAULT_RENDER_REALISM_MODE,
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from '@/lib/render-realism';

/**
 * Which Image 3 art the pose guide uses.
 * - `openpose` (default): standard COCO-18 keypoint map on black — the pose-control format
 *   Qwen Image Edit 2509/2511 were trained on, so it reads as a pose, not a picture to copy.
 * - `legacy`: the older magenta capsules / gray outlines, kept for A/B and fallback.
 */
export type PoseGuideStylePreference = 'openpose' | 'openpose-hands' | 'legacy';

export const DEFAULT_POSE_GUIDE_STYLE: PoseGuideStylePreference = 'openpose';

export function normalizePoseGuideStylePreference(value: unknown): PoseGuideStylePreference {
  return value === 'legacy' || value === 'openpose-hands' ? value : DEFAULT_POSE_GUIDE_STYLE;
}

/** Both OpenPose variants share the keypoint cue; only legacy uses capsule/outline art. */
export function isOpenPoseStyle(value: unknown): boolean {
  return normalizePoseGuideStylePreference(value) !== 'legacy';
}

/** OpenPose with 21-point hand maps. */
export function poseGuideStyleDrawsHands(value: unknown): boolean {
  return normalizePoseGuideStylePreference(value) === 'openpose-hands';
}

/**
 * OpenPose Image 3 cue. Short on purpose: the model already knows what a keypoint map is,
 * so it needs the mapping (who is who), not a list of things not to paint.
 */
export const POSE_GUIDE_OPENPOSE_EDIT_PROMPT_LINE =
  'Image 3 is an OpenPose keypoint skeleton map (pose control only, not part of the picture). Pose the people to match Image 3: body position, limb angles, head direction, and headcount. Keep Image 1 face and body proportions; discard Image 1 pose. Never draw the skeleton lines, colored dots, or black background into the photo.';

/**
 * Skeletons are flat, so the angle they were drawn from must be said: a top-down lying layout
 * otherwise renders as a side view of people standing, and a profile layout as a front view.
 */
export const POSE_GUIDE_CAMERA_LINES: Record<'overhead' | 'side' | 'low', string> = {
  overhead: 'Camera: high overhead angle looking down, as Image 3 is drawn.',
  side: 'Camera: eye-level side view, as Image 3 is drawn.',
  low: 'Camera: low angle from about hip height looking up at the subject; keep the Image 3 body pose.',
};

/** Extra cue when Image 3 carries 21-point hand maps. */
export const POSE_GUIDE_OPENPOSE_HANDS_LINE =
  'Image 3 hand keypoints show where each hand is and which way the fingers point — place the real hands there.';

export const POSE_GUIDE_OPENPOSE_SOLO_LOCK =
  'Image 3 has one skeleton: the Image 1 person takes that pose. Exactly one person in the still.';

/** Lead mapping for 2–3 skeletons, by position (OpenPose colors are per-limb, not per-person). */
export function poseGuideOpenPoseMultiLock(
  headcount: number,
  leadPosition?: string | null
): string {
  const count = Math.max(2, Math.min(3, Math.round(headcount)));
  const word = count === 3 ? 'three' : 'two';
  const lead = leadPosition?.trim()
    ? `the ${leadPosition.trim()} skeleton is the Image 1 person (same face)`
    : 'one skeleton is the Image 1 person (same face)';
  return `Image 3 has ${word} skeletons: ${lead}; each other skeleton is a different adult with their own face. Exactly ${word} separate people with real skin — touching where the skeletons touch, never merged, no extra person.`;
}

/** Short negatives for OpenPose guides — only what a keypoint map can actually leak. */
export const POSE_GUIDE_OPENPOSE_NEGATIVE =
  'openpose skeleton, keypoint dots, colored stick lines, pose diagram, stick figure, black void background, merged bodies, fused people, extra person, extra limbs, extra hands, duplicate face';

/** Core pose-reference instruction (style-agnostic: never copy the diagram). */
export const POSE_GUIDE_EDIT_PROMPT_LINE =
  'Image 3 is a flat SCHEMATIC pose guide on white — bright magenta/cyan/orange filled capsules only (not people, not black suits). Use it ONLY for body pose, stance, limb angles, and headcount. Completely ignore Image 3 colors, flat fill, and white void; never draw mannequins, stick figures, black morphsuits, latex void creatures, cyan outlines, translucent ghost doubles, or any overlay of Image 3. Keep Image 1 face and body proportions only — discard Image 1 standing clothes/pose and any Image 2 garments when the beat is nude/sex; never keep a clothed Image 1 ghost as a third person. When Image 3 shows more than one colored figure, each maps to a separate solid opaque HUMAN with real skin — exactly that headcount, never an extra person.';

/**
 * Rapid AIO Image 3 cue — gray outline guides (no neon color words).
 * Neon magenta/cyan language self-conditions CFG-1 into painting schematics.
 */
export const POSE_GUIDE_RAPID_AIO_EDIT_PROMPT_LINE =
  'Image 3 is a thin gray OUTLINE pose guide on white paper — stick limbs only (not people, not neon fills, not a dark plate). Use it ONLY for body pose, stance, limb angles, and headcount. Completely ignore Image 3 lines and the white paper; never copy Image 3 as a dark color overlay, charcoal wash, gray vignette, or schematic on top of the photograph. Never draw stick figures, wireframes, outline overlays, openpose skeletons, translucent ghost doubles, neon capsules, or charcoal studio backgrounds. Keep Image 1 face identity only — discard Image 1 standing clothes/pose when the beat needs a new stance. When Image 3 shows more than one outline figure, each maps to a separate solid opaque HUMAN with real skin — exactly that headcount.';

export const POSE_GUIDE_RAPID_AIO_COMPACT_LOCK =
  'Thick Image 3 outline = Image 1 Cast FACE on the lead body pose; thinner outline = other adults with different faces and REAL bare human skin on the whole body. Match Image 3 pose only — never paint Image 3 as a black morphsuit, zentai, catsuit, black bodysuit, latex void creature, stick overlay, or diagram (never leave only face and hands uncovered on a black suit). Exactly the Image 3 headcount as solid opaque humans — when Image 3 shows TWO outlines, BOTH adults must be fully visible mid-contact; never collapse to a solo Cast portrait; no ghost overlay.';

export const POSE_GUIDE_RAPID_AIO_SOLO_COMPACT_LOCK =
  'Image 3 shows exactly ONE outline figure = Cast lead only. Match that single body pose with real human skin — for nude solo beats both wrists stay on the vulva midline with fingers inside (never on inner thighs framing the crotch, never claw hands, never raised rock-on/peace hands or bra-cup grabs). Exactly one adult in the still — no friend, twin, schematic ghost, or pose-guide leak beside the subject.';

/**
 * Text-only pose unlock when Image 3 is intentionally omitted.
 */
export const POSE_GUIDE_TEXT_ONLY_PROMPT_LINE =
  'Match the beat body pose, stance, limb angles, and headcount as finished photoreal humans with real skin and real clothes. Keep Image 1 face and body proportions. Completely ignore any pose diagram — never draw stick figures, wireframes, cyan/magenta schematic overlays, openpose skeletons, translucent ghost doubles, black morphsuits, flat filled capsules, or pose-guide art into the photograph.';

export const POSE_GUIDE_TEXT_ONLY_SOLO_LOCK =
  'Exactly one adult in the still — Cast lead only. No friend, twin, selfie partner, schematic ghost, window-reflection doppelganger, or second figure.';

export const POSE_GUIDE_TEXT_ONLY_MULTI_LOCK =
  'Match the named headcount as separate solid opaque humans with different faces — may touch, must not merge; never schematic overlays or fused bodies.';

/** Compact duo/lead/contact/anti-merge lock (keeps prompts short for Qwen Edit). */
export const POSE_GUIDE_COMPACT_LOCK =
  'Magenta schematic = Image 1 Cast FACE on the lead body pose; cyan/orange = other adults with different faces. Match Image 3 pose only — real bare human skin on the whole body (no black morphsuit/zentai/catsuit with only face and hands showing, no ball joints, no plastic gray). Hands that grab belong on the other person. Exactly the Image 3 headcount as solid opaque humans; never keep Image 1 clothed standing body as a third adult; no third black silhouette, no merge, no diagram art, no ghost overlay.';

/** Solo Image 3: one magenta figure — never invent a friend / twin / selfie partner. */
export const POSE_GUIDE_SOLO_COMPACT_LOCK =
  'Image 3 shows exactly ONE magenta schematic = Cast lead only. Match that single body pose with real human skin and real clothes. Exactly one adult in the still — no friend, twin, selfie partner, bystander face, window-reflection doppelganger, Image 1 standing ghost, flesh-colored blob, featureless nude torso mass, incomplete second body, or detached extra hand; no two heads, no merge, no diagram art, no pose-guide leak beside the subject.';

/** Force edit to follow Image 3 stance instead of Image 1 standing plate. */
export const POSE_GUIDE_ACTION_LOCK =
  'Match Image 3 body positions and headcount exactly — do not keep Image 1 standing portrait pose; never invent a third person from the schematic.';

/** Wall/elevator presses: keep both adults on their feet. */
export const POSE_GUIDE_WALL_STANDING_LOCK =
  'Wall duo: two adults, eye-level side view, lead on glass, partner behind — clean anatomy.';

/** Wall contact recipe when the beat names throat / collarbone / core. */
export const POSE_GUIDE_WALL_CONTACT_LOCK =
  'Partner behind: mouth on neck; upper hand on throat; lower hand on front crotch (not butt); lead hands on glass; mid-thigh framing.';

/** Bent-over / rear-entry: keep two clear bodies and hip grip only (never say "doggy"). */
export const POSE_GUIDE_DOGGY_LOCK =
  'Behind duo: exactly TWO solid humans — lead bent over desk/ledgers or on all fours; partner behind — never a third black morphsuit, never a clothed Image 1 ghost, never a dog or pet, four limbs each, no flesh blob.';

/** Chair bent: standing fold over chair back — hands on chair, not neck-lock / sit-twist. */
export const POSE_GUIDE_CHAIR_BENT_LOCK =
  'Chair bent: two adults standing — lead folded over chair BACK, hands on chair, feet on floor (not sitting/kneeling on seat); partner behind; four hands only; silk bottoms stay on.';

/** Filing-cabinet open-drawer rear-entry — not desk lean. */
export const POSE_GUIDE_CABINET_DRAWER_LOCK =
  'Cabinet drawer: exactly TWO nude adults — lead slumped sideways INTO the open steel drawer (not bent over a desk); partner stands behind mid-thrust; Image 1 face only — never a clothed third man in black between them; no morphsuit, no Image 3 leak.';

/** Soft withdrawal lying in an open drawer — not coffin crop, not wall press. */
export const POSE_GUIDE_DRAWER_AFTERGLOW_LOCK =
  'Drawer afterglow: exactly TWO nude adults — she lies on her back in an OPEN filing-cabinet drawer; he leans over withdrawing with thumb on her clit between her thighs; mid-shot hips-to-faces; never sealed metal coffin, never finger in mouth, never a third hand.';

/** Archive/desk bent with throat + genital hands. */
export const POSE_GUIDE_ARCHIVE_BENT_LOCK =
  'Archive bent: exactly TWO solid humans — lead curled over ledgers/desk; partner behind mid-thrust — one hand on her throat, one between her thighs; dim flickering light; never a third black morphsuit, clothed Image 1 ghost, or Image 3 figure in frame; humans only, no dogs.';

/** Piano-bench oral: upright kneel on bench; partner beside licking — never draped over the lid. */
export const POSE_GUIDE_PIANO_ORAL_LOCK =
  'Piano oral: lead kneels upright ON the bench; partner kneels BESIDE (not behind) with mouth at thigh/crotch and one hand on clit; four hands only; never bent over the piano lid.';

/**
 * Map Cast identity to the lead mannequin only (black / first figure).
 * Prevents swapping the reference face onto the partner body.
 */
export const POSE_GUIDE_LEAD_IDENTITY_LOCK =
  'Image 1 Cast face/body ONLY on the magenta (first/thick) schematic; cyan/orange = other adults — do not swap; never paint schematics as black bodysuits.';

/** Blocks fused/merged bodies on duo+ pose guides (safe no-op for solo). */
export const POSE_GUIDE_MULTI_PERSON_LOCK =
  'Keep Image 3 headcount as fully separate people — may touch, must not merge or share one torso.';

/** Duo intimate contact: wrists reach the other body; keep two clear separate people. */
export const POSE_GUIDE_CONTACT_LOCK =
  'Cross-person touch as the beat says (hands on the other body); no self-grab; two separate silhouettes.';

/** Default realism lock when Settings realism is realistic / hyper (or unset). */
export const POSE_GUIDE_PHOTO_REALISM_LOCK =
  'Final still must be a photorealistic live-action photograph: real skin texture, real fabric, natural lighting, and believable materials — not illustration, cartoon, anime, CGI, a redraw of the Image 3 mannequin, a translucent ghost person, or a pose-diagram overlay.';

/** When Settings realism is anime — still reject mannequins/sticks, keep stylized finish. */
export const POSE_GUIDE_ANIME_STYLE_LOCK =
  'Final still must be a finished anime/illustration scene with real character rendering — not mannequins, stick figures, wireframes, schematics, or a redraw of the Image 3 diagram.';

/** When realism is Off — still block diagram bleed without forcing a photo look. */
export const POSE_GUIDE_NO_DIAGRAM_LOCK =
  'Final still must be a finished rendered scene matching Image 1 material quality — never mannequins, stick figures, wireframes, schematics, or a redraw of the Image 3 diagram.';

/** Extra negatives when Image 3 pose guide is attached. */
export const POSE_GUIDE_NEGATIVE_EXTRA =
  'mannequin, wooden mannequin, artist dummy, pose doll, gray mannequin, blank mannequin face, featureless face, ball joints, wooden doll joints, joint spheres, rubber limbs, sausage limbs, inflated limbs, plastic gray skin, stick figure, stickman, wireframe, pose diagram, schematic, skeleton line art, white void background, flat diagram, pose sketch, controlnet stickman, dark color overlay, charcoal wash, gray vignette overlay, muddy color grade, underexposed overlay, pose-guide overlay, merged bodies, fused people, conjoined couple, shared torso, one body two heads, couple blob, morphing bodies, glued figures, siamese twin, identical twins, clone pair, mirror doppelganger, duplicate face, swapped faces, identity swap, face on wrong body, headless person, missing head, head only in mirror, head only in reflection, standing fashion portrait, arms at sides portrait, solo centerframe when duo posed, partner as window reflection, reflection as third person, threesome, three people, third person, extra adult, extra head, third head, bald head floating, crowd, thigh-high boots when barefoot, self-grab, grabbing own body, hands on own hips only, hands on own throat, holding own jaw, arms raised to own head, hands beside own ears, finger in mouth, hand in mouth, hand inside mouth, fingers in own mouth, sucking finger, biting own hand, hands on handrail, gripping handrail, leaning on elevator rail, foreground handrail pose, chrome bar grip, hall of mirrors, infinite reflections, mismatched reflection clothes, ornate mirror frame, gilded picture frame, painting frame border, framed mirror portrait, armchair instead of chaise, wingback chair lap sit, partner sitting on chaise, man seated on bench, cowgirl on couch, face to face straddle, lap straddle, sofa straddle, face to face kiss, puckered lips kiss, almost kiss, lip lock, fairy light clutter, blank white wall studio, glasses, sunglasses, frosted glasses, opaque eyewear, face shield, goggles, watch on wrist prop clutter, open book, notebook, clipboard, journal, planner, magazine in lap, reading a book, holding paper, pen in hand writing, masturbating alone when duo posed, floating hands, third hand, extra hand, third leg, flesh blob between legs, dangling flesh mass, flesh-colored blob, featureless torso mass, incomplete nude body, rubber torso beside subject, skin blob behind arm, no physical contact, distant couple, polite gap between bodies, hovering touch, extra elbows, double knees, warped proportions, mangled fingers, fused fingers, six fingers, extra fingers, kneeling couple facing each other when wall press, floor kneel when wall press, face to face kneel, kneeling in elevator, passionate kiss, open mouth kiss, french kiss, frontal embrace when wall press, couple facing each other when wall press, cheek kiss, ear kiss, surgical mask, face mask, medical mask, floating black blob, amorphous mass, random prop between heads, balcony railing sex, hotel window couple, mangled groin, blob crotch, extra legs, fused hips, impossible lower body, fused faces, melted mouths, mouth to mouth kiss when licking collarbone, hand only on mirror, missing throat grab, hands on butt only, hands on hip only, frog squat, wide squat, spread eagle squat, feet on handrail, feet on railing, lifted spread legs, holding her up by the thighs, tongue out grimace, gaping mouth face, foot growing from torso, leg from shoulder, disembodied limb, skin flap on hip, velvet bench sit when chair bent, tufted bench instead of office chair, candlelit threesome, three torsos, sitting lingerie portrait when bent over chair, cat on desk, pet watching, animal in scene, dog in office, dog in archive, dog between couple, dog standing behind woman, beagle, hound, puppy between legs, sex on carpet floor when desk sex, floor doggy with desk backdrop, carpet all fours when ledger sex, bright living room when archive, gaping O-face, cartoon surprise mouth, black morphsuit, glossy black humanoid, featureless black body, black latex void creature, zentai, black catsuit, full body black suit face and hands only, black rubber partner, black blob between bodies, pose guide mannequin in photo, flat black filled figure, third black silhouette, black morphsuit person, person in black bodysuit when duo, black painted face, void suit third adult, schematic figure in photo, headless black mannequin, Image 3 drawn into scene, dog, puppy, canine, terrier, pet dog, animal under desk, literal dog, dog between legs, floating hand on desk, detached hand on desk, dual camera O-face, both looking at camera open mouth, disconnected male lower body, floating penis, partner torso missing legs, sitting in office chair when bent over, straddling office chair, perched on chair seat, blank gray studio backdrop when office chair, floating hand holding penis, third arm between legs, pajama bottoms missing when named, draped over piano lid when piano oral, bent over piano keys, torso on piano when oral, partner behind thrusting when oral, rear-entry on piano, five hands, hand sprouting from crotch, giant hand on piano bench, translucent ghost person, semi-transparent body overlay, double exposure figure, cyan pose outline, blue mannequin silhouette, pose guide leak, controlnet overlay, openpose lines on face, forehead keypoint marks, ghost double of partner, clothed third person, clothed man between couple, man in black shirt between couple, office clothes third adult, black long sleeve third person, Image 1 standing leftover, clothed Image 1 ghost, desk lean when drawer sex, bent over desk when cabinet drawer, sealed metal coffin drawer, white metal coffin close-up, face-only crop when drawer afterglow, finger in mouth when clit, finger pulling lip, bikini top when nude, white bra when nude, third hand near face, turtleneck when nude, black shirt when nude, suit pants when nude, lingerie when fully nude, sports bra when nude, cream underwear when nude, tattoo, tattoos, tattoo sleeve, inked skin, body ink, tribal tattoo, face tattoo, neck tattoo, hand tattoo';

/** Match OpenPose, schematic, Rapid outline, text-only, or legacy cues. */
const POSE_GUIDE_CUE_RE =
  /Image 3 is (?:an OpenPose keypoint|a (?:flat SCHEMATIC|thin gray OUTLINE|flat gray OUTLINE|flat mannequin|crude stick-figure))|Match the beat body pose, stance, limb angles/i;

const OPENPOSE_CUE_RE = /Image 3 is an OpenPose keypoint/i;

/** The prompt already carries the OpenPose cue (so legacy color locks must not be appended). */
export function promptHasOpenPoseGuideCue(prompt: string | null | undefined): boolean {
  return OPENPOSE_CUE_RE.test(prompt?.trim() || '');
}

export function promptHasPoseGuideCue(prompt: string | null | undefined): boolean {
  return POSE_GUIDE_CUE_RE.test(prompt?.trim() || '');
}

export function poseGuideStyleLockLine(
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE
): string {
  const resolved = normalizeRenderRealismMode(mode);
  if (resolved === 'anime') {
    return POSE_GUIDE_ANIME_STYLE_LOCK;
  }
  if (resolved === 'off') {
    return POSE_GUIDE_NO_DIAGRAM_LOCK;
  }
  return POSE_GUIDE_PHOTO_REALISM_LOCK;
}

function isRapidAioModelId(model: string | null | undefined): boolean {
  return /^qwen-rapid-aio-/i.test(String(model ?? '').trim());
}

/**
 * Models whose Image 3 guides are gray outlines (not neon fills) — Rapid AIO and
 * Edit-2511. Cue text and anti-leak packs must match so magenta/purple lines do not
 * paint into the finished still.
 */
export function usesOutlineGrayPoseGuide(model?: string | null): boolean {
  const id = String(model ?? '').trim();
  if (!id) return false;
  return isRapidAioModelId(id) || /qwen-image-edit-2511/i.test(id);
}

/** Full pose block for queue / LLM cues. */
export function poseGuidePromptBlock(
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE,
  options?: {
    headcount?: number;
    imageAttached?: boolean;
    model?: string | null;
    style?: PoseGuideStylePreference;
    /** OpenPose only: position phrase for the lead skeleton ("leftmost", "lower (underneath)"). */
    leadPosition?: string | null;
    /** OpenPose only: camera angle the flat skeleton implies. */
    camera?: 'overhead' | 'side' | 'low' | null;
  }
): string {
  // Undefined headcount keeps the legacy duo-aware compact lock (Story).
  // Day passes headcount: 1 for everyday solo stills.
  const headcount = options?.headcount;
  const imageAttached = options?.imageAttached !== false;
  if (imageAttached && isOpenPoseStyle(options?.style)) {
    const lock =
      headcount != null && headcount >= 2
        ? poseGuideOpenPoseMultiLock(headcount, options?.leadPosition)
        : headcount != null
          ? POSE_GUIDE_OPENPOSE_SOLO_LOCK
          : '';
    return [
      POSE_GUIDE_OPENPOSE_EDIT_PROMPT_LINE,
      poseGuideStyleDrawsHands(options?.style) ? POSE_GUIDE_OPENPOSE_HANDS_LINE : '',
      options?.camera ? POSE_GUIDE_CAMERA_LINES[options.camera] : '',
      poseGuideStyleLockLine(mode),
      lock,
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (!imageAttached) {
    const compact =
      headcount != null && headcount < 2
        ? POSE_GUIDE_TEXT_ONLY_SOLO_LOCK
        : POSE_GUIDE_TEXT_ONLY_MULTI_LOCK;
    return `${POSE_GUIDE_TEXT_ONLY_PROMPT_LINE} ${poseGuideStyleLockLine(mode)} ${compact}`;
  }
  if (usesOutlineGrayPoseGuide(options?.model)) {
    const compact =
      headcount != null && headcount < 2
        ? POSE_GUIDE_RAPID_AIO_SOLO_COMPACT_LOCK
        : POSE_GUIDE_RAPID_AIO_COMPACT_LOCK;
    return `${POSE_GUIDE_RAPID_AIO_EDIT_PROMPT_LINE} ${poseGuideStyleLockLine(mode)} ${compact}`;
  }
  const compact =
    headcount != null && headcount < 2 ? POSE_GUIDE_SOLO_COMPACT_LOCK : POSE_GUIDE_COMPACT_LOCK;
  return `${POSE_GUIDE_EDIT_PROMPT_LINE} ${poseGuideStyleLockLine(mode)} ${compact}`;
}

/**
 * Rewrite neon magenta/cyan Image 3 cues into Rapid AIO gray-outline cues
 * (keeps Image 3 attached — does not drop the pose image).
 */
export function rewritePoseGuideCueForRapidAio(
  prompt: string,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE,
  options?: { headcount?: number }
): string {
  let next = prompt.trim();
  if (!next) {
    return next;
  }
  next = next
    .replace(/Image 3 is a flat SCHEMATIC[^]*?(?=\n|$)/gi, '')
    .replace(/Image 3 is a (?:crude stick-figure|flat mannequin)[^]*?(?=\n|$)/gi, '')
    .replace(/Magenta schematic = Image 1 Cast[^\n]*/gi, '')
    .replace(/Image 3 shows exactly ONE magenta schematic[^\n]*/gi, '')
    .replace(/Black (?:thick stick|mannequin) = Image 1 Cast[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const block = poseGuidePromptBlock(mode, {
    headcount: options?.headcount,
    imageAttached: true,
    model: 'qwen-rapid-aio-edit',
    style: 'legacy',
  });
  if (!/gray OUTLINE pose guide on white/i.test(next)) {
    next = `${next}\n${block}`;
  }
  return next.trim();
}

/**
 * Rewrite Image 3 schematic instructions into text-only pose cues.
 * Only when Image 3 is intentionally omitted — not the Rapid AIO default path.
 */
export function rewritePoseGuideCueForTextOnly(
  prompt: string,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE,
  options?: { headcount?: number }
): string {
  let next = prompt.trim();
  if (!next) {
    return next;
  }
  // Drop Image 3 schematic / mannequin paragraphs and magenta/cyan identity lines.
  next = next
    .replace(/Image 3 is a flat SCHEMATIC[^]*?(?=\n|$)/gi, '')
    .replace(/Image 3 is a (?:thin|flat) gray OUTLINE[^]*?(?=\n|$)/gi, '')
    .replace(/Image 3 is a (?:crude stick-figure|flat mannequin)[^]*?(?=\n|$)/gi, '')
    .replace(/Magenta schematic = Image 1 Cast[^\n]*/gi, '')
    .replace(/Thick Image 3 outline = Image 1 Cast[^\n]*/gi, '')
    .replace(/Image 3 shows exactly ONE (?:magenta schematic|outline figure)[^\n]*/gi, '')
    .replace(/Black (?:thick stick|mannequin) = Image 1 Cast[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const block = poseGuidePromptBlock(mode, {
    headcount: options?.headcount,
    imageAttached: false,
  });
  if (!promptHasPoseGuideCue(next)) {
    next = `${next}\n${block}`;
  } else if (!next.includes(POSE_GUIDE_TEXT_ONLY_PROMPT_LINE.slice(0, 40))) {
    next = `${next}\n${block}`;
  }
  return next.trim();
}

/**
 * Append pose + realism lock when queueing / saving a still prompt (idempotent).
 */
export function withPoseGuideEditPrompt(
  prompt: string,
  enabled: boolean,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE,
  options?: {
    imageAttached?: boolean;
    headcount?: number;
    model?: string | null;
    style?: PoseGuideStylePreference;
    leadPosition?: string | null;
    camera?: 'overhead' | 'side' | 'low' | null;
  }
): string {
  const trimmed = prompt.trim();
  if (!enabled || !trimmed) {
    return trimmed;
  }
  const imageAttached = options?.imageAttached !== false;
  if (!imageAttached) {
    return rewritePoseGuideCueForTextOnly(trimmed, mode, { headcount: options?.headcount });
  }
  if (isOpenPoseStyle(options?.style)) {
    return withOpenPoseGuidePrompt(trimmed, mode, options);
  }
  // Legacy art attached: drop any OpenPose cue an LLM draft picked up from the default block.
  const legacyBase = stripOpenPoseGuideCues(trimmed);
  if (usesOutlineGrayPoseGuide(options?.model)) {
    return rewritePoseGuideCueForRapidAio(legacyBase, mode, { headcount: options?.headcount });
  }
  const lock = poseGuideStyleLockLine(mode);
  let next = legacyBase;
  if (!promptHasPoseGuideCue(next)) {
    next = `${next}\n${POSE_GUIDE_EDIT_PROMPT_LINE}`;
  } else if (
    /Image 3 is a (?:crude stick-figure|flat mannequin)/i.test(next) &&
    !/flat SCHEMATIC/i.test(next)
  ) {
    // Upgrade legacy stick/mannequin cue in place when re-queueing.
    next = next.replace(
      /Image 3 is a (?:crude stick-figure pose wireframe on white|flat mannequin pose guide on white)[^.]*\./i,
      POSE_GUIDE_EDIT_PROMPT_LINE
    );
  }
  if (!next.includes(lock.slice(0, 48))) {
    next = `${next}\n${lock}`;
  }
  if (
    !/Black (?:thick stick|mannequin) = Image 1 Cast|Magenta schematic = Image 1 Cast|Thick Image 3 outline|Match the beat body pose/i.test(
      next
    )
  ) {
    next = `${next}\n${POSE_GUIDE_COMPACT_LOCK}`;
  } else if (/Black (?:thick stick|mannequin) = Image 1 Cast/i.test(next)) {
    next = next.replace(
      /Black (?:thick stick|mannequin) = Image 1 Cast[^\n]*/i,
      POSE_GUIDE_COMPACT_LOCK
    );
  }
  return next;
}

/** Strip every legacy Image 3 cue/lock (capsule, outline, text-only) from a prompt. */
function stripLegacyPoseGuideCues(prompt: string): string {
  return prompt
    .replace(/Image 3 is a (?:flat SCHEMATIC|thin gray OUTLINE|flat gray OUTLINE)[^\n]*/gi, '')
    .replace(/Image 3 is a (?:crude stick-figure|flat mannequin)[^\n]*/gi, '')
    .replace(/Match the beat body pose, stance, limb angles[^\n]*/gi, '')
    .replace(/Magenta schematic = Image 1 Cast[^\n]*/gi, '')
    .replace(/Thick Image 3 outline = Image 1 Cast[^\n]*/gi, '')
    .replace(/Image 3 shows exactly ONE (?:magenta schematic|outline figure)[^\n]*/gi, '')
    .replace(/Black (?:thick stick|mannequin) = Image 1 Cast[^\n]*/gi, '')
    .replace(/Image 1 Cast face\/body ONLY on the magenta[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Strip the OpenPose cue + lead locks (for a legacy-art requeue). */
function stripOpenPoseGuideCues(prompt: string): string {
  return prompt
    .replace(/Image 3 is an OpenPose keypoint[^\n]*/gi, '')
    .replace(/Image 3 hand keypoints show[^\n]*/gi, '')
    .replace(/Image 3 has (?:one|two|three) skeletons?:[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** OpenPose path of withPoseGuideEditPrompt: swap any legacy cue for the keypoint cue (idempotent). */
function withOpenPoseGuidePrompt(
  prompt: string,
  mode: RenderRealismMode,
  options?: {
    headcount?: number;
    leadPosition?: string | null;
    style?: PoseGuideStylePreference;
    camera?: 'overhead' | 'side' | 'low' | null;
  }
): string {
  // No fresh headcount = nothing new to say (e.g. a requeue): keep the existing keypoint cue.
  if (promptHasOpenPoseGuideCue(prompt) && options?.headcount == null) {
    return ensurePoseGuideStyleLock(prompt, mode);
  }
  const lock = poseGuideStyleLockLine(mode);
  const base = stripOpenPoseGuideCues(stripLegacyPoseGuideCues(prompt))
    // The intimate reinforcer's LIGHTING line names the legacy capsule colors.
    .replace(
      /never cyan or magenta neon gels, chest glow, schematic smoke, or Image 3 colors painted into the scene/gi,
      'never neon gels, chest glow, or Image 3 skeleton colors painted into the scene'
    )
    .split('\n')
    .filter(line => line.trim() !== lock)
    .join('\n')
    .trim();
  const block = poseGuidePromptBlock(mode, {
    headcount: options?.headcount,
    imageAttached: true,
    style: options?.style ?? 'openpose',
    leadPosition: options?.leadPosition,
    camera: options?.camera,
  });
  return `${base}\n${block}`.trim();
}

/** Ensure a prompt that already names Image 3 also carries the style lock. */
export function ensurePoseGuideStyleLock(
  prompt: string,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE
): string {
  const trimmed = prompt.trim();
  if (!trimmed || !promptHasPoseGuideCue(trimmed)) {
    return trimmed;
  }
  const lock = poseGuideStyleLockLine(mode);
  if (promptHasOpenPoseGuideCue(trimmed)) {
    // Keypoint cue carries its own headcount/lead mapping — never append color locks.
    return trimmed.includes(lock.slice(0, 48)) ? trimmed : `${trimmed}\n${lock}`;
  }
  let next = trimmed;
  if (
    /Image 3 is a (?:crude stick-figure|flat mannequin)/i.test(next) &&
    !/flat SCHEMATIC/i.test(next)
  ) {
    next = next.replace(
      /Image 3 is a (?:crude stick-figure pose wireframe on white|flat mannequin pose guide on white)[^.]*\./i,
      POSE_GUIDE_EDIT_PROMPT_LINE
    );
  }
  if (!next.includes(lock.slice(0, 48))) {
    // Legacy short cue — upgrade in place when possible.
    if (
      /ignore Image 3 style, face, and clothing\.?/i.test(next) &&
      !/never draw (?:stick figures|mannequins|black morphsuits)/i.test(next)
    ) {
      next = next.replace(
        /Image 3 is a (?:flat SCHEMATIC|flat mannequin|crude stick-figure)[^.]*\./i,
        POSE_GUIDE_EDIT_PROMPT_LINE
      );
    }
    next = `${next}\n${lock}`;
  }
  if (
    !/Black (?:thick stick|mannequin) = Image 1 Cast|Magenta schematic = Image 1 Cast/i.test(next)
  ) {
    // Drop verbose legacy lock stack if present, then attach compact.
    next = next
      .replace(/\nMatch Image 3 body positions[^\n]*/gi, '')
      .replace(/\nImage 1 is the Cast lead:[^\n]*/gi, '')
      .replace(/\nImage 1 Cast face\/body ONLY[^\n]*/gi, '')
      .replace(/\nWhen Image 3 shows two figures[^\n]*/gi, '')
      .replace(/\nIf Image 3 shows two or more stick figures[^\n]*/gi, '')
      .replace(/\nKeep Image 3 headcount[^\n]*/gi, '')
      .replace(/\nCross-person touch as the beat[^\n]*/gi, '')
      .replace(/\nBlack (?:thick stick|mannequin) = Image 1 Cast[^\n]*/gi, '');
    next = `${next}\n${POSE_GUIDE_COMPACT_LOCK}`;
  } else if (/Black (?:thick stick|mannequin) = Image 1 Cast/i.test(next)) {
    next = next.replace(
      /Black (?:thick stick|mannequin) = Image 1 Cast[^\n]*/i,
      POSE_GUIDE_COMPACT_LOCK
    );
  }
  return next;
}

export function mergePoseGuideNegatives(
  negative: string | undefined,
  enabled: boolean,
  options?: { style?: PoseGuideStylePreference }
): string | undefined {
  if (!enabled) {
    return negative?.trim() || undefined;
  }
  const extra = isOpenPoseStyle(options?.style)
    ? POSE_GUIDE_OPENPOSE_NEGATIVE
    : POSE_GUIDE_NEGATIVE_EXTRA;
  const parts = `${negative ?? ''}, ${extra}`
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(part);
  }
  return merged.join(', ') || undefined;
}
