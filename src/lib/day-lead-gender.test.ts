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
