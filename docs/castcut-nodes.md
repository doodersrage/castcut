# Castcut nodes for ComfyUI

An **optional** ComfyUI node pack that runs some of Castcut's checks inside the render job instead
of as separate ComfyUI calls. Everything works without it.

| With the pack | Without it |
| --- | --- |
| **Best of two for hard poses** (Day) renders both takes in one job: one model load, one encode, the pose check runs inside ComfyUI and the closer take is saved as the still, the other beside it. | Best of two queues the second take after the first and checks each one with a separate ComfyUI call. |
| **Cut-outs** (Isolate on white, plates) repair the matte and composite onto the fill in the same job. | The matte comes back to the app, is repaired there and composited in a second step. |

The pack is one Python file, `castcut_nodes.py`, using only what ComfyUI already has (numpy,
Pillow). It adds five nodes under the *Castcut* category: Pose Score, Pick Best, Face Distance,
Mask Repair and Report.

## Install from Castcut (easiest)

Open **Settings → ComfyUI → Castcut nodes**. The card says whether this ComfyUI has the pack and
which version (*Missing*, *Installed v1.4.0*, *Outdated*), and offers one way to install it:

- **ComfyUI-Manager is installed** → **Install with ComfyUI-Manager**. When it is done,
  **Restart ComfyUI…** restarts ComfyUI through the Manager. It asks first, because a restart stops
  whatever ComfyUI is rendering and empties its queue for everyone, and it stays disabled
  (*Wait for 2 jobs*) while ComfyUI has jobs running or waiting. The card then waits for ComfyUI to
  come back and checks again.
- **No Manager, or the Manager refuses** → a copy-paste command for the ComfyUI machine. The app
  reads ComfyUI's `/system_stats` (its start command, OS, Python) to find the `custom_nodes`
  folder and serves the file itself at `/api/castcut-nodes/file`. There are versions for curl and
  wget, Windows PowerShell (incl. the portable build), git, comfy-cli and Docker. Then restart
  ComfyUI and click **Check again**.

The Best of two switch on Day and the Play checks list in Settings link to the card when the
pack is missing.

### When ComfyUI-Manager says no

The pack is on the Comfy Registry as `castcut-nodes` (publisher `doodersrage`), so a Manager that
reads the Registry installs it by name. A Manager that installs it from its Git URL instead
(`https://github.com/doodersrage/castcut-nodes`) — recent versions, 3.41 and later — only does so
when **both** of these are true:

- `allow_git_url_install = true` under `[default]` in the Manager's `config.ini` — on current
  ComfyUI that is `ComfyUI/user/__manager/config.ini` (older ComfyUI:
  `ComfyUI/user/default/ComfyUI-Manager/config.ini`). It is read at start-up, so restart ComfyUI
  after changing it.
- ComfyUI listens on this machine only (`--listen 127.0.0.1`, or no `--listen`). With
  `--listen 0.0.0.0` Git-URL installs are always refused.

Restarting from the app needs the Manager's `security_level` at `normal` (the default) or lower.
If you would rather not change Manager settings, use the copy command: it needs nothing from the
Manager.

## Install by hand

Any one of these, then restart ComfyUI.

**Copy the file** (smallest). From the Castcut checkout:

```bash
# A ComfyUI system service (here /opt/comfyui):
sudo install -m 644 comfyui-nodes/castcut/castcut_nodes.py /opt/comfyui/custom_nodes/castcut_nodes.py
sudo systemctl restart comfyui

# A ComfyUI in your home folder:
cp comfyui-nodes/castcut/castcut_nodes.py ~/ComfyUI/custom_nodes/
```

Or fetch it from a running Castcut (`curl -fsSL http://<castcut>/api/castcut-nodes/file -o …`);
when the app has sign-in or `PROMPT_API_TOKEN` on, add
`-H "Authorization: Bearer <API key>"` (a personal key from Profile → API keys works).

**Windows portable**: put `castcut_nodes.py` in `ComfyUI_windows_portable\ComfyUI\custom_nodes\`.
No `python_embeded` packages are needed.

**ComfyUI-Manager → Install via Git URL**: `https://github.com/doodersrage/castcut-nodes` (see the
settings above). It clones the whole Castcut repository; its root `__init__.py` loads only the
node pack.

**Comfy Registry**: ComfyUI-Manager → search *Castcut nodes*, or `comfy node install castcut-nodes`
(published as version 1.1.0; 1.2.0 adds the routes below).

**Docker**: copy the file into the container's `custom_nodes` (or onto the volume mounted
there) and restart the container.

Check it worked: `http://<comfyui>:8188/object_info/CastcutPoseScore` returns the node, and the
card shows *Installed v1.4.0*. With 1.2.0, `http://<comfyui>:8188/castcut/info` answers too.

## Routes (1.2.0 – 1.4.0)

Besides the nodes, the pack adds a few HTTP routes to ComfyUI, so some checks no longer go
through the render queue:

- **Face checks answer right away.** The face match (identity score, partner and face-lock
  checks) and *finding the face* on a plate used to be queued as small graphs, which waited for
  the render in progress — 45–95 s on Edit 2511 for about half a second of work. They now run
  on the CPU inside ComfyUI, with the InsightFace model kept loaded, and give the same numbers
  (checked against the queued graphs on 12 stills: distances within 7×10⁻⁸, identical boxes).
- **No round trip for a still that is checked.** A finished still used to be downloaded and
  uploaded again as an input; ComfyUI now copies it itself, under the same name.
- **`object_info` only when something changed.** The app asks for a fingerprint of the node list
  and model files and refetches the ~8 MB `object_info` only when it moved.

- **1.3.0: pose checks and the Face finish probe too.** The pose read behind Auto-review and the
  pose checks runs DWPose on the CPU inside ComfyUI (~0.3 s a still, the same keypoints as the
  node), and Face finish's "which face is hers" probe runs with the face checks.
- **1.3.0: delete unused uploads.** Settings → ComfyUI → Input folder offers *Delete N files*
  after a scan. It asks first, scans again, deletes only what that scan offers, and the pack
  keeps anything younger than a day or named by a queued job. Without 1.3.0 you get the command
  as before.
- **1.3.0: health.** One call for the queue, free GPU memory and what the pack can check; the
  Castcut nodes card uses it instead of reading the whole queue.

- **1.4.0: two-person pose reads too.** The read that keeps a couple in contact as two bodies
  (person masks, each person alone, DWPose) runs in-process with the Impact Pack's own nodes and
  YOLO on the CPU, instead of a queued graph.
- **1.4.0: graphs without the picture.** Fix area, Face finish and the LoRA check read the
  graph a still was made with from its PNG; the pack sends only that text, not the ~1.5 MB file.
- **1.4.0: is it being used?** The Castcut nodes card shows what the pack answered since ComfyUI
  started (per check, with the average time) and how often the app had to fall back to the
  queue — run a Day and look there.

Without 1.2.0 (or when a route fails) everything works as before, through queued graphs. The
queue position of a waiting still now comes from ComfyUI's jobs list rather than the whole
queue, on any ComfyUI that has it (pack or not).

## Updating

The card compares the installed version (each node's description ends with
`[castcut-nodes 1.4.0]`) with the version this app ships. *Outdated* means a newer one came with
the app: install again the same way — copying the file over the old one, `git pull` in a clone, or
the Manager. A copy from before version 1.1.0 shows as *Installed (an older version)*.

Use one install, not two: a `castcut_nodes.py` file and a `castcut` folder in `custom_nodes` both
load and the later one wins.

## For maintainers

The pack's source, tests and Comfy Registry metadata (`pyproject.toml`) live in
[`comfyui-nodes/castcut`](https://github.com/doodersrage/castcut/tree/main/comfyui-nodes/castcut).
`scripts/castcut-nodes-release.sh <dir>` copies it into the standalone repository
([doodersrage/castcut-nodes](https://github.com/doodersrage/castcut-nodes)) that is published to the
Registry (`comfy node publish`). When a node changes, bump
`CASTCUT_VERSION` in `castcut_nodes.py`, `version` in `pyproject.toml` and
`CASTCUT_NODES_BUNDLED_VERSION` in `src/lib/castcut-nodes-setup.ts` together — the Python and
TypeScript tests check they agree.
