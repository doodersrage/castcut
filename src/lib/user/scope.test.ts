import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  USER_SCOPE_CHANGED_EVENT,
  setActiveUserScope,
  getActiveUserId,
  getActiveUsername,
  isUserScoped,
  scopedStorageKey,
  scopeLabel,
  sharedScopeId,
} from "./scope";

describe("user-scope: Node context (no window)", () => {
  it("starts unscoped and does not throw when window is undefined", () => {
    assert.equal(getActiveUserId(), null);
    assert.equal(getActiveUsername(), null);
    assert.equal(isUserScoped(), false);
    assert.equal(scopedStorageKey("base"), "base");
    assert.equal(scopeLabel(), "shared session");
    assert.equal(sharedScopeId(), "shared");

    assert.doesNotThrow(() =>
      setActiveUserScope({ id: "u-node", username: "node-user" })
    );
  });

  it("reflects the active user in every derived accessor once scoped", () => {
    setActiveUserScope({ id: "u-node", username: "node-user" });
    assert.equal(getActiveUserId(), "u-node");
    assert.equal(getActiveUsername(), "node-user");
    assert.equal(isUserScoped(), true);
    assert.equal(scopedStorageKey("base"), "base:user:u-node");
    assert.equal(scopeLabel(), "node-user");
  });

  it("clears back to the shared/unscoped state when passed null", () => {
    setActiveUserScope({ id: "u-node", username: "node-user" });
    setActiveUserScope(null);
    assert.equal(getActiveUserId(), null);
    assert.equal(isUserScoped(), false);
    assert.equal(scopedStorageKey("base"), "base");
    assert.equal(scopeLabel(), "shared session");
  });
});

describe("user-scope: dispatches USER_SCOPE_CHANGED_EVENT via window", () => {
  let dispatched: string[] = [];
  let originalWindow: unknown;

  beforeEach(() => {
    dispatched = [];
    originalWindow = (globalThis as Record<string, unknown>).window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        dispatchEvent: (event: { type: string }) => {
          dispatched.push(event.type);
          return true;
        },
      },
    });
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it("dispatches when the active user actually changes", () => {
    setActiveUserScope(null);
    dispatched.length = 0;

    setActiveUserScope({ id: "u2", username: "bob" });
    assert.deepEqual(dispatched, [USER_SCOPE_CHANGED_EVENT]);
  });

  it("does not dispatch (short-circuits) when set again with the same id and username", () => {
    setActiveUserScope({ id: "u2", username: "bob" });
    dispatched.length = 0;

    setActiveUserScope({ id: "u2", username: "bob" });
    assert.deepEqual(dispatched, []);
  });

  it("dispatches when only the id changes, even if the username stays the same", () => {
    setActiveUserScope({ id: "u2", username: "bob" });
    dispatched.length = 0;

    setActiveUserScope({ id: "u3", username: "bob" });
    assert.deepEqual(dispatched, [USER_SCOPE_CHANGED_EVENT]);
  });

  it("dispatches when clearing an active scope back to null", () => {
    setActiveUserScope({ id: "u3", username: "bob" });
    dispatched.length = 0;

    setActiveUserScope(null);
    assert.deepEqual(dispatched, [USER_SCOPE_CHANGED_EVENT]);
  });
});
