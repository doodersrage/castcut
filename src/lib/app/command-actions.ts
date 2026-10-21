/**
 * Command palette actions that features add (docs/architecture-boundaries.md: the shared palette
 * names no feature; Play registers its own). Two kinds, one registry:
 *
 * - app actions, registered once at start (`registerCommandActions` from a features module):
 *   "Open Story", "New Cast member" — they navigate, or do a small thing and navigate;
 * - page actions, registered by a mounted page while it is open (`registerCommandActions` in an
 *   effect, the returned function unregisters on unmount): "Queue the Day", "Animate all" — they
 *   call the very handler the page's button calls.
 *
 * An action registered under an id that is already there takes its place until it unregisters,
 * so a page can replace an app action ("Cut the film" opens Cut; on Cut it cuts).
 */

export type CommandActionContext = {
  /** Client-side navigation (the palette's router). */
  navigate: (href: string) => void;
};

export type CommandAction = {
  id: string;
  label: string;
  subtitle?: string;
  /** Extra words that should find it. */
  keywords?: string;
  /** Palette group heading (default "Actions"). */
  group?: string;
  /** Navigate here (when there is no `run`, or after it). */
  href?: string;
  run?: (context: CommandActionContext) => void;
  /** Listed only while this returns true (e.g. the button it stands for is enabled). */
  available?: () => boolean;
};

export const COMMAND_ACTIONS_CHANGED_EVENT = 'command-actions-changed';

type Registration = { token: number; action: CommandAction };

const stacks = new Map<string, Registration[]>();
const order: string[] = [];
let nextToken = 1;
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(COMMAND_ACTIONS_CHANGED_EVENT));
  }
}

/** Add actions; returns a function that removes exactly these registrations. */
export function registerCommandActions(actions: CommandAction[]): () => void {
  const tokens: Array<{ id: string; token: number }> = [];
  for (const action of actions) {
    const token = nextToken++;
    const stack = stacks.get(action.id) ?? [];
    stack.push({ token, action });
    stacks.set(action.id, stack);
    if (!order.includes(action.id)) order.push(action.id);
    tokens.push({ id: action.id, token });
  }
  if (tokens.length > 0) changed();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    for (const { id, token } of tokens) {
      const stack = stacks.get(id);
      if (!stack) continue;
      const next = stack.filter(entry => entry.token !== token);
      if (next.length > 0) {
        stacks.set(id, next);
      } else {
        stacks.delete(id);
        const at = order.indexOf(id);
        if (at >= 0) order.splice(at, 1);
      }
    }
    changed();
  };
}

/** The current action for each id (the latest registration), in first-registered order. */
export function listCommandActions(): CommandAction[] {
  const out: CommandAction[] = [];
  for (const id of order) {
    const stack = stacks.get(id);
    const top = stack?.[stack.length - 1]?.action;
    if (!top) continue;
    if (top.available && !safeAvailable(top.available)) continue;
    out.push(top);
  }
  return out;
}

function safeAvailable(available: () => boolean): boolean {
  try {
    return available();
  } catch {
    return false;
  }
}

/** Run an action the way the palette does: its handler, then its link. */
export function runCommandAction(action: CommandAction, context: CommandActionContext): void {
  action.run?.(context);
  if (action.href) context.navigate(action.href);
}

/** For useSyncExternalStore. */
export function subscribeCommandActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function commandActionsVersion(): number {
  return version;
}

/** Tests only. */
export function resetCommandActionsForTests(): void {
  stacks.clear();
  order.length = 0;
  version = 0;
}
