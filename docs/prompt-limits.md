# Prompt size limits

Limits are enforced per **model × detail** combination. See also [Supported models](https://github.com/doodersrage/castcut/blob/main/README.md#supported-models) in the main README.

Limits are enforced per **model × detail** combination. All models have Concise / Balanced / Rich presets; long-form models also enforce `minChars`:

| Detail   | Qwen-Image-Edit | Edit-2511  | Image-2512         | Image-2.0           | FLUX.2 Klein       | SDXL       | SD1.5      |
| -------- | --------------- | ---------- | ------------------ | ------------------- | ------------------ | ---------- | ---------- |
| Concise  | ~280 chars      | ~220 chars | ~320 chars         | ~400 chars          | ~250 chars         | ~280 chars | ~220 chars |
| Balanced | ~520 chars      | ~420 chars | ~380–650 chars     | ~550–800 chars      | ~450–700 chars     | ~520 chars | ~380 chars |
| Rich     | ~920 chars      | ~680 chars | **700–1000 chars** | **1100–1400 chars** | **900–1200 chars** | ~780 chars | ~520 chars |

Other families use limits tuned to their encoder (see `src/lib/comfy-models/limits.ts`).
