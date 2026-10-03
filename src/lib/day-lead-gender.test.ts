import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { restoreText, swapDayPromptGender } from './day-lead-gender';

describe('Day man lead', () => {
  it('swaps both people in one pass', () => {
    assert.equal(
      swapDayPromptGender(
        'She wears a slip dress; slow dancing with her partner, her arms around his neck, kissing her.'
      ),
      'He wears a slip dress; slow dancing with his partner, his arms around her neck, kissing him.'
    );
    assert.equal(
      swapDayPromptGender('Keep her face from the first image; the man has his own face.'),
      'Keep his face from the first image; the woman has her own face.'
    );
    assert.equal(
      swapDayPromptGender('hugging her boyfriend goodnight'),
      'hugging his girlfriend goodnight'
    );
  });

  it('leaves unrelated words alone', () => {
    const text = 'Theme: the human mannequin — they held hands. HEADCOUNT: one.';
    assert.equal(swapDayPromptGender(text), text);
  });

  it('solo stills swap the anatomy too', () => {
    assert.equal(
      swapDayPromptGender('bare breasts with nipples visible and bare vulva; no bra', {
        solo: true,
      }),
      'bare chest and penis; no undershirt'
    );
  });

  it('keeps the lead description as written', () => {
    const descriptor = 'a Nordic man in his late thirties with a soft double chin';
    const prompt = `look: ${descriptor}; she wears a suit`;
    assert.equal(
      restoreText(swapDayPromptGender(prompt), descriptor),
      `look: ${descriptor}; he wears a suit`
    );
  });
});

describe('Day man lead clothing', () => {
  it('turns a woman lead’s clothes into his, leaving "dressed up" alone', async () => {
    const { masculineClothes } = await import('./day-lead-gender');
    assert.equal(
      masculineClothes('up on her toes in a short dress, both dressed up'),
      'up on her toes in a shirt and trousers, both dressed up'
    );
    assert.equal(masculineClothes('in lingerie and heels'), 'in boxer briefs and shoes');
  });
});

describe('a beat typed for a man lead', () => {
  it('is read by its first pronoun', async () => {
    const { writtenAboutHim, inDayPromptVoice, swapDayPromptGender } = await import(
      './day-lead-gender'
    );
    assert.equal(writtenAboutHim('he fixes his bike in the garage'), true);
    assert.equal(writtenAboutHim('dancing with her boyfriend, his hand on her waist'), false);
    assert.equal(writtenAboutHim('reading on a bench'), false);
    const typed = 'he fixes his bike, grease on his hands';
    // Put in the prompt's voice, then flipped for the man at the end: back as typed.
    assert.equal(swapDayPromptGender(inDayPromptVoice(typed, 'man')!), typed);
    assert.equal(inDayPromptVoice(typed, 'woman'), typed);
    const builtIn = 'lying on her side on the sofa, reading';
    assert.equal(inDayPromptVoice(builtIn, 'man'), builtIn);
  });
});

describe('a man lead alone', () => {
  it('rests a hand on his chest, not "his breast"', () => {
    assert.equal(
      swapDayPromptGender('the other hand rests on her breast.', { solo: true }),
      'the other hand rests on his chest.'
    );
  });
});
