/**
 * Who a Cast is to the other Cast (2026-10-14): partner, sibling, best friend, rival… Day's
 * partner was only a second face, so every pair read as a couple — a sister in an Everyday duo
 * leaned in like a date. The relation is said on two-person stills, and family never plays a
 * partner in the romantic or adult moods (dayPartnerApplies).
 *
 * Kept on both Casts: setting one side sets the other (parent ↔ child, the rest mirror).
 */

import {
  getCharacter,
  upsertCharacter,
  type CastRelationKind,
  type CastRelationship,
  type CharacterRecord,
} from './character-os';

export const CAST_RELATION_KINDS: ReadonlyArray<{
  id: CastRelationKind;
  label: string;
  romantic: boolean;
  family: boolean;
}> = [
  { id: 'partner', label: 'Partner', romantic: true, family: false },
  { id: 'spouse', label: 'Spouse', romantic: true, family: false },
  { id: 'ex', label: 'Ex', romantic: false, family: false },
  { id: 'best-friend', label: 'Best friend', romantic: false, family: false },
  { id: 'friend', label: 'Friend', romantic: false, family: false },
  { id: 'roommate', label: 'Roommate', romantic: false, family: false },
  { id: 'coworker', label: 'Coworker', romantic: false, family: false },
  { id: 'rival', label: 'Rival', romantic: false, family: false },
  { id: 'sibling', label: 'Sibling', romantic: false, family: true },
  { id: 'cousin', label: 'Cousin', romantic: false, family: true },
  { id: 'parent', label: 'Parent', romantic: false, family: true },
  { id: 'child', label: 'Child', romantic: false, family: true },
];

export type { CastRelationKind, CastRelationship };

const KIND_IDS = new Set<string>(CAST_RELATION_KINDS.map(kind => kind.id));

export function castRelationInfo(kind: CastRelationKind) {
  return CAST_RELATION_KINDS.find(item => item.id === kind)!;
}

export function normalizeCastRelationships(raw: unknown): CastRelationship[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: CastRelationship[] = [];
  for (const item of raw) {
    const castId = typeof item?.castId === 'string' ? item.castId.trim() : '';
    const kind = typeof item?.kind === 'string' ? item.kind : '';
    if (!castId || !KIND_IDS.has(kind) || list.some(other => other.castId === castId)) continue;
    list.push({ castId, kind: kind as CastRelationKind });
  }
  return list.length ? list : undefined;
}

/** What `other` is to `cast`, if set. */
export function castRelationOf(
  cast: Pick<CharacterRecord, 'relationships'> | null | undefined,
  otherId: string | null | undefined
): CastRelationKind | null {
  const id = otherId?.trim();
  if (!id) return null;
  return (
    normalizeCastRelationships(cast?.relationships)?.find(item => item.castId === id)?.kind ?? null
  );
}

/** The other side: if B is A's parent, A is B's child. */
export function inverseRelation(kind: CastRelationKind): CastRelationKind {
  return kind === 'parent' ? 'child' : kind === 'child' ? 'parent' : kind;
}

function withRelation(
  character: CharacterRecord,
  otherId: string,
  kind: CastRelationKind | null
): CharacterRecord {
  const rest = (normalizeCastRelationships(character.relationships) ?? []).filter(
    item => item.castId !== otherId
  );
  const next = kind ? [...rest, { castId: otherId, kind }] : rest;
  if (next.length) return { ...character, relationships: next };
  // Cleared, not left out: an update without the field keeps the stored value.
  return { ...character, relationships: undefined };
}

/** Set (or clear, with null) what `otherId` is to `castId`, and the mirror on the other Cast. */
export function saveCastRelationship(
  castId: string,
  otherId: string,
  kind: CastRelationKind | null
): CharacterRecord | undefined {
  const cast = getCharacter(castId.trim());
  const other = getCharacter(otherId.trim());
  if (!cast || !other || cast.id === other.id) return cast;
  upsertCharacter(withRelation(cast, other.id, kind));
  upsertCharacter(withRelation(other, cast.id, kind ? inverseRelation(kind) : null));
  return getCharacter(cast.id);
}

/** Gender-free on purpose: Day's text is written for a woman and swapped whole for a man lead. */
const PAIR_WORDS: Record<CastRelationKind, string> = {
  partner: 'a couple',
  spouse: 'a married couple',
  ex: 'exes on good terms',
  'best-friend': 'best friends',
  friend: 'friends',
  roommate: 'roommates',
  coworker: 'coworkers',
  rival: 'friendly rivals',
  sibling: 'siblings',
  cousin: 'cousins',
  parent: 'parent and grown child',
  child: 'parent and grown child',
};

/**
 * The sentence a two-person still carries for how the pair relate, e.g. "They are siblings —
 * warm and familiar, not romantic." A couple is said plainly.
 */
export function castRelationSentence(kind: CastRelationKind | null | undefined): string {
  if (!kind) return '';
  const info = castRelationInfo(kind);
  const what = PAIR_WORDS[kind];
  if (info.romantic) return `They are ${what}.`;
  return `They are ${what} — ${info.family ? 'warm and familiar' : 'easy and friendly'}, not romantic.`;
}

/** Family never plays the partner in a romantic or adult Day mood. */
export function relationAllowsRomance(kind: CastRelationKind | null | undefined): boolean {
  return !kind || !castRelationInfo(kind).family;
}
