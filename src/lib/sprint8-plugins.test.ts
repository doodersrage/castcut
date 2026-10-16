import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APP_NAV_GROUPS,
  flattenAppNavLinks,
  mergePluginLinksIntoNav,
} from "./app-nav-catalog";
import {
  navLinksFromInstalledPlugins,
  normalizeInstalledPlugins,
  normalizePluginManifest,
} from "./plugin-manifest";
import {
  applyPluginQueueHookMutation,
  loadManifestPluginHooksForEvent,
  normalizeHookCfg,
  normalizeHookDenoise,
} from "./plugin-queue-hooks";

describe("sprint8 plugin runtime", () => {
  it("normalizes a valid manifest", () => {
    const manifest = normalizePluginManifest({
      id: "Queue Rewrite Denoise",
      label: "Denoise rewrite",
      version: "1.0.0",
      enabled: true,
      nav: [
        {
          href: "/plugins/queue-rewrite-denoise",
          label: "Denoise rewrite",
          description: "Softens denoise",
        },
      ],
      queueHooks: {
        url: "/api/plugin-hooks/denoise-rewrite",
        events: ["queue-preflight"],
      },
      tools: [
        {
          id: "overview",
          title: "Denoise rewrite",
          route: "/plugins/queue-rewrite-denoise",
        },
      ],
    });
    assert.ok(manifest);
    assert.equal(manifest!.id, "queue-rewrite-denoise");
    assert.equal(manifest!.queueHooks?.url, "/api/plugin-hooks/denoise-rewrite");
    assert.deepEqual(manifest!.queueHooks?.events, ["queue-preflight"]);
    assert.equal(manifest!.tools?.[0]?.route, "/plugins/queue-rewrite-denoise");
  });

  it("rejects missing required fields and bad surfaces", () => {
    assert.equal(normalizePluginManifest({ id: "x", label: "X" }), null);
    assert.equal(normalizePluginManifest({ label: "X", version: "1" }), null);

    const manifest = normalizePluginManifest({
      id: "demo",
      label: "Demo",
      version: "0.1.0",
      nav: [{ href: "https://evil.example", label: "Nope" }, { href: "/ok", label: "Ok" }],
      queueHooks: { url: "/api/hook" },
      tools: [
        { id: "bad", title: "Bad", route: "not-a-path" },
        { id: "frame", title: "Frame", iframeUrl: "https://example.com/tool" },
        { id: "panel", title: "Panel", iframeUrl: "/plugins/denoise-nudge" },
      ],
    });
    assert.ok(manifest);
    assert.equal(manifest!.nav?.length, 1);
    assert.deepEqual(manifest!.queueHooks?.events, ["queue-preflight"]);
    assert.equal(manifest!.tools?.length, 2);
    assert.equal(manifest!.tools?.[0]?.iframeUrl, "https://example.com/tool");
    assert.equal(manifest!.tools?.[1]?.title, "Panel");
  });

  it("dedupes installed plugins and merges enabled nav into Library", () => {
    const list = normalizeInstalledPlugins([
      { id: "a", label: "A", version: "1" },
      { id: "a", label: "A2", version: "2" },
      { id: "b", label: "B", version: "1" },
      { id: "bad" },
    ]);
    assert.equal(list.length, 2);
    assert.equal(list[0].version, "1");

    const plugins = normalizeInstalledPlugins([
      {
        id: "queue-rewrite-denoise",
        label: "Denoise rewrite",
        version: "1.0.0",
        nav: [
          {
            href: "/plugins/queue-rewrite-denoise",
            label: "Denoise rewrite",
            description: "Example",
          },
        ],
      },
      {
        id: "off",
        label: "Off",
        version: "1",
        enabled: false,
        nav: [{ href: "/plugins/off", label: "Off", description: "hidden" }],
      },
    ]);
    const links = navLinksFromInstalledPlugins(plugins);
    assert.equal(links.length, 1);
    const merged = mergePluginLinksIntoNav(APP_NAV_GROUPS, links);
    const flat = flattenAppNavLinks(merged);
    assert.ok(flat.some((link) => link.href === "/plugins/queue-rewrite-denoise"));
  });

  it("simulates denoise rewrite from hook payload", () => {
    const result = applyPluginQueueHookMutation(
      {
        event: "queue-preflight",
        prompt: "test",
        denoise: "0.5",
        cfg: "3.5",
      },
      { denoise: "0.72" },
    );
    assert.equal(String(result.payload.denoise), "0.72");
    assert.equal(String(result.payload.cfg), "3.5");
    assert.equal(result.blocked, false);
  });

  it("clamps denoise/cfg and blocks with reason", () => {
    assert.equal(normalizeHookDenoise(9), 1);
    assert.equal(normalizeHookDenoise(0), 0.05);
    assert.equal(normalizeHookCfg(99), 30);

    const blocked = applyPluginQueueHookMutation(
      { event: "queue-preflight", prompt: "nsfw" },
      { blocked: true, reason: "policy rejected", message: "legacy", denoise: 0.2 },
    );
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.reason, "policy rejected");
    assert.equal(blocked.payload.denoise, undefined);
  });

  it("loads manifest hooks by lifecycle event", () => {
    const hooks = loadManifestPluginHooksForEvent("prompt-generated");
    assert.ok(Array.isArray(hooks));
  });
});
