import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyDayTemplate, normalizeDayTemplates, templateFromDay } from './day-templates';

describe('Day templates', () => {
  const slots = [
    { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee', wardrobeId: 'kit-1', lighting: 'window' },
    { id: 'evening', label: 'Evening', location: 'bar', sceneHints: 'meets a friend', line: 'Hi!' },
  ];

  it('keeps the plan, never the outfit', () => {
    const template = templateFromDay({ name: ' Coffee day ', slots: slots as never, dayMood: 'everyday', id: 't', now: 1 });
    assert.equal(template.name, 'Coffee day');
    assert.deepEqual(template.slots[0], { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee', lighting: 'window' });
    assert.equal(template.dayMood, 'everyday');
  });

  it('puts the plan on the day’s slots, keeping each slot’s own outfit', () => {
    const template = templateFromDay({ name: 'x', slots: slots as never, id: 't' });
    const today = [
      { id: 'morning', label: 'Morning', location: 'office', sceneHints: 'types', wardrobeId: 'kit-9' },
      { id: 'afternoon', label: 'Afternoon', location: 'park' },
    ];
    const next = applyDayTemplate(today as never, template);
    assert.deepEqual(next.map(slot => slot.id), ['morning', 'evening']);
    assert.equal(next[0]!.location, 'kitchen');
    assert.equal(next[0]!.wardrobeId, 'kit-9');
    assert.equal(next[1]!.line, 'Hi!');
    assert.equal(normalizeDayTemplates([{ id: 'a', name: 'b', slots: [] }, 'junk']).length, 0);
  });
});
