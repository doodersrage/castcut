import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { SettingsCache } from "./settings-cache";
import type { ComfyWorkflowFile } from "./comfyui-workflow-files";

let sharedSettings: SettingsCache["shared"] = {} as SettingsCache["shared"];
const loadSettingsCache = mock.fn(
  (): SettingsCache => ({ shared: sharedSettings, tools: {}, installedPlugins: [] }) as SettingsCache
);
mock.module("./settings-cache", { namedExports: { loadSettingsCache } });

let files: ComfyWorkflowFile[] = [];
const loadComfyWorkflowFiles = mock.fn((): ComfyWorkflowFile[] => files);
mock.module("./comfyui-workflow-files", { namedExports: { loadComfyWorkflowFiles } });

let resolvedFile: ComfyWorkflowFile | undefined;
const findLibraryFaceDetailerWorkflow = mock.fn((): ComfyWorkflowFile | undefined => resolvedFile);
mock.module("./workflow-library-face-detailer", { namedExports: { findLibraryFaceDetailerWorkflow } });

function workflowFile(overrides: Partial<ComfyWorkflowFile>): ComfyWorkflowFile {
  return {
    id: "wf-1",
    name: "Face Detailer",
    workflowJson: "{}",
    createdAt: 0,
    ...overrides,
  } as ComfyWorkflowFile;
}

describe("getFaceDetailerHealth", async () => {
  const { getFaceDetailerHealth } = await import("./face-detailer-health");

  it("reports 'ready' when a pinned workflow includes Impact FaceDetailer nodes", () => {
    sharedSettings = { modelWorkflowMap: { faceDetailer: "wf-pinned" } } as unknown as SettingsCache["shared"];
    files = [
      workflowFile({
        id: "wf-pinned",
        name: "Pinned Face Fixer",
        workflowJson: JSON.stringify({
          "1": { class_type: "FaceDetailer", inputs: {} },
        }),
      }),
    ];
    resolvedFile = undefined;

    const health = getFaceDetailerHealth();
    assert.deepEqual(health, {
      status: "ready",
      label: "Ready",
      workflowName: "Pinned Face Fixer",
      pinnedId: "wf-pinned",
      hasImpactNodes: true,
    });
  });

  it("reports 'partial' when the pin is only the LoadImage→SaveImage scaffold", () => {
    sharedSettings = { modelWorkflowMap: { faceDetailer: "wf-scaffold" } } as unknown as SettingsCache["shared"];
    files = [
      workflowFile({
        id: "wf-scaffold",
        name: "FaceDetailer scaffold",
        workflowJson: JSON.stringify({
          "1": { class_type: "LoadImage", inputs: { image: "{{FACE_DETAIL_IMAGE}}" } },
          "2": { class_type: "SaveImage", inputs: { images: ["1", 0] } },
        }),
      }),
    ];
    resolvedFile = undefined;

    const health = getFaceDetailerHealth();
    assert.equal(health.status, "partial");
    assert.match(health.label, /Impact Pack/i);
    assert.equal(health.hasImpactNodes, false);
  });

  it("reports 'missing' with a 'Missing pin' label when the pinned id has no matching file", () => {
    sharedSettings = { modelWorkflowMap: { faceDetailer: "wf-gone" } } as unknown as SettingsCache["shared"];
    files = [workflowFile({ id: "wf-other" })];
    resolvedFile = undefined;

    const health = getFaceDetailerHealth();
    assert.deepEqual(health, { status: "missing", label: "Missing pin", pinnedId: "wf-gone" });
  });

  it("reports 'detected' when no pin exists but a workflow is heuristically resolved", () => {
    sharedSettings = {} as SettingsCache["shared"];
    files = [];
    resolvedFile = workflowFile({ id: "wf-x", name: "Auto Face Fixer" });

    const health = getFaceDetailerHealth();
    assert.deepEqual(health, {
      status: "detected",
      label: "Detected",
      workflowName: "Auto Face Fixer",
      hasImpactNodes: false,
    });
  });

  it("trims a blank pinned id and falls through to heuristic detection", () => {
    sharedSettings = { modelWorkflowMap: { faceDetailer: "   " } } as unknown as SettingsCache["shared"];
    files = [];
    resolvedFile = workflowFile({ id: "wf-detected", name: "Detected Fixer" });

    const health = getFaceDetailerHealth();
    assert.deepEqual(health, {
      status: "detected",
      label: "Detected",
      workflowName: "Detected Fixer",
      hasImpactNodes: false,
    });
  });

  it("reports 'missing' with a plain 'Missing' label when there is no pin and no heuristic match", () => {
    sharedSettings = {} as SettingsCache["shared"];
    files = [];
    resolvedFile = undefined;

    const health = getFaceDetailerHealth();
    assert.deepEqual(health, { status: "missing", label: "Missing" });
  });
});
