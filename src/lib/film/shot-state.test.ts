import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shotStateSummary, slotShotState, storyShotState, type ShotStateResolve } from './shot-state';

const names: Record<string, string> = { nora: 'Nora', tomas: 'Tomas', ines: 'Ines' };
const resolve: ShotStateResolve = {
  castName: id => (id ? names[id] : undefined),
  lookName: (id, lookId) => (id ? (lookId === 'beach' ? 'Beach look' : 'Main look') : undefined),
  kitLabel: id => ({ 'kit-linen': 'Linen sundress' })[id] ?? id,
  activeLookId: id => (id ? 'main' : undefined),
  props: id =>
    id === 'nora'
      ? [
          { id: 'p1', name: 'phone', looks: 'rose-gold' },
          { id: 'p2', name: 'dog', looks: 'a golden retriever' },
        ]
      : undefined,
};

describe('per-shot state (M2 C3)', () => {
  it("reads a Day slot's shot: who, look, outfit, place, time, props, line", () => {
    const state = slotShotState(
      {
        slot: {
          id: 'morning-2',
          label: 'Late morning',
          location: 'kitchen',
          sceneHints: 'scrolling her phone while the dog waits',
          lookId: 'beach',
          thirdCastId: 'ines',
          line: 'Coffee first.',
        },
        castId: 'nora',
        partnerCharacterId: 'tomas',
        outfit: { wardrobeId: 'kit-linen', footwear: 'white sneakers' },
      },
      resolve
    );
    assert.deepEqual(state, {
      castId: 'nora',
      castName: 'Nora',
      others: ['Tomas', 'Ines'],
      look: 'Beach look',
      lookId: 'beach',
      changeStated: true,
      outfit: 'Linen sundress',
      shoes: 'white sneakers',
      place: 'kitchen',
      time: 'morning',
      props: ['phone', 'dog'],
      line: 'Coffee first.',
    });
    assert.equal(
      shotStateSummary(state),
      'Nora with Tomas and Ines · Beach look · Linen sundress · white sneakers · kitchen · Morning · phone, dog'
    );
  });

  it("a slot's own kit wins over the Day's; a clothing photo says so", () => {
    const own = slotShotState(
      { slot: { id: 'evening', label: 'Evening', wardrobeId: 'kit-red' }, castId: 'nora', outfit: { wardrobeId: 'kit-linen' } },
      resolve
    );
    assert.equal(own.outfit, 'kit-red');
    const photo = slotShotState(
      { slot: { id: 'night', label: 'Night', wardrobeId: 'custom-garment' }, castId: 'nora', outfit: { customGarmentImageUrl: '/g.png' } },
      resolve
    );
    assert.equal(photo.outfit, 'Own clothing photo');
    const described = slotShotState(
      { slot: { id: 'night', label: 'Night' }, castId: 'nora', outfit: { customGarmentImageUrl: '/g.png', customGarmentDescription: 'a green wrap dress' } },
      resolve
    );
    assert.equal(described.outfit, 'a green wrap dress');
  });

  it("reads a Story beat's shot from the story (no place or time on a beat)", () => {
    const state = storyShotState(
      { castId: undefined, title: 'The walk', blurb: 'She takes the dog out.', line: 'Come on!' },
      { castId: 'nora', outfit: { wardrobeId: 'kit-linen' } },
      resolve
    );
    assert.deepEqual(state, {
      castId: 'nora',
      castName: 'Nora',
      others: [],
      look: 'Main look',
      lookId: 'main',
      outfit: 'Linen sundress',
      props: ['dog'],
      line: 'Come on!',
    });
    assert.equal(shotStateSummary(state), 'Nora · Main look · Linen sundress · dog');
  });
});
