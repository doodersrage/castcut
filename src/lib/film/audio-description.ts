/**
 * Audio description (Part 18 R7): what a shot shows, said for someone who can't see it — from the
 * shot's beat and place ("pours coffee · kitchen" → "She pours coffee in the kitchen."), short
 * enough to fit the shot. Pure.
 */

const MAX_WORDS = 14;

export function audioDescriptionLine(beatText: string): string {
  const [beat = '', place = ''] = beatText.split(' · ').map(part => part.trim());
  let text = beat.replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  if (!text) return '';
  const words = text.split(' ');
  if (words.length > MAX_WORDS) text = words.slice(0, MAX_WORDS).join(' ');
  // "pours coffee" → "She pours coffee": a beat that starts on its verb; one that names who keeps it.
  if (/^[a-z]+s\b/.test(text)) text = `She ${text}`;
  text = text.charAt(0).toUpperCase() + text.slice(1);
  const where =
    place && !text.toLowerCase().includes(place.toLowerCase())
      ? ` in the ${place.replace(/^(the|a|an)\s+/i, '')}`
      : '';
  return `${text}${where}.`;
}
