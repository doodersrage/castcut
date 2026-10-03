import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseComfyObjectInfoModelLists } from "./comfyui-object-info";

describe("comfyui-object-info", () => {
  it("parses checkpoint and upscale lists from object_info shape", () => {
    const lists = parseComfyObjectInfoModelLists({
      CheckpointLoaderSimple: {
        input: {
          ckpt_name: [["a.safetensors", "b.safetensors"], {}],
        },
      },
      UpscaleModelLoader: {
        input: {
          model_name: [["4x-UltraSharp.pth"], {}],
        },
      },
    });
    assert.deepEqual(lists.checkpoints, ["a.safetensors", "b.safetensors"]);
    assert.deepEqual(lists.upscaleModels, ["4x-UltraSharp.pth"]);
    assert.deepEqual(lists.clips, []);
    assert.deepEqual(lists.dualClipTypes, []);
    assert.deepEqual(lists.clipLoaderTypes, []);
    assert.deepEqual(lists.loras, []);
    assert.deepEqual(lists.controlNets, []);
  });

  it("reads combo lists nested under input.required (live ComfyUI shape)", () => {
    const lists = parseComfyObjectInfoModelLists({
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [["dream.safetensors"], {}],
          },
        },
      },
      LoraLoader: {
        input: {
          required: {
            lora_name: [["style.safetensors", "lightning.safetensors"], {}],
          },
        },
      },
      LoraLoaderModelOnly: {
        input: {
          required: {
            lora_name: [["lightning.safetensors", "extra.safetensors"], {}],
          },
        },
      },
    });
    assert.deepEqual(lists.checkpoints, ["dream.safetensors"]);
    assert.deepEqual(lists.loras, [
      "style.safetensors",
      "lightning.safetensors",
      "extra.safetensors",
    ]);
  });

  it("merges UnetLoaderGGUF filenames into the UNET inventory", () => {
    const lists = parseComfyObjectInfoModelLists({
      UNETLoader: {
        input: {
          unet_name: [["flux1-dev.safetensors"], {}],
        },
      },
      UnetLoaderGGUF: {
        input: {
          unet_name: [["flux1-dev-Q4_K_S.gguf"], {}],
        },
      },
    });
    assert.deepEqual(lists.unets, [
      "flux1-dev.safetensors",
      "flux1-dev-Q4_K_S.gguf",
    ]);
  });
});

describe('combo inputs in every ComfyUI shape', () => {
  it('reads the classic, current ("COMBO") and options-object forms', async () => {
    const { readComboOptionList } = await import('./comfyui-combo');
    assert.deepEqual(readComboOptionList([['a.pth', 'b.pth'], {}]), ['a.pth', 'b.pth']);
    assert.deepEqual(
      readComboOptionList(['COMBO', { multiselect: false, options: ['4x-UltraSharp.pth'] }]),
      ['4x-UltraSharp.pth']
    );
    assert.deepEqual(readComboOptionList({ options: ['x'] }), ['x']);
    assert.deepEqual(readComboOptionList(['INT', { default: 1 }]), []);
  });

  it('finds upscale models listed in the current form', async () => {
    const { parseComfyObjectInfoModelLists } = await import('./comfyui-object-info');
    const lists = parseComfyObjectInfoModelLists({
      UpscaleModelLoader: {
        input: {
          required: { model_name: ['COMBO', { multiselect: false, options: ['4x-UltraSharp.pth'] }] },
        },
      },
    } as never);
    assert.deepEqual(lists.upscaleModels, ['4x-UltraSharp.pth']);
  });
});
