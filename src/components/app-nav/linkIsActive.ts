import type { AppNavLink } from '@/lib/app/nav-catalog';

export function linkIsActive(link: AppNavLink, pathname: string, search: string): boolean {
  const [path, query = ''] = link.href.split('?');
  const normalizedPath = path || '/';
  if (pathname !== normalizedPath) {
    if (normalizedPath === '/characters' && pathname.startsWith('/characters/')) {
      return !query;
    }
    return false;
  }
  const current = new URLSearchParams(search);
  if (!query) {
    if (normalizedPath === '/variations') {
      return !current.has('matrix');
    }
    return true;
  }
  const required = new URLSearchParams(query);
  for (const [key, value] of required.entries()) {
    if (current.get(key) !== value) {
      return false;
    }
  }
  return true;
}
