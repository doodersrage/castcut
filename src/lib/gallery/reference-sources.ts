/**
 * What the production uses (M0 audit 2026-10-25, R1b): renders a feature still shows or cuts — a
 * Scene's takes, a Day slot's still, a Story beat's takes, a shot added in Cut. Their Gallery
 * entries keep their stored graph past the 30-day and 8 MB rules, and stay through the local cap
 * and Archive & purge (protected-ids.ts). Features register a source at app start
 * (docs/architecture-boundaries.md); the Gallery never imports them, and with none registered
 * nothing changes.
 *
 * A source returns the prompt ids, entry ids and media URLs it holds, as found.
 */

export type GalleryReferenceSource = () => Iterable<string | null | undefined>;

const sources: GalleryReferenceSource[] = [];

export function registerGalleryReferenceSource(source: GalleryReferenceSource): void {
  if (!sources.includes(source)) sources.push(source);
}

/** Every value the registered sources hold now (trimmed, one each). */
export function collectGalleryReferenceValues(): Set<string> {
  const values = new Set<string>();
  for (const source of sources) {
    try {
      for (const value of source()) {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (trimmed) values.add(trimmed);
      }
    } catch {
      // A feature's data that won't read protects nothing; the Gallery carries on.
    }
  }
  return values;
}
