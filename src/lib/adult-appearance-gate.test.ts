import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ADULT_GATE_WITHHELD_MESSAGE,
  adultGateVisionPrompt,
  dayMoodNeedsAdultSafeguards,
  decideAdultGate,
  parseAdultGateReply,
  storyRatingNeedsAdultSafeguards,
} from './adult-appearance-gate';

describe('adult-appearance gate', () => {
  it('asks one strict-JSON question about every person', () => {
    const prompt = adultGateVisionPrompt();
    assert.match(prompt, /do all people shown clearly look like adults over 21\?/);
    assert.match(prompt, /strict JSON only/);
    assert.match(prompt, /"answer":"yes or no","confidence":0-100/);
  });

  it('reads the reply, also with prose or fences around it', () => {
    assert.deepEqual(
      parseAdultGateReply('{"people":2,"youngest_apparent_age":25,"answer":"yes","confidence":95}'),
      { answer: 'yes', confidence: 95, youngestAge: 25, people: 2 }
    );
    assert.deepEqual(
      parseAdultGateReply('```json\n{"answer":"No","confidence":0.9}\n```'),
      { answer: 'no', confidence: 90 }
    );
    assert.deepEqual(parseAdultGateReply('{"answer":"maybe"}'), { answer: 'unsure', confidence: 50 });
    assert.equal(parseAdultGateReply('I cannot tell.'), null);
    assert.equal(parseAdultGateReply('{broken'), null);
    assert.equal(parseAdultGateReply(''), null);
  });

  const yes = { answer: 'yes' as const, confidence: 95, youngestAge: 25 };

  it('passes a confident yes', () => {
    assert.equal(decideAdultGate({ visionAvailable: true, reply: yes, strongTake: false }).verdict, 'pass');
    assert.equal(
      decideAdultGate({ visionAvailable: true, reply: { ...yes, youngestAge: 21 }, strongTake: true })
        .verdict,
      'pass'
    );
  });

  it('withholds a no, an unsure answer, a weak yes and a yes it does not believe', () => {
    const fails = [
      { answer: 'no' as const, confidence: 95, youngestAge: 15 },
      { answer: 'unsure' as const, confidence: 50 },
      { answer: 'yes' as const, confidence: 40 },
      { answer: 'yes' as const, confidence: 95, youngestAge: 16 },
      null,
    ];
    for (const reply of fails) {
      assert.equal(
        decideAdultGate({ visionAvailable: true, reply, strongTake: false }).verdict,
        'requeue',
        JSON.stringify(reply)
      );
      // The stronger take already ran: stop there.
      assert.equal(
        decideAdultGate({ visionAvailable: true, reply, strongTake: true }).verdict,
        'withhold',
        JSON.stringify(reply)
      );
    }
  });

  it('allows a still unchecked when no vision model is configured', () => {
    const decision = decideAdultGate({ visionAvailable: false, reply: null, strongTake: false });
    assert.equal(decision.verdict, 'unchecked');
    assert.match(decision.reason, /no vision model/);
  });

  it('says plainly why the card is empty', () => {
    assert.equal(
      ADULT_GATE_WITHHELD_MESSAGE,
      'Withheld: the picture did not read as clearly adult — try a different seed or beat'
    );
  });

  it('applies to Suggestive / Intimate / Raunchy days and adult-rated stories', () => {
    for (const mood of ['suggestive', 'intimate', 'Raunchy']) {
      assert.equal(dayMoodNeedsAdultSafeguards(mood), true, mood);
    }
    for (const mood of ['everyday', 'sport', 'vacation', '', null]) {
      assert.equal(dayMoodNeedsAdultSafeguards(mood), false, String(mood));
    }
    for (const rating of ['suggestive', 'sultry', 'explicit', 'raunchy']) {
      assert.equal(storyRatingNeedsAdultSafeguards(rating), true, rating);
    }
    for (const rating of ['clean', 'pg13', undefined]) {
      assert.equal(storyRatingNeedsAdultSafeguards(rating), false, String(rating));
    }
  });
});
