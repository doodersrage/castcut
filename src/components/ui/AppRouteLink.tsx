import Link from 'next/link';
import type { ComponentProps } from 'react';
import { appHasRoute } from '@/lib/app-profile';

/**
 * A link to a page this app may not have (Castcut has no Prompt Studio pages, Prompt Studio no
 * Play pages — app-profile.ts): renders nothing when the page is not here.
 */
export default function AppRouteLink(props: ComponentProps<typeof Link> & { href: string }) {
  return appHasRoute(props.href) ? <Link {...props} /> : null;
}
