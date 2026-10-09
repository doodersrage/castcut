/**
 * What the classic Prompt Studio app (apps/prompt-studio) takes from Castcut's routes: every page,
 * API route and special file outside the Play layer, as a wrapper that re-exports it. Pure; used
 * by scripts/gen-classic-app.mts and its test. docs/architecture-boundaries.md.
 */
import { isPlayLayer } from './architecture-boundaries';

// The wrapper itself is plain JS, shared with the core package's prompt-studio-sync-routes.
export { CLASSIC_GENERATED_MARK, wrapperSource } from '../../scripts/classic-wrappers.mjs';
import { isRouteSourceFile, pairClassicRouteFiles } from '../../scripts/classic-wrappers.mjs';

export const CLASSIC_APP_DIR = 'apps/prompt-studio';

/** Written by hand in the classic app (its own layout and styles). */
const CLASSIC_OWN = new Set(['src/app/layout.tsx', 'src/app/globals.css', 'src/app/favicon.ico']);

/**
 * The classic app's route files, `{ source, target }` (target under src/app): every src/app page,
 * API route and special file outside the Play layer, and Prompt Studio's own pages from
 * src/studio-app, which win at the same route.
 */
export function classicRouteFiles(
  srcFiles: readonly string[],
  owned: ReadonlySet<string>
): { source: string; target: string }[] {
  const app = srcFiles.filter(
    path =>
      path.startsWith('src/app/') &&
      isRouteSourceFile(path) &&
      !CLASSIC_OWN.has(path) &&
      !isPlayLayer(path, owned)
  );
  const studio = srcFiles.filter(
    path => path.startsWith('src/studio-app/') && isRouteSourceFile(path)
  );
  return pairClassicRouteFiles(app, studio);
}
