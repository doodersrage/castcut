export function applyLockedLocation(
  hints: string | undefined,
  lockedLocation?: string
): string | undefined {
  const locked = lockedLocation?.trim();
  if (!locked) {
    return hints?.trim() || undefined;
  }

  const base = hints?.trim() ?? '';
  if (/location\s*:/i.test(base)) {
    return base || undefined;
  }

  return base ? `${base}, location: ${locked}` : `location: ${locked}`;
}
