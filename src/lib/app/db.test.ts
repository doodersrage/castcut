import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("appDb", () => {
  it("is null outside a browser (no window means no IndexedDB)", async () => {
    // @ts-expect-error ensure no window is present for this import
    delete globalThis.window;
    const { appDb } = await import("./db");
    assert.equal(appDb, null);
  });
});
