/**
 * The clothing editor's picture change (user request 2026-11-04): a packshot changed as the player
 * asks ("make it red", "shorter hem") on Qwen-Image 2.1 Turbo, as a finished graph — the garment
 * alone on a plain background, nothing else changed. Pure.
 */
import { locationPictureGraph } from '../location/picture';

/** The garment as it is, but for the asked change, on a plain backdrop. */
export function clothingEditPrompt(
  instruction: string,
  subject: 'clothing' | 'footwear' = 'clothing'
): string {
  const change = instruction.trim().replace(/[.\s]+$/, '');
  // The footwear editor: a pair of shoes, side by side, no foot in them.
  if (subject === 'footwear') {
    return `Edit <image1>, a product photo of a pair of shoes: ${change}. Everything else about the shoes stays exactly as it is — the same shape, heel, sole, material and details, except what is asked. Show the pair alone, side by side and whole, on a plain light-grey studio background — no feet, no legs, no person, no box. Photorealistic product photograph, even soft light.`;
  }
  return `Edit <image1>, a product photo of a piece of clothing: ${change}. Everything else about the garment stays exactly as it is — the same cut, shape, fabric and details, except what is asked. Show the garment alone, centred and whole, on a plain light-grey studio background — no person, no mannequin, no hanger. Photorealistic product photograph, even soft light.`;
}

/** A packshot's size: 4:5 portrait (the catalog's shape), long side 1280. */
export const CLOTHING_EDIT_SIZE = { width: 1024, height: 1280 } as const;

/** A pair of shoes' size: square, 1024. */
export const FOOTWEAR_EDIT_SIZE = { width: 1024, height: 1024 } as const;

/** The finished graph: Qwen-Image 2.1 Turbo editing `image` (an input-folder file). */
export function clothingEditGraph(
  image: string,
  instruction: string,
  seed: number,
  subject: 'clothing' | 'footwear' = 'clothing'
): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const graph = locationPictureGraph({ name: '', look: '', setting: 'INT' }, seed);
  graph['14'] = { class_type: 'LoadImage', inputs: { image } };
  graph['5']!.inputs = {
    ...graph['5']!.inputs,
    prompt: clothingEditPrompt(instruction, subject),
    negative_prompt: '',
    'images.image_1': ['14', 0],
  };
  // A pair of shoes sits in a square (the footwear kits' shape); clothing is 4:5.
  graph['6']!.inputs = {
    ...graph['6']!.inputs,
    ...(subject === 'footwear' ? FOOTWEAR_EDIT_SIZE : CLOTHING_EDIT_SIZE),
  };
  graph['13']!.inputs = {
    ...graph['13']!.inputs,
    filename_prefix: subject === 'footwear' ? 'Castcut/footwear-edit' : 'Castcut/clothing-edit',
  };
  return graph;
}
