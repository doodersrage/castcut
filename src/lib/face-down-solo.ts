/** One person, nude, lying face-down (on her stomach / front). */
const FACE_DOWN_RE =
  /\b(?:face[- ]down|prone|on (?:her|his) (?:stomach|belly|front)|lies? (?:stretched out )?(?:flat )?on (?:her|his) (?:stomach|belly|front))\b/i;

const NUDE_RE = /\b(?:nude|naked|explicit|sex(?:ual)?|topless)\b/i;

/**
 * Nude solo stills lying face-down stay on Rapid AIO NSFW when Qwen-Image 2.1 is picked: Turbo
 * turned her onto her side every time — 0/9 with the brief, a prone POSE FIRST line, a
 * from-behind camera and the landscape canvas; Rapid on the same brief lay her face-down 3/3
 * (wide sweep, 2026-10-18). Kept apart from the renderer so Day can ask without loading it.
 */
export function isFaceDownNudeSolo(prompt: string, solo: boolean): boolean {
  return solo && NUDE_RE.test(prompt) && FACE_DOWN_RE.test(prompt);
}
