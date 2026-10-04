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
which version (*Missing*, *Installed v1.1.0*, *Outdated*), and offers one way to install it:

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

Until the pack is in the Comfy Registry, the Manager installs it from its Git URL
(`https://github.com/doodersrage/castcut-nodes`). Recent ComfyUI-Manager versions (3.41 and later) only
install from a Git URL when **both** of these are true:

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

**Comfy Registry** (once published): ComfyUI-Manager → search *Castcut nodes*, or
`comfy node install castcut-nodes`.

**Docker**: copy the file into the container's `custom_nodes` (or onto the volume mounted
there) and restart the container.

Check it worked: `http://<comfyui>:8188/object_info/CastcutPoseScore` returns the node, and the
card shows *Installed v1.1.0*.

## Updating

The card compares the installed version (each node's description ends with
`[castcut-nodes 1.1.0]`) with the version this app ships. *Outdated* means a newer one came with
the app: install again the same way — copying the file over the old one, `git pull` in a clone, or
the Manager. A copy from before version 1.1.0 shows as *Installed (an older version)*.

Use one install, not two: a `castcut_nodes.py` file and a `castcut` folder in `custom_nodes` both
load and the later one wins.

## For maintainers

The pack's source, tests and Comfy Registry metadata (`pyproject.toml`) live in
[`comfyui-nodes/castcut`](https://github.com/doodersrage/castcut/tree/main/comfyui-nodes/castcut).
`scripts/castcut-nodes-release.sh <dir>` copies it into a standalone folder ready to become its
own repository and be published (`comfy node publish`). When a node changes, bump
`CASTCUT_VERSION` in `castcut_nodes.py`, `version` in `pyproject.toml` and
`CASTCUT_NODES_BUNDLED_VERSION` in `src/lib/castcut-nodes-setup.ts` together — the Python and
TypeScript tests check they agree.
