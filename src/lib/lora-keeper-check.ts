/**
 * Before training a Cast LoRA from a look's keepers (character-lora-flywheel.ts): are there
 * enough, are they varied, do they look like the Cast (2026-10-14)? A set of near-identical
 * stills teaches the LoRA one pose and one room — and LoRAs recompose shots already (lora-check,
 * "Check on Cast" findings), so a narrow set makes that worse. Pure.
 */

export type KeeperCheckEntry = {
  prompt?: string;
  model?: string;
  playChecks?: { face?: number };
};

export type KeeperCheck = {
  count: number;
  /** Distinct places among the keepers (the prompt's Setting / SCENE). */
  places: number;
  /** Median face match of the measured keepers, null when none is measured. */
  face: number | null;
  measured: number;
  problems: string[];
  ok: boolean;
};

/** Trainers want 15–30 pictures of a person; under 10 a LoRA mostly memorises. */
export const KEEPER_MIN = 10;
export const KEEPER_GOOD = 15;
const FACE_MIN = 0.55;

function placeOf(prompt: string | undefined): string {
  const text = prompt ?? '';
  const scene =
    /SCENE:\s*([^\n.]*)/.exec(text)?.[1] ||
    /SETTING:\s*([^\n.]*)/.exec(text)?.[1] ||
    /\bin (?:the |a |an |her )?([a-z][a-z -]{3,40}?)(?:[,.;]| with | at )/i.exec(text)?.[1] ||
    '';
  return scene
    .toLowerCase()
    .replace(/\b(?:she is|in|the|a|an|her)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function checkLoraKeepers(keepers: ReadonlyArray<KeeperCheckEntry>): KeeperCheck {
  const count = keepers.length;
  const places = new Set(keepers.map(entry => placeOf(entry.prompt)).filter(Boolean)).size;
  const faces = keepers
    .map(entry => entry.playChecks?.face)
    .filter((value): value is number => typeof value === 'number');
  const face = faces.length ? median(faces) : null;
  const problems: string[] = [];
  if (count < KEEPER_MIN) {
    problems.push(
      `${count} keeper${count === 1 ? '' : 's'} — keep at least ${KEEPER_MIN} (${KEEPER_GOOD}+ is better).`
    );
  }
  if (count >= 4 && places > 0 && places < Math.min(4, Math.ceil(count / 3))) {
    problems.push(
      `Only ${places} place${places === 1 ? '' : 's'} among them — the LoRA would learn the room too. Keep stills from more places.`
    );
  }
  if (face !== null && face < FACE_MIN) {
    problems.push(
      `The keepers look like the Cast only ${Math.round(face * 100)}% (median) — drop the weakest before training.`
    );
  }
  return { count, places, face, measured: faces.length, problems, ok: problems.length === 0 };
}
