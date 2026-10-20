import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyGalleryEntry } from "../gallery/comfyui-gallery";

const galleryEntryPrimaryViewUrl = mock.fn((_entry: ComfyGalleryEntry): string | null => null);
mock.module("../gallery/comfyui-gallery", { namedExports: { galleryEntryPrimaryViewUrl } });

function entry(overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id: "e1",
    promptId: "p1",
    prompt: "a scene",
    comfyUrl: "http://mock-comfy:8188",
    status: "completed",
    queuedAt: 1000,
    images: [],
    ...overrides,
  } as ComfyGalleryEntry;
}

function removeWindow() {
  // @ts-expect-error test cleanup
  delete globalThis.window;
  // @ts-expect-error test cleanup
  delete globalThis.Notification;
}

describe("comfyui-notifications", async () => {
  const {
    isComfyNotificationSupported,
    requestComfyNotificationPermission,
    notifyComfyJobComplete,
  } = await import("./notifications");

  describe("isComfyNotificationSupported", () => {
    it("is false with no window", () => {
      removeWindow();
      assert.equal(isComfyNotificationSupported(), false);
    });

    it("is false when window has no Notification", () => {
      // @ts-expect-error test stub
      globalThis.window = {};
      removeWindow();
      // @ts-expect-error test stub
      globalThis.window = {};
      assert.equal(isComfyNotificationSupported(), false);
      removeWindow();
    });

    it("is true when window has Notification", () => {
      // @ts-expect-error test stub
      globalThis.window = { Notification: class {} };
      assert.equal(isComfyNotificationSupported(), true);
      removeWindow();
    });
  });

  describe("requestComfyNotificationPermission", () => {
    it("returns 'unsupported' with no window", async () => {
      removeWindow();
      assert.equal(await requestComfyNotificationPermission(), "unsupported");
    });

    it("returns the current permission without prompting when already granted", async () => {
      let requested = false;
      // @ts-expect-error test stub
      globalThis.window = { Notification: {} };
      // @ts-expect-error test stub
      globalThis.Notification = {
        permission: "granted",
        requestPermission: async () => {
          requested = true;
          return "granted";
        },
      };
      assert.equal(await requestComfyNotificationPermission(), "granted");
      assert.equal(requested, false);
      removeWindow();
    });

    it("returns the current permission without prompting when already denied", async () => {
      // @ts-expect-error test stub
      globalThis.window = { Notification: {} };
      // @ts-expect-error test stub
      globalThis.Notification = { permission: "denied", requestPermission: async () => "denied" };
      assert.equal(await requestComfyNotificationPermission(), "denied");
      removeWindow();
    });

    it("prompts for permission when it is still 'default'", async () => {
      // @ts-expect-error test stub
      globalThis.window = { Notification: {} };
      // @ts-expect-error test stub
      globalThis.Notification = {
        permission: "default",
        requestPermission: async () => "granted",
      };
      assert.equal(await requestComfyNotificationPermission(), "granted");
      removeWindow();
    });
  });

  describe("notifyComfyJobComplete", () => {
    it("does nothing when notifications are unsupported", () => {
      removeWindow();
      assert.doesNotThrow(() => notifyComfyJobComplete(entry()));
    });

    it("does nothing when permission is not granted", () => {
      // @ts-expect-error test stub
      globalThis.window = { Notification: {} };
      // @ts-expect-error test stub
      globalThis.Notification = { permission: "denied" };
      assert.doesNotThrow(() => notifyComfyJobComplete(entry()));
      removeWindow();
    });

    it("creates a notification with a truncated body and the preview image icon", () => {
      galleryEntryPrimaryViewUrl.mock.mockImplementationOnce(() => "http://preview.png");
      const created: Array<{ title: string; options: Record<string, unknown> }> = [];
      // @ts-expect-error test stub
      globalThis.window = { Notification: {}, focus: () => {}, location: {} };
      // @ts-expect-error test stub
      globalThis.Notification = class {
        permission = "granted";
        onclick: (() => void) | null = null;
        constructor(title: string, options: Record<string, unknown>) {
          created.push({ title, options });
        }
      };
      // @ts-expect-error test stub
      globalThis.Notification.permission = "granted";

      const longPrompt = "x".repeat(200);
      notifyComfyJobComplete(entry({ prompt: longPrompt, promptId: "p42" }));

      assert.equal(created.length, 1);
      assert.equal(created[0]?.title, "ComfyUI job completed");
      assert.equal(created[0]?.options.tag, "p42");
      assert.equal(created[0]?.options.icon, "http://preview.png");
      assert.equal((created[0]?.options.body as string).length, 141); // 140 chars + ellipsis
      removeWindow();
    });

    it("swallows an error thrown by the Notification constructor", () => {
      // @ts-expect-error test stub
      globalThis.window = { Notification: {} };
      // @ts-expect-error test stub
      globalThis.Notification = class {
        constructor() {
          throw new Error("blocked by browser");
        }
      };
      // @ts-expect-error test stub
      globalThis.Notification.permission = "granted";
      assert.doesNotThrow(() => notifyComfyJobComplete(entry()));
      removeWindow();
    });
  });
});
