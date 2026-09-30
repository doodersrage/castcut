/**
 * A readable one-liner for a gallery card. Day / Story / recipe prompts all open with the same
 * instruction boilerplate ("Carry out this change on Image 1…"), so every card read the same;
 * the beat is inside the prompt. Falls back to the prompt with that boilerplate stripped.
 */

const BOILERPLATE_RE =
  /^(?:Carry out this change on Image 1[^:]*:\s*)?(?:Keep facial likeness only:\s*)?(?:Edit Image 1[.:]\s*)?/i;

function clean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\s.;,—-]+$/, '')
    .trim();
}

export function galleryCardCaption(prompt: string | null | undefined): string {
  const p = String(prompt ?? '');
  if (!p.trim()) return '';
  const part = /Edit instruction for a Day still — ([^:\n]+):/i.exec(p)?.[1]?.trim();
  const found =
    /(?:^|\n)\s*beat(?: \(mandatory[^)]*\))?:\s*([^\n]+)/i.exec(p)?.[1] ??
    /Beat \([^)]*\):\s*([^\n|]+)/i.exec(p)?.[1] ??
    /\bACTION:\s*([^\n]+?)\.(?:\s|$)/i.exec(p)?.[1] ??
    /\bMoment:\s*([^\n]+?)\.(?:\s|$)/i.exec(p)?.[1] ??
    /\b(?:Explicit (?:sex|solo) photo|Suggestive photo|Vacation photo):\s*([^.\n]+)/i.exec(p)?.[1];
  if (found) {
    // Sport beats carry a long guard tail after the action.
    const beat = clean(found.split(' — ')[0]!);
    return part ? `${part[0]!.toUpperCase()}${part.slice(1)} · ${beat}` : beat;
  }
  return clean(p.replace(BOILERPLATE_RE, '').split('\n')[0]!).slice(0, 160);
}
