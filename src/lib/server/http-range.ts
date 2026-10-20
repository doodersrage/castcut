export type ByteRange = { start: number; end: number };

/**
 * Parses a single-range HTTP `Range: bytes=...` header against a known total
 * size (RFC 7233 §2.1 — this app only ever serves one range per request, no
 * multipart/byteranges). Returns `null` when the header is absent, malformed,
 * multi-range, or unsatisfiable; callers should fall back to a full 200
 * response in that case rather than erroring, matching how most static file
 * servers degrade.
 *
 * Used to let `<video>` seek/scrub against durably-stored originals
 * (`/api/gallery/media/[id]?variant=original`) the same way it already can
 * against the live ComfyUI `/view` proxy.
 */
export function parseRangeHeader(
  header: string | null | undefined,
  size: number
): ByteRange | null {
  if (!header || size <= 0) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return null;
  }
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) {
    return null;
  }

  let start: number;
  let end: number;
  if (!startRaw) {
    // Suffix range (`bytes=-500` → last 500 bytes).
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(0, size - Math.floor(suffixLength));
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size) {
    return null;
  }
  end = Math.min(Math.floor(end), size - 1);
  start = Math.floor(start);
  if (end < start) {
    return null;
  }
  return { start, end };
}
