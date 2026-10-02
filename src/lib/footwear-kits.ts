/**
 * Footwear kits: a small catalog of shoes to pick beside the clothing, the way outfit kits are
 * picked. Each kit is its words (what the prompt says) and a packshot under /footwear/ that is
 * both the picker thumbnail and the image the still is shown (see footwear-image.ts).
 */

export type FootwearKitGroup = 'Sneakers' | 'Heels' | 'Boots' | 'Flats' | 'Sandals' | 'At home';

export type FootwearKit = {
  id: string;
  label: string;
  group: FootwearKitGroup;
  /** What the prompt names: a short noun phrase, lower case. */
  words: string;
};

export const FOOTWEAR_KITS: readonly FootwearKit[] = [
  // Sneakers
  {
    id: 'white-sneakers',
    label: 'White sneakers',
    group: 'Sneakers',
    words: 'white leather low-top sneakers',
  },
  {
    id: 'black-high-tops',
    label: 'Black high-tops',
    group: 'Sneakers',
    words: 'black canvas high-top sneakers with white rubber toe caps',
  },
  {
    id: 'chunky-sneakers',
    label: 'Chunky sneakers',
    group: 'Sneakers',
    words: 'white chunky platform sneakers with thick soles',
  },
  {
    id: 'running-shoes',
    label: 'Running shoes',
    group: 'Sneakers',
    words: 'grey mesh running shoes with white foam soles',
  },
  {
    id: 'retro-runners',
    label: 'Retro runners',
    group: 'Sneakers',
    words: 'navy and cream suede retro running sneakers with gum soles',
  },
  {
    id: 'canvas-slip-ons',
    label: 'Canvas slip-ons',
    group: 'Sneakers',
    words: 'black canvas slip-on sneakers with white soles',
  },
  // Heels
  {
    id: 'black-pumps',
    label: 'Black pumps',
    group: 'Heels',
    words: 'black leather pointed-toe stiletto pumps',
  },
  {
    id: 'red-stilettos',
    label: 'Red stilettos',
    group: 'Heels',
    words: 'glossy red patent stiletto pumps',
  },
  { id: 'nude-pumps', label: 'Nude pumps', group: 'Heels', words: 'nude beige pointed-toe pumps' },
  {
    id: 'strappy-gold-heels',
    label: 'Gold strappy heels',
    group: 'Heels',
    words: 'gold strappy stiletto sandals with thin ankle straps',
  },
  {
    id: 'block-heel-sandals',
    label: 'Block-heel sandals',
    group: 'Heels',
    words: 'tan suede block-heel sandals with ankle straps',
  },
  {
    id: 'platform-heels',
    label: 'Platform heels',
    group: 'Heels',
    words: 'black platform high heels with ankle straps',
  },
  {
    id: 'kitten-slingbacks',
    label: 'Kitten slingbacks',
    group: 'Heels',
    words: 'white kitten-heel slingback pumps',
  },
  // Boots
  {
    id: 'black-ankle-boots',
    label: 'Black ankle boots',
    group: 'Boots',
    words: 'black leather heeled ankle boots',
  },
  {
    id: 'brown-chelsea-boots',
    label: 'Chelsea boots',
    group: 'Boots',
    words: 'brown leather chelsea boots with elastic side panels',
  },
  {
    id: 'knee-high-boots',
    label: 'Knee-high boots',
    group: 'Boots',
    words: 'black leather knee-high boots with block heels',
  },
  {
    id: 'over-knee-boots',
    label: 'Over-the-knee boots',
    group: 'Boots',
    words: 'black suede over-the-knee boots',
  },
  {
    id: 'combat-boots',
    label: 'Combat boots',
    group: 'Boots',
    words: 'black lace-up combat boots with chunky lug soles',
  },
  {
    id: 'cowboy-boots',
    label: 'Cowboy boots',
    group: 'Boots',
    words: 'tan leather cowboy boots with stitched shafts',
  },
  {
    id: 'hiking-boots',
    label: 'Hiking boots',
    group: 'Boots',
    words: 'brown leather hiking boots with red laces',
  },
  {
    id: 'rain-boots',
    label: 'Rain boots',
    group: 'Boots',
    words: 'bright yellow rubber rain boots',
  },
  {
    id: 'snow-boots',
    label: 'Snow boots',
    group: 'Boots',
    words: 'tan suede shearling-lined snow boots',
  },
  // Flats
  {
    id: 'ballet-flats',
    label: 'Ballet flats',
    group: 'Flats',
    words: 'black leather ballet flats with small bows',
  },
  { id: 'loafers', label: 'Loafers', group: 'Flats', words: 'brown leather penny loafers' },
  { id: 'oxfords', label: 'Oxfords', group: 'Flats', words: 'black leather lace-up oxford shoes' },
  {
    id: 'mary-janes',
    label: 'Mary Janes',
    group: 'Flats',
    words: 'black patent mary jane shoes with a buckled strap',
  },
  {
    id: 'espadrilles',
    label: 'Espadrilles',
    group: 'Flats',
    words: 'cream canvas espadrilles with woven rope soles',
  },
  {
    id: 'boat-shoes',
    label: 'Boat shoes',
    group: 'Flats',
    words: 'navy leather boat shoes with white soles',
  },
  // Sandals
  {
    id: 'leather-sandals',
    label: 'Leather sandals',
    group: 'Sandals',
    words: 'flat tan leather strappy sandals',
  },
  {
    id: 'slides',
    label: 'Slides',
    group: 'Sandals',
    words: 'white rubber slide sandals with one wide band across the foot',
  },
  { id: 'flip-flops', label: 'Flip-flops', group: 'Sandals', words: 'black rubber flip-flops' },
  {
    id: 'gladiator-sandals',
    label: 'Gladiator sandals',
    group: 'Sandals',
    words: 'brown leather gladiator sandals laced up the calf',
  },
  {
    id: 'wedge-sandals',
    label: 'Wedge sandals',
    group: 'Sandals',
    words: 'cork wedge sandals with white straps',
  },
  // At home
  { id: 'slippers', label: 'Slippers', group: 'At home', words: 'fluffy white house slippers' },
  {
    id: 'wool-socks',
    label: 'Wool socks',
    group: 'At home',
    words: 'thick grey wool socks, no shoes',
  },
  {
    id: 'white-ankle-socks',
    label: 'Ankle socks',
    group: 'At home',
    words: 'white cotton ankle socks, no shoes',
  },
];

const KIT_BY_ID = new Map(FOOTWEAR_KITS.map(kit => [kit.id, kit]));

export function footwearKit(id: string | null | undefined): FootwearKit | null {
  return (id && KIT_BY_ID.get(id.trim())) || null;
}

/** The kit whose words these are (a kit pick is stored as its words). */
export function footwearKitForWords(words: string | null | undefined): FootwearKit | null {
  const text = words?.replace(/\s+/g, ' ').trim().toLowerCase();
  return text ? (FOOTWEAR_KITS.find(kit => kit.words.toLowerCase() === text) ?? null) : null;
}

/** Packshot shipped with the app: picker thumbnail and Image 2 reference. */
export function footwearKitImageUrl(id: string): string {
  return `/footwear/${id}.webp`;
}
