import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adultGateRequeueMessage,
  adultGateVisionPrompt,
  decideAdultGate,
  isAdultGateCause,
  parseAdultGateReply,
} from './adult-appearance-gate';
import {
  anatomyCastFor,
  anatomyCastFromPrompt,
  anatomyCastWords,
  anatomyRedoLine,
  normalizeAnatomyAsk,
  normalizeAnatomyCast,
  readAnatomyAnswer,
  withAnatomyRedoLine,
} from './anatomy-check';

describe('anatomy check: who the still should show', () => {
  it('is the lead alone, or the lead and a partner of known sex', () => {
    assert.deepEqual(anatomyCastFor({ leadNoun: 'woman', people: 1 }), { women: 1, men: 0 });
    assert.deepEqual(anatomyCastFor({ leadNoun: 'man', people: 1 }), { women: 0, men: 1 });
    assert.deepEqual(anatomyCastFor({ leadNoun: 'woman', partnerNoun: 'man', people: 2 }), { women: 1, men: 1 });
    assert.deepEqual(anatomyCastFor({ leadNoun: 'woman', partnerNoun: 'woman', people: 2 }), { women: 2, men: 0 });
    assert.deepEqual(anatomyCastFor({ leadNoun: 'man', partnerNoun: 'man', people: 2 }), { women: 0, men: 2 });
  });

  it('is not said when it cannot be: an unknown partner, three people, an unknown lead', () => {
    assert.equal(anatomyCastFor({ leadNoun: 'woman', people: 2 }), null);
    assert.equal(anatomyCastFor({ leadNoun: 'woman', partnerNoun: 'man', people: 3 }), null);
    assert.equal(anatomyCastFor({ leadNoun: undefined, people: 1 }), null);
  });

  it('is read from the still prompt only when it says who outright, never guessed', () => {
    assert.deepEqual(anatomyCastFromPrompt('Day photo: a woman and a man together in bed.'), { women: 1, men: 1 });
    assert.deepEqual(anatomyCastFromPrompt('Two women together on the couch.'), { women: 2, men: 0 });
    assert.deepEqual(anatomyCastFromPrompt('two men together'), { women: 0, men: 2 });
    // Calibration: adult duo prompts say "the man" and "the couple" — no cast, not "one woman".
    assert.equal(anatomyCastFromPrompt('The couple on the bed; the man leans over her.'), null);
    assert.equal(anatomyCastFromPrompt('One woman alone in the shower.'), null);
  });

  it('from a request: an ask is { cast }, the cast one or two people, else nothing', () => {
    assert.deepEqual(normalizeAnatomyAsk({ cast: null }), { cast: null });
    assert.deepEqual(normalizeAnatomyAsk({ cast: { women: 1, men: 1 } }), { cast: { women: 1, men: 1 } });
    assert.deepEqual(normalizeAnatomyAsk({ cast: { women: 9 } }), { cast: null });
    assert.equal(normalizeAnatomyAsk(true), null);
    assert.deepEqual(normalizeAnatomyCast({ women: 1, men: 1 }), { women: 1, men: 1 });
    assert.deepEqual(normalizeAnatomyCast({ women: 0, men: 2 }), { women: 0, men: 2 });
    for (const bad of [null, 'x', {}, { women: 0, men: 0 }, { women: 3, men: 0 }, { women: 1.5, men: 0 }, { women: -1, men: 2 }, { women: 2, men: 1 }])
      assert.equal(normalizeAnatomyCast(bad), null, JSON.stringify(bad));
  });

  it('is said in words, and the redo line names each body', () => {
    assert.equal(anatomyCastWords({ women: 1, men: 1 }), 'a woman and a man');
    assert.equal(anatomyCastWords({ women: 2, men: 0 }), 'two women');
    assert.equal(anatomyCastWords({ women: 0, men: 1 }), 'one man');
    assert.match(anatomyRedoLine({ women: 1, men: 1 }), /^ANATOMY \(mandatory\): the woman .*no penis; the man .*penis\.$/);
    assert.match(anatomyRedoLine({ women: 2, men: 0 }), /both women .*no penis/);
    assert.match(anatomyRedoLine(null), /every woman .*no penis; every man .*a penis\.$/);
    const redo = withAnatomyRedoLine('A photo.', { women: 1, men: 0 });
    assert.match(redo, /^ANATOMY \(mandatory\): .* A photo\.$/);
    assert.equal(withAnatomyRedoLine(redo, { women: 1, men: 0 }), redo);
  });
});

describe('anatomy check: the gate question and answer', () => {
  it('asks whether anyone’s genitals do not match their own body, with the cast only as context', () => {
    const plain = adultGateVisionPrompt({ anatomy: { cast: null } });
    assert.match(plain, /"anatomy": look only at genitals that are clearly visible\./);
    assert.match(plain, /Judge each person against their own body, not against the description/);
    assert.match(plain, /"anatomy":"ok, mismatch or not_visible"/);
    assert.doesNotMatch(plain, /meant to show/);
    assert.match(adultGateVisionPrompt({ anatomy: { cast: { women: 1, men: 1 } } }), /meant to show a woman and a man/);
    assert.doesNotMatch(adultGateVisionPrompt({ clothed: true, anatomy: { cast: null } }), /anatomy/);
    assert.doesNotMatch(adultGateVisionPrompt(), /anatomy/);
  });

  it('reads the anatomy answer, and an unreadable one as unsure', () => {
    assert.equal(readAnatomyAnswer('mismatch'), 'mismatch');
    assert.equal(readAnatomyAnswer('OK'), 'ok');
    assert.equal(readAnatomyAnswer('not visible'), 'not_visible');
    assert.equal(readAnatomyAnswer('maybe'), 'unsure');
    assert.equal(readAnatomyAnswer(undefined), null);
    assert.equal(
      parseAdultGateReply('{"answer":"yes","confidence":90,"youngest_apparent_age":30,"anatomy":"mismatch"}')?.anatomy,
      'mismatch'
    );
    assert.equal(parseAdultGateReply('{"answer":"yes","confidence":90}')?.anatomy, undefined);
  });
});

describe('anatomy check: the decision', () => {
  const reply = (anatomy?: string) =>
    parseAdultGateReply(JSON.stringify({ answer: 'yes', confidence: 90, youngest_apparent_age: 30, ...(anatomy ? { anatomy } : {}) }));
  const decide = (anatomy: string | undefined, anatomyTake = false, asked = true) =>
    decideAdultGate({ visionAvailable: true, reply: reply(anatomy), strongTake: false, anatomy: asked, anatomyTake });

  it('redoes a mismatch once, then keeps it flagged for review', () => {
    const first = decide('mismatch');
    assert.equal(first.verdict, 'requeue');
    assert.equal(first.cause, 'anatomy');
    const second = decide('mismatch', true);
    assert.equal(second.verdict, 'pass');
    assert.equal(second.flag, 'anatomy');
    assert.match(second.reason, /anatomy may be wrong/);
  });

  it('passes a match, nothing visible, an unsure answer, or a question not asked', () => {
    for (const answer of ['ok', 'not_visible', 'unsure', undefined]) {
      const decision = decide(answer);
      assert.equal(decision.verdict, 'pass', String(answer));
      assert.equal(decision.flag, undefined);
    }
    assert.equal(decide('mismatch', false, false).verdict, 'pass');
  });

  it('puts the age read first: a still that is not clearly adult is withheld whatever its anatomy', () => {
    const decision = decideAdultGate({
      visionAvailable: true,
      reply: parseAdultGateReply('{"answer":"no","confidence":90,"anatomy":"mismatch"}'),
      strongTake: false,
      anatomy: true,
    });
    assert.equal(decision.cause, 'age');
  });

  it('is a cause of its own, with its own tray line', () => {
    assert.equal(isAdultGateCause('anatomy'), true);
    assert.match(adultGateRequeueMessage('anatomy'), /anatomy line/);
  });
});
