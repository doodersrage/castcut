/**
 * Read the lines on stills (Part 19, the stills animatic): a still says its line only once it is
 * animated, so a cut of stills is silent. With this, each still's line is read in its speaker's
 * voice and the still holds for it. The lead's line is the still's `stillLine` (or `spoken`);
 * another person's line is in its beat as `Rob says: “…”` (day/script-shots.ts). One line a
 * shot. Pure.
 */

export type StillLine = {
  text: string;
  /** Who says it: the lead, or the other person's name as the beat gives it. */
  speaker: { lead: true } | { lead: false; name: string };
};

const SAYS = /([A-Z][\w'’-]*(?: [A-Z][\w'’-]*)?) says: [“"](.+?)[”"]/;

export function stillLineOf(shot: {
  kind?: string;
  spoken?: string;
  stillLine?: string;
  caption?: string;
}): StillLine | null {
  if (shot.kind !== 'still') return null;
  const spoken = shot.stillLine?.trim() || shot.spoken?.trim();
  if (spoken) return { text: spoken.slice(0, 400), speaker: { lead: true } };
  const said = SAYS.exec(shot.caption ?? '');
  if (said?.[2]?.trim()) {
    return { text: said[2].trim().slice(0, 400), speaker: { lead: false, name: said[1]! } };
  }
  return null;
}

/**
 * A speaker's own seed for read lines: the speech model draws a new voice for each seed, so a
 * random one a line made each line a slightly different person (Rob most of all). Stable per
 * speaker key — a Cast id, else the name the beat gives. Pure.
 */
export function speakerSeed(key: string): number {
  let hash = 2166136261;
  for (const char of key.trim().toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 1_000_000_000;
}

/**
 * What a speaker says to give them a base voice (a Cast member with none, before their lines are
 * read): a few seconds in their own words, kept as their voice sample like an audition. Lively,
 * not calm: a read line copies its sample's delivery as well as its voice (2026-11-07: the calm
 * introduction made every line flat).
 */
export function baseVoiceLine(name: string): string {
  const first = name.trim().split(/\s+/)[0] || 'me';
  return `Hi! I'm ${first}. Honestly? This is just how I sound — happy, annoyed, all of it. Ha!`;
}
