import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  outfitBareSeen,
  outfitCheckJudgePrompt,
  outfitCheckVerdict,
  outfitDescribePrompt,
  outfitWearerFor,
} from './outfit-check';
import { withOutfitSecondLook, type SlotQualityReport } from '../play/slot-quality';

const SLIP = 'oversized forest green slip dress';

describe('the outfit check (2026-11-11 overnight Short)', () => {
  it('misses bare skin or underwear the plan doesn’t name, whatever the judge said', () => {
    // The 8B judge said yes to three of these for a slip dress.
    for (const seen of ['naked', 'white underwear', 'cream lace underwear', 'beige underwear']) {
      assert.deepEqual(outfitCheckVerdict(SLIP, seen, 'yes'), { match: false, seen });
    }
    assert.equal(outfitBareSeen('red string bikini', 'red bikini'), null);
    assert.equal(outfitBareSeen('black lace lingerie set', 'black lingerie'), null);
    assert.equal(outfitBareSeen(SLIP, 'emerald green slip dress'), null);
  });

  it('otherwise takes the judge’s yes or no, and nothing it can’t read', () => {
    assert.deepEqual(outfitCheckVerdict(SLIP, 'emerald green slip dress', 'Yes'), {
      match: true,
      seen: 'emerald green slip dress',
    });
    assert.equal(
      outfitCheckVerdict(SLIP, 'brown patterned midi dress, brown cardigan', 'No.')?.match,
      false
    );
    assert.equal(outfitCheckVerdict(SLIP, 'emerald green slip dress', null), null);
    assert.equal(outfitCheckVerdict(SLIP, '  ', 'yes'), null);
  });

  it('asks about the lead: alone, or beside someone of the other sex — not two alike', () => {
    const prompt = 'TWO PEOPLE: she (wearing a slip dress) and her partner — a Middle Eastern man in a shirt';
    assert.equal(outfitWearerFor({ lead: 'woman', solo: true }), 'woman');
    assert.equal(outfitWearerFor({ lead: 'woman', solo: false, prompt }), 'woman');
    assert.equal(outfitWearerFor({ lead: 'woman', solo: false, prompt: 'she and her friend, a tall woman' }), null);
    assert.equal(outfitWearerFor({ lead: 'man', solo: false, prompt: 'he and a young woman' }), 'man');
    assert.equal(outfitWearerFor({ lead: 'woman', solo: false, prompt: 'two women laughing' }), null);
  });

  it('describes without the plan, and asks about him for a man', () => {
    assert.doesNotMatch(outfitDescribePrompt('woman'), /slip/);
    assert.match(outfitDescribePrompt('man'), /the man in this photo/);
    assert.match(outfitCheckJudgePrompt('navy suit', 'navy suit', 'man'), /a man wearing/);
  });

  it('keeps Auto-review’s outfit miss when the second look sees bare skin', () => {
    const report: SlotQualityReport = {
      faceIntegrity: 5,
      outfitMatch: 1,
      anatomy: 5,
      flags: ['wrong-outfit'],
      note: '',
    } as SlotQualityReport;
    const kept = withOutfitSecondLook(report, { seen: 'naked', answer: 'yes' }, SLIP);
    assert.ok(kept.flags.includes('wrong-outfit'));
    assert.equal(kept.outfitSeen, 'naked');
    // Without the plan, as before: the judge's yes clears it.
    assert.ok(!withOutfitSecondLook(report, { seen: 'naked', answer: 'yes' }).flags.includes('wrong-outfit'));
  });
});
