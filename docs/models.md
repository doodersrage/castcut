# Models

What each part of Castcut needs in ComfyUI. Install them from **Settings → ComfyUI → Models**
(filter by the tool); **Settings → Overview → Play checks** says what is missing.

!!! tip "Start small"
    For a first film you need **one still engine** and **LTX-2.5** for clips. Add the rest
    when you want the tool.

## Stills — pick at least one

| Engine | Size | Good for |
| --- | --- | --- |
| **Qwen Rapid AIO** (SFW or NSFW v23) | 28 GB | Fastest stills; Intimate / Raunchy need the NSFW one |
| **Qwen-Image-Edit 2511** + Lightning | 41 GB + 0.8 GB | The liveliest clothed stills; room photos (also on Rapid); shoe pictures |
| **Qwen-Image 2.1** + Turbo 8-step (or Pruna 8-step) — the default when installed | 14 GB + 0.9 GB | Closest likeness. Turbo is the Qwen team's own fast version (Qwen Research License) — sharper, and clean lying down where Pruna can melt |

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
