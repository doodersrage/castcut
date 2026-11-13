import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DaySlot } from './planner';
import { categoryLabel } from '@/lib/wardrobe/clothing-catalog-fields';
import { planTakeOutfit } from './take-plan';

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
