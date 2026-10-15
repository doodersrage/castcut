/**
 * A failed card's one-line reason: the message's first clause ("Job not found", a node's error
 * title), never a cut-off paragraph or traceback. The full message stays on hover.
 */
export function galleryFailureSummary(message: string | undefined | null, max = 60): string {
  const text = (message ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Failed';
  // First clause: up to " — ", ": " (Python "ValueError: …" keeps its type), or a sentence end.
  const clause =
    text
      .split(/ — | - |(?<=[.!?]) /)[0]!
      .replace(/[.:;,]+$/, '')
      .trim() || text;
  if (clause.length <= max) return clause;
  const cut = clause.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:(]+$/, '')}…`;
}
