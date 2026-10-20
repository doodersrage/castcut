/**
 * A look's reference sheet (2026-10-14): the plate turned to the side and the back, three-quarter,
 * and a few expressions — each one short Edit 2511 pass on the plate (as Prepare plate is), kept
 * on the look and printable as a character card. A back view made this way held the outfit and
 * the person 4 of 4 (outfit-shoes-pose, 2026-10-03); a back view asked of a scene prompt did not.
 *
 * The views are for the player (and the card). Feeding them to Day's graphs as extra references
 * is not done: the face lock already uses the plate, and an untested extra image costs the
 * clothing image its slot.
 */

import {
  getCharacter,
  looksOf,
  upsertCharacter,
  type CharacterLook,
  type CharacterRecord,
  type ReferenceSheetView,
  type ReferenceSheetViewId,
} from './character-os';
import type { DayPartnerNoun } from './day/partner';

export type { ReferenceSheetView, ReferenceSheetViewId };

export const REFERENCE_SHEET_VIEWS: Array<{
  id: ReferenceSheetViewId;
  label: string;
  /** Full body (the plate's canvas) or a head-and-shoulders crop (square). */
  frame: 'body' | 'head';
}> = [
  { id: 'three-quarter', label: 'Three-quarter', frame: 'body' },
  { id: 'side', label: 'Side', frame: 'body' },
  { id: 'back', label: 'Back', frame: 'body' },
  { id: 'smile', label: 'Smiling', frame: 'head' },
  { id: 'laugh', label: 'Laughing', frame: 'head' },
  { id: 'serious', label: 'Serious', frame: 'head' },
  { id: 'surprised', label: 'Surprised', frame: 'head' },
];

/** Short on purpose: distilled edit stacks drift on long briefs (cast-plate-prepare.ts). */
export function referenceSheetPrompt(
  id: ReferenceSheetViewId,
  noun: DayPartnerNoun = 'woman'
): string {
  const her = noun === 'man' ? 'his' : noun === 'woman' ? 'her' : 'their';
  const keepBody = `Keep ${her} face, hair, skin tone, body shape, clothes and shoes exactly. Plain light grey background. One person. Photoreal.`;
  const keepHead = `Keep ${her} face, hair, skin tone and clothes exactly. Plain light grey background. One person. Photoreal.`;
  switch (id) {
    case 'three-quarter':
      return `Edit Image 1: the same person standing, turned three-quarters to the left, full body head to feet in frame. ${keepBody}`;
    case 'side':
      return `Edit Image 1: the same person standing in a full side profile facing left, full body head to feet in frame. ${keepBody}`;
    case 'back':
      return `Edit Image 1: the same person standing seen from directly behind — ${her} back to the camera, full body head to feet in frame. ${keepBody}`;
    case 'smile':
      return `Edit Image 1: a head-and-shoulders close-up of the same person facing the camera, smiling warmly. ${keepHead}`;
    case 'laugh':
      return `Edit Image 1: a head-and-shoulders close-up of the same person facing the camera, laughing openly. ${keepHead}`;
    case 'serious':
      return `Edit Image 1: a head-and-shoulders close-up of the same person facing the camera, a calm serious expression. ${keepHead}`;
    case 'surprised':
      return `Edit Image 1: a head-and-shoulders close-up of the same person facing the camera, eyebrows raised in surprise. ${keepHead}`;
  }
}

export const REFERENCE_SHEET_NEGATIVE =
  'different person, different face, changed hairstyle, changed clothes, extra people, text, logo, blurry, cropped feet';

export function normalizeReferenceSheet(raw: unknown): ReferenceSheetView[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = new Set(REFERENCE_SHEET_VIEWS.map(view => view.id));
  const list = raw.filter(
    (item): item is ReferenceSheetView =>
      Boolean(item) && ids.has(item.id) && typeof item.url === 'string' && item.url.trim() !== ''
  );
  return list.length ? list : undefined;
}

/** Keep one view on a look (a re-render of the same view replaces it). */
export function saveReferenceSheetView(
  characterId: string,
  lookId: string,
  view: ReferenceSheetView
): CharacterRecord | undefined {
  const character = getCharacter(characterId);
  if (!character) return undefined;
  const looks = looksOf(character);
  const target = looks.find(look => look.id === lookId);
  if (!target) return character;
  const sheet = [
    ...(normalizeReferenceSheet(target.referenceSheet) ?? []).filter(item => item.id !== view.id),
    view,
  ];
  const next: CharacterLook = { ...target, referenceSheet: sheet };
  upsertCharacter({
    ...character,
    looks: looks.map(look => (look.id === target.id ? next : look)),
    updatedAt: Date.now(),
  });
  return getCharacter(characterId);
}

/** The plain text a printed character card carries (name, look, marks, props, lines). */
export function characterCardFacts(character: CharacterRecord, look: CharacterLook): string[] {
  const facts: string[] = [];
  const descriptor = (look.descriptor || character.descriptor || '').trim();
  if (descriptor) facts.push(descriptor);
  const marks = (character.marks ?? []).map(mark => `${mark.what} (${mark.where})`);
  if (marks.length) facts.push(`Marks: ${marks.join('; ')}`);
  const props = (character.props ?? []).map(prop => `${prop.name}: ${prop.looks}`);
  if (props.length) facts.push(`Props: ${props.join('; ')}`);
  const lines = character.speech?.catchphrases ?? [];
  if (lines.length) facts.push(`Says: ${lines.map(line => `“${line}”`).join(' ')}`);
  return facts;
}
