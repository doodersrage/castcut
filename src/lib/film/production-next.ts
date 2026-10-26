/**
 * "What should I do next?" (M5 W2, ROADMAP §8.2): the production's next actions, most pressing
 * first, read from Film Director's overview. Each opens the tool that does it, at the place it
 * is about (a Scene, a script, the Queue, the Cut's Continuity list, the Cast) — it never does
 * the work itself. Pure.
 */
import type { ProductionOverview } from './production-overview';

export type ProductionActionKind =
  | 'cast-reference'
  | 'retry-jobs'
  | 'run-paused'
  | 'replace-wrong'
  | 'review-takes'
  | 'continuity'
  | 'first-take'
  | 'cover-gap'
  | 'coverage-findings';

export type ProductionAction = {
  /** Stable for a given thing to do (a key for the list). */
  id: string;
  kind: ProductionActionKind;
  title: string;
  detail: string;
  /** The tool, at the place. */
  href: string;
  /** Opens with this label. */
  cta: string;
};

const RANK: Record<ProductionActionKind, number> = {
  'cast-reference': 0,
  'retry-jobs': 1,
  'run-paused': 1.5,
  'replace-wrong': 2,
  'review-takes': 3,
  continuity: 4,
  'first-take': 5,
  'cover-gap': 6,
  'coverage-findings': 7,
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export function nextProductionActions(
  overview: ProductionOverview,
  cast: { name?: string; hasReference: boolean },
  /** A run on the Scene page that stopped short (M5 W5): its label and why. */
  run?: { label: string; state: string; stopReason?: string } | null
): ProductionAction[] {
  const id = encodeURIComponent(overview.castId);
  const scenePage = `/scene?character=${id}`;
  const sceneHref = (sceneId: string) => `${scenePage}&scene=${encodeURIComponent(sceneId)}`;
  const actions: ProductionAction[] = [];
  const who = cast.name || 'This Cast';

  if (!cast.hasReference) {
    actions.push({
      id: 'cast-reference',
      kind: 'cast-reference',
      title: `${who} has no reference picture`,
      detail: 'Every take keeps the face from it — add one first.',
      href: `/characters/${id}`,
      cta: 'Open the Cast',
    });
  }
  const broken = overview.jobs.failed + overview.jobs.lost;
  if (broken) {
    actions.push({
      id: 'retry-jobs',
      kind: 'retry-jobs',
      title: `${plural(broken, 'job')} failed or ${broken === 1 ? 'was' : 'were'} lost`,
      detail: overview.jobs.problems[0]?.message
        ? `Latest: ${overview.jobs.problems[0].message}`
        : 'Retry them from the Queue.',
      href: '/queue',
      cta: 'Open the Queue',
    });
  }
  if (run && run.state === 'paused') {
    actions.push({
      id: 'run-paused',
      kind: 'run-paused',
      title: `The run “${run.label}” is paused`,
      detail: run.stopReason || 'Resume it on the Scene page.',
      href: scenePage,
      cta: 'Open the run',
    });
  }
  for (const scene of overview.scenes.items) {
    if (scene.keptLooksWrong) {
      actions.push({
        id: `replace-wrong:${scene.id}`,
        kind: 'replace-wrong',
        title: `Replace the kept take of ${scene.name}`,
        detail: 'You marked it Looks wrong — make another take, or keep a different one.',
        href: sceneHref(scene.id),
        cta: 'Open the Scene',
      });
    }
  }
  for (const scene of overview.scenes.items) {
    if (scene.state === 'to-review') {
      actions.push({
        id: `review-takes:${scene.id}`,
        kind: 'review-takes',
        title: `Review ${plural(scene.takes, 'take')} of ${scene.name}`,
        detail: 'Keep one — Cut uses the kept take.',
        href: sceneHref(scene.id),
        cta: 'Review takes',
      });
    }
  }
  if (overview.continuity.open) {
    actions.push({
      id: 'continuity',
      kind: 'continuity',
      title: `${plural(overview.continuity.open, 'continuity finding')} to look at`,
      detail: 'On kept takes — decide It’s fine or It’s real, or fix the shot.',
      href: '/cut?from=scenes#cut-continuity-section',
      cta: 'Open Continuity',
    });
  }
  for (const scene of overview.scenes.items) {
    if (scene.state === 'planned') {
      actions.push({
        id: `first-take:${scene.id}`,
        kind: 'first-take',
        title: `${scene.name} has no take yet`,
        detail: 'Render its first take.',
        href: sceneHref(scene.id),
        cta: 'Open the Scene',
      });
    }
  }
  for (const gap of overview.script.uncovered) {
    actions.push({
      id: `cover-gap:${gap.scriptId}:${gap.sceneId}`,
      kind: 'cover-gap',
      title: `Make shots of ${gap.heading}`,
      detail: `Planned in “${gap.scriptName}”, nothing made yet — Make it a Scene.`,
      href: `${scenePage}&script=${encodeURIComponent(gap.scriptId)}`,
      cta: 'Open the script',
    });
  }
  if (overview.script.openFindings) {
    actions.push({
      id: 'coverage-findings',
      kind: 'coverage-findings',
      title: `${plural(overview.script.openFindings, 'coverage gap')} to look at`,
      detail: 'No establishing shot, no reaction, or nothing kept — in the script’s shot lists.',
      href: scenePage,
      cta: 'Open the Scene page',
    });
  }
  return actions.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}
