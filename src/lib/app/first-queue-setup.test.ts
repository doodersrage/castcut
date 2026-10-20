import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const dismissFirstRunSetupSurfaces = mock.fn(() => {});
const resetFirstRunSetupSurfaces = mock.fn(() => {});
mock.module("./first-run-dismiss", {
  namedExports: {
    dismissFirstRunSetupSurfaces,
    resetFirstRunSetupSurfaces,
    FIRST_QUEUE_SETUP_DISMISS_KEY: "comfy-first-queue-setup-dismiss-v1",
    FIRST_QUEUE_SETUP_RESET_EVENT: "comfy-first-queue-setup-reset",
  },
});

describe("first-queue-setup", async () => {
  const {
    dismissFirstQueueSetupModal,
    resetFirstQueueSetupModal,
    FIRST_QUEUE_SETUP_DISMISS_KEY,
    FIRST_QUEUE_SETUP_RESET_EVENT,
  } = await import("./first-queue-setup");

  it("dismissFirstQueueSetupModal delegates to dismissFirstRunSetupSurfaces", () => {
    dismissFirstRunSetupSurfaces.mock.resetCalls();
    dismissFirstQueueSetupModal();
    assert.equal(dismissFirstRunSetupSurfaces.mock.calls.length, 1);
  });

  it("resetFirstQueueSetupModal delegates to resetFirstRunSetupSurfaces", () => {
    resetFirstRunSetupSurfaces.mock.resetCalls();
    resetFirstQueueSetupModal();
    assert.equal(resetFirstRunSetupSurfaces.mock.calls.length, 1);
  });

  it("re-exports the dismiss key and reset event constants", () => {
    assert.equal(FIRST_QUEUE_SETUP_DISMISS_KEY, "comfy-first-queue-setup-dismiss-v1");
    assert.equal(FIRST_QUEUE_SETUP_RESET_EVENT, "comfy-first-queue-setup-reset");
  });
});
