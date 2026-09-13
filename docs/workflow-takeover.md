# Workflow takeover

How Castcut patches ComfyUI workflows at queue time.

Community ComfyUI workflows rarely match this app’s model picker, sampler defaults, or edit/inpaint image inputs out of the box. **Workflow takeover** applies a consistent queue-time pipeline so imported JSON behaves like a first-class template:

```
Target model + tool → resolveRuntimeForQueue
  → resolveQueueParams (quality profile, checkpoint/upscale maps)
  → optimizeWorkflowForQueue (auto-bind placeholders)
  → enrichWorkflowGraph (ModelSamplingFlux, Lanczos upscale on Final/Max)
  → injectPromptsWithFallbacks (tokens + direct patch + KSampler patch)
  → POST /api/comfyui → gallery entry (stores queueParams + queueQualityProfile)
```

### Placeholders

Standard tokens: `{{POSITIVE}}`, `{{NEGATIVE}}`, `{{SEED}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{CFG}}`, `{{STEPS}}`, `{{DENOISE}}`, `{{INPUT_IMAGE}}`, `{{MASK_IMAGE}}`.

Video tokens (WAN Video / Hunyuan Video, patched from the **Video** tool's optional init image + frames/FPS fields):

| Token              | Typical target                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `{{INIT_IMAGE}}`   | `LoadImage` feeding an I2V node's start-frame input — resolves to the same uploaded/fetched filename as `{{INPUT_IMAGE}}` |
| `{{VIDEO_FRAMES}}` | Frame count / length, e.g. `EmptyHunyuanLatentVideo.length`                                                               |
| `{{VIDEO_FPS}}`    | Output frame rate, e.g. `SaveAnimatedWEBP.fps`                                                                            |

These are only injected when the Video tool has a value for that field — add them to your library workflow's nodes and they'll be patched at queue time like any other placeholder. **Scaffold for model** in the workflow library builds a starter WAN/Hunyuan Video graph with all three wired in when `wan-video` / `hunyuan-video` is the selected model.

Loader / upscale tokens (patched directly even when placeholders are missing, when **Direct workflow patching** is enabled):

| Token               | Settings source                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `{{CHECKPOINT}}`    | **Settings → Checkpoint map** (also sets UNET when no separate UNET map)                                |
| `{{UNET}}`          | Checkpoint map, registry hints (FLUX Klein), or custom tokens                                           |
| `{{VAE}}`           | **VAE map**, category defaults (`flux2-vae.safetensors` for FLUX), or custom tokens                     |
| `{{UPSCALE_MODEL}}` | **Upscale model map** (optional) — neural UpscaleModel on Final/Max when set; otherwise Lanczos upscale |

Loader placeholders are replaced at queue time via token injection and direct patching. Use **Settings → Merge suggested loader maps** to fill checkpoint/VAE/refiner defaults for common models (your entries win). If ComfyUI reports `value_not_in_list` for `{{UNET}}` or `{{VAE}}`, add the exact filename from the error’s allowed list to the checkpoint or VAE map.

Use **Optimize & save copy** in the workflow library to persist auto-bound placeholders on community JSON.

### Queue quality profiles

| Profile            | Effect                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Follow sidebar** | Uses your sampler preset + resolution tier from Settings                                                                                  |
| **Draft**          | Faster sampler tier, smaller resolution                                                                                                   |
| **Final**          | Optimized sampler, medium+ resolution, SDXL refiner pass (latent upscale), optional neural UpscaleModel or 1.25× Lanczos before SaveImage |
| **Max**            | Max-quality sampler/resolution, SDXL refiner at higher denoise, neural upscale + 1.05× Lanczos polish (sharpen off by default)            |

Loader precision: queue injection detects **fp8 vs bf16** from existing workflow loaders and resolves `{{UNET}}`/`{{CHECKPOINT}}` to the matching tier (defaults to bf16 when unknown).

- Sidebar chips on each tool page override the global default for that session.
- **Settings → Per-tool queue quality** sets persistent overrides (Generate, Variations, Refine, etc.).
- Gallery entries store the profile used at queue time; **Upscale (Final/Max)**, **New variation (Final/Max)**, and sidecar import restore or override it. Derived entries record lineage (`upscaled from prior`, etc.).

### Settings toggles (Workflow patching & checkpoints)

| Toggle                             | Purpose                                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct workflow patching           | Patch `EmptyLatentImage`, loaders, LoadImage/Mask, UpscaleModel without placeholders                                                                                                                     |
| Optimize workflows on queue        | Auto-bind missing placeholders before injection                                                                                                                                                          |
| Insert model-sampling nodes        | Add `ModelSamplingFlux` / shift nodes when loader → KSampler is direct                                                                                                                                   |
| Auto improve on 4–5★               | Final-quality improve: upscale (same pixels); Rapid AIO → moiré clean; Lightning → re-queue new seed (on by default). When enabled, mutate/seed-experiment toggles only run if this path fails or is off |
| Auto improve on 5★                 | Max-quality improve (same model-aware paths as above; neural upscale falls back to Lanczos when the mapped file is missing)                                                                              |
| Auto img2img refine on 5★          | Optional low-denoise refine after 5★ upscale (experimental, off by default; skipped for Lightning and Rapid AIO)                                                                                         |
| Subtle sharpen after upscale (Max) | Optional ImageSharpen — off by default to avoid waxy skin                                                                                                                                                |
| WebSocket progress                 | On by default — faster gallery job status via ComfyUI WebSocket                                                                                                                                          |

Gallery **5★** auto-improve is model-aware: standard models upscale, Rapid AIO runs moiré clean, Lightning re-queues a Final/Max seed. Set an upscale model map entry only when that file exists in ComfyUI; missing entries fall back to Lanczos automatically.

Use **Optimize all in library** (Settings → workflow library) after importing community JSON so placeholders bind to your checkpoint/VAE filenames.

Gallery card menus separate **Upscale** (same pixels), **Refine** (low-denoise img2img), **Clean moiré** (Rapid AIO), and **New variation** (new seed). Bulk actions from multi-select → Queue adapt labels to the selection.

Preflight and **Workflow configuration** on gallery entries show unresolved tokens and the stored/effective params.
