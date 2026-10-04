import type { MouseEvent } from 'react';
import { resolvePlayLoopNavHref } from './play-campaign';
import { loadSettingsCache } from './settings-cache';

type NavClick = Pick<
  MouseEvent<HTMLAnchorElement>,
  'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'preventDefault'
>;

function activeCastId(): string {
  return loadSettingsCache().shared.activeCharacterId?.trim() || '';
}

/**
 * onClick for a nav Link whose href carries the active Cast (`?character=`). The nav reads the
 * Cast when it renders, and a Cast switch is saved without re-rendering the nav (the pickers save
 * quietly), so the link could still name the previous Cast: switching Cast on Film and then
 * opening Day from the sidebar switched the Cast back. A plain click goes to the href for the
 * Cast active now instead.
 */
export function followCurrentPlayLoopHref(
  event: NavClick,
  renderedHref: string,
  baseHref: string,
  push: (href: string) => void,
  castId: string = activeCastId()
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const href = resolvePlayLoopNavHref(baseHref, castId);
  if (href === renderedHref) {
    return;
  }
  event.preventDefault();
  push(href);
}
