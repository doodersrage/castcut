import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  storyLeadIsMan,
  storyPromptForManLead,
  storySceneForManLead,
  storyScenesForManLead,
} from './story-lead-gender';

describe('a man as the Story lead', () => {
  it('is read from the Cast record first, then the bible', () => {
    assert.equal(storyLeadIsMan({ descriptor: 'a man in his thirties with a beard' }), true);
    assert.equal(storyLeadIsMan({ look: 'a tall man in a grey coat' }), true);
    assert.equal(storyLeadIsMan({ look: 'a woman with dark hair' }), false);
    assert.equal(storyLeadIsMan({ descriptor: 'a woman', look: 'he is tall' }), false);
    assert.equal(storyLeadIsMan({}), false);
  });

  it("rewords Story's fixed lines and leaves the written scene alone", () => {
    const prompt =
      'Edit Image 1: OUTFIT (mandatory): she wears exactly the outfit and the shoes she has on in Image 1.\n' +
      'Replace the scene with Tomas waits on the pier; he watches the ferry, his hands in his pockets.\n' +
      'One woman alone.';
    const out = storyPromptForManLead(prompt);
    assert.match(out, /he wears exactly the outfit and the shoes he has on/);
    assert.match(out, /he watches the ferry, his hands in his pockets/);
    assert.match(out, /One man alone\./);
    assert.doesNotMatch(out, /\bshe\b|woman/i);
  });

  it('rewords a built-in scene', () => {
    const scene = storySceneForManLead({
      id: 's',
      title: 'The letter',
      blurb: 'She sits on the stairs with her chin in her hands; a friend waves at her.',
    });
    assert.equal(
      scene.blurb,
      'He sits on the stairs with his chin in his hands; a friend waves at him.'
    );
    assert.equal(scene.title, 'The letter');
  });

  it('keeps the earlier beat a built-in card quotes, cut short or whole, as it was written', () => {
    const last =
      'Tomas sprints across a weathered rooftop at golden hour, tossing his lopsided hat into the air as he stretches.';
    const [card, other] = storyScenesForManLead(
      [
        {
          title: 'Next room',
          blurb: `Tomas leaves "Rooftop Run Prep" for an adjoining space, still carrying the problem: Tomas sprints across a weathered rooftop at golden hour, tossing his lopsided hat into`,
        },
        { title: 'Wardrobe change', blurb: 'Tomas changes her clothes; she keeps the trouble.' },
      ],
      [last, 'Rooftop Run Prep', 'a weekend lighthouse keeper training for his first marathon']
    );
    assert.match(card!.blurb, /tossing his lopsided hat into$/);
    assert.doesNotMatch(card!.blurb, /\bher\b/);
    assert.equal(other!.blurb, 'Tomas changes his clothes; he keeps the trouble.');
  });
});
