import type { MouseEvent } from 'react';

/**
 * How nav links resolve and follow (docs/architecture-boundaries.md). A feature can rewrite a nav
 * href (Play: carry the active Cast on Film / Day / Outfit / Story links) and take over a plain
 * click (Play: follow the Cast active now, not the one the nav rendered with). Without one, links
 * are used as they are.
 */
export type NavClick = Pick<
  MouseEvent<HTMLAnchorElement>,
  'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'preventDefault'
>;

export type NavHrefResolver = (href: string, activeCharacterId?: string | null) => string;
export type NavClickFollower = (
  event: NavClick,
  renderedHref: string,
  baseHref: string,
  push: (href: string) => void
) => void;

let hrefResolver: NavHrefResolver | null = null;
let clickFollower: NavClickFollower | null = null;

export function registerNavHrefResolver(resolver: NavHrefResolver): void {
  hrefResolver = resolver;
}

export function registerNavClickFollower(follower: NavClickFollower): void {
  clickFollower = follower;
}

export function resolveNavHref(href: string, activeCharacterId?: string | null): string {
  return hrefResolver ? hrefResolver(href, activeCharacterId) : href;
}

export function followNavClick(
  event: NavClick,
  renderedHref: string,
  baseHref: string,
  push: (href: string) => void
): void {
  clickFollower?.(event, renderedHref, baseHref, push);
}
