export function applyLockedVariationSeed(rolledSeed: string, lockedSeed?: string): string {
  const locked = lockedSeed?.trim();
  return locked && locked.length > 0 ? locked : rolledSeed;
}
