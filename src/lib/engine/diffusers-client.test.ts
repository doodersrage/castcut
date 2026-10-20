import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DIFFUSERS_API_URL,
  getDiffusersBaseUrl,
} from "./diffusers-client";

describe("diffusers-client", () => {
  it("defaults to local Diffusers port", () => {
    assert.equal(DEFAULT_DIFFUSERS_API_URL, "http://127.0.0.1:8190");
    assert.equal(getDiffusersBaseUrl(), "http://127.0.0.1:8190");
  });

  it("accepts an explicit client URL when allowlisted", () => {
    assert.equal(
      getDiffusersBaseUrl("http://127.0.0.1:8191/"),
      "http://127.0.0.1:8191",
    );
  });
});
