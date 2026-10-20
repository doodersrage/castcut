/**
 * The Look page (/moodboard) is retired (2026-10-14): a Cast's looks, look plates and Look notes
 * live on Cast home, clothing comes from Outfit / Day. Old links and saved films that still point
 * at Look land on the Cast's looks instead.
 */
export function retiredLookHref(characterId?: string | null): string {
  const id = characterId?.trim();
  return id ? `/characters/${encodeURIComponent(id)}?tab=overview#looks` : '/characters';
}
