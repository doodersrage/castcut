import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "../browser-storage";
import {
  inferWorkflowGraphKind,
  mergeInferredModels,
  suggestMediaCustomTokens,
} from "./graph-kind";
import { importComfyWorkflowPack } from "./pack-import";
import { AUDIO_SECONDS_TOKEN, MESH_RESOLUTION_TOKEN } from "../audio-mesh-prompt";
import { buildZipBlob } from "../gallery/zip-export";
import { readZipTextEntries } from "../zip-read";
import { applyWorkflowNodeBindings } from "./apply-bindings";
import { suggestWorkflowNodeMappings } from "./node-mapper";
import {
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  DEFAULT_INIT_IMAGE_TOKEN,
} from "../comfyui/config";
import { prepareWorkflowJsonImport } from "./import";
import { loadComfyWorkflowFiles } from "../comfyui/workflow-files";

function withMockLocalStorage(run: () => void | Promise<void>): Promise<void> {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      indexedDB: undefined,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset: {} } },
  });
  return Promise.resolve()
    .then(() => run())
    .finally(() => {
      if (originalWindow === undefined) {
        // @ts-expect-error test cleanup
        delete globalThis.window;
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      }
      if (originalDocument === undefined) {
        // @ts-expect-error test cleanup
        delete globalThis.document;
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      }
    });
}

const audioApiJson = JSON.stringify({
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "x.safetensors" } },
  "2": {
    class_type: "CLIPTextEncode",
    inputs: { text: "rain on tin", clip: ["1", 1] },
  },
  "3": { class_type: "SaveAudio", inputs: { audio: ["2", 0], filename_prefix: "a" } },
});

const meshApiJson = JSON.stringify({
  "1": { class_type: "LoadImage", inputs: { image: "ref.png" } },
  "2": { class_type: "Hunyuan3D", inputs: { image: ["1", 0] } },
  "3": { class_type: "SaveGLB", inputs: { mesh: ["2", 0] } },
});

describe("workflow pack import", () => {
  beforeEach(async () => {
    await withMockLocalStorage(() => resetBrowserStorageCache());
  });
  afterEach(async () => {
    await withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it("detects audio/mesh/video graph kinds from class_type", () => {
    assert.equal(inferWorkflowGraphKind(audioApiJson), "audio");
    assert.equal(inferWorkflowGraphKind(meshApiJson), "mesh");
    assert.equal(
      inferWorkflowGraphKind(
        JSON.stringify({
          "1": { class_type: "EmptyHunyuanLatentVideo", inputs: {} },
          "2": { class_type: "SaveAnimatedWEBP", inputs: {} },
        }),
      ),
      "video",
    );
  });

  it("suggests media custom tokens for audio and mesh", () => {
    const audioTokens = suggestMediaCustomTokens(audioApiJson);
    assert.ok(audioTokens.some((token) => token.token === AUDIO_SECONDS_TOKEN));
    const meshTokens = suggestMediaCustomTokens(meshApiJson);
    assert.ok(meshTokens.some((token) => token.token === MESH_RESOLUTION_TOKEN));
  });

  it("merges graph defaults with label models", () => {
    assert.deepEqual(mergeInferredModels([], "audio"), ["stable-audio"]);
    assert.ok(mergeInferredModels(["wan-video"], "video").includes("wan-video"));
  });

  it("imports API JSON and maps audio model", async () => {
    await withMockLocalStorage(async () => {
      const result = await importComfyWorkflowPack(
        [{ name: "stable-audio-pack.json", text: audioApiJson }],
        { autoMapModels: true },
      );
      assert.equal(result.created, 1);
      assert.equal(result.imported[0]?.ok, true);
      assert.equal(result.imported[0]?.kind, "audio");
      assert.ok(result.imported[0]?.inferredModels.includes("stable-audio"));
      assert.ok(
        result.imported[0]?.workflow?.customTokens?.some(
          (token) => token.token === AUDIO_SECONDS_TOKEN,
        ),
      );
    });
  });

  it("reads workflow JSON out of a store-only zip", async () => {
    const blob = buildZipBlob([
      {
        filename: "workflows/mesh.json",
        data: new TextEncoder().encode(meshApiJson),
      },
    ]);
    const buffer = await blob.arrayBuffer();
    const entries = await readZipTextEntries(buffer);
    assert.equal(entries.length, 1);
    assert.match(entries[0]!.filename, /mesh\.json$/);

    await withMockLocalStorage(async () => {
      const result = await importComfyWorkflowPack(
        [{ name: "mesh-pack.zip", buffer }],
        { autoMapModels: true },
      );
      assert.equal(result.created, 1);
      assert.equal(result.imported[0]?.kind, "mesh");
    });
  });

  it("soft-binds video length, fps, and init image on import bindings", () => {
    const workflow = {
      "1": {
        class_type: "EmptyHunyuanLatentVideo",
        inputs: { width: 832, height: 480, length: 81 },
      },
      "2": {
        class_type: "SaveAnimatedWEBP",
        inputs: { images: ["1", 0], fps: 16, filename_prefix: "v" },
      },
      "3": {
        class_type: "LoadImage",
        _meta: { title: "Init Image" },
        inputs: { image: "start.png" },
      },
    };
    const json = JSON.stringify(workflow);
    const mappings = suggestWorkflowNodeMappings(json);
    const applied = applyWorkflowNodeBindings(json, mappings, {
      positive: DEFAULT_POSITIVE_TOKEN,
      negative: DEFAULT_NEGATIVE_TOKEN,
    });
    assert.match(applied.json, new RegExp(`"length": "${DEFAULT_VIDEO_FRAMES_TOKEN}"`));
    assert.match(applied.json, new RegExp(`"fps": "${DEFAULT_VIDEO_FPS_TOKEN}"`));
    assert.match(applied.json, new RegExp(`"image": "${DEFAULT_INIT_IMAGE_TOKEN}"`));
  });

  it("soft-binds audio seconds and mesh resolution fields", () => {
    const audio = applyWorkflowNodeBindings(
      JSON.stringify({
        "1": {
          class_type: "StableAudioSampler",
          inputs: { seconds: 10, seed: 1 },
        },
      }),
      [],
      { positive: DEFAULT_POSITIVE_TOKEN, negative: DEFAULT_NEGATIVE_TOKEN },
    );
    assert.match(audio.json, new RegExp(`"seconds": "${AUDIO_SECONDS_TOKEN}"`));

    const mesh = applyWorkflowNodeBindings(
      JSON.stringify({
        "1": {
          class_type: "Hunyuan3D",
          inputs: { resolution: 512, image: ["2", 0] },
        },
      }),
      [],
      { positive: DEFAULT_POSITIVE_TOKEN, negative: DEFAULT_NEGATIVE_TOKEN },
    );
    assert.match(mesh.json, new RegExp(`"resolution": "${MESH_RESOLUTION_TOKEN}"`));
  });

  it("persists lastOptimizedHash on pack import", async () => {
    await withMockLocalStorage(async () => {
      const prepared = prepareWorkflowJsonImport(audioApiJson, undefined, {
        name: "stable-audio-pack.json",
        filename: "stable-audio-pack.json",
      });
      assert.ok(prepared.ok);
      assert.ok(prepared.contentHash);

      const result = await importComfyWorkflowPack(
        [{ name: "stable-audio-pack.json", text: audioApiJson }],
        { autoMapModels: true },
      );
      assert.equal(result.created, 1);
      const files = loadComfyWorkflowFiles();
      const saved = files.find((file) => file.id === result.imported[0]?.workflow?.id);
      assert.ok(saved?.lastOptimizedHash);
      assert.equal(saved?.lastOptimizedHash, prepared.contentHash);
      assert.ok(saved?.lastOptimizedModel);
    });
  });
});
