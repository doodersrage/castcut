/**
 * A clip's camera move, picked by sight (2026-11-05): Day's clips hold a locked-off camera by
 * default (the LLM writer once invented an orbit or a dolly on every clip, still/clip-prompt.ts),
 * so a move is only ever the player's choice — its sentence takes the locked camera's place.
 * The picker shows each move on the slot's own still (CameraMovePicker).
 */

export const CLIP_CAMERA_MOVES = [
  { id: 'still', label: 'Still', words: '' },
  {
    id: 'push-in',
    label: 'Push in',
    // Not "push-in" or "zoom": H3 turns a camera sentence with those into a tripod (h3CameraWords).
    // Live (LTX-2.5, 2026-11-05): "forward for the whole clip" ended on a cropped close-up.
    words:
      'Camera: moves slowly forward, ending only a little closer — a medium shot, their head and shoulders fully in frame with room above, no cut.',
  },
  {
    id: 'pull-out',
    label: 'Pull out',
    words:
      'Camera: one slow, smooth pull-back away from them, revealing more of the place, no cut.',
  },
  {
    id: 'pan-left',
    label: 'Pan left',
    // Live: a pan "across the scene" panned off her and she walked out of frame.
    words:
      'Camera: pans slowly to the left, following them so they stay in the frame while the background slides past, no cut.',
  },
  {
    id: 'pan-right',
    label: 'Pan right',
    words:
      'Camera: pans slowly to the right, following them so they stay in the frame while the background slides past, no cut.',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    // Live: "an arc around them" came out as the same move forward as Push in.
    words:
      'Camera: circles slowly sideways around them at the same distance, so the background behind them swings past and they are seen from a new angle, staying in the centre of the frame, no cut.',
  },
  {
    id: 'crane-up',
    label: 'Rise',
    words: 'Camera: rises slowly and smoothly, tilting down to keep them in view, no cut.',
  },
  {
    id: 'handheld',
    label: 'Handheld',
    words: 'Camera: handheld, a gentle natural sway as if held by someone standing close, no cut.',
  },
] as const;

export type ClipCameraMove = (typeof CLIP_CAMERA_MOVES)[number]['id'];

export function normalizeClipCameraMove(value: unknown): ClipCameraMove {
  return CLIP_CAMERA_MOVES.some(move => move.id === value) ? (value as ClipCameraMove) : 'still';
}

/** The locked-camera sentence the clip templates write (still/clip-prompt, intimate-clip-prompt). */
const LOCKED = /Camera: locked-off[^.]*\.(?:\s*[^.]*framing stays as the first frame\.)?/;

/** The prompt with its camera move: the locked-camera sentence swapped for the move's, or added. */
export function withCameraMove(prompt: string, move: unknown): string {
  const picked = CLIP_CAMERA_MOVES.find(entry => entry.id === normalizeClipCameraMove(move));
  if (!picked?.words) return prompt;
  return LOCKED.test(prompt)
    ? prompt.replace(LOCKED, picked.words)
    : `${prompt.trim()} ${picked.words}`;
}
