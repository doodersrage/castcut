import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("continueEditResultProps", async () => {
  const { continueEditResultProps } = await import("./continue-edit-result-props");

  function makeActions() {
    return {
      comfyUiPreviewUrl: "https://example.com/preview.png",
      improveOutput: mock.fn(),
      refineOutput: mock.fn(),
      inpaintOutput: mock.fn(),
      outpaintOutput: mock.fn(),
      composeOutput: mock.fn(),
      videoOutput: mock.fn(),
      controlNetOutput: mock.fn(),
      sendSeedVariationBatch: mock.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("wires each continue-edit callback to the matching action with output + preview", () => {
    const actions = makeActions();
    const props = continueEditResultProps(actions, "the output text");

    props.onImprove();
    assert.deepEqual(actions.improveOutput.mock.calls[0].arguments, [
      "the output text",
      "https://example.com/preview.png",
    ]);

    props.onRefine();
    assert.deepEqual(actions.refineOutput.mock.calls[0].arguments, [
      "the output text",
      "https://example.com/preview.png",
    ]);

    props.onContinueInpaint();
    assert.equal(actions.inpaintOutput.mock.calls.length, 1);

    props.onContinueOutpaint();
    assert.equal(actions.outpaintOutput.mock.calls.length, 1);

    props.onContinueCompose();
    assert.equal(actions.composeOutput.mock.calls.length, 1);

    props.onContinueVideo();
    assert.equal(actions.videoOutput.mock.calls.length, 1);

    props.onContinueControlNet();
    assert.equal(actions.controlNetOutput.mock.calls.length, 1);
  });

  it("includes a seed-batch action by default, defaulting the count to 3", () => {
    const actions = makeActions();
    const props = continueEditResultProps(actions, "out");
    assert.equal(props.seedBatchLabel, "Queue 3 seed variants");
    assert.ok("onQueueSeedBatch" in props);

    props.onQueueSeedBatch!();
    assert.deepEqual(actions.sendSeedVariationBatch.mock.calls[0].arguments, [
      "out",
      3,
      undefined,
      undefined,
    ]);
  });

  it("honors a custom seedBatchCount and passes queueImageOptions through", () => {
    const actions = makeActions();
    const queueImageOptions = { foo: "bar" };
    const props = continueEditResultProps(actions, "out", {
      seedBatchCount: 7,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queueImageOptions: queueImageOptions as any,
    });
    assert.equal(props.seedBatchLabel, "Queue 7 seed variants");

    props.onQueueSeedBatch!();
    assert.deepEqual(actions.sendSeedVariationBatch.mock.calls[0].arguments, [
      "out",
      7,
      undefined,
      queueImageOptions,
    ]);
  });

  it("omits the seed-batch action when includeSeedBatch is false", () => {
    const actions = makeActions();
    const props = continueEditResultProps(actions, "out", { includeSeedBatch: false });
    assert.equal("onQueueSeedBatch" in props, false);
    assert.equal("seedBatchLabel" in props, false);
  });
});
