import type { CharacterRecord } from './character-os';
import type { FittingPlate } from './character-plate';
import type { ReferenceCheckInput } from './reference-check-client';

/** One reference picture Workflow health checks (ReferenceHealthSection). */
export type ReferenceHealthItem = {
  key: string;
  label: string;
  check: ReferenceCheckInput;
};

export type ReferenceHealthContext = {
  lead: CharacterRecord | null;
  leadPlate: FittingPlate | null;
};

/** A feature's own reference pictures (Play: the Day partner). docs/architecture-boundaries.md. */
export type ReferenceHealthSource = (context: ReferenceHealthContext) => ReferenceHealthItem[];

const sources: ReferenceHealthSource[] = [];

export function registerReferenceHealthItems(source: ReferenceHealthSource): void {
  if (!sources.includes(source)) sources.push(source);
}

export function extraReferenceHealthItems(context: ReferenceHealthContext): ReferenceHealthItem[] {
  return sources.flatMap(source => source(context));
}
