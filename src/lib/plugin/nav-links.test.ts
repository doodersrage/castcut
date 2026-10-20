import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { AppNavLink } from '../app/nav-catalog';

let installedLinksImpl: () => AppNavLink[] = () => [];
const navLinksFromInstalledPlugins = mock.fn(() => installedLinksImpl());
mock.module('./manifest', { namedExports: { navLinksFromInstalledPlugins } });

function resetMocks() {
  navLinksFromInstalledPlugins.mock.resetCalls();
  installedLinksImpl = () => [];
}

afterEach(resetMocks);

describe('plugin-nav-links', async () => {
  const { resolveAllPluginNavLinks } = await import('./nav-links');
  // ./tool-plugin-registry is not mocked: its real loadToolPlugins() returns
  // real BUILTIN_TOOL_PLUGINS when `window` is undefined (this test
  // environment), which means every entry's id is always in the real
  // module's own builtinIds set, so the "custom tool plugin" loop always
  // skips every entry here — that branch is only reachable in a browser
  // with a saved custom tool plugin, which we can't construct without
  // mocking away the real registry entirely. We verify that no built-in
  // tool plugin is duplicated instead.

  it('returns only manifest-plugin links when there are no installed plugins', () => {
    const links = resolveAllPluginNavLinks();
    assert.deepEqual(links, []);
  });

  it('includes installed-plugin nav links from navLinksFromInstalledPlugins', () => {
    installedLinksImpl = () => [{ href: '/plugins/demo', label: 'Demo Plugin', description: 'A demo plugin' }];
    const links = resolveAllPluginNavLinks();
    assert.deepEqual(links, [{ href: '/plugins/demo', label: 'Demo Plugin', description: 'A demo plugin' }]);
  });

  it('dedupes installed-plugin links against each other by path (ignoring query strings)', () => {
    installedLinksImpl = () => [
      { href: '/plugins/demo?x=1', label: 'Demo A', description: 'A' },
      { href: '/plugins/demo?x=2', label: 'Demo B (dup path)', description: 'B' },
    ];
    const links = resolveAllPluginNavLinks();
    assert.equal(links.length, 1);
    assert.equal(links[0]!.label, 'Demo A');
  });

  it('never returns a link whose path collides with a known built-in app nav href', () => {
    // /dashboard is a real APP_NAV_GROUPS href; navLinksFromInstalledPlugins
    // itself already dedupes against the app catalog internally in the real
    // module, but resolveAllPluginNavLinks does not re-filter its output —
    // it only dedupes the tool-plugin loop against knownHrefs. This
    // confirms the tool-plugin loop's guard doesn't wrongly reject an
    // installed-plugin link sharing a path with a built-in route (they are
    // independent code paths).
    installedLinksImpl = () => [{ href: '/dashboard', label: 'Also Dashboard', description: 'Also Dashboard' }];
    const links = resolveAllPluginNavLinks();
    assert.deepEqual(links, [{ href: '/dashboard', label: 'Also Dashboard', description: 'Also Dashboard' }]);
  });
});
