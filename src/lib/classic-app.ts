/**
 * What the classic Prompt Studio app (apps/prompt-studio) takes from Castcut's routes: every page,
 * API route and special file outside the Play layer, as a wrapper that re-exports it. Pure; used
 * by scripts/gen-classic-app.mts and its test. docs/architecture-boundaries.md.
 */
import { isPlayLayer } from './architecture-boundaries';

// The wrapper itself is plain JS, shared with the core package's prompt-studio-sync-routes.
export { CLASSIC_GENERATED_MARK, wrapperSource } from '../../scripts/classic-wrappers.mjs';

export const CLASSIC_APP_DIR = 'apps/prompt-studio';

/** Written by hand in the classic app (its own layout and styles). */
const CLASSIC_OWN = new Set(['src/app/layout.tsx', 'src/app/globals.css', 'src/app/favicon.ico']);

export function classicAppFiles(appFiles: readonly string[], owned: ReadonlySet<string>): string[] {
  return appFiles
    .filter(path => /\.(?:ts|tsx)$/.test(path) && !/\.test\.(?:ts|tsx)$/.test(path))
    .filter(path => !CLASSIC_OWN.has(path) && !isPlayLayer(path, owned))
    .sort();
}
