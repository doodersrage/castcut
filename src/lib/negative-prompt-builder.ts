import type { AthleticSport } from './athletic-sport-profiles';

const BASE_NEGATIVE =
  'blurry, low quality, watermark, text, logo, deformed, bad anatomy, extra limbs, plastic skin, waxy skin, airbrushed, doll-like, oversharpened halos, generic stock model face, beauty-filter face, identical default woman, identical default man, same influencer face, symmetrical beauty portrait, poreless skin, default slim fitness body, identical hourglass figure, same male model physique, Barbie proportions, action-figure proportions, nude, topless, bottomless, missing shorts, exposed buttocks, underwear visible, split screen, diptych, collage panels, side by side comparison, multiple unrelated subjects';

const SOLO_SUBJECT_NEGATIVE =
  'second person, extra face, crowd, duo, pair, twins, wrong gender, elderly man, split frame';

const SPORT_NEGATIVE: Partial<Record<AthleticSport, string>> = {
  cycling:
    'bare head, no helmet, dress, street clothes, track pants, running shoes, javelin, wrong sport',
  running:
    'cycling kit, bicycle, cleats on bike, dress shoes, sports bra only, missing running shorts, no pants, panties visible',
  basketball: 'cycling kit, soccer cleats, baseball uniform',
  soccer: 'cycling kit, basketball hoop indoors only, American football',
  track_field: 'bicycle, cycling kit, basketball, unrelated sport gear',
};

export function buildNegativePrompt(input: {
  sport?: AthleticSport | null;
  preserveSubject?: boolean;
  soloSubject?: boolean;
  extra?: string;
}): string {
  const parts = [BASE_NEGATIVE];

  if (input.soloSubject) {
    parts.push(SOLO_SUBJECT_NEGATIVE);
  }

  if (input.preserveSubject) {
    parts.push('different face, identity change, age change, gender swap, duplicate person');
  }

  if (input.sport && SPORT_NEGATIVE[input.sport]) {
    parts.push(SPORT_NEGATIVE[input.sport]!);
  }

  if (input.extra?.trim()) {
    parts.push(input.extra.trim());
  }

  return parts.join(', ');
}

export type NegativePromptResult = {
  prompt: string;
  mode: 'negative' | 'preserve';
  sport: AthleticSport | null;
};
