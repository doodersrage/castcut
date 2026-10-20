import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { GalleryLightboxUiPreferences } from "./lightbox-prefs";

let stored: unknown = null;
const readBrowserValue = mock.fn(<T>(): T | null => stored as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  stored = value;
});
mock.module("../browser-storage", { namedExports: { readBrowserValue, writeBrowserValue } });

describe("gallery-lightbox-prefs", async () => {
  const {
    GALLERY_LIGHTBOX_UI_KEY,
    isGalleryLightboxFit,
    loadGalleryLightboxUiPreferences,
    saveGalleryLightboxUiPreferences,
    markGalleryLightboxTutorialSeen,
  } = await import("./lightbox-prefs");

  describe("isGalleryLightboxFit", () => {
    it("accepts the three known fit values", () => {
      assert.equal(isGalleryLightboxFit("contain"), true);
      assert.equal(isGalleryLightboxFit("cover"), true);
      assert.equal(isGalleryLightboxFit("actual"), true);
    });

    it("rejects anything else", () => {
      assert.equal(isGalleryLightboxFit("zoom"), false);
      assert.equal(isGalleryLightboxFit(undefined), false);
      assert.equal(isGalleryLightboxFit(42), false);
    });
  });

  describe("loadGalleryLightboxUiPreferences", () => {
    it("returns the defaults when nothing is stored", () => {
      stored = null;
      assert.deepEqual(loadGalleryLightboxUiPreferences(), {
        fit: "contain",
        tutorialSeen: false,
        chromeCompact: true,
      });
    });

    it("returns the defaults when the stored value is not an object", () => {
      stored = "not-an-object";
      assert.deepEqual(loadGalleryLightboxUiPreferences(), {
        fit: "contain",
        tutorialSeen: false,
        chromeCompact: true,
      });
    });

    it("falls back to the default fit for an invalid stored value, and to the default chromeCompact for a non-boolean value", () => {
      // tutorialSeen has no type-check fallback in the source -- it's Boolean(parsed.tutorialSeen)
      // unconditionally, so a truthy non-boolean like "yes" legitimately coerces to true rather
      // than falling back to the default. fit and chromeCompact each explicitly validate the
      // stored type/value before using it, so they do fall back here. Verified against the real
      // implementation, not assumed.
      stored = { fit: "zoom", tutorialSeen: "yes", chromeCompact: "no" };
      assert.deepEqual(loadGalleryLightboxUiPreferences(), {
        fit: "contain",
        tutorialSeen: true,
        chromeCompact: true,
      });
    });

    it("coerces a falsy non-boolean tutorialSeen to false", () => {
      stored = { fit: "cover", tutorialSeen: 0, chromeCompact: true };
      assert.equal(loadGalleryLightboxUiPreferences().tutorialSeen, false);
    });

    it("passes through valid stored values", () => {
      stored = { fit: "cover", tutorialSeen: true, chromeCompact: false };
      assert.deepEqual(loadGalleryLightboxUiPreferences(), {
        fit: "cover",
        tutorialSeen: true,
        chromeCompact: false,
      });
    });
  });

  describe("saveGalleryLightboxUiPreferences", () => {
    it("writes the preferences object under the expected key", () => {
      writeBrowserValue.mock.resetCalls();
      const prefs: GalleryLightboxUiPreferences = { fit: "actual", tutorialSeen: true, chromeCompact: false };
      saveGalleryLightboxUiPreferences(prefs);
      assert.deepEqual(writeBrowserValue.mock.calls[0]?.arguments, [GALLERY_LIGHTBOX_UI_KEY, prefs]);
    });
  });

  describe("markGalleryLightboxTutorialSeen", () => {
    it("saves tutorialSeen:true, preserving the other current preferences", () => {
      stored = { fit: "cover", tutorialSeen: false, chromeCompact: false };
      writeBrowserValue.mock.resetCalls();
      markGalleryLightboxTutorialSeen();
      assert.deepEqual(writeBrowserValue.mock.calls[0]?.arguments[1], {
        fit: "cover",
        tutorialSeen: true,
        chromeCompact: false,
      });
    });

    it("is a no-op when the tutorial has already been seen", () => {
      stored = { fit: "cover", tutorialSeen: true, chromeCompact: false };
      writeBrowserValue.mock.resetCalls();
      markGalleryLightboxTutorialSeen();
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });
  });
});
