/**
 * Which app this build is (docs/architecture-boundaries.md): Castcut, with Play (Film, Cast, Look,
 * Outfit, Day, Story), or the classic Prompt Studio tools without it. Set at build time by the
 * app's next.config (`NEXT_PUBLIC_APP_PROFILE`); unset is Castcut. Inlined into both bundles, so
 * a classic build drops what is gated on it.
 */
export type AppProfileId = 'castcut' | 'classic';

export const APP_PROFILE: AppProfileId =
  process.env.NEXT_PUBLIC_APP_PROFILE === 'classic' ? 'classic' : 'castcut';

/** Castcut's Play features: the Film workspace, its nav group and the home redirect. */
export const APP_HAS_PLAY = APP_PROFILE === 'castcut';

/** Castcut's Play routes — not in the classic app (its build has no such pages). */
const PLAY_ROUTE_PREFIXES = [
  '/play',
  '/day',
  '/story',
  '/roleplay',
  '/fitting',
  '/moodboard',
  '/character',
  '/characters',
  '/m',
];

/** Whether this app has the page an href points at (classic: no Play routes). */
export function appHasRoute(href: string): boolean {
  if (APP_HAS_PLAY) return true;
  const path = href.split(/[?#]/)[0] || '/';
  return !PLAY_ROUTE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}
