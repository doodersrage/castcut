# Models

What each part of Castcut needs in ComfyUI. Install them from **Settings → ComfyUI → Models**
(filter by the tool); **Settings → Overview → Play checks** says what is missing.

!!! tip "Start small"
    For a first film you need **one still engine** and **LTX-2.5** for clips. Add the rest
    when you want the tool.

## Stills — pick at least one

| Engine | Size | Good for |
| --- | --- | --- |
| **Qwen Rapid AIO** (SFW or NSFW v23) | 28 GB | Fastest stills; Intimate needs the NSFW one |
| **Qwen-Image-Edit 2511** + Lightning | 41 GB + 0.8 GB | The liveliest clothed stills; room photos (also on Rapid); shoe pictures |
| **Qwen-Image 2.1 Turbo** — the default when installed | 7.3 GB | Closest likeness, ~11 s a still. The Qwen team's own 8-step model (Qwen Research License) as one int8 checkpoint. If you already have the 14 GB 2.1 base + the 0.9 GB Turbo LoRA, that works too; Pruna 8-step and the full 30-step pass need the base |
| **Qwen-Image 2.1 Noct-Q** (uncensored) | 7.3 GB | Adult two-person stills: the pair actually connect where Turbo poses them side by side, and they stay on it (no Rapid hand-off). Turbo now leads a sex still with the recipe's placement, puts lying / bent pairs on a landscape canvas and turns him toward her from behind, which joins most lying and from-behind layouts; Noct-Q does the same for lying / bent pairs (not on Noct-Q Fast) and still connects more of the upright ones. Noctaluna's full 2.1 merge (V4 int8, non-commercial licence), same text encoder and VAE as 2.1. 35 steps, ~25–35 s a still. Clothed stills about level with Turbo |
| **Qwen-Image 2.1 Noct-Q Fast** (12-step, uncensored) | same file | Noct-Q's own pass (euler, shift 3) in 12 steps instead of 35: about half the time a still. Side by side with the full pass the stills match nearly frame for frame; two-person stills are a little smoother. Shows as installed whenever Noct-Q is |

*Optional, any Qwen-Image 2.1 engine:* **Qwen-Image 2.1 Fun ControlNet Union** (7.6 GB, models/controlnet, plus the T8
`Comfyui-Qwen-Image-2.1-Fun-Controlnet-Union-T8` node pack) for **Settings → ComfyUI → Prompt quality →
Stronger pose control (slower)**. With it on, a one-person pose you made (joint editor or a photo)
also steers the render: about 7 in 10 hard poses right instead of 5 in 10, at 2.5–3× the render
time. Off by default; without the file the setting says so and stills render as before.

## Clips

| What | Models | Size |
| --- | --- | --- |
| **Clips, talking clips, Add voice** | LTX-2.5 (5 files) — accept the terms on Hugging Face and set `HF_TOKEN` | ~40 GB |
| **Her kept voice** | LTX-2.3 ID-LoRA | 1.2 GB |
| **Two-person adult clips** | WAN Rapid AIO NSFW | 23 GB |
| **MiniMax-H3** *(optional, best motion)* | 5 files — licence excludes the US, EU, UK and South Korea | ~45 GB |

## Film

| What | Models | Size |
| --- | --- | --- |
| **Score this film** | ACE-Step 1.5 | 10 GB |
| **Room sound under talking** | castcut-nodes 1.7.0+ (a node pack) | — |
| **Face finish** | ComfyUI-ReActor + CodeFormer | small |

## Finishing tools

| Tool | Models | Size |
| --- | --- | --- |
| **Sharpen & smooth** · **Upscale to 4K** | SeedVR2 3B int8 + VAE (RIFE 4.26 for clips) | 4 GB |
| **Make more realistic** | WAN 2.2 T2V 14B low-noise fp8 (14.3 GB), Wan2.2-Lightning 4-step low-noise LoRA (1.2 GB), UMT5 fp8, Wan 2.1 VAE | 22 GB |
| **Copy moves** | Wan Animate 2 distilled int8, CLIP vision H, Wan 2.1 VAE, UMT5 | 25 GB |
| **Dance to music** | Wan-Dancer global + local, lightx2v LoRA, CLIP vision H, Wan 2.1 VAE, UMT5 | 46 GB |
| **Lip-sync** | Wan 2.1 I2V 480p fp8, InfiniteTalk (single; multi for two people), lightx2v LoRA, wav2vec2, UMT5 | 29–34 GB |
| **Relight** | Qwen-Edit Relight LoRA (+ a Rapid AIO checkpoint) | 0.2 GB |
| **Sketch** | A Rapid AIO checkpoint | — |

Shared files (UMT5, CLIP vision, the Wan 2.1 VAE, lightx2v) download once.

## Checks

| Check | Needs |
| --- | --- |
| Pose check, pose from a photo | **comfyui_controlnet_aux** (DWPose) |
| Face match, Face finish | **ComfyUI_FaceAnalysis** |
| Outfit, place, adult-age and Auto-review checks | A **vision LLM** — see [Install](install.md#3-connect-an-llm) |

**Heal & ready** installs the node packs for you.
