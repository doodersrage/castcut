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
  if (/Edit instruction for an outfit try-on/i.test(p)) {
    const outfit =
      /outfit name[^:\n]*:\s*([^\n]+)/i.exec(p)?.[1] ??
      /(?:^|\n)\s*subject:\s*([^\n]+)/i.exec(p)?.[1];
    return outfit ? `Outfit try-on · ${clean(outfit)}` : 'Outfit try-on';
  }
  // Plate and outfit edits: name the edit, not the instruction (UI review 2026-10-15).
  if (/\bnow standing upright facing the camera\b/i.test(p)) return 'Plate · stood upright';
  if (/\bseen from directly behind\b/i.test(p)) return 'Outfit · back view';
  const shoes = /\bput (.+?) on (?:her|his|their) bare feet/i.exec(p)?.[1];
  if (shoes) return `Shoes · ${clean(shoes)}`;
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
  // No beat: drop the leading "OUTFIT (mandatory): …." / "FOOTWEAR (mandatory): …." lines and
  // the "Replace the scene with" lead-in; an old-format scene prompt is just a new scene.
  const rest = p
    .replace(BOILERPLATE_RE, '')
    .replace(/^(?:\s*[A-Z]+ \(mandatory\):[^\n]*?\.(?:\s|$))+/, '')
    .replace(/^\s*Replace the scene with\s+/i, '');
  if (/^\s*new environment not from the reference photo\b/i.test(rest)) return 'New scene';
  return clean(rest.split('\n')[0]!).slice(0, 160);
}
