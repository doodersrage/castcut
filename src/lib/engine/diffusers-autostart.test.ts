import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLoopbackDiffusersUrl } from "./diffusers-autostart";

describe("isLoopbackDiffusersUrl", () => {
  it("allows localhost and loopback hosts", () => {
    assert.equal(isLoopbackDiffusersUrl("http://127.0.0.1:8190"), true);
    assert.equal(isLoopbackDiffusersUrl("http://localhost:8190"), true);
    assert.equal(isLoopbackDiffusersUrl("http://[::1]:8190"), true);
  });

  it("rejects remote hosts", () => {
    assert.equal(isLoopbackDiffusersUrl("http://192.168.1.10:8190"), false);
    assert.equal(isLoopbackDiffusersUrl("https://diffusers.example.com"), false);
  });
});
