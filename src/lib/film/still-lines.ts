/**
 * Read the lines on stills (Part 19, the stills animatic): a still says its line only once it is
 * animated, so a cut of stills is silent. With this, each still's line is read in its speaker's
 * voice and the still holds for it. A Scene's lead line is the shot's `spoken`; another person's
 * line is in its beat as `Rob says: “…”` (day/script-shots.ts). One line a shot. Pure.
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
  caption?: string;
}): StillLine | null {
  if (shot.kind !== 'still') return null;
  const spoken = shot.spoken?.trim();
  if (spoken) return { text: spoken.slice(0, 400), speaker: { lead: true } };
  const said = SAYS.exec(shot.caption ?? '');
  if (said?.[2]?.trim()) {
    return { text: said[2].trim().slice(0, 400), speaker: { lead: false, name: said[1]! } };
  }
  return null;
}
