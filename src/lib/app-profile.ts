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

/**
 * Prompt Studio's pages (src/studio-app): Castcut does not serve them. "/" here is Generate; in
 * Castcut "/" is a redirect to Film. classic-app.test.ts keeps this list in step with the folder.
 */
export const STUDIO_ONLY_ROUTES = [
  '/',
  '/audio',
  '/background',
  '/controlnet',
  '/fantasy',
  '/format',
  '/image-prompt',
  '/lint',
  '/logo',
  '/mesh',
  '/negative',
  '/outpaint',
  '/pet',
  '/plugins',
  '/prompt',
  '/studio',
  '/topics',
  '/variations',
  '/workflow-editor',
] as const;

function underAny(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    prefix => path === prefix || (prefix !== '/' && path.startsWith(`${prefix}/`))
  );
}

/**
 * Whether this app has the page an href points at: Castcut has no Prompt Studio pages (its "/"
 * goes to Film), Prompt Studio no Play pages.
 */
export function appHasRoute(href: string): boolean {
  const path = href.split(/[?#]/)[0] || '/';
  return APP_HAS_PLAY ? !underAny(path, STUDIO_ONLY_ROUTES) : !underAny(path, PLAY_ROUTE_PREFIXES);
}

/** Whether this app offers a page in its nav, palette and handoffs: the pages it has. */
export function appOffersRoute(href: string): boolean {
  return appHasRoute(href);
}
