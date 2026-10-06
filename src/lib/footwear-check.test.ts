import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FOOTWEAR_CHECK_PROMPT,
  footwearCheckApplies,
  footwearCheckNote,
  footwearCheckVerdict,
  footwearExpectedHeel,
  footwearNeedsFeetPass,
  parseFootwearCheck,
  resolveFeetPassModel,
  type FootwearCheckReading,
} from './footwear-check';

const HEELS = 'black strappy stiletto heels with crystal embellishments and ankle straps';

const reading = (patch: Partial<FootwearCheckReading>): FootwearCheckReading => ({
  feetVisible: true,
  shoesOnFeet: 2,
  heel: 'high',
  kind: 'black strappy high-heel sandals',
  shoesBesideHer: false,
  deformed: false,
  ...patch,
});

describe('parseFootwearCheck', () => {
  it('reads the bare JSON reply the model gave in calibration', () => {
    assert.deepEqual(
      parseFootwearCheck(
        '{ "feetVisible": true, "shoesOnFeet": 2, "heel": "low", "kind": "black strappy low-heel sandals", "shoesBesideHer": false, "deformed": false }'
      ),
      reading({ heel: 'low', kind: 'black strappy low-heel sandals' })
    );
  });

  it('reads a fenced reply with reasoning around it, and words for counts', () => {
    const parsed = parseFootwearCheck(
      'Looking at the feet…\n```json\n{"feetVisible":"true","shoesOnFeet":"both","heel":"HIGH","kind":"red pumps","shoesBesideHer":"no"}\n```'
    );
    assert.equal(parsed?.shoesOnFeet, 2);
    assert.equal(parsed?.heel, 'high');
    assert.equal(parsed?.shoesBesideHer, false);
    assert.equal(parsed?.deformed, false);
  });

  it('bare feet with the pair beside her', () => {
    const parsed = parseFootwearCheck(
      '{"feetVisible": true, "shoesOnFeet": 0, "heel": "none", "kind": "bare feet", "shoesBesideHer": true, "deformed": false}'
    );
    assert.equal(parsed?.shoesOnFeet, 0);
    assert.equal(parsed?.shoesBesideHer, true);
  });

  it('unreadable or off-topic replies are null', () => {
    assert.equal(parseFootwearCheck(''), null);
    assert.equal(parseFootwearCheck('She is wearing heels.'), null);
    assert.equal(parseFootwearCheck('{"feetVisible": tru'), null);
    assert.equal(parseFootwearCheck('{"answer": "yes"}'), null);
  });

  it('an unknown heel word is none; a missing feetVisible counts as visible', () => {
    const parsed = parseFootwearCheck('{"shoesOnFeet": 2, "heel": "medium"}');
    assert.equal(parsed?.heel, 'none');
    assert.equal(parsed?.feetVisible, true);
  });
});

describe('footwearCheckVerdict', () => {
  it('passes the picked heels when she wears high heels on both feet', () => {
    assert.deepEqual(footwearCheckVerdict(reading({}), HEELS), {
      ok: true,
      reason: null,
      seen: 'black strappy high-heel sandals',
    });
  });

  it('flags barefoot, one shoe and shoes set down beside her', () => {
    assert.equal(
      footwearCheckVerdict(reading({ shoesOnFeet: 0, heel: 'none', kind: 'bare feet' }), HEELS)
        .reason,
      'barefoot'
    );
    assert.equal(footwearCheckVerdict(reading({ shoesOnFeet: 1 }), HEELS).reason, 'one-shoe');
    assert.equal(
      footwearCheckVerdict(reading({ shoesOnFeet: 0, shoesBesideHer: true }), HEELS).reason,
      'shoes-beside'
    );
  });

  it('flat or low sandals are not the picked stilettos (the feet pass failure seen live)', () => {
    const verdict = footwearCheckVerdict(
      reading({ heel: 'low', kind: 'black strappy low-heel sandals' }),
      HEELS
    );
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, 'wrong-heel');
    assert.equal(footwearCheckNote(verdict), 'she has black strappy low-heel sandals on');
  });

  it('high heels are wrong for flats; boots and sneakers are not sandals', () => {
    assert.equal(footwearCheckVerdict(reading({}), 'black ballet flats').reason, 'wrong-heel');
    assert.equal(
      footwearCheckVerdict(reading({ heel: 'flat', kind: 'white sandals' }), 'white low-top sneakers')
        .reason,
      'wrong-kind'
    );
    assert.equal(
      footwearCheckVerdict(reading({ heel: 'flat', kind: 'white sneakers' }), 'white low-top sneakers')
        .ok,
      true
    );
    assert.equal(
      footwearCheckVerdict(reading({ heel: 'low', kind: 'black ankle boots' }), 'black leather ankle boots')
        .ok,
      true
    );
    assert.equal(
      footwearCheckVerdict(reading({ kind: 'black ankle boots' }), HEELS).reason,
      'wrong-kind'
    );
  });

  it('broken shoes need the pass; feet out of frame are not something it can fix', () => {
    assert.equal(footwearCheckVerdict(reading({ deformed: true }), HEELS).reason, 'deformed');
    assert.deepEqual(footwearCheckVerdict(reading({ feetVisible: false }), HEELS).ok, true);
    assert.equal(footwearCheckVerdict(reading({ feetVisible: false }), HEELS).reason, 'feet-hidden');
  });

  it('picked wedges: flat sandals or plain heels fail, a wedge or platform passes', () => {
    const wedges = 'light blue cork wedge sandals with ankle straps';
    // The dressed plate behind the user's duo stills (live 2026-10-06).
    assert.equal(
      footwearCheckVerdict(reading({ heel: 'flat', kind: 'black strappy flat sandals' }), wedges)
        .reason,
      'wrong-heel'
    );
    assert.equal(
      footwearCheckVerdict(reading({ kind: 'blue strappy high-heel sandals' }), wedges).reason,
      'wrong-kind'
    );
    assert.equal(footwearCheckVerdict(reading({ kind: 'blue cork platform sandals' }), wedges).ok, true);
    assert.equal(footwearCheckVerdict(reading({ kind: 'turquoise wedge sandals' }), wedges).ok, true);
    // Platform sneakers stay flat.
    assert.equal(footwearExpectedHeel('white platform sneakers'), 'flat');
  });

  it('a shoe picture with no words only checks that both feet wear shoes', () => {
    assert.equal(footwearCheckVerdict(reading({ heel: 'flat', kind: 'sandals' }), '').ok, true);
  });
});

describe('footwearExpectedHeel', () => {
  it('reads the heel the picked words call for', () => {
    assert.equal(footwearExpectedHeel(HEELS), 'high');
    assert.equal(footwearExpectedHeel('black high-heeled pumps'), 'high');
    assert.equal(footwearExpectedHeel('nude kitten heels'), 'low');
    assert.equal(footwearExpectedHeel('flat tan leather sandals'), 'flat');
    assert.equal(footwearExpectedHeel('white low-top sneakers'), 'flat');
    assert.equal(footwearExpectedHeel('black leather ankle boots'), null);
  });
});

describe('footwearNeedsFeetPass', () => {
  it('follows the verdict when there is one', () => {
    assert.equal(footwearNeedsFeetPass({ ok: false, reason: 'barefoot', seen: '' }, false), true);
    assert.equal(footwearNeedsFeetPass({ ok: true, reason: null, seen: '' }, true), false);
    assert.equal(
      footwearNeedsFeetPass({ ok: true, reason: 'feet-hidden', seen: '' }, true),
      false
    );
  });

  it('without a check, only where the shoes are known to go missing', () => {
    assert.equal(footwearNeedsFeetPass(null, true), true);
    assert.equal(footwearNeedsFeetPass(undefined, false), false);
  });
});

describe('footwearCheckApplies / resolveFeetPassModel', () => {
  it('real shoes in words or a picture; not barefoot or auto', () => {
    assert.equal(footwearCheckApplies({ footwear: HEELS }), true);
    assert.equal(footwearCheckApplies({ footwear: '', hasShoeImage: true }), true);
    assert.equal(footwearCheckApplies({ footwear: 'Barefoot.', hasShoeImage: true }), false);
    assert.equal(footwearCheckApplies({ footwear: '' }), false);
  });

  it('runs the pass on the try-on engine when it is Edit 2511, else on an installed 2511', () => {
    assert.equal(
      resolveFeetPassModel('qwen-image-edit-2511-lightning-4'),
      'qwen-image-edit-2511-lightning-4'
    );
    assert.equal(resolveFeetPassModel('qwen-image-edit-rapid-aio'), null);
    assert.equal(
      resolveFeetPassModel('qwen-image-2.1', id => id === 'qwen-image-edit-2511-lightning-8'),
      'qwen-image-edit-2511-lightning-8'
    );
    assert.equal(resolveFeetPassModel('qwen-image-edit-rapid-aio', () => false), null);
  });

  it('never tells the vision model which shoes to expect (it echoed them back)', () => {
    assert.doesNotMatch(FOOTWEAR_CHECK_PROMPT, /stiletto|\{SHOES\}/);
  });
});
