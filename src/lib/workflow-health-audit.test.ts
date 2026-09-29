import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditWorkflowLibraryHealth,
  summarizeWorkflowLibraryHealth,
  swapVersionInWorkflowName,
} from "./workflow-health-audit";

describe("workflow-health-audit", () => {
  it("accepts placeholders the queue fills and notes unknown ones", () => {
    const report = auditWorkflowLibraryHealth({
      workflowFiles: [
        {
          id: "wf-1",
          name: "Test workflow",
          workflowJson: JSON.stringify({
            "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{CHECKPOINT}}" } },
            "2": { class_type: "CLIPTextEncode", inputs: { text: "{{POSITIVE}}" } },
            "3": { class_type: "KSampler", inputs: { seed: "{{SEED}}", steps: "{{STEPS}}" } },
            "4": { class_type: "LoraLoader", inputs: { lora_name: "{{LORA_skin}}" } },
            "5": { class_type: "Custom", inputs: { value: "{{MY_THING}}" } },
          }),
          createdAt: 1753843200000,
        },
      ],
    });

    assert.equal(report.scanned, 1);
    const messages = report.issues.map((issue) => issue.message);
    assert.equal(report.issues.some((issue) => issue.severity === "error"), false);
    assert.ok(messages.some((message) => /Unknown placeholder \{\{MY_THING\}\}/.test(message)));
    assert.equal(messages.some((message) => /CHECKPOINT|POSITIVE|SEED|LORA_skin/.test(message)), false);
  });

  it("summarizes clean libraries", () => {
    const summary = summarizeWorkflowLibraryHealth({
      scanned: 2,
      healthy: 2,
      issues: [],
    });
    assert.match(summary, /2 workflow\(s\) look ready/);
  });

  it("flags workflows that have never been optimized", () => {
    const report = auditWorkflowLibraryHealth({
      workflowFiles: [
        {
          id: "wf-2",
          name: "Fresh import",
          workflowJson:
            '{"1":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"model.safetensors"}}}',
          createdAt: 1753843200000,
        },
      ],
    });

    assert.equal(report.scanned, 1);
    assert.ok(
      report.issues.some((issue) => /Not optimized yet/i.test(issue.message)),
    );
  });

  it("flags a workflow loader override that disagrees with the checkpoint map", () => {
    const report = auditWorkflowLibraryHealth({
      workflowFiles: [
        {
          id: "wf-rapid",
          name: "qwen-rapid-aio-nsfw-v21",
          workflowJson: JSON.stringify({
            "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{CHECKPOINT}}" } },
          }),
          createdAt: 1,
          customTokens: [{ token: "{{CHECKPOINT}}", value: "Qwen-Rapid-AIO-NSFW-v21.safetensors" }],
        },
      ],
      modelWorkflowMap: { "qwen-rapid-aio-edit-nsfw": "wf-rapid" },
      checkpointMap: { "qwen-rapid-aio-edit-nsfw": "Qwen-Rapid-AIO-NSFW-v23.safetensors" },
    });
    const issue = report.issues.find((entry) => entry.fix);
    assert.ok(issue);
    assert.match(issue.message, /overrides your checkpoint map/);
    assert.deepEqual(issue.fix, {
      token: "{{CHECKPOINT}}",
      value: "Qwen-Rapid-AIO-NSFW-v23.safetensors",
      name: "qwen-rapid-aio-nsfw-v23",
    });
  });

  it("renames only a matching version tag", () => {
    assert.equal(
      swapVersionInWorkflowName("rapid v21", "Rapid-AIO-v21.safetensors", "Rapid-AIO-v23.safetensors"),
      "rapid v23",
    );
    assert.equal(
      swapVersionInWorkflowName("rapid v21", "Rapid-AIO-v21.safetensors", "Other-v23.safetensors"),
      "rapid v21",
    );
  });
});
