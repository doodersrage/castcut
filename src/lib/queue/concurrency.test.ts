import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapWithConcurrency } from "./concurrency";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("returns an empty array for empty input without calling fn", async () => {
    let calls = 0;
    const result = await mapWithConcurrency([], 3, async () => {
      calls += 1;
      return calls;
    });
    assert.deepEqual(result, []);
    assert.equal(calls, 0);
  });

  it("preserves result order regardless of completion order", async () => {
    const delays = [30, 10, 20, 0, 15];
    const result = await mapWithConcurrency(delays, 3, async (delay, index) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      return index;
    });
    assert.deepEqual(result, [0, 1, 2, 3, 4]);
  });

  it("never runs more than `limit` calls concurrently", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(items, 3, async item => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return item * 2;
    });
    assert.ok(maxActive <= 3, `expected max 3 concurrent, saw ${maxActive}`);
    assert.ok(maxActive > 1, "expected some real concurrency, not fully serialized");
  });

  it("runs fully sequentially when limit is 1", async () => {
    const items = [1, 2, 3];
    let active = 0;
    let sawOverlap = false;
    await mapWithConcurrency(items, 1, async item => {
      active += 1;
      if (active > 1) sawOverlap = true;
      await new Promise(resolve => setTimeout(resolve, 2));
      active -= 1;
      return item;
    });
    assert.equal(sawOverlap, false);
  });

  it("clamps an oversized limit to the item count without erroring", async () => {
    const result = await mapWithConcurrency([1, 2], 50, async n => n + 1);
    assert.deepEqual(result, [2, 3]);
  });

  it("propagates a rejection from fn", async () => {
    await assert.rejects(
      () =>
        mapWithConcurrency([1, 2, 3], 2, async n => {
          if (n === 2) throw new Error("boom");
          return n;
        }),
      /boom/
    );
  });

  it("lets later workers start as earlier ones finish (streaming, not batched)", async () => {
    // With limit=2 over 3 items where item 0 is slow and items 1/2 are fast, item 2 should
    // start as soon as item 1 finishes — not wait for item 0's whole batch to complete.
    const order: number[] = [];
    const slow = deferred<void>();
    await Promise.all([
      mapWithConcurrency([0, 1, 2], 2, async n => {
        if (n === 0) {
          await slow.promise;
        }
        order.push(n);
        return n;
      }),
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        order.push(-1); // marks "item 2 should have started by now"
        slow.resolve();
      })(),
    ]);
    assert.ok(order.indexOf(1) < order.indexOf(-1), "item 1 should finish before the marker");
  });
});
