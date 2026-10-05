import { stripStillPromptForClip } from './clip-prompt-from-still';

const TWO_PEOPLE_STILL_RE =
  /\bMatch their two bodies\b|\bTWO PEOPLE\b|\b(?:a woman and a man|a man and a woman|two women|two men)(?: are)? together\b|\bboth fully in frame\b/i;

/** People in a Day still, read from its own prompt (a companion / partner beat = 2). */
export function stillPromptPeople(stillPrompt: string | null | undefined): 1 | 2 {
  return TWO_PEOPLE_STILL_RE.test(String(stillPrompt ?? '')) ? 2 : 1;
}

/**
 * Animate prompt for a clothed Day still (image-to-video, WAN or LTX-2.5). Day used to send the
 * beat to the LLM clip writer, which never sees the still: it invented camera moves on every
 * clip ("camera glides softly around in slow orbit", "gentle dolly forward"), restaged the scene
 * ("a tennis player" on a volleyball still, "mountain trail" in a bookstore, "seated" for a
 * standing still) and pushed expressions (a yawn became a wide-open scream). On both engines
 * the orbit / push-in reframed the shot and turned faces away, and the restaged words fought
 * the first frame.
 *
 * This keeps what the first frame already shows and animates only the beat's action, like the
 * intimate template (intimate-clip-prompt.ts): locked camera, place and clothes as they are,
 * calm face. Live A/B 2026-10-04 — see CHANGELOG.
 */
export function buildStillClipPrompt(
  action: string,
  options?: {
    durationSec?: number;
    /** People in the still (a Day companion / partner = 2). */
    people?: number;
    /** End pose words (day-end-pose.ts): where the clip lands. */
    endPoseWords?: string;
  }
): string {
  const seconds = options?.durationSec && options.durationSec > 0 ? options.durationSec : 4;
  const duo = (options?.people ?? 1) > 1;
  const beat = stripStillPromptForClip(action)
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .slice(0, 360);
  const end = options?.endPoseWords?.trim().replace(/[.\s]+$/, '');
  return [
    `${seconds}s clip, one continuous shot that starts on the first frame.`,
    beat ? `Action: ${beat}.` : '',
    duo
      ? 'Motion: both people continue this moment with small, natural movements from the first frame’s poses — nobody walks away, turns around or leaves the frame.'
      : 'Motion: she continues this moment with small, natural movements from the first frame’s pose — she does not walk away, turn around or leave the frame.',
    end ? `By the end of the clip, ${end}.` : '',
    'The place, light and clothes stay exactly as in the first frame; nothing new appears.',
    duo
      ? 'Faces: the same two people throughout, relaxed natural expressions — no wide-open mouths.'
      : 'Face: the same person throughout, relaxed natural expression — no wide-open mouth.',
    'Camera: locked-off static tripod shot — no camera movement, no zoom, no orbit, no push-in; framing stays as the first frame.',
    'Stable identity, consistent limb count, coherent hands, no extra people.',
  ]
    .filter(Boolean)
    .join(' ');
}
