/**
 * Content-addressed names for files the app puts in ComfyUI's input folder.
 *
 * Uploads used to be named by the moment they were made ("day-nude-face-1791063803863.png",
 * "nora-cutout-umuro9zni.png"), so the same face crop, pose map or plate landed in the input
 * folder again on every run — about a fifth of the folder was byte-identical copies. A name built
 * from the bytes ("day-nude-face-3f2a…c901.png") is the same every time the picture is the same,
 * so an upload can be skipped when ComfyUI already has it, and two different pictures can never
 * share a name (what the per-upload stamps were for).
 */

/** Hex characters of the SHA-256 kept in the name — 64 bits, collisions are not a concern. */
export const INPUT_NAME_HASH_LENGTH = 16;

const HASH_SEGMENT_RE = new RegExp(`-[0-9a-f]{${INPUT_NAME_HASH_LENGTH}}(?=-|$)`, 'g');

/** Trailing per-upload stamps the old names carried; none of them describes the picture. */
const TRAILING_STAMP_RES = [
  /\s*\(\d+\)$/, // ComfyUI's own "name (1).png" rename
  /-u[0-9a-z]{6,}$/, // stampedUploadName
  /-\d{10,}$/, // Date.now()
  /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // randomUUID()
];

const MAX_PREFIX_LENGTH = 80;

function splitExtension(name: string): { base: string; extension: string } {
  const match = /^(.*?)(\.[A-Za-z0-9]{1,5})?$/.exec(name);
  return { base: match?.[1] ?? '', extension: (match?.[2] ?? '.png').toLowerCase() };
}

/**
 * The readable part of an upload name: the caller's filename without its folder, extension,
 * time stamps or an earlier content hash. Everything that means something stays —
 * "day-pose-guide-lap-59c64f-x2", "...-photo", "day-partner-vl" — since queue code reads those.
 */
export function inputNamePrefix(filename: string): string {
  const leaf = filename.trim().split(/[\\/]/).pop() ?? '';
  let { base } = splitExtension(leaf);
  base = base.replace(HASH_SEGMENT_RE, '');
  for (let changed = true; changed;) {
    changed = false;
    for (const re of TRAILING_STAMP_RES) {
      const next = base.replace(re, '');
      if (next !== base) {
        base = next;
        changed = true;
      }
    }
  }
  const clean = base
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, MAX_PREFIX_LENGTH)
    .replace(/[-.]+$/g, '');
  return clean || 'upload';
}

/** `<prefix>-<sha256[:16]>.<ext>` for `filename` whose bytes hash to `sha256Hex`. */
export function contentAddressedInputName(filename: string, sha256Hex: string): string {
  const hash = sha256Hex.trim().toLowerCase().slice(0, INPUT_NAME_HASH_LENGTH);
  if (!new RegExp(`^[0-9a-f]{${INPUT_NAME_HASH_LENGTH}}$`).test(hash)) {
    throw new Error('Content hash must be hex.');
  }
  const leaf = filename.trim().split(/[\\/]/).pop() ?? '';
  const { extension } = splitExtension(leaf);
  return `${inputNamePrefix(leaf)}-${hash}${extension}`;
}

/** True for a name this module made (prefix, a 16-hex hash, an extension). */
export function isContentAddressedInputName(name: string): boolean {
  return new RegExp(`-[0-9a-f]{${INPUT_NAME_HASH_LENGTH}}\\.[A-Za-z0-9]{1,5}$`).test(name.trim());
}
