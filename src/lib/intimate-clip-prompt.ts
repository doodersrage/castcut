import { parseIntimateLayout, type IntimateLayout } from './day-pose-guide';

/**
 * Animate prompt for an Intimate / Raunchy Day still (WAN I2V). The LLM clip writer asked for
 * camera drifts and dolly pushes, carried the gag ("when the chair tips back", "partner's laughter
 * echoes") into the motion, and wrote "passionate embrace" for sex — clips turned the rider around,
 * dropped the partner out of frame, pushed the camera into a crop and grew laughs into cackles.
 * This keeps the first frame: locked camera, one steady motion for the pose, calm faces.
 */
export function buildIntimateClipPrompt(beat: string, durationSec = 4): string {
  const act = stripLaughter(stripInterruption(beat))
    .replace(/\bmid-doggy(?:[- ]?style)?\b/gi, 'mid-sex from behind')
    .replace(/\bdoggy(?:[- ]?style)?\b/gi, 'from behind');
  const layout = parseIntimateLayout(beat);
  const solo = layout === 'solo';
  return [
    `${durationSec}s clip, one continuous shot.`,
    `Scene: ${act}.`,
    `Motion: ${layoutMotion(layout)}`,
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

function layoutMotion(layout: IntimateLayout | null): string {
  switch (layout) {
    case 'straddle':
    case 'reverse_straddle':
    case 'lap':
      return 'she rocks her hips slowly on him in a small, steady rhythm; he stays under her.';
    case 'missionary':
    case 'mating_press':
      return 'he thrusts slowly and steadily into her; she stays on her back under him.';
    case 'bent':
    case 'prone':
    case 'standing':
    case 'wall':
      return 'he thrusts slowly from behind in a small, steady rhythm, hands on her hips; she stays bent in place.';
    case 'spoon':
      return 'slow, small hip thrusts from behind while both lie on their sides.';
    case 'oral':
    case 'sixty_nine':
    case 'facesit':
      return 'slow, steady oral motion of the head; the other body stays still.';
    case 'solo':
      return 'her fingers move slowly and steadily between her thighs; her body stays in place.';
    case 'kneeling':
    case 'scissors':
    case 'lift':
    case 'afterglow':
    case 'undress':
    case 'generic':
    default:
      return 'slow, small, steady rhythmic motion of the hips; bodies stay in place.';
  }
}
