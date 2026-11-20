/** Whether two cues are one slip apart: a letter changed, added, dropped, or two swapped. */
export function oneSlipApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const off = [...a].flatMap((char, index) => (char === b[index] ? [] : [index]));
    if (off.length === 1) return true;
    return (
      off.length === 2 &&
      off[1] === off[0]! + 1 &&
      a[off[0]!] === b[off[1]!] &&
      a[off[1]!] === b[off[0]!]
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  for (let index = 0; index < long.length; index++) {
    if (long.slice(0, index) + long.slice(index + 1) === short) return true;
  }
  return false;
}
