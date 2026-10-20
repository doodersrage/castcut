import { APP_NAV_GROUPS, flattenAppNavLinks, type AppNavLink } from '../app/nav-catalog';
import { navLinksFromInstalledPlugins } from './manifest';
import { BUILTIN_TOOL_PLUGINS, loadToolPlugins } from '../app/tool-plugin-registry';

/** Manifest nav + custom bookmark plugins, deduped by path (for palette / search). */
export function resolveAllPluginNavLinks(): AppNavLink[] {
  const knownHrefs = new Set(
    flattenAppNavLinks(APP_NAV_GROUPS).map(link => link.href.split('?')[0] ?? link.href)
  );
  const builtinIds = new Set(BUILTIN_TOOL_PLUGINS.map(entry => entry.id));
  const seen = new Set<string>();
  const links: AppNavLink[] = [];

  const push = (link: AppNavLink) => {
    const path = link.href.split('?')[0] ?? link.href;
    if (seen.has(path)) {
      return;
    }
    seen.add(path);
    links.push(link);
  };

  for (const entry of loadToolPlugins()) {
    if (builtinIds.has(entry.id)) {
      continue;
    }
    const path = entry.href.split('?')[0] ?? entry.href;
    if (knownHrefs.has(path)) {
      continue;
    }
    push({
      href: entry.href,
      label: entry.label,
      description: entry.description,
    });
  }

  for (const link of navLinksFromInstalledPlugins()) {
    push(link);
  }

  return links;
}
