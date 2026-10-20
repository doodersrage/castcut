import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServerEnvGroup } from "./server-env-summary";

function group(overrides: Partial<ServerEnvGroup>): ServerEnvGroup {
  return { id: "llm", title: "LLM", fields: [], ...overrides };
}

describe("buildEnvSnippet", async () => {
  const { buildEnvSnippet } = await import("./env-snippet");

  it("starts with the header comment lines", () => {
    const snippet = buildEnvSnippet([]);
    const lines = snippet.split("\n");
    assert.equal(lines[0], "# Castcut — copy to .env.local and fill in secrets");
    assert.equal(lines[1], "# Restart the dev server or container after changes.");
  });

  it("emits a group title comment and a blank KEY= line for every field, regardless of value", () => {
    const snippet = buildEnvSnippet([
      group({
        title: "LLM Settings",
        fields: [{ key: "LLM_API_KEY", label: "API key", value: "", configured: false }],
      }),
    ]);
    assert.match(snippet, /# LLM Settings/);
    assert.match(snippet, /^LLM_API_KEY=$/m);
  });

  it("emits KEY= (blank) for any field whose key includes KEY or TOKEN, even when configured with a value", () => {
    const snippet = buildEnvSnippet([
      group({
        fields: [
          { key: "SOME_TOKEN", label: "Token", value: "abc123", configured: true },
          { key: "MY_API_KEY", label: "Key", value: "abc123", configured: true },
        ],
      }),
    ]);
    assert.match(snippet, /^SOME_TOKEN=$/m);
    assert.match(snippet, /^MY_API_KEY=$/m);
  });

  it("fills in the value for a configured non-secret field", () => {
    const snippet = buildEnvSnippet([
      group({
        fields: [{ key: "BASE_URL", label: "Base URL", value: "http://localhost:1234", configured: true }],
      }),
    ]);
    assert.match(snippet, /^BASE_URL=http:\/\/localhost:1234$/m);
  });

  it("leaves the value blank when a non-secret field is masked with bullet characters", () => {
    const snippet = buildEnvSnippet([
      group({
        fields: [{ key: "SOME_HOST", label: "Host", value: "••••1234", configured: true }],
      }),
    ]);
    assert.match(snippet, /^SOME_HOST=$/m);
  });

  it("leaves the value blank when a non-secret field is not configured", () => {
    const snippet = buildEnvSnippet([
      group({
        fields: [{ key: "SOME_HOST", label: "Host", value: "leftover", configured: false }],
      }),
    ]);
    assert.match(snippet, /^SOME_HOST=$/m);
  });

  it("includes an optional hint as its own comment line directly above the field", () => {
    const snippet = buildEnvSnippet([
      group({
        fields: [
          { key: "HOST", label: "Host", value: "", configured: false, hint: "e.g. http://localhost:8188" },
        ],
      }),
    ]);
    const lines = snippet.split("\n");
    const hintIndex = lines.indexOf("# e.g. http://localhost:8188");
    assert.ok(hintIndex >= 0);
    assert.equal(lines[hintIndex + 1], "HOST=");
  });

  it("separates multiple groups with a blank line and trims the trailing newline", () => {
    const snippet = buildEnvSnippet([
      group({ id: "llm", title: "LLM", fields: [{ key: "A", label: "A", value: "", configured: false }] }),
      group({ id: "storage", title: "Storage", fields: [{ key: "B", label: "B", value: "", configured: false }] }),
    ]);
    assert.match(snippet, /# LLM\nA=\n\n# Storage\nB=$/);
    assert.equal(snippet.endsWith("\n"), false);
  });

  it("returns just the header for an empty group list", () => {
    const snippet = buildEnvSnippet([]);
    assert.equal(
      snippet,
      "# Castcut — copy to .env.local and fill in secrets\n# Restart the dev server or container after changes."
    );
  });
});
