import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withEatingUtensil } from './eating-utensil';

describe('eating utensil', () => {
  it('gives twirled pasta a fork (the Late evening card ate it by hand)', () => {
    assert.equal(
      withEatingUtensil('sitting at a dinner table twirling pasta, one elbow on the table'),
      'sitting at a dinner table twirling pasta on her fork, one elbow on the table'
    );
    assert.equal(
      withEatingUtensil('eating a bowl of spaghetti by the window'),
      'eating a bowl of spaghetti with a fork by the window'
    );
  });

  it('chopsticks for ramen and sushi, a spoon for soup', () => {
    assert.equal(withEatingUtensil('slurping ramen at the counter'), 'slurping ramen with chopsticks at the counter');
    assert.equal(withEatingUtensil('eating sushi at the bar'), 'eating sushi with chopsticks at the bar');
    assert.equal(withEatingUtensil('eating tomato soup on the sofa'), 'eating tomato soup with a spoon on the sofa');
    assert.equal(
      withEatingUtensil('sitting cross-legged on the bed eating noodles from the carton'),
      'sitting cross-legged on the bed eating noodles with chopsticks from the carton'
    );
  });

  it('leaves a beat that already names a utensil, finger food, and food nobody is eating', () => {
    const forked = 'twirling spaghetti on her fork, laughing';
    assert.equal(withEatingUtensil(forked), forked);
    assert.equal(withEatingUtensil('eating ramen with chopsticks'), 'eating ramen with chopsticks');
    assert.equal(withEatingUtensil('eating a slice of pizza on the stoop'), 'eating a slice of pizza on the stoop');
    assert.equal(withEatingUtensil('biting into a croissant'), 'biting into a croissant');
    const box = 'perched on a kitchen counter eating cereal straight from the box';
    assert.equal(withEatingUtensil(box), box);
    assert.equal(withEatingUtensil('stirring a pot of pasta sauce at the stove'), 'stirring a pot of pasta sauce at the stove');
    assert.equal(withEatingUtensil('carrying a cake box down the street'), 'carrying a cake box down the street');
  });
});
