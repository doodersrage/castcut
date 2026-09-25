import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  flaggedRetryPlan,
  buildSlotReviewPrompt,
  DEFAULT_SLOT_QUALITY_POLICY,
  decideSlotQuality,
  flaggedSlotIds,
  parseSlotQualityReport,
  recordSlotDecision,
  reviewOutfitLabel,
  slotQualityBadge,
  slotQualityOverall,
  slotRerollNudge,
  slotRerollsUsed,
  type SlotQualityLedger,
  type SlotQualityReport,
} from './play-slot-quality';

const CLEAN: SlotQualityReport = {
  faceIntegrity: 5,
  outfitMatch: 4,
  anatomy: 5,
  flags: [],
  note: '',
};

describe('play slot quality', () => {
  it('parses fenced JSON, clamps scores, and drops unknown flags', () => {
    const report = parseSlotQualityReport(
      'Sure!\n```json\n{"faceIntegrity":9,"outfitMatch":"4","anatomy":0,"flags":["Extra-Hands","bogus","extra-hands"],"note":" ghost hand on left "}\n```'
    );
    assert.deepEqual(report, {
      faceIntegrity: 5,
      outfitMatch: 4,
      anatomy: 1,
      flags: ['extra-hands'],
      note: 'ghost hand on left',
    });
  });

  it('defaults missing scores to neutral and rejects replies without any score', () => {
    const partial = parseSlotQualityReport('{"anatomy":5}');
    assert.equal(partial?.faceIntegrity, 3);
    assert.equal(partial?.outfitMatch, 3);
    assert.equal(parseSlotQualityReport('no json here'), null);
    assert.equal(parseSlotQualityReport('{"note":"nothing scored"}'), null);
    assert.equal(parseSlotQualityReport('{not valid json}'), null);
  });

  it('keeps a clean still', () => {
    const decision = decideSlotQuality(CLEAN, 0);
    assert.equal(decision.action, 'keep');
    assert.deepEqual(decision.reasons, []);
    assert.equal(decision.overall, slotQualityOverall(CLEAN));
    assert.equal(decision.overall, 4.7);
  });

  it('rerolls on a hard flag even when scores are high', () => {
    const decision = decideSlotQuality({ ...CLEAN, flags: ['extra-hands'] }, 0);
    assert.equal(decision.action, 'reroll');
    assert.match(decision.reasons.join(' '), /ghost or extra hands/);
  });

  it('ignores soft flags such as plastic-skin for the decision', () => {
    assert.equal(decideSlotQuality({ ...CLEAN, flags: ['plastic-skin'] }, 0).action, 'keep');
  });

  it('rerolls on a low single score or low overall', () => {
    const lowSingle = decideSlotQuality({ ...CLEAN, anatomy: 1 }, 0);
    assert.equal(lowSingle.action, 'reroll');
    assert.match(lowSingle.reasons.join(' '), /anatomy score 1\/5/);

    const lowOverall = decideSlotQuality(
      { faceIntegrity: 3, outfitMatch: 3, anatomy: 3, flags: [], note: '' },
      0
    );
    assert.equal(lowOverall.action, 'reroll');
    assert.match(lowOverall.reasons.join(' '), /overall 3\/5 below 3\.5/);
  });

  it('flags instead of rerolling once the reroll budget is spent', () => {
    const bad = { ...CLEAN, flags: ['merged-limbs' as const] };
    const max = DEFAULT_SLOT_QUALITY_POLICY.maxRerolls;
    assert.equal(decideSlotQuality(bad, max - 1).action, 'reroll');
    assert.equal(decideSlotQuality(bad, max).action, 'flag');
    assert.equal(decideSlotQuality(bad, 0, { ...DEFAULT_SLOT_QUALITY_POLICY, maxRerolls: 0 }).action, 'flag');
  });

  it('builds a review prompt that names the outfit, beat, and expected people', () => {
    const solo = buildSlotReviewPrompt({ outfit: 'red rain jacket', beat: 'waits at a bus stop' });
    assert.match(solo.user, /Expected outfit: red rain jacket/);
    assert.match(solo.user, /Beat: waits at a bus stop/);
    assert.match(solo.user, /exactly one adult/);
    assert.match(solo.system, /JSON only/);
    const duo = buildSlotReviewPrompt({ expectedPeople: 2 });
    assert.match(duo.user, /two adults/);
    assert.doesNotMatch(duo.user, /Expected outfit/);
    assert.match(duo.user, /No expected outfit given/);
    const any = buildSlotReviewPrompt({ expectedPeople: 'any' });
    assert.match(any.user, /one or more adults/);
    assert.match(any.system, /Never use extra-person/);
  });

  it('builds a reroll nudge only from flags that have one', () => {
    assert.equal(slotRerollNudge([]), '');
    assert.equal(slotRerollNudge(['text-artifact']), '');
    const nudge = slotRerollNudge(['extra-hands', 'wrong-outfit']);
    assert.match(nudge, /two hands with five fingers/);
    assert.match(nudge, /Keep outfit from Image 2/);
  });

  it('only sends an outfit the reviewer can understand', () => {
    assert.equal(reviewOutfitLabel({}), undefined);
    // Catalog not loaded yet: label === id, so send nothing rather than "kit-a1b2".
    assert.equal(reviewOutfitLabel({ wardrobeId: 'kit-a1b2', wardrobeLabel: 'kit-a1b2' }), undefined);
    assert.equal(reviewOutfitLabel({ wardrobeId: 'kit-a1b2', wardrobeLabel: '' }), undefined);
    assert.equal(
      reviewOutfitLabel({ wardrobeId: 'kit-a1b2', wardrobeLabel: 'Red rain jacket' }),
      'Red rain jacket'
    );
    // A BYO clothing description always wins over the kit label.
    assert.equal(
      reviewOutfitLabel({
        customDescription: ' denim jumpsuit ',
        wardrobeId: 'kit-a1b2',
        wardrobeLabel: 'Red rain jacket',
      }),
      'denim jumpsuit'
    );
  });

  it('scores identity only when a reference panel was supplied', () => {
    const withIdentity = parseSlotQualityReport(
      '{"faceIntegrity":4,"outfitMatch":4,"anatomy":4,"identityMatch":2,"flags":[]}'
    );
    assert.equal(withIdentity?.identityMatch, 2);
    const without = parseSlotQualityReport('{"faceIntegrity":4,"outfitMatch":4,"anatomy":4}');
    assert.equal(without?.identityMatch, undefined);
    assert.equal(
      parseSlotQualityReport('{"faceIntegrity":4,"identityMatch":null}')?.identityMatch,
      undefined
    );
  });

  it('warns about a face mismatch but never rerolls for it', () => {
    const mismatch = decideSlotQuality({ ...CLEAN, flags: ['wrong-face'] }, 0);
    assert.equal(mismatch.action, 'keep');
    assert.deepEqual(mismatch.reasons, []);
    assert.deepEqual(mismatch.warnings, ['face may not match the Cast']);

    const lowScore = decideSlotQuality({ ...CLEAN, identityMatch: 2 }, 0);
    assert.equal(lowScore.action, 'keep');
    assert.deepEqual(lowScore.warnings, ['face match 2/5']);

    // At or above the threshold there is nothing to say.
    assert.deepEqual(decideSlotQuality({ ...CLEAN, identityMatch: 3 }, 0).warnings, []);
    // The flag wins over the score so the same finding is not reported twice.
    assert.deepEqual(
      decideSlotQuality({ ...CLEAN, identityMatch: 1, flags: ['wrong-face'] }, 0).warnings,
      ['face may not match the Cast']
    );
  });

  it('warns about plastic skin alongside a real reroll reason', () => {
    const decision = decideSlotQuality(
      { ...CLEAN, anatomy: 1, flags: ['plastic-skin', 'wrong-face'] },
      0
    );
    assert.equal(decision.action, 'reroll');
    assert.match(decision.reasons.join(' '), /anatomy score 1\/5/);
    assert.deepEqual(decision.warnings, [
      'face may not match the Cast',
      'plastic-looking skin — try Skin refine',
    ]);
  });

  it('frames the prompt as a pair when a reference panel is attached', () => {
    const pair = buildSlotReviewPrompt({ referencePair: true, beat: 'waits at a bus stop' });
    assert.match(pair.system, /TWO PANELS/);
    assert.match(pair.system, /identityMatch/);
    assert.match(pair.user, /Review the right-hand still/);
    assert.match(pair.user, /left panel is only the identity reference/);

    const single = buildSlotReviewPrompt({});
    assert.doesNotMatch(single.system, /TWO PANELS/);
    assert.match(single.system, /Never use wrong-face/);
    assert.match(single.user, /Review this still/);
  });

  it('builds a board badge from the latest decision', () => {
    assert.equal(slotQualityBadge({}, 'morning'), null);
    assert.equal(slotQualityBadge({ morning: { rerolls: 0 } }, 'morning'), null);
    assert.deepEqual(
      slotQualityBadge(
        { morning: { rerolls: 2, lastDecision: 'flag', lastReasons: ['ghost or extra hands'] } },
        'morning'
      ),
      { tone: 'warn', label: 'Check this still', detail: 'ghost or extra hands' }
    );
    assert.equal(
      slotQualityBadge({ m: { rerolls: 1, lastDecision: 'reroll', lastReasons: [] } }, 'm')?.label,
      'Requeueing…'
    );
    assert.deepEqual(slotQualityBadge({ m: { rerolls: 1, lastDecision: 'keep' } }, 'm'), {
      tone: 'muted',
      label: 'Passed after 1 reroll',
      detail: '',
    });
    assert.equal(
      slotQualityBadge({ m: { rerolls: 3, lastDecision: 'keep' } }, 'm')?.label,
      'Passed after 3 rerolls'
    );
    // A soft warning surfaces even when the still passed on its first try.
    assert.deepEqual(
      slotQualityBadge(
        { m: { rerolls: 0, lastDecision: 'keep', lastWarnings: ['face match 2/5'] } },
        'm'
      ),
      { tone: 'muted', label: 'Passed · worth a look', detail: 'face match 2/5' }
    );
    // A clean first-try pass shows nothing.
    assert.equal(slotQualityBadge({ m: { rerolls: 0, lastDecision: 'keep' } }, 'm'), null);
  });

  it('tracks rerolls and flagged slots in an immutable ledger', () => {
    const empty: SlotQualityLedger = {};
    const rerolled = recordSlotDecision(empty, 'morning', {
      action: 'reroll',
      reasons: ['distorted face'],
      warnings: [],
      overall: 2.7,
    });
    assert.deepEqual(empty, {});
    assert.equal(slotRerollsUsed(rerolled, 'morning'), 1);
    assert.equal(slotRerollsUsed(rerolled, 'night'), 0);

    const flagged = recordSlotDecision(rerolled, 'morning', {
      action: 'flag',
      reasons: ['distorted face'],
      warnings: [],
      overall: 2.7,
    });
    assert.equal(slotRerollsUsed(flagged, 'morning'), 1);
    assert.deepEqual(flaggedSlotIds(flagged), ['morning']);

    const kept = recordSlotDecision(flagged, 'morning', { action: 'keep', reasons: [], warnings: [], overall: 4.5 });
    assert.deepEqual(flaggedSlotIds(kept), []);
  });
});

describe('flaggedRetryPlan', () => {
  it('retries flagged stills and warned clips in board order, once per slot', () => {
    assert.deepEqual(
      flaggedRetryPlan({
        flaggedStillSlotIds: ['night', 'morning'],
        clipChecks: {
          morning: { status: 'warn' },
          evening: { status: 'warn' },
          afternoon: { status: 'ok' },
        },
        slotOrder: ['morning', 'afternoon', 'evening', 'night'],
      }),
      { stills: ['morning', 'night'], clips: ['evening'] }
    );
  });

  it('is empty when nothing is flagged', () => {
    assert.deepEqual(
      flaggedRetryPlan({ flaggedStillSlotIds: [], clipChecks: {}, slotOrder: ['morning'] }),
      { stills: [], clips: [] }
    );
  });
});
