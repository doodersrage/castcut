import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DaySlot } from './planner';
import { categoryLabel } from '@/lib/wardrobe/clothing-catalog-fields';
import {
  planTakeModel,
  planTakeOutfit,
  planTakePartner,
  planTakePoseGuide,
  takeModelNeedsInventory,
} from './take-plan';

const outfits = categoryLabel('outfit');
const catalog = [
  { value: '', label: 'Default kit…' },
  { value: 'kit-romper', label: 'Black romper', group: outfits },
  { value: 'kit-jeans', label: 'Jeans and tee', group: outfits },
];
const slot = (extra: Partial<DaySlot> = {}): DaySlot =>
  ({ id: 'evening', label: 'Evening', location: 'kitchen', ...extra }) as DaySlot;
const base = {
  catalog,
  lookHasPlate: true,
  customGarment: false,
  dayMood: 'everyday',
  workingSlots: [slot()],
  latestSlots: [slot()],
  salt: 'cast-1',
  hasPackshot: () => true,
};

describe('a take’s plan: its outfit (Phase 3, step 4)', () => {
  it('picks a kit when nothing dresses her, and says so for the caller to save', () => {
    const plan = planTakeOutfit({ ...base, target: slot() });
    assert.ok(plan.picked);
    assert.equal(plan.wardrobeId, plan.picked);
    assert.deepEqual([plan.target.wardrobeId, plan.target.wardrobeAuto], [plan.picked, true]);
    // The same slot and salt: the same kit.
    assert.equal(planTakeOutfit({ ...base, target: slot() }).picked, plan.picked);
  });

  it('keeps what the player chose, or the locked kit, and picks nothing', () => {
    const chosen = planTakeOutfit({ ...base, target: slot({ wardrobeId: 'kit-jeans' }) });
    assert.deepEqual([chosen.wardrobeId, chosen.picked], ['kit-jeans', undefined]);
    const locked = planTakeOutfit({ ...base, target: slot(), lockedWardrobeId: 'kit-romper' });
    assert.deepEqual([locked.wardrobeId, locked.picked], ['kit-romper', undefined]);
  });

  it('clears a kit another lead left (not in this lead’s catalog)', () => {
    const plan = planTakeOutfit({ ...base, target: slot({ wardrobeId: 'kit-tuxedo' }) });
    assert.notEqual(plan.wardrobeId, 'kit-tuxedo');
    // Before the catalog loads nothing is judged another lead's.
    const early = planTakeOutfit({ ...base, catalog: [{ value: '', label: '' }], target: slot({ wardrobeId: 'kit-tuxedo' }) });
    assert.equal(early.wardrobeId, 'kit-tuxedo');
  });

  it('picks nothing when she is dressed another way, or the mood wants no kit', () => {
    for (const extra of [
      { plateSource: 'keeper' },
      { customGarment: true },
      { lookHasPlate: false },
      { dayMood: 'suggestive' },
    ]) {
      const plan = planTakeOutfit({ ...base, ...extra, target: slot() });
      assert.equal(plan.picked, undefined, JSON.stringify(extra));
      assert.equal(plan.wardrobeId, undefined);
    }
  });

  it('a script’s Scene wears what its script’s other Scenes wear at this time of day', () => {
    const scenes = [
      { id: 'a', createdAt: 1, fromScript: { scriptId: 's', sceneId: 'int-kitchen' }, slot: { id: 'evening', wardrobeId: 'kit-jeans' } },
      { id: 'b', createdAt: 2, fromScript: { scriptId: 's', sceneId: 'int-kitchen' }, slot: { id: 'evening' } },
    ];
    const plan = planTakeOutfit({ ...base, target: slot(), scene: { scenes, activeSceneId: 'b' } });
    assert.equal(plan.picked, 'kit-jeans');
  });
});

describe('a take’s plan: its engine (Phase 3, step 4)', () => {
  const input = {
    slot: slot({ sceneHints: 'stirring a pot at the stove' }),
    pickedModel: 'qwen-image-edit-2511' as const,
    dayMood: 'everyday',
    intimateEnabled: false,
    intimateMix: undefined,
    allowCompanions: false,
    bestEnginePerPose: false,
    hasPlate: true,
    inventory: null,
    weakLayouts: () => {
      throw new Error('read only with best engine per pose');
    },
    poseReport: () => {
      throw new Error('read only with best engine per pose');
    },
  };

  it('a plain still renders on the short’s engine, the play-metrics never read', () => {
    const plan = planTakeModel(input);
    assert.equal(plan.stillModel, 'qwen-image-edit-2511');
    assert.equal(plan.omitGarment, false);
    assert.equal(plan.poseEngineSwap, null);
    assert.equal(plan.pinNote, undefined);
  });

  it('a card’s own engine that isn’t installed stays on the short’s, and says so', () => {
    const plan = planTakeModel({ ...input, slot: slot({ engine: 'rapid-aio' } as Partial<DaySlot>) });
    assert.equal(plan.stillModel, 'qwen-image-edit-2511');
    assert.ok(plan.pinNote);
    assert.equal(takeModelNeedsInventory({ ...input, slot: slot({ engine: 'rapid-aio' } as Partial<DaySlot>) }), true);
  });

  it('asks ComfyUI what is installed only when something could hand the still off', () => {
    assert.equal(takeModelNeedsInventory({ ...input, pickedModel: 'qwen-image-edit-2511' }), Boolean(
      // Edit 2511 has its adult hand-off (pose-model-profile).
      true
    ));
    assert.equal(takeModelNeedsInventory({ ...input, pickedModel: 'sdxl' as never, hasPlate: false }), false);
  });
});

describe('a take’s plan: its partner (Phase 3, step 4)', () => {
  const lead = { id: 'mara', name: 'Mara', relationships: [{ castId: 'tom', kind: 'sibling' }] } as never;
  const people: Record<string, unknown> = {
    theo: { id: 'theo', name: 'Theo', descriptor: 'a man in his thirties', traits: { sex: 'man' } },
    tom: { id: 'tom', name: 'Tom', descriptor: 'a man in his thirties', traits: { sex: 'man' } },
  };
  const input = {
    slot: slot({ sceneHints: 'Mara and Theo, the two of them together, cooking at the stove' }),
    partnerCharacterId: 'theo',
    scriptShot: false,
    leadNoun: 'woman' as const,
    lead,
    getCharacter: (id: string) => people[id] as never,
    lookHasPlate: true,
    dayMood: 'everyday',
    intimateEnabled: false,
    intimateMix: undefined,
    allowCompanions: true,
    stillModel: 'qwen-image-edit-2511',
  };

  it('a Cast partner in a two-person still: their face to load and check', () => {
    const plan = planTakePartner(input);
    assert.equal(plan.kind, 'cast');
    assert.equal(plan.kind === 'cast' && plan.character.id, 'theo');
    assert.equal(plan.partnerCharacter?.id, 'theo');
  });

  it('nobody without a plate, or in a one-person still', () => {
    assert.equal(planTakePartner({ ...input, lookHasPlate: false }).kind, 'none');
    assert.equal(
      planTakePartner({ ...input, slot: slot({ sceneHints: 'reading alone by the window' }) }).kind,
      'none'
    );
  });

  it('an invented partner: a stand-in face, kept per film', () => {
    const plan = planTakePartner({ ...input, partnerCharacterId: 'new:man', filmScriptId: 'script-1' });
    assert.equal(plan.kind, 'stand-in');
    if (plan.kind !== 'stand-in') return;
    assert.equal(plan.candidate.noun, 'man');
    assert.equal(plan.filmKey, 'script-1');
    assert.equal(plan.stranger, null);
  });

  it('a stranger the script’s shot names gets a face of their own, never the partner’s', () => {
    const plan = planTakePartner({
      ...input,
      scriptShot: true,
      filmScriptId: 'script-1',
      slot: slot({ sceneHints: 'Mara and Elderly man, the two of them together. He hands her a book.' }),
    });
    assert.equal(plan.kind, 'stand-in');
    if (plan.kind !== 'stand-in') return;
    assert.deepEqual([plan.candidate.noun, plan.stranger?.elderly, plan.filmKey], ['man', true, 'script-1|elderly man']);
  });

  it('family never plays the partner in a romantic mood — left out, and said', () => {
    const plan = planTakePartner({
      ...input,
      partnerCharacterId: 'tom',
      dayMood: 'suggestive',
      slot: slot({ sceneHints: 'Mara and Tom, the two of them together, dancing close' }),
    });
    assert.equal(plan.kind, 'none');
    assert.match(String(plan.kind === 'none' && plan.note), /Tom is family/);
  });
});

describe('a take’s plan: its drawn pose guide (Phase 3, step 4)', () => {
  const input = {
    slot: slot({ sceneHints: 'stirring a pot at the stove' }),
    stillModel: 'qwen-image-edit-2511',
    dayMood: 'everyday',
    intimateEnabled: false,
    intimateMix: undefined,
    allowCompanions: true,
    skippedForIdentity: false,
    wordsOnlyRedo: false,
    partnerNoun: null,
    leadNoun: 'woman' as const,
  };

  it('a plain still sends its guide', () => {
    assert.deepEqual(planTakePoseGuide(input), { skip: false, kleinSpoonRecipe: false });
  });

  it('a words-only redo and the Lightning identity path go without one, and say why', () => {
    assert.match(String(planTakePoseGuide({ ...input, wordsOnlyRedo: true }).skipReason), /pose from text/);
    assert.equal(
      planTakePoseGuide({ ...input, skippedForIdentity: true }).skipReason,
      'Lightning identity path keeps Image 1 whole (stance from text)'
    );
  });

  it('a walk in step on Edit 2511 goes without the standing drawing', () => {
    const plan = planTakePoseGuide({
      ...input,
      partnerNoun: 'man',
      slot: slot({ sceneHints: 'Mara and Theo walking hand in hand along the river' }),
    });
    assert.equal(plan.skip, true);
    assert.match(String(plan.skipReason), /walk in step/);
  });
});
