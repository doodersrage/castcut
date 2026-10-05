import { parseIntimateLayout, type IntimateLayout } from './day-pose-guide';
import { twoMenBeat, twoWomenBeat } from './rapid-duo-recipe';
import { adultAgeLine, neutralizeYouthWords } from './adult-age-safeguard';

/**
 * Animate prompt for an Intimate / Raunchy Day still (WAN I2V). The LLM clip writer asked for
 * camera drifts and dolly pushes, carried the gag ("when the chair tips back", "partner's laughter
 * echoes") into the motion, and wrote "passionate embrace" for sex — clips turned the rider around,
 * dropped the partner out of frame, pushed the camera into a crop and grew laughs into cackles.
 * This keeps the first frame: locked camera, one steady motion for the pose, calm faces.
 */
export function buildIntimateClipPrompt(
  beat: string,
  durationSec = 4,
  options?: {
    twoWomen?: boolean;
    twoMen?: boolean;
    /**
     * The still's own age sentence (adult-age-safeguard.ts: adultAgeLineIn) — the clip names
     * the same ages. Without one, the mature default for the layout.
     */
    ageLine?: string | null;
  }
): string {
  const twoWomen = options?.twoWomen === true;
  const twoMen = !twoWomen && options?.twoMen === true;
  const act = stripLaughter(
    stripInterruption(
      neutralizeYouthWords(twoWomen ? twoWomenBeat(beat) : twoMen ? twoMenBeat(beat) : beat)
    )
  )
    .replace(/\bmid-doggy(?:[- ]?style)?\b/gi, 'mid-sex from behind')
    .replace(/\bdoggy(?:[- ]?style)?\b/gi, 'from behind')
    // Face-sit and 69 are drawn as seated oral — a Scene line naming them pulls the clip off it.
    .replace(
      /\b(?:sixty-?nine|69|face-?sit(?:ting)?(?:\s+a\s+partner)?|sitting\s+on\s+(?:his|her|their)\s+face)\b/gi,
      'oral sex'
    );
  const layout = parseIntimateLayout(beat);
  const solo = layout === 'solo';
  const ageLine =
    options?.ageLine?.trim() ||
    adultAgeLine({ lead: { noun: twoMen ? 'man' : 'woman' }, people: solo ? 1 : 2 });
  return [
    `${durationSec}s clip, one continuous shot.`,
    `Scene: ${act}.`,
    // Every person's adult age, right after the scene (WAN runs at CFG 1: the positive says it).
    ageLine,
    `Motion: ${twoWomen ? twoWomenMotion(layout, beat) : twoMen ? twoMenMotion(layout, beat) : layoutMotion(layout, beat)}`,
    solo
      ? 'Her body keeps the exact pose and position of the first frame the whole time — she does not turn around, stand up, or leave the frame.'
      : 'Both bodies keep the exact pose and position of the first frame the whole time — nobody turns around, stands up, slides away, or leaves the frame.',
    'Faces calm: eyes soft or half-closed, lips closed or softly parted — no laughing, no wide-open mouth.',
    'Camera: locked-off static tripod shot — no camera movement, no zoom, no push-in, framing stays as the first frame.',
    'Stable identity, consistent limb count, coherent hands, no extra people, no mirror doubles.',
  ].join(' ');
}

/** The gag stays in the still; as motion it turned bodies ("when the chair tips back"). */
function stripInterruption(beat: string): string {
  return beat
    .replace(
      /\s+(?:when|as|while)\s+(?:it|the|a|an|her|his|their|she|he|they)\b[^—,.]*(?=\s*—|,|\.|$)/gi,
      ''
    )
    .replace(/\s*—\s*/g, ' — ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Clips escalate any laugh into a wide-open cackle — drop it; the Faces line sets the mood. */
function stripLaughter(text: string): string {
  return text
    .replace(
      /,?\s*(?:both\s+(?:scramble|freeze)\s+)?(?:laughing|laughs?|mid-laugh)(?:\s+mid-(?:thrust|act|sex))?/gi,
      ''
    )
    .replace(/\s+(—|,)/g, ' $1')
    .replace(/(—|,)\s*(—|,)/g, '$1')
    .replace(/[\s,—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * The wall still is from behind only when the beat says so or the wall is glass (the recipe's own
 * rule, rapid-duo-recipe.ts); otherwise she stands with her back to the wall, face to face.
 */
function wallFromBehind(beat: string): boolean {
  return /\b(?:partner\s+behind|from\s+behind|window|glass)\b/i.test(beat);
}

/**
 * Two women (Day Partner): the motion the still shows. Their recipes draw a hand between the
 * thighs (no strap-on) for spoon, prone, standing and wall, and seated oral for face-sit / 69.
 */
function twoWomenMotion(layout: IntimateLayout | null, beat: string): string {
  switch (layout) {
    case 'straddle':
    case 'reverse_straddle':
    case 'lap':
      return 'she rocks her hips slowly on her girlfriend in a small, steady rhythm; her girlfriend stays under her.';
    case 'missionary':
    case 'mating_press':
      return 'her girlfriend moves her hips slowly and steadily against her; she stays on her back.';
    case 'bent':
      return "her girlfriend's hand moves slowly between her thighs from behind; she stays bent in place.";
    case 'prone':
      return "her girlfriend's hand moves slowly between her thighs from behind; she stays face-down.";
    case 'standing':
      return "her girlfriend's hand moves slowly between her thighs from behind; both stay standing side by side.";
    case 'wall':
      return wallFromBehind(beat)
        ? "her girlfriend's hand moves slowly between her thighs from behind; she stays standing against the wall."
        : "her girlfriend's hand moves slowly between her thighs; both stay standing chest to chest, her back against the wall.";
    case 'spoon':
      return "slow, small movements of her girlfriend's hand between her thighs while both lie on their sides.";
    case 'oral':
    case 'facesit':
    case 'sixty_nine':
      // Face-sit and 69 are drawn as seated oral (Rapid cannot draw either).
      return 'slow, steady motion of the head at the hips; the other body stays still.';
    case 'scissors':
      return 'their hips grind slowly together where their legs cross; both stay sitting, leaning back on their hands.';
    case 'lift':
      return 'her girlfriend holds her up and moves her hips slowly; her legs stay wrapped around her.';
    case 'afterglow':
      return 'they lie still and breathe slowly, a hand resting on skin — no thrusting, nobody sits up.';
    case 'undress':
      return 'hands move slowly over clothes and skin — nobody turns away.';
    default:
      return layoutMotion(layout, beat);
  }
}

/** Two men: the motion the still shows (their wall and scissors recipes differ from a couple's). */
function twoMenMotion(layout: IntimateLayout | null, beat: string): string {
  switch (layout) {
    case 'straddle':
    case 'reverse_straddle':
    case 'lap':
      return 'he rocks his hips slowly on his boyfriend in a small, steady rhythm; his boyfriend stays under him.';
    case 'missionary':
    case 'mating_press':
      return 'his boyfriend thrusts slowly and steadily; he stays on his back.';
    case 'bent':
    case 'standing':
    case 'wall':
      // Their standing / wall recipes both stand him bent forward, braced, partner behind.
      return 'his boyfriend thrusts slowly from behind in a small, steady rhythm; he stays bent forward, braced in place.';
    case 'prone':
      return 'his boyfriend thrusts slowly from behind in a small, steady rhythm; he stays face-down.';
    case 'spoon':
      return 'his boyfriend thrusts slowly from behind while both lie on their sides.';
    case 'oral':
    case 'facesit':
    case 'sixty_nine':
      return 'slow, steady motion of the head at the hips; the other body stays still.';
    case 'scissors':
    case 'kneeling':
      // Their scissors recipe kneels them face to face, stroking each other.
      return 'both stay kneeling upright face to face, chests together, hands moving slowly.';
    case 'lift':
      return 'his boyfriend holds him up and thrusts slowly; his legs stay wrapped around him.';
    case 'afterglow':
      return 'they lie still and breathe slowly, a hand resting on skin — no thrusting, nobody sits up.';
    case 'undress':
      return 'hands move slowly over clothes and skin — nobody turns away.';
    default:
      void beat;
      return 'slow, small, steady rhythmic motion of the hips; bodies stay in place.';
  }
}

function layoutMotion(layout: IntimateLayout | null, beat = ''): string {
  switch (layout) {
    case 'straddle':
    case 'reverse_straddle':
    case 'lap':
      return 'she rocks her hips slowly on him in a small, steady rhythm; he stays under her.';
    case 'missionary':
    case 'mating_press':
      return 'he thrusts slowly and steadily into her; she stays on her back under him.';
    case 'bent':
      return 'he thrusts slowly from behind in a small, steady rhythm, hands on her hips; she stays bent in place.';
    case 'prone':
      return 'he thrusts slowly from behind in a small, steady rhythm; she stays face-down under him.';
    case 'standing':
      return 'he moves his hips slowly against her in a small, steady rhythm; both stay standing, feet on the floor.';
    case 'wall':
      return wallFromBehind(beat)
        ? 'he thrusts slowly from behind in a small, steady rhythm; she stays standing facing the wall, feet on the floor.'
        : 'he moves his hips slowly against her in a small, steady rhythm; both stay standing chest to chest, her back against the wall, her raised knee at his hip.';
    case 'spoon':
      return 'slow, small hip thrusts from behind while both lie on their sides.';
    case 'oral':
      return 'slow, steady motion of the head at the hips; the other body stays still.';
    case 'sixty_nine':
    case 'facesit':
      // Drawn as seated oral (Rapid cannot draw a 69 or face-sitting): animate what is there.
      return 'slow, steady motion of the head at the hips; the other body stays still.';
    case 'scissors':
      return 'their hips grind slowly together where their legs cross; both stay sitting, leaning back on their hands.';
    case 'lift':
      return 'he holds her up and thrusts slowly; her legs stay wrapped around his waist.';
    case 'kneeling':
      return 'both stay on their knees and move their hips slowly together in a small rhythm.';
    case 'afterglow':
      return 'they lie still and breathe slowly, a hand resting on skin — no thrusting, nobody sits up.';
    case 'undress':
      return 'hands move slowly over clothes and skin, fabric shifting — nobody turns away.';
    case 'solo':
      return 'her fingers move slowly and steadily between her thighs; her body stays in place.';
    case 'generic':
    default:
      return 'slow, small, steady rhythmic motion of the hips; bodies stay in place.';
  }
}
