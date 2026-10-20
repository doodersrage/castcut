/** Same service address: host:port equal, ignoring 127.0.0.1 vs localhost, a trailing `/v1` or `/`. */
export function sameServiceAddress(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const norm = (value: string | null | undefined) =>
    (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\/+$/, '')
      .replace(/\/v1$/, '')
      .replace('://localhost', '://127.0.0.1');
  return Boolean(a?.trim()) && norm(a) === norm(b);
}
