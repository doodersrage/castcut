# Replaying renders to compare changes

When you change a prompt line, a model or a LoRA, one better-looking picture proves nothing. Seeds
vary too much. `scripts/play-ab.mjs` replays real renders with one thing changed, on the same
seeds. It scores each face against the Cast's plate and writes a contact sheet, so you can tell a
real improvement from a lucky seed.

## What it needs

- A local ComfyUI with the models the renders used (and the ComfyUI_FaceAnalysis nodes for face
  scores).
- The renders to replay. Use output PNGs (ComfyUI embeds the graph in them) or API-format
  `.json` graphs. Their input images must still be in ComfyUI's input folder.

The ComfyUI queue is shared. `--client` tags your jobs so other people can tell them apart. The
script only adds jobs; it never cancels or clears anyone else's.

## A spec

```json
{
  "reference": "Castcut_00195_-cutout.png",
  "seeds": ["own", 4242],
  "original": true,
  "cases": [
    {
      "name": "lifted",
      "graph": "/home/me/ComfyUI/output/Castcut_07620_.png",
      "variants": {
        "today": {},
        "candid": {
          "replace": [["camera realism.", "camera realism. Candid photo taken on a phone…"]]
        },
        "detail-lora": {
          "nodes": {
            "950": {
              "class_type": "LoraLoaderModelOnly",
              "inputs": {
                "model": ["1", 0],
                "lora_name": "qwen21_detail_fix_v2.safetensors",
                "strength_model": 0.8
              }
            }
          },
          "inputs": { "7": { "model": ["950", 0] } }
        }
      }
    }
  ]
}
```

- **`seeds`**: each variant renders once per seed. `"own"` keeps the graph's own seed, which
  replays the render exactly as it was made.
- **`original`**: each row of the sheet starts with the render the graph came from.
- **Variant overrides**:
  - `replace`: prompt text, `[old, new]` pairs.
  - `latent`: `[width, height]`.
  - `steps`.
  - `inputs`: set a node's inputs; `null` removes one.
  - `nodes`: add nodes.

  An empty variant (`{}`) is the baseline. The summary compares every other variant against the
  first one.

## Run it

```bash
node scripts/play-ab.mjs spec.json --out play-ab-out/realism --client my-ab
```

The script writes these files to the `--out` folder:

- **`contact.jpg`**: one row per case and seed: the original, then one tile per variant, each
  labelled with its face distance.
- **`results.json`**: every job, with its prompt id, seed, file and face distance.
- **Each render as a PNG.**

It also prints the mean face distance per variant, and how often each variant beat the baseline
on the same seed.

Face distance is the cosine distance between InsightFace embeddings: lower is closer, and 100
means no face was found. Always look at the sheet too. A face score alone once picked a variant
that wore the wrong clothes.

## Keep what you learn

A comparison worth keeping goes in the plan or a report, with its spec and numbers:

- the task's notes in `IMPLEMENTATION_PLAN.md`;
- `docs/consistency-report.md`.

Examples: "kneeling face to face: side by side 3/3 before, facing each other 3/3 after";
"lamp-lit room on 2.1: pose and face held, 6 stills × 2 seeds".
