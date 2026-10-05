import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  photographableStoryPrompt,
  storyClauseIsImpossible,
  storyPhotographableLine,
  storySetupIsFantastical,
  storyStillPromptForSetup,
  STORY_PHOTOGRAPHABLE_RULE,
} from './story-photographable';

describe('story setup genre', () => {
  it('keeps effects for built-in Parts (creatures, talking animals, sentient objects)', () => {
    assert.equal(storySetupIsFantastical({ personaId: 'retail-vampire' }), true);
    assert.equal(storySetupIsFantastical({ personaId: 'sentient-toaster' }), true);
  });

  it('reads the genre from a custom Part, the bible, the setting and the notes', () => {
    assert.equal(
      storySetupIsFantastical({ personaId: 'custom', customPersona: 'a hedge witch in a fen' }),
      true
    );
    assert.equal(storySetupIsFantastical({ setting: 'a starship bridge on night watch' }), true);
    assert.equal(storySetupIsFantastical({ bio: { look: 'cyberpunk courier, chrome arm' } }), true);
    assert.equal(storySetupIsFantastical({ extraHints: 'high fantasy, dragons' }), true);
  });

  it('treats an ordinary setup as photographable', () => {
    const setup = {
      personaId: 'custom',
      customPersona: 'Gloovi the Cap-Weaver, a quiet hat-maker who brews tea at dawn',
      bio: { look: 'black strapless lace mini dress', personality: 'Quiet. A local legend.' },
      setting: 'a cottage kitchen at magic hour',
      extraHints: 'she does a magic trick for the barista',
    };
    assert.equal(storySetupIsFantastical(setup), false);
    assert.equal(storySetupIsFantastical({}), false);
    assert.equal(storyPhotographableLine(setup), STORY_PHOTOGRAPHABLE_RULE);
    assert.equal(storyPhotographableLine({ personaId: 'bad-ghost' }), '');
  });

  it('the writer line asks for a photograph and names the effects', () => {
    assert.match(STORY_PHOTOGRAPHABLE_RULE, /camera could take/);
    assert.match(STORY_PHOTOGRAPHABLE_RULE, /floating, hovering or levitating/);
    assert.match(STORY_PHOTOGRAPHABLE_RULE, /forming shapes or letters/);
  });
});

describe('photographable still prompt', () => {
  it('drops impossible clauses from real Story beats and keeps the action', () => {
    assert.equal(
      photographableStoryPrompt(
        'Gloovi lifts a steaming kettle high as violet cap-drones spiral around her wrist, steam curling into a question mark above her head—she tilts it toward the man stirring his cup under moonlight.'
      ),
      'Gloovi lifts a steaming kettle high—she tilts it toward the man stirring his cup under moonlight.'
    );
    assert.equal(
      photographableStoryPrompt(
        'Gloovi stands barefoot on a rain-slicked stone ledge — she lowers her cup as a stranger brushes her shoulder, roots curling beneath hands that breathe like shared breath.'
      ),
      'Gloovi stands barefoot on a rain-slicked stone ledge — she lowers her cup as a stranger brushes her shoulder.'
    );
    assert.equal(
      photographableStoryPrompt(
        'She sets the mug down. The mossy stones glow amber beneath her bare feet, mist curling where steam meets earth.'
      ),
      'She sets the mug down. Mist curling where steam meets earth.'
    );
  });

  it('turns impossible props into real ones', () => {
    assert.equal(
      photographableStoryPrompt('Mara laughs at the café counter, floating cups beside her.'),
      'Mara laughs at the café counter, cups on the table beside her.'
    );
    assert.equal(
      photographableStoryPrompt('Mara reads in the attic among levitating books and glowing roots.'),
      'Mara reads in the attic among books and roots.'
    );
  });

  it('catches the shapes, swarms, glows and magic the realism check flagged', () => {
    for (const clause of [
      'steam curls into a soft question mark',
      'smoke shaped like a heart',
      'letting it form a question mark in midair',
      'cap-drones shimmer silver',
      'drones hum lavender around their wrists',
      'tiny woven caps drifting like pollen from branch to hand',
      'roots coil around her wrists',
      'cap-drones dissolve into pollen',
      'sparks of magic dance from her fingertips',
      'the teacup levitates',
      'her eyes glow violet',
    ]) {
      assert.equal(storyClauseIsImpossible(clause), true, clause);
    }
  });

  it('leaves ordinary words alone', () => {
    for (const prompt of [
      'Lana floats on her back in the pool, arms out.',
      'She leans on the rail at magic hour, hair swirling around her shoulders in the wind.',
      'A neon sign glows pink above the bar as she laughs.',
      'Steam rises from her mug; smoke curls from the chimney.',
      'She hovers over the stove, stirring the soup.',
      'Snow drifts around her boots as she walks.',
      'He performs a magic trick for the kids at the party.',
      'Candles glow on the table while she pours the wine.',
      'A drone films the wedding from above.',
      'She makes a heart with her hands for the camera.',
      'Lana sits on the floating dock with a coffee, shelves of books behind her.',
    ]) {
      assert.equal(photographableStoryPrompt(prompt), prompt, prompt);
    }
  });

  it('never drops the opening clause, and returns the prompt when nothing is left', () => {
    assert.equal(
      photographableStoryPrompt('Glowing roots coil around her wrists as she kneels.'),
      'Roots coil around her wrists as she kneels.'
    );
    assert.equal(photographableStoryPrompt(''), '');
  });

  it('only rewrites stories that are not fantasy or sci-fi', () => {
    const prompt = 'Nib lifts a teacup as steam curls into a question mark.';
    assert.equal(storyStillPromptForSetup(prompt, { personaId: 'raccoon-pirate' }), prompt);
    assert.equal(storyStillPromptForSetup(prompt, { personaId: 'custom' }), 'Nib lifts a teacup.');
  });
});
