/**
 * "Sketch over this still": rough strokes drawn over a still (or a blank page) and a few words
 * become a photo — an edit on the still engine's Rapid AIO checkpoint with the sketch as Image 1
 * (relight.ts's graph without the LoRA). Re-rendered each time the player pauses drawing.
 * Client-safe: the prompt only.
 */

export function sketchPrompt(words: string, overStill: boolean): string {
  const what = words.trim() || 'what the drawing shows';
  return overStill
    ? `Image 1 is a photograph with rough coloured strokes drawn over it. Turn the strokes into real things in the photo — ${what} — following their shapes, places and colours, as part of the same photograph. Keep everything that is not drawn over exactly as it is: the people, faces, bodies, clothes, the room and the light. Photorealistic, no drawing lines left.`
    : `Turn the rough sketch in Image 1 into a realistic photograph of ${what}, following its shapes, layout and colours. Photorealistic, natural light, no drawing lines left.`;
}
