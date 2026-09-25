# Troubleshooting

Common failures, where to click, and what to check in Settings or `.env.local`. Queue failure playbooks in the app mirror many of these routes automatically.

Jump to: [Heal & ComfyUI](#heal-comfyui) · [Queue & VRAM](#queue-vram) · [LLM & vision](#llm-vision) · [Auth & email](#auth-email) · [Play funnel](#play-funnel) · [Storage](#storage)

---

## Heal & ComfyUI {#heal-comfyui}

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Tools show “ComfyUI unreachable” | Wrong URL, Comfy down, firewall | Settings → ComfyUI → **Connection**; run **Heal & ready** on Overview |
| `object_info` / missing node errors | Custom nodes not installed | Heal installs via ComfyUI-Manager; or Settings → **Workflow map** → install pack |
| Jobs stuck “waiting for output” | Slow GPU, orphan queue | Open **Queue** — claim orphans, import history, retry |
| Half-healed / restart timeout | Host still booting | Overview heal again; check Comfy logs |
| Wrong host picked in pool | Pool order / sticky host | Settings → ComfyUI → cluster hosts; use **Retry on another host** on failed jobs |

!!! note "SSRF hardening"
    Production: set `COMFYUI_ALLOW_CLIENT_URL=false` and pin `COMFYUI_API_URL` or pool — see [configuration](configuration.md).

---

## Queue & VRAM {#queue-vram}

| Symptom | In-app playbook | Settings / action |
| --- | --- | --- |
| CUDA OOM / out of memory | Gallery or Queue **Retry as Draft/Final**; VRAM guide link | Settings → ComfyUI → **VRAM guard**; lower quality profile |
| LoRA / checkpoint not found | **Remap loaders**, **Retry without LoRAs** | Settings → **Model assets** / **LoRA library** |
| Inpaint mask missing | **Open Inpaint** guide | Draw or upload mask before queue |
| Batch partial failure | **Open Queue** | Retry failed rows; check status message clusters in Gallery (error filter) |
| Identity / LoadImage missing | Connection guide | Re-upload refs; check pinned host paths |

Failed job recovery banner on Gallery (`?status=error`) groups errors and offers one-click fixes.

---

## LLM & vision {#llm-vision}

| Symptom | Fix |
| --- | --- |
| Generate returns rules fallback only | Set `LLM_API_BASE_URL` + `LLM_MODEL` in `.env.local`; Settings → LLM session override |
| Image → Prompt / Refine vision fails | Set `LLM_VISION_MODEL` (must support vision); not text-only |
| Scan with vision errors | Same as above; uploads use JSON data URLs by default |
| Slow or rate-limited | Check LLM provider; enable backpressure settings if configured |

---

## Auth & email {#auth-email}

| Symptom | Fix |
| --- | --- |
| Login 404 / disabled | `PROMPT_AUTH_ENABLED=true`; create users under `PROMPT_DATA_DIR/auth/` |
| Invite link points at localhost | Set `PROMPT_API_URL` to public origin |
| SMTP test fails | Settings → Users → SMTP or `PROMPT_SMTP_*` + `PROMPT_EMAIL_FROM` |
| API 401 from Comfy nodes | Set `PROMPT_API_TOKEN`; nodes send `Authorization: Bearer` |

See [configuration — production checklist](configuration.md#production-checklist).

---

## Posing looks wrong (stance ignored, wireframe bleed) {#pose-guide}

Day and Story stills get their stance from an **Image 3 pose guide** — an OpenPose keypoint map
(or, with **Settings → Prompt quality → Pose guide style → Legacy capsules**, the older colored
mannequin) drawn on a canvas in your browser, uploaded to ComfyUI, and attached as the third
image. Open **Show pose guides** under the status line to see exactly what each slot sent. With
more than one person, the prompt names the Cast lead by position ("the lower (underneath)
skeleton") because OpenPose colors mark limbs, not people. When that guide does not
arrive, the still keeps the pose of the Image 1 plate, which looks like "the beat was ignored"
and like "every slot has the same pose".

The Day status strip (under the slot board, desk and phone) now says what happened after each
queue:

| Line | Meaning | What to do |
| --- | --- | --- |
| `Pose guide (OpenPose) attached on 4 of 4 slots.` | Image 3 reached the queue for every slot | Posing problems are prompt/model quality, not plumbing. If the map itself looks wrong in **Show pose guides**, the beat text picked the wrong layout |
| `Pose guide failed on … — <reason>` | The canvas render or the ComfyUI upload threw | Check the reason; most are ComfyUI upload failures (offline, auth, wrong URL). Full error is in the browser console |
| `Pose guide attached on a non-Edit model (…)` | The guide went to a text-to-image model | Switch the Day engine to an Edit model — a T2I model copies the wireframe into the still instead of reading it as a pose |
| `Pose guide off on … — Lightning identity path…` | Legacy style only: Edit-2511 Lightning keeps Image 1 whole and takes stance from prompt text, because the legacy art leaked there | Switch Pose guide style back to OpenPose, which attaches on Lightning |
| `Pose guide off on … — no Day plate` | No plate is set, so there is nothing to pose | Set a Day plate (Look or Outfit Keep) |

Story logs the same failures to the browser console (`Story pose guide could not be attached: …`),
and each Story beat card has a **Pose guide** drawer showing the guide its latest still used.

### Did the still follow its guide? (pose check)

**Settings → ComfyUI → Heal & ready** shows a **Play checks** list — pose check (DWPose), face
check (FaceAnalysis) and Cut titles (server ffmpeg + font) — with the pack to install for any
that are off and a **Re-check** button. Day shows the same summary under the chips while
Auto-review is on. After installing a pack, restart ComfyUI, Re-check, then reload Day / Story.

With **Auto-review stills** on and the **comfyui_controlnet_aux** node pack installed in ComfyUI
(it provides `DWPreprocessor`), Day reads the body pose back out of every finished still and
scores it against the guide it was sent: `pose match 82%` in the review line. Below 60% the
slot is requeued with a "match the Image 3 skeleton" fix. If the pack is missing, the review
line says `Pose check off: DWPose not installed…` and everything else keeps working.

Each score is also logged per guide style, and **Film loop → Pose match by guide** shows the
average and miss rate for OpenPose, OpenPose + hands and Legacy. Run a few Days in each style
and switch to the one with the higher match.

Story runs the same check on every still that was queued with a guide and shows `Pose match …%`
on the beat card; under 60% it suggests **Retry**, which draws a reseeded / mirrored variant.
You can also seed the library yourself: **Settings → Prompt quality → Import pose as … from
photo** reads the pose from any picture and files it under the layout you pick.

Two starting values are uncalibrated: the 60% gate, and the 80% bar at which a kept still's
detected pose is saved to the **pose library** (Settings → Prompt quality shows the count and
can clear it). Library poses are real rendered bodies; later guides for the same layout
sometimes draw one instead of the hand-placed mannequin, and every other reroll does.

### Stance ignored on Qwen Image Edit 2511 (incl. Lightning)

Edit-2511 anchors the body pose from **Image 1**, and everyday Day stills keep the whole standing
Outfit Keep plate as Image 1 — so the plate's catalog stance could win even with a pose guide
attached, intermittently. Everyday prompts now lead with the slot's **Beat** (the baseline pose is
only the fallback for a vague beat) and add an explicit instruction to discard the plate's standing
stance on Edit-2511 models. If a slot still freezes, give the beat a concrete stance
("leaning on the rail, hip cocked") rather than a mood ("relaxed morning").

### Three of four stills come back standing

Beat selection used to de-duplicate beat *text* without looking at posture, and the everyday
pools were mostly upright actions — four different beats could all be "standing near something".
Beats are now spread across postures (seated, crouching, kneeling, lying, leaning, walking,
dancing, upright) so a four-slot day gets at least three distinct stances, and the pools carry
enough non-upright options to spread into. If a slot still freezes, write the beat with a
concrete posture verb the pose guide recognises — sit, crouch, kneel, lie, lean, stride — rather
than a mood.

### The Cast keeps the plate's pose

Qwen Image Edit 2511 (including Lightning) takes body pose from **Image 1**, and everyday Day
stills put the whole standing Outfit Keep plate there. Prompt wording alone does not beat that;
the identity lock does, because a high IP-Adapter strength carries composition as well as the
face. When a beat needs a posture the plate cannot supply (seated, crouching, kneeling, lying,
leaning, walking), Day now drops the identity lock to 0.22 and raises denoise — the same trick
Vacation and Suggestive already used. Standing gestures (waving, sipping, pockets) are left
alone, since they cost identity for nothing.

The **Pose over plate** chip under the slot board turns this off. Do that if faces drift more
than the posing is worth; the trade is real, which is why it is a chip and not a constant.

### A posture beat still renders standing

The Image 3 guide matches a hand-gesture layout (phone, reading, drinking, waving) before it
matches a body posture. A stated posture now wins the body while the gesture keeps the arms, so
"lying across the bed scrolling a phone" draws a lying figure. If a beat still renders upright,
check it names a posture the guide knows — sit, seated, perched, crouch, bend down, kneel, lie,
sprawl, recline, lean against, foot up on, climbing the stairs.

### Background drops out to white

A white pose guide (Image 3) or clothing packshot (Image 2) can be copied as the scene background.
The ban that prevents this was previously applied only on Suggestive / Vacation / Sport / adult
moods; it now applies to every mood whenever a white reference image is attached. If it still
happens, check that the slot has a **Setting** — an empty Setting leaves nothing to put behind the
subject.

## Play funnel {#play-funnel}

| Symptom | Fix |
| --- | --- |
| Dashboard stall at **Outfit** | Open Outfit from stall CTA; Keep a try-on plate |
| Stall at **Cut** | Complete Day stills or Story beats; open Day → **Cut film** |
| **Cut film** disabled | Need at least one completed still in Day reel playlist |
| Metrics empty | Start Film (`/play`); metrics update on Film start / first cut |
| Resume wrong character | **Switch to resume character** on Play or re-import look pack |
| Share link too long | **Export JSON** instead of hash link |

Full walkthrough: [Play film guide](play-guide.md).

---

## Storage {#storage}

| Symptom | Fix |
| --- | --- |
| Settings lost after refresh | IndexedDB quota — Settings → **Data** tab; export backup |
| Gallery out of sync | Browser storage health; export gallery snapshot |
| Move to new machine | Settings → Overview → **Export backup**; restore on new install |

Studio backup v5 includes characters, campaigns, tool settings, and gallery pointers — see [operator — new machine](operator.md#new-machine).

---

## Still stuck?

1. **System tray** toasts often include a playbook link (VRAM, Workflow map, Queue, Inpaint).
2. **Command palette** (`Ctrl+K` / `⌘K`) → Heal & ready, open failed queue, jump to tool.
3. Open a [GitHub issue](https://github.com/doodersrage/castcut/issues) with the failed job `statusMessage` and ComfyUI version.
