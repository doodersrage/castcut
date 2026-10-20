import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceComfyTimestampMs,
  extractComfyExecutionTiming,
  formatRenderDuration,
  resolveGalleryRenderDurationMs,
  wallClockRenderDurationMs,
} from "./render-duration";

describe("comfyui render duration", () => {
  it("coerces second and millisecond epoch timestamps", () => {
    assert.equal(coerceComfyTimestampMs(1_700_000_000), 1_700_000_000_000);
    assert.equal(coerceComfyTimestampMs(1_700_000_000_000), 1_700_000_000_000);
    assert.equal(coerceComfyTimestampMs(12), undefined);
  });

  it("extracts execution_start → execution_success duration", () => {
    const timing = extractComfyExecutionTiming({
      messages: [
        ["execution_start", { timestamp: 1_700_000_000 }],
        ["execution_success", { timestamp: 1_700_000_125 }],
      ],
    });
    assert.equal(timing.renderDurationMs, 125_000);
    assert.equal(timing.executionStartedAt, 1_700_000_000_000);
    assert.equal(timing.executionEndedAt, 1_700_000_125_000);
  });

  it("uses wall-clock fallback when Comfy timing is absent", () => {
    assert.equal(
      wallClockRenderDurationMs({ queuedAt: 1000, completedAt: 4500 }),
      3500,
    );
    assert.equal(
      resolveGalleryRenderDurationMs({
        queuedAt: 1000,
        completedAt: 4500,
      }),
      3500,
    );
    assert.equal(
      resolveGalleryRenderDurationMs({
        renderDurationMs: 12_000,
        queuedAt: 1000,
        completedAt: 4500,
      }),
      12_000,
    );
  });

  it("formats compact duration labels", () => {
    assert.equal(formatRenderDuration(842), "842ms");
    assert.equal(formatRenderDuration(12_400), "12s");
    assert.equal(formatRenderDuration(192_000), "3m 12s");
    assert.equal(formatRenderDuration(3_725_000), "1h 2m 5s");
  });
});
