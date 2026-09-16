import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { featureForPath } from "./features";
import { canAccessFeature } from "./access";
import { userCanAccessFeature } from "./store";
import type { AuthUser } from "./types";

describe("auth features", () => {
  it("maps root path to generate", () => {
    assert.equal(featureForPath("/"), "generate");
  });

  it("maps gallery and comfyui api paths", () => {
    assert.equal(featureForPath("/gallery"), "gallery");
    assert.equal(featureForPath("/api/comfyui"), "comfyui-api");
    assert.equal(featureForPath("/api/diffusers"), "comfyui-api");
    assert.equal(featureForPath("/api/fal"), "comfyui-api");
    assert.equal(featureForPath("/api/fal/status"), "comfyui-api");
    assert.equal(featureForPath("/api/replicate"), "comfyui-api");
    assert.equal(featureForPath("/api/replicate/status"), "comfyui-api");
    assert.equal(featureForPath("/api/openai"), "comfyui-api");
    assert.equal(featureForPath("/api/gemini/status"), "comfyui-api");
    assert.equal(featureForPath("/api/grok"), "comfyui-api");
    assert.equal(featureForPath("/story"), "roleplay");
    assert.equal(featureForPath("/play"), "play");
    assert.equal(featureForPath("/fitting"), "play");
    assert.equal(featureForPath("/day"), "play");
    assert.equal(featureForPath("/moodboard"), "play");
    assert.equal(featureForPath("/characters"), "character");
    assert.equal(featureForPath("/characters/char-rin"), "character");
    assert.equal(featureForPath("/api/roleplay"), "llm-api");
    assert.equal(featureForPath("/m"), "gallery");
    assert.equal(featureForPath("/m/capture"), "gallery");
    assert.equal(featureForPath("/m/queue"), "queue");
    assert.equal(featureForPath("/m/gallery"), "gallery");
    assert.equal(featureForPath("/m/story"), "roleplay");
    assert.equal(featureForPath("/m/film"), "play");
    assert.equal(featureForPath("/m/moodboard"), "play");
    assert.equal(featureForPath("/m/fitting"), "play");
    assert.equal(featureForPath("/m/day"), "play");
  });
});

describe("auth access resolution", () => {
  const baseUser: AuthUser = {
    id: "u1",
    username: "tester",
    passwordHash: "scrypt$abc$def",
    role: "user",
    groupIds: [],
    blockedFeatures: ["settings"],
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };

  it("grants admins all features", () => {
    assert.equal(
      userCanAccessFeature({ ...baseUser, role: "admin", blockedFeatures: ["gallery"] }, "gallery"),
      true,
    );
  });

  it("blocks user-specific features", () => {
    assert.equal(userCanAccessFeature(baseUser, "settings"), false);
    assert.equal(userCanAccessFeature(baseUser, "gallery"), true);
  });

  it("treats legacy roleplay grants as play access", () => {
    assert.equal(canAccessFeature(["roleplay"], "play"), true);
    assert.equal(canAccessFeature(["play"], "roleplay"), false);
    assert.equal(canAccessFeature(["play"], "play"), true);
  });
});
