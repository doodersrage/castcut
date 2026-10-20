import assert from "node:assert/strict";
import { describe, it } from "node:test";

function installFetchStub(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  // @ts-expect-error test stub
  globalThis.fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init));
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("checkEmbeddingSearchHealth", async () => {
  const { checkEmbeddingSearchHealth } = await import("./embedding-search-health");

  it("reports available with the expected request + success shape when the probe responds ok", async () => {
    const stub = installFetchStub(
      () =>
        new Response(JSON.stringify({ results: [{ id: "probe", score: 0.9, method: "embedding" }] }), {
          status: 200,
        }),
    );
    const health = await checkEmbeddingSearchHealth();
    assert.equal(stub.calls[0]?.url, "/api/search/embeddings");
    assert.equal(stub.calls[0]?.init?.method, "POST");
    stub.restore();

    assert.equal(health.available, true);
    assert.equal(health.model, "nomic-embed-text");
    assert.equal(health.baseUrl, "/api/search/embeddings");
    assert.equal(health.message, "Embeddings available (semantic search active).");
  });

  it("a 200 that fell back to word matching is not semantic search", async () => {
    const stub = installFetchStub(
      () => new Response(JSON.stringify({ results: [{ id: "probe", score: 0, method: "token" }] }), { status: 200 }),
    );
    const health = await checkEmbeddingSearchHealth();
    stub.restore();
    assert.equal(health.available, false);
    assert.match(health.message, /needs an Ollama embed model/);
  });

  it("surfaces the server error message when the probe is not ok", async () => {
    const stub = installFetchStub(() => new Response(JSON.stringify({ error: "no embed model" }), { status: 503 }));
    const health = await checkEmbeddingSearchHealth();
    stub.restore();
    assert.equal(health.available, false);
    assert.equal(health.message, "no embed model");
  });

  it("falls back to the generic guidance message when the error body has no error field", async () => {
    const stub = installFetchStub(() => new Response("{}", { status: 503 }));
    const health = await checkEmbeddingSearchHealth();
    stub.restore();
    assert.equal(health.available, false);
    assert.match(health.message, /needs an Ollama embed model/);
  });

  it("falls back to the generic guidance message when fetch throws", async () => {
    const stub = installFetchStub(() => {
      throw new Error("network down");
    });
    const health = await checkEmbeddingSearchHealth();
    stub.restore();
    assert.equal(health.available, false);
    assert.match(health.message, /needs an Ollama embed model/);
  });
});
