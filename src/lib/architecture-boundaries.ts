/**
 * Layer boundaries (docs/architecture-boundaries.md). Castcut's Play features (Film, Cast, Look,
 * Day, Outfit, Story) are one layer; everything else — the ComfyUI render pipeline, the shared app
 * kit and the classic Studio tools — must not import it, so the shared code can become packages
 * the classic Prompt Studio app also uses. Pure: the test reads the files and checks the edges.
 */

/** Files that belong to the Play layer (paths relative to the repo root, forward slashes). */
export const PLAY_LAYER_RE = new RegExp(
  '^src/(?:' +
    [
      'lib/(?:day-|day/|fitting-|fitting/|roleplay|story-|play-|film-|character-film|cast-|dress-plate|rapid-duo-recipe\.ts$|rapid-solo|pose-everyday|look-pack|look-outfit|outfit-handoff|welcome-sample-film|klein-duo-recipe|intimate-clip)',
      'hooks/(?:day-planner|fitting-room|roleplay|play|story|mobile-play|character|moodboard)/',
      'hooks/use(?:DayPlanner|Fitting|Roleplay|Story|Play|Character|Cast|Film|Look|Moodboard)[A-Za-z]*\\.ts$',
      'components/(?:day-planner|fitting|roleplay|play|story|cast|character|moodboard)/',
      'components/(?:DayPlanner|Fitting|Roleplay|Story|Play|Character|Cast|Film|Moodboard)[A-Za-z]*\\.tsx$',
      'components/mobile/Mobile(?:Day|Fitting|Play|Story|Roleplay|Cast|Character|Film|Look|Moodboard)[A-Za-z]*\\.tsx$',
      'app/(?:day|fitting|story|play|roleplay|characters|character|moodboard)/',
      // The phone app (/m) is Castcut's: film-first screens. Its route helpers (lib/mobile-*)
      // stay shared — the shell and settings use them.
      'components/mobile/',
      'app/m/',
      'hooks/(?:useMobile|mobile-)',
    ].join('|') +
    ')'
);

/**
 * Play files outside the Play folders and names (architecture/play-owned.json): used only by Play
 * — the pose editor, the wardrobe pickers, Story's writer, Play API routes. They move into the
 * Castcut app in step 4; until then the list says they belong to Play.
 */
export function isPlayLayer(path: string, owned: ReadonlySet<string> = NO_OWNED): boolean {
  return PLAY_LAYER_RE.test(path) || owned.has(path);
}

const NO_OWNED: ReadonlySet<string> = new Set();

/**
 * Castcut's composition root: the one place the app wires Play in (PlayFeatures registers Play's
 * hooks with the shared code). The classic Studio app's layout will not import it.
 */
export const PLAY_COMPOSITION_ROOTS: ReadonlySet<string> = new Set(['src/app/layout.tsx']);

export type ImportEdge = { from: string; to: string; typeOnly: boolean };

const IMPORT_RE =
  /^\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

/** `import { type A, type B } from` counts as type-only too. */
function namesAreTypeOnly(clause: string): boolean {
  const inner = /^\{([\s\S]*)\}$/.exec(clause.trim())?.[1];
  if (!inner) return false;
  const names = inner
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  return names.length > 0 && names.every(name => name.startsWith('type '));
}

/** The import specifiers in one source file, with whether each is type-only. */
export function readImports(source: string): { spec: string; typeOnly: boolean }[] {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    // A bare `import './x';` (side effects, or a shell hoist for the bundler) is an edge too.
    const spec = match[3] ?? match[4] ?? match[5];
    if (!spec) continue;
    // `import('./x').SomeType` in a type position is erased; `import('./x').then(…)` is not.
    const inlineType =
      match[4] !== undefined && /^\.[A-Z]/.test(source.slice((match.index ?? 0) + match[0].length));
    out.push({
      spec,
      typeOnly: Boolean(match[1]) || namesAreTypeOnly(match[2] ?? '') || inlineType,
    });
  }
  return out;
}

/** Edges from outside the Play layer into it — what the baseline records and the test ratchets. */
export function playBoundaryEdges(
  edges: readonly ImportEdge[],
  owned: ReadonlySet<string> = NO_OWNED
): ImportEdge[] {
  return edges.filter(
    edge =>
      isPlayLayer(edge.to, owned) &&
      !isPlayLayer(edge.from, owned) &&
      !PLAY_COMPOSITION_ROOTS.has(edge.from)
  );
}

export function edgeKey(edge: Pick<ImportEdge, 'from' | 'to'>): string {
  return `${edge.from} -> ${edge.to}`;
}
