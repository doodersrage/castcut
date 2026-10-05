import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  LlmBusyError,
  acquireLlmSlot,
  getLlmInflightCount,
  getLlmMaxInflight,
  isLlmBusy,
  resetLlmInflightForTests,
  withLlmSlot,
} from "./llm-backpressure";

describe("getLlmMaxInflight", () => {
  const original = process.env.LLM_MAX_INFLIGHT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.LLM_MAX_INFLIGHT;
    } else {
      process.env.LLM_MAX_INFLIGHT = original;
    }
  });

  it("defaults to 2 when unset", () => {
    delete process.env.LLM_MAX_INFLIGHT;
    assert.equal(getLlmMaxInflight(), 2);
  });

  it("defaults to 2 for invalid values", () => {
    process.env.LLM_MAX_INFLIGHT = "not-a-number";
    assert.equal(getLlmMaxInflight(), 2);
    process.env.LLM_MAX_INFLIGHT = "0";
    assert.equal(getLlmMaxInflight(), 2);
    process.env.LLM_MAX_INFLIGHT = "-3";
    assert.equal(getLlmMaxInflight(), 2);
  });

  it("honors a positive integer override", () => {
    process.env.LLM_MAX_INFLIGHT = "5";
    assert.equal(getLlmMaxInflight(), 5);
  });

  it("floors fractional overrides", () => {
    process.env.LLM_MAX_INFLIGHT = "3.7";
    assert.equal(getLlmMaxInflight(), 3);
  });
});

describe("acquireLlmSlot / getLlmInflightCount", () => {
  const original = process.env.LLM_MAX_INFLIGHT;

  beforeEach(() => {
    resetLlmInflightForTests();
    process.env.LLM_MAX_INFLIGHT = "2";
  });

  afterEach(() => {
    resetLlmInflightForTests();
    if (original === undefined) {
      delete process.env.LLM_MAX_INFLIGHT;
    } else {
      process.env.LLM_MAX_INFLIGHT = original;
    }
  });

  it("increments in-flight count on acquire and decrements on release", () => {
    assert.equal(getLlmInflightCount(), 0);
    const release = acquireLlmSlot();
    assert.equal(getLlmInflightCount(), 1);
    release();
    assert.equal(getLlmInflightCount(), 0);
  });

  it("is idempotent when release is called more than once", () => {
    const release = acquireLlmSlot();
    release();
    release();
    assert.equal(getLlmInflightCount(), 0);
  });

  it("reports busy once the max-inflight limit is reached", () => {
    const releaseA = acquireLlmSlot();
    assert.equal(isLlmBusy(), false);
    const releaseB = acquireLlmSlot();
    assert.equal(isLlmBusy(), true);

    assert.throws(() => acquireLlmSlot(), LlmBusyError);

    releaseA();
    assert.equal(isLlmBusy(), false);
    releaseB();
  });

  it("throws LlmBusyError with a positive retryAfterSeconds when saturated", () => {
    acquireLlmSlot();
    acquireLlmSlot();
    try {
      acquireLlmSlot();
      assert.fail("expected LlmBusyError to be thrown");
    } catch (error) {
      assert.ok(error instanceof LlmBusyError);
      assert.ok(error.retryAfterSeconds > 0);
    }
  });
});

describe("withLlmSlot", () => {
  const original = process.env.LLM_MAX_INFLIGHT;

  beforeEach(() => {
    resetLlmInflightForTests();
    process.env.LLM_MAX_INFLIGHT = "2";
  });

  afterEach(() => {
    resetLlmInflightForTests();
    if (original === undefined) {
      delete process.env.LLM_MAX_INFLIGHT;
    } else {
      process.env.LLM_MAX_INFLIGHT = original;
    }
  });

  it("releases the slot after the wrapped function resolves", async () => {
    const result = await withLlmSlot(async () => {
      assert.equal(getLlmInflightCount(), 1);
      return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(getLlmInflightCount(), 0);
  });

  it("releases the slot even when the wrapped function throws", async () => {
    await assert.rejects(
      withLlmSlot(async () => {
        throw new Error("boom");
      }),
    );
    assert.equal(getLlmInflightCount(), 0);
  });

  it("rejects with LlmBusyError without running fn when saturated", async () => {
    acquireLlmSlot();
    acquireLlmSlot();
    let ran = false;
    await assert.rejects(
      withLlmSlot(async () => {
        ran = true;
      }),
      LlmBusyError,
    );
    assert.equal(ran, false);
  });

  it("waits for a slot to free up when asked to, then runs", async () => {
    const releaseA = acquireLlmSlot();
    acquireLlmSlot();
    setTimeout(releaseA, 300);
    let ran = false;
    await withLlmSlot(
      async () => {
        ran = true;
      },
      { waitMs: 5000 },
    );
    assert.equal(ran, true);
  });

  it("still fails busy once the wait runs out", async () => {
    acquireLlmSlot();
    acquireLlmSlot();
    await assert.rejects(withLlmSlot(async () => undefined, { waitMs: 300 }), LlmBusyError);
  });
});
