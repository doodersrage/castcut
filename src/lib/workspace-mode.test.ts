import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "./browser-storage";
import { APP_NAV_GROUPS } from "./app-nav-catalog";
import {
  defaultExpandedNavGroups,
  hasChosenWorkspaceMode,
  isLeanWorkspaceMode,
  isRoleplayFocusNavHref,
  isRoleplayFocusPath,
  loadWorkspaceMode,
  navGroupsForPath,
  navGroupsForWorkspaceMode,
  normalizeWorkspaceMode,
  saveWorkspaceMode,
  workspaceShowsAdvancedControls,
  ROLEPLAY_FOCUS_ESCAPE_HREF,
  WORKSPACE_MODE_OPTIONS,
} from "./workspace-mode";

function withMockLocalStorage(run: () => void): void {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const dataset: Record<string, string> = {};
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      dispatchEvent: () => true,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: { dataset },
    },
  });
  try {
    run();
  } finally {
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
    if (originalDocument === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.document;
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  }
}

describe("workspace-mode", () => {
  beforeEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });
  afterEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it("normalizes unknown modes to play", () => {
    assert.equal(normalizeWorkspaceMode("nope"), "play");
    assert.equal(normalizeWorkspaceMode("play"), "play");
    assert.equal(normalizeWorkspaceMode("studio"), "studio");
    // Castcut has two layouts: Simple was lean (→ Film), Full was Studio with more open.
    assert.equal(normalizeWorkspaceMode("simple"), "play");
    assert.equal(normalizeWorkspaceMode("full"), "studio");
  });

  it("persists workspace mode and marks chosen", () => {
    withMockLocalStorage(() => {
      assert.equal(hasChosenWorkspaceMode(), false);
      saveWorkspaceMode("studio");
      assert.equal(loadWorkspaceMode(), "studio");
      assert.equal(hasChosenWorkspaceMode(), true);
      assert.equal(document.documentElement.dataset.workspace, "studio");
    });
  });

  it("offers Film and Studio only (Castcut; Simple and Full are folded in)", () => {
    assert.deepEqual(
      WORKSPACE_MODE_OPTIONS.map((option) => option.id),
      ["play", "studio"],
    );
  });

  it("keeps Film / Create / Edit / Library / More tools structure for studio and full", () => {
    for (const mode of ["studio", "full"] as const) {
      const groups = navGroupsForWorkspaceMode(mode, APP_NAV_GROUPS);
      const labels = groups.map((group) => group.label);
      assert.deepEqual(labels, ["Film", "Create", "Edit", "Library", "More tools"]);
      assert.equal(labels.includes("Tools"), false);
    }
  });

  it("defaults More tools collapsed in studio and expands all in full", () => {
    const studio = defaultExpandedNavGroups("studio", APP_NAV_GROUPS);
    assert.equal(studio.includes("More tools"), false);
    assert.ok(studio.includes("Film"));
    assert.ok(studio.includes("Edit"));
    const full = defaultExpandedNavGroups("full", APP_NAV_GROUPS);
    assert.deepEqual(
      full,
      APP_NAV_GROUPS.map((group) => group.label),
    );
    assert.deepEqual(
      defaultExpandedNavGroups("simple", [
        { label: "Essentials", links: [] },
        { label: "More tools", links: [] },
      ]),
      ["Essentials"],
    );
  });

  it("hides advanced controls in Simple and Play", () => {
    assert.equal(workspaceShowsAdvancedControls("simple"), false);
    assert.equal(workspaceShowsAdvancedControls("play"), false);
    assert.equal(workspaceShowsAdvancedControls("studio"), true);
    assert.equal(workspaceShowsAdvancedControls("full"), true);
    assert.equal(isLeanWorkspaceMode("play"), true);
  });

  it("treats Cast and Roleplay routes as Play focus, not Generate Character", () => {
    assert.equal(isRoleplayFocusPath("/story"), true);
    assert.equal(isRoleplayFocusPath("/fitting"), true);
    assert.equal(isRoleplayFocusPath("/day"), true);
    assert.equal(isRoleplayFocusPath("/moodboard"), true);
    assert.equal(isRoleplayFocusPath("/play"), true);
    assert.equal(isRoleplayFocusPath("/characters"), true);
    assert.equal(isRoleplayFocusPath("/characters/kai"), true);
    assert.equal(isRoleplayFocusPath("/character"), false);
    assert.equal(isRoleplayFocusPath("/gallery"), false);
    assert.equal(isRoleplayFocusPath("/"), false);
    assert.equal(isRoleplayFocusPath("/m/story"), false);
  });

  it("slims Cast/Roleplay chrome to Play destinations plus All tools", () => {
    for (const mode of ["simple", "studio", "full"] as const) {
      for (const path of ["/story", "/fitting", "/day", "/characters", "/characters/kai"]) {
        const groups = navGroupsForPath(mode, path, APP_NAV_GROUPS);
        assert.deepEqual(
          groups.map((group) => group.label),
          ["Play"],
        );
        const hrefs = groups[0]!.links.map((link) => link.href);
        assert.deepEqual(hrefs, [
          "/characters",
          "/play",
          "/moodboard",
          "/fitting",
          "/day",
          "/story",
          "/gallery",
          "/queue",
        ]);
        // Castcut's All tools is the Gallery (its "/" is Film), already listed once.
        assert.equal(hrefs.filter((href) => href === "/gallery").length, 1);
      }
    }
  });

  it("Roleplay workspace mode is a kiosk catalog without Audio, Mesh, or Plugins", () => {
    const groups = navGroupsForWorkspaceMode("play", APP_NAV_GROUPS);
    assert.deepEqual(
      groups.map((group) => group.label),
      ["Play"],
    );
    const hrefs = groups[0]!.links.map((link) => link.href);
    assert.deepEqual(hrefs, [
      "/characters",
      "/play",
      "/moodboard",
      "/fitting",
      "/day",
      "/story",
      "/gallery",
      "/queue",
    ]);
    assert.equal(hrefs.includes("/audio"), false);
    assert.equal(hrefs.includes("/mesh"), false);
    assert.equal(hrefs.includes("/plugins"), false);
    const generate = navGroupsForPath("play", "/", APP_NAV_GROUPS);
    assert.equal(generate[0]?.label, "Play");
  });

  it("leaves Generate and other studio routes on the full workspace catalog", () => {
    const focused = navGroupsForPath("simple", "/story", APP_NAV_GROUPS);
    const generate = navGroupsForPath("simple", "/", APP_NAV_GROUPS);
    assert.equal(focused[0]?.label, "Play");
    assert.equal(generate[0]?.label, "Essentials");
    assert.ok(generate[0]!.links.some((link) => link.href === "/story"));
    const studio = navGroupsForPath("studio", "/video", APP_NAV_GROUPS);
    assert.ok(studio.some((group) => group.label === "Edit"));
  });

  it("expands Roleplay by default and allows footer Settings/Profile hrefs", () => {
    const play = navGroupsForPath("studio", "/story", APP_NAV_GROUPS);
    assert.deepEqual(defaultExpandedNavGroups("studio", play), ["Play"]);
    assert.equal(isRoleplayFocusNavHref("/characters"), true);
    assert.equal(isRoleplayFocusNavHref("/settings"), true);
    assert.equal(isRoleplayFocusNavHref("/profile"), true);
    assert.equal(isRoleplayFocusNavHref(ROLEPLAY_FOCUS_ESCAPE_HREF), true);
    assert.equal(ROLEPLAY_FOCUS_ESCAPE_HREF, "/gallery");
    assert.equal(isRoleplayFocusNavHref("/video"), false);
    assert.equal(isRoleplayFocusNavHref("/character"), false);
  });
});
