/**
 * The routes the core package (prompt-studio-core) ships to the Prompt Studio app: every src/app
 * page, API route and special file outside the Play layer. Prompt Studio's own pages (Generate,
 * Studio, ControlNet, …) live in its repo (github.com/doodersrage/prompt-studio, src/studio-app)
 * and win at the same route; its `prompt-studio-sync-routes` writes the wrappers. Pure; used by
 * scripts/pack-core.mts and its test. docs/architecture-boundaries.md.
 */
import { isPlayLayer } from './architecture-boundaries';

// The wrapper itself is plain JS, shared with the core package's prompt-studio-sync-routes.
export { CLASSIC_GENERATED_MARK, wrapperSource } from '../../scripts/classic-wrappers.mjs';
import { isRouteSourceFile } from '../../scripts/classic-wrappers.mjs';

/** Written by hand in the Prompt Studio app (its own layout and styles). */
const CLASSIC_OWN = new Set(['src/app/layout.tsx', 'src/app/globals.css', 'src/app/favicon.ico']);

/** The core's route files (under src/app) the Prompt Studio app wraps. */
export function coreRouteFiles(srcFiles: readonly string[], owned: ReadonlySet<string>): string[] {
  return srcFiles.filter(
    path =>
      path.startsWith('src/app/') &&
      isRouteSourceFile(path) &&
      !CLASSIC_OWN.has(path) &&
      !isPlayLayer(path, owned)
  );
}
