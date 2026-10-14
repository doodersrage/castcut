/**
 * Whether a finished clip carries no sound: WAN saves an animated WebP (no audio track), LTX-2.5
 * and H3 save MP4 with their soundtrack. A cut mixing the two had silent holes (2026-10-14).
 */
export function clipUrlIsSilent(url: string | null | undefined): boolean {
  const value = (url ?? '').trim();
  if (!value) return false;
  let name = value;
  try {
    const parsed = new URL(value, 'http://local');
    name = parsed.searchParams.get('filename') || parsed.pathname;
  } catch {
    // Keep the raw string.
  }
  return /\.(?:webp|gif)$/i.test(name);
}
