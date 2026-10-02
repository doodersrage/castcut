/**
 * What the dress-plate step is doing right now, for whichever tool page is open (Story and
 * Outfit read it; Day has its own state). A tiny in-memory store: it describes a render in
 * progress, nothing worth persisting.
 */

export type DressPlateActivity = {
  text: string;
  busy: boolean;
  /** The store key of the plate this page is using — what the notice shows and redoes. */
  key?: string;
} | null;

let current: DressPlateActivity = null;
const listeners = new Set<() => void>();

export function getDressPlateActivity(): DressPlateActivity {
  return current;
}

export function setDressPlateActivity(next: DressPlateActivity): void {
  current = next;
  for (const listener of listeners) listener();
}

export function subscribeDressPlateActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
