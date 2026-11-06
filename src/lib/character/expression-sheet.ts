/**
 * The Cast's expression sheet (Part 18 R6): the same face across six feelings — a consistency
 * reference, and a check that the face holds when it moves. Each is the Cast's plate edited on
 * Qwen-Image 2.1 Turbo (wardrobe/clothing-edit.ts imageEditGraph): the same person, head and
 * shoulders, only the expression changed. Pure; the queue is in expression-sheet-client.ts.
 */

export const CAST_EXPRESSIONS: ReadonlyArray<{ id: string; label: string; words: string }> = [
  { id: 'neutral', label: 'Neutral', words: 'a calm, neutral expression, lips relaxed' },
  { id: 'smile', label: 'Smiling', words: 'a warm, natural smile' },
  { id: 'laugh', label: 'Laughing', words: 'laughing openly, eyes crinkled' },
  { id: 'sad', label: 'Sad', words: 'a sad expression, eyes lowered, about to cry' },
  { id: 'angry', label: 'Angry', words: 'an angry expression, brows drawn together, jaw set' },
  {
    id: 'surprised',
    label: 'Surprised',
    words: 'a surprised expression, eyebrows raised, mouth open',
  },
];

/** The edit for one expression: the same person, only the face's expression changed. */
export function castExpressionPrompt(words: string): string {
  return `Edit <image1>, a photo of a person: the same person with ${words}. Keep their face, identity, age, skin, hair and clothes exactly as they are — only the expression changes. Head and shoulders, facing the camera, on a plain soft-grey background, even soft light. Photorealistic photograph.`;
}

/** The sheet's picture size: 4:5 portrait. */
export const CAST_EXPRESSION_SIZE = { width: 896, height: 1120 } as const;
