/**
 * The intimate-wording rewriter (clarifyIntimateImageLanguage) runs on scene text before a
 * rating is known in several places (Story scene cards, pose text, the still reinforcer). On
 * clean text it must change nothing that matters: a rule that is too broad puts sexual words
 * into an ordinary scene — "the stranger's joined hands" became "the stranger's penetrating in
 * sex hands", and the still was then queued as an adult one.
 *
 * Every clean Day beat and Setting, the Sport and Vacation beats, and a list of ordinary
 * sentences built from the words the rules key on.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_LATE_SLOT_BEAT_PRESETS,
  DAY_LATE_SLOT_COMPANION_BEAT_PRESETS,
  DAY_LATE_SLOT_SETTING_PRESETS,
  DAY_PARTS,
  DAY_SLOT_BEAT_PRESETS,
  DAY_SLOT_COMPANION_BEAT_PRESETS,
  DAY_SLOT_SETTING_PRESETS,
  daySlotsForLength,
} from './day-planner';
import { daySportBeatPresetsForSlot } from './day-sport';
import { dayVacationBeatPresetsForSlot, dayVacationDuoBeatPresetsForSlot } from './day-vacation';
import { clarifyIntimateImageLanguage } from './intimate-prompt-clarify';

/** Words the rewriter only ever writes for a sex scene. */
const SEXUAL_RE =
  /\b(?:sex|penetrat\w*|cock|penis|pussy|vagina|clit\w*|oral|nipples?|nude|naked|orgasm\w*|thrust\w*|masturbat\w*|cum\w*|erect\w*|genital\w*)\b/i;

/** Ordinary sentences that use the words the rules look for. */
const ORDINARY = [
  "Roots unspool from her wrists and drift into the stranger's joined hands.",
  'She joined him at the table and poured the tea.',
  'The two rivers joined below the bridge where she stood.',
  'They moved as one across the dance floor.',
  'The band rocked together on the small stage while she watched.',
  'She watched the coupling of the train cars from the platform.',
  'He buried himself in a book while she sketched.',
  'They became one team after the match and lifted the cup.',
  'She is joining the queue at the bakery.',
  'Coupled with the rain, the fog hid the pier.',
  'She came home late and kicked off her shoes.',
  'He finished the race and she came second.',
  'She rides the tram to the market, holding the pole.',
  'She mounts the bicycle and pushes off.',
  'He takes her by the hand and they run for the ferry.',
  'She is on top of the hill, catching her breath.',
  'She goes down the stairs to the cellar.',
  'Her entrance to the party turned every head.',
  'She touches herself up in the mirror, fixing her lipstick.',
  'The heat between them was the stove; they laughed and opened a window.',
  'She strokes the cat on the windowsill.',
  'He enters the room with two cups of coffee.',
  'She slides into the booth across from a friend.',
  'She swallows the last of the espresso and stands.',
  'Kneeling in the herb garden, she pulls weeds while he waters the beds.',
  'She blows on her tea and wraps both hands around the mug.',
  'She eats out with friends at the noodle bar.',
  'They finish together, crossing the line hand in hand.',
  'She fingers the hem of her coat while she waits.',
  'She releases the kite string and watches it climb.',
  'He takes her from the station to the hotel in a taxi.',
  'She climaxes the speech with a toast.',
  'Her core is tight as she holds the plank on the mat.',
  'She spreads the picnic blanket and lies back on it.',
  'They make love letters out of old postcards.',
];

function cleanCorpus(): string[] {
  const texts = new Set<string>(ORDINARY);
  const add = (list: readonly string[] | undefined) => {
    for (const text of list ?? []) {
      if (text.trim()) texts.add(text);
    }
  };
  for (const part of DAY_PARTS) {
    add(DAY_SLOT_BEAT_PRESETS[part]);
    add(DAY_SLOT_COMPANION_BEAT_PRESETS[part]);
    add(DAY_LATE_SLOT_BEAT_PRESETS[part]);
    add(DAY_LATE_SLOT_COMPANION_BEAT_PRESETS[part]);
    add(DAY_SLOT_SETTING_PRESETS[part]);
    add(DAY_LATE_SLOT_SETTING_PRESETS[part]);
  }
  for (const slot of daySlotsForLength(8)) {
    add(daySportBeatPresetsForSlot(slot.id));
    add(dayVacationBeatPresetsForSlot(slot.id));
    add(dayVacationDuoBeatPresetsForSlot(slot.id));
  }
  return [...texts];
}

describe('the intimate-wording rewriter on clean text', () => {
  const corpus = cleanCorpus();

  it('has a corpus worth the name', () => {
    assert.ok(corpus.length > 300, `only ${corpus.length} texts`);
  });

  it('adds no sexual wording to a clean scene', () => {
    const broken: string[] = [];
    for (const text of corpus) {
      if (SEXUAL_RE.test(text)) continue;
      const out = clarifyIntimateImageLanguage(text);
      if (SEXUAL_RE.test(out)) {
        broken.push(`${text}\n      → ${out}`);
      }
    }
    assert.deepEqual(broken, [], `${broken.length} clean texts were sexualised`);
  });
});
