/**
 * Snaps a width/height pair to the nearest of a fixed set of standard
 * aspect ratio labels. Shared by the Replicate and cloud-LLM image
 * provider protocols, which previously each carried their own
 * byte-identical copy of this — a single source of truth here keeps
 * the snap table from silently drifting between the two.
 */
export function aspectRatioFromSize(width: number, height: number): string {
  const ratio = width / Math.max(1, height);
  const options: Array<[number, string]> = [
    [1, '1:1'],
    [16 / 9, '16:9'],
    [9 / 16, '9:16'],
    [4 / 3, '4:3'],
    [3 / 4, '3:4'],
    [3 / 2, '3:2'],
    [2 / 3, '2:3'],
    [21 / 9, '21:9'],
  ];
  let best = options[0]!;
  let bestDelta = Math.abs(ratio - best[0]);
  for (const option of options) {
    const delta = Math.abs(ratio - option[0]);
    if (delta < bestDelta) {
      best = option;
      bestDelta = delta;
    }
  }
  return best[1];
}
