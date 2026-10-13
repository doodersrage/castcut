/**
 * The utensil an eating beat leaves out. "Sitting at a dinner table twirling pasta" named no fork,
 * and the image engine fed her spaghetti by hand (the user's Late evening card, 2026-10-13). A beat
 * that eats a food people eat with a fork, chopsticks or a spoon — and names no utensil — gets one
 * right after the food. Finger foods (pizza, a sandwich, a croissant, fries) and food eaten
 * straight from the box are left alone; noodles get chopsticks, spaghetti a fork.
 */

/** Eaten by hand on purpose: dry cereal straight from the box, chips from the bag. */
const BY_HAND_RE =
  /\b(?:straight\s+)?(?:from|out\s+of)\s+the\s+(?:box|bag|packet)\b|\bby\s+hand\b/i;

const UTENSIL_RE =
  /\b(?:fork|forks|chopsticks?|spoon|spoons|teaspoon|ladle|knife|knives|skewer|tongs|straw)\b/i;

/** What she eats → the utensil, in the words added after the food. */
const FOODS: ReadonlyArray<[RegExp, { twirl: string; plain: string }]> = [
  [
    /\b(?:ramen|udon|soba|pho|sushi|sashimi|dumplings|noodles|noodle\s+soup|stir[- ]fry)\b/i,
    { twirl: 'with her chopsticks', plain: 'with chopsticks' },
  ],
  [
    /\b(?:soup|cereal|yogh?urt|porridge|oatmeal|gelato|sundae|parfait)\b/i,
    { twirl: 'with her spoon', plain: 'with a spoon' },
  ],
  [
    /\b(?:pasta|spaghetti|linguine|fettuccine|tagliatelle|penne|carbonara|salad|cake|cheesecake|pie|tart|steak|omelett?e|pancakes|waffles|risotto|lasagna|gnocchi)\b/i,
    { twirl: 'on her fork', plain: 'with a fork' },
  ],
];

/** An eating clause: the verb, then the food within a few words. */
const EATING_RE =
  /\b(twirl(?:s|ing)?|eat(?:s|ing)?|bit(?:es|ing)|biting\s+into|tuck(?:s|ing)?\s+into|dig(?:s|ging)?\s+into|slurp(?:s|ing)?|tast(?:es|ing)|savou?r(?:s|ing)?|sharing|share(?:s)?|finish(?:es|ing)?)\b([^,;.]{0,40}?)$/i;

export function withEatingUtensil(beat: string): string {
  if (!beat.trim() || UTENSIL_RE.test(beat) || BY_HAND_RE.test(beat)) return beat;
  for (const [food, utensil] of FOODS) {
    const match = food.exec(beat);
    if (!match) continue;
    const before = beat.slice(0, match.index);
    const eating = EATING_RE.exec(before);
    if (!eating) continue;
    const end = match.index + match[0].length;
    const words = /^twirl/i.test(eating[1]!) ? utensil.twirl : utensil.plain;
    return `${beat.slice(0, end)} ${words}${beat.slice(end)}`;
  }
  return beat;
}
