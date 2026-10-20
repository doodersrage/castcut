/**
 * A clip's motion text is often the still's own prompt (Play / Story beats send it as "Motion"),
 * and a still prompt talks to the edit model: "Image 3 is an OpenPose keypoint skeleton map…",
 * "Keep Image 1 face…", "replace the reference clothing…". A video model has one picture (the
 * start frame) and no pose map, so those lines are noise at best — at worst it draws the
 * skeleton it was told about. Found live (2026-10-03): a queued clip prompt carried the whole
 * Image 3 OpenPose block.
 */

/** Sentences that address an edit model's numbered inputs or the pose map. */
const STILL_INPUT_SENTENCE_RE =
  /\bImage\s*[1-4]\b|<image\s*\d>|\bopen\s*pose\b|\bskeletons?\b|\bkey\s*points?\b|\bpose[-\s](?:guide|map|diagram|control)\b|\bschematic\b|\bmannequin\b/i;

/** Comma clauses that only tell an edit model what to do with its reference photo. */
const REFERENCE_EDIT_CLAUSE_RE =
  /\b(?:reference (?:photo|image|picture|plate|clothing|outfit)|not from the reference)\b/i;

/** The still prompt with its edit-input / pose-map lines taken out (whitespace tidied). */
export function stripStillPromptForClip(text: string | null | undefined): string {
  const raw = String(text ?? '');
  if (!raw.trim()) return '';
  const sentences = raw
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (STILL_INPUT_SENTENCE_RE.test(sentence)) continue;
    const clauses = sentence.split(/,\s+/);
    const cleaned = clauses.filter(clause => !REFERENCE_EDIT_CLAUSE_RE.test(clause));
    if (cleaned.length === 0) continue;
    let joined = cleaned.join(', ').trim();
    // Dropping the last clause took the full stop with it.
    if (cleaned.length < clauses.length && !/[.!?]$/.test(joined) && /[.!?]$/.test(sentence)) {
      joined += sentence.slice(-1);
    }
    kept.push(joined);
  }
  return kept.join(' ').replace(/\s+/g, ' ').trim();
}
