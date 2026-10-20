import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

let currentConfig: { baseUrl: string; apiKey: string } = {
  baseUrl: "http://localhost:11434/v1",
  apiKey: "",
};
const getLlmConfig = mock.fn(() => ({ ...currentConfig, model: "m", visionModel: "m" }));
mock.module("../llm/client", { namedExports: { getLlmConfig } });

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;

function installFetchStub(impl: FetchImpl) {
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

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
}

function embeddingResponse(embedding: number[] | null): Response {
  return new Response(JSON.stringify(embedding ? { embedding } : {}), { status: 200 });
}

describe("embedding-search", async () => {
  const { embedText, rankByEmbedding } = await import("./embedding-search");

  describe("embedText", () => {
    it("returns null for blank text without calling fetch", async () => {
      const stub = installFetchStub(() => embeddingResponse([1, 2, 3]));
      const result = await embedText("   ");
      assert.equal(result, null);
      assert.equal(stub.calls.length, 0);
      stub.restore();
    });

    it("fetches, caches, and returns the embedding for new text", async () => {
      const stub = installFetchStub(() => embeddingResponse([0.5, 0.5]));
      const first = await embedText("cache-me-please-1");
      const second = await embedText("cache-me-please-1");
      assert.deepEqual(first, [0.5, 0.5]);
      assert.deepEqual(second, [0.5, 0.5]);
      assert.equal(stub.calls.length, 1); // second call hit the cache
      stub.restore();
    });

    it("returns null when the response is not ok", async () => {
      const stub = installFetchStub(() => new Response("nope", { status: 500 }));
      const result = await embedText("not-ok-text-1");
      assert.equal(result, null);
      stub.restore();
    });

    it("returns null when the embedding field is missing or empty", async () => {
      const stub = installFetchStub(() => embeddingResponse(null));
      const missing = await embedText("missing-embed-text");
      const stub2 = installFetchStub(() => embeddingResponse([]));
      stub.restore();
      const empty = await embedText("empty-embed-text");
      stub2.restore();
      assert.equal(missing, null);
      assert.equal(empty, null);
    });

    it("returns null when fetch throws", async () => {
      const stub = installFetchStub(() => {
        throw new Error("network down");
      });
      const result = await embedText("throwing-text-1");
      assert.equal(result, null);
      stub.restore();
    });

    it("strips a trailing /v1 from the base URL when building the embeddings endpoint", async () => {
      currentConfig = { baseUrl: "http://example:11434/v1", apiKey: "" };
      const stub = installFetchStub(() => embeddingResponse([1]));
      await embedText("url-strip-text-1");
      assert.equal(stub.calls[0]?.url, "http://example:11434/api/embeddings");
      stub.restore();
    });

    it("sends an Authorization header only when an API key is configured", async () => {
      currentConfig = { baseUrl: "http://example:11434/v1", apiKey: "secret-key" };
      const stub = installFetchStub(() => embeddingResponse([1]));
      await embedText("auth-header-text-1");
      const headers = stub.calls[0]?.init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer secret-key");
      stub.restore();

      currentConfig = { baseUrl: "http://example:11434/v1", apiKey: "" };
      const stub2 = installFetchStub(() => embeddingResponse([1]));
      await embedText("no-auth-header-text");
      const headers2 = stub2.calls[0]?.init?.headers as Record<string, string>;
      assert.equal("Authorization" in headers2, false);
      stub2.restore();
    });

    it("resolves the embed model from override, then env vars, then the default", async () => {
      currentConfig = { baseUrl: "http://example:11434/v1", apiKey: "" };

      const stub1 = installFetchStub(() => embeddingResponse([1]));
      await embedText("model-resolution-1", "override-model");
      assert.equal(
        (JSON.parse(String(stub1.calls[0]?.init?.body)) as { model: string }).model,
        "override-model"
      );
      stub1.restore();

      const stub2 = installFetchStub(() => embeddingResponse([1]));
      await withEnv({ LLM_EMBED_MODEL: "env-llm-model" }, () => embedText("model-resolution-2"));
      assert.equal(
        (JSON.parse(String(stub2.calls[0]?.init?.body)) as { model: string }).model,
        "env-llm-model"
      );
      stub2.restore();

      const stub3 = installFetchStub(() => embeddingResponse([1]));
      await withEnv(
        { LLM_EMBED_MODEL: undefined, OLLAMA_EMBED_MODEL: "ollama-env-model" },
        () => embedText("model-resolution-3")
      );
      assert.equal(
        (JSON.parse(String(stub3.calls[0]?.init?.body)) as { model: string }).model,
        "ollama-env-model"
      );
      stub3.restore();

      const stub4 = installFetchStub(() => embeddingResponse([1]));
      await withEnv(
        { LLM_EMBED_MODEL: undefined, OLLAMA_EMBED_MODEL: undefined },
        () => embedText("model-resolution-4")
      );
      assert.equal(
        (JSON.parse(String(stub4.calls[0]?.init?.body)) as { model: string }).model,
        "nomic-embed-text"
      );
      stub4.restore();
    });
  });

  describe("rankByEmbedding", () => {
    it("returns all items with score 0 and method token for a blank query, without fetching", async () => {
      const stub = installFetchStub(() => embeddingResponse([1]));
      const items = ["a", "b"];
      const result = await rankByEmbedding(items, "   ", item => item);
      assert.equal(stub.calls.length, 0);
      assert.deepEqual(
        result.map(entry => ({ item: entry.item, score: entry.score, method: entry.method })),
        [
          { item: "a", score: 0, method: "token" },
          { item: "b", score: 0, method: "token" },
        ]
      );
      stub.restore();
    });

    it("falls back to real token-overlap scoring, sorted descending, when the query embedding fails", async () => {
      const stub = installFetchStub(() => new Response("no", { status: 500 }));
      const items = [
        { id: "match", text: "a golden retriever running on the beach" },
        { id: "nomatch", text: "quarterly finance report summary" },
      ];
      const result = await rankByEmbedding(items, "golden retriever beach", item => item.text);
      stub.restore();

      assert.equal(result.length, 1);
      assert.equal(result[0]?.item.id, "match");
      assert.equal(result[0]?.method, "token");
      assert.ok(result[0]!.score > 0);
    });

    it("ranks by cosine similarity when embeddings are available, and excludes low-similarity items", async () => {
      currentConfig = { baseUrl: "http://example:11434/v1", apiKey: "" };
      const vectors: Record<string, number[]> = {
        "the query text": [1, 0],
        "closely related corpus": [1, 0],
        "unrelated corpus": [0, 1],
      };
      const stub = installFetchStub((_url, init) => {
        const { prompt } = JSON.parse(String(init?.body)) as { prompt: string };
        const vector = vectors[prompt];
        return vector ? embeddingResponse(vector) : embeddingResponse(null);
      });

      const items = [
        { id: "close", text: "closely related corpus" },
        { id: "far", text: "unrelated corpus" },
      ];
      const result = await rankByEmbedding(items, "the query text", item => item.text);
      stub.restore();

      assert.equal(result.length, 1);
      assert.equal(result[0]?.item.id, "close");
      assert.equal(result[0]?.method, "embedding");
      assert.ok(result[0]!.score > 0.99);
    });

    it("falls back to token scoring for a single item whose own embedding call fails", async () => {
      currentConfig = { baseUrl: "http://example:11434/v1", apiKey: "" };
      const vectors: Record<string, number[]> = {
        "mixed method query": [1, 0],
        "embeddable corpus one": [1, 0],
      };
      const stub = installFetchStub((_url, init) => {
        const { prompt } = JSON.parse(String(init?.body)) as { prompt: string };
        const vector = vectors[prompt];
        return vector ? embeddingResponse(vector) : new Response("no", { status: 500 });
      });

      const items = [
        { id: "embed-ok", text: "embeddable corpus one" },
        { id: "embed-fails-but-token-matches", text: "mixed method query overlaps here" },
      ];
      const result = await rankByEmbedding(items, "mixed method query", item => item.text);
      stub.restore();

      const byId = new Map(result.map(entry => [entry.item.id, entry]));
      assert.equal(byId.get("embed-ok")?.method, "embedding");
      assert.equal(byId.get("embed-fails-but-token-matches")?.method, "token");
    });
  });
});
