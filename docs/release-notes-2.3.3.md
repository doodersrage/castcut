# Castcut 2.3.3 — release notes

A patch on 2.3.2. Live progress and previews are back for the still that is rendering. Checks run inside ComfyUI with the **Castcut nodes 1.4.0** pack instead of waiting behind your renders. Setup says what is actually wrong. A batch of Day still fixes too: no third leg, no contradicting pose drawings, two men checked live, shoes on duos, and a simpler Settings page.

> ## Things to know
>
> - **Update the Castcut nodes pack to 1.4.0** (ComfyUI Manager or the Comfy Registry). Face checks, pose checks, the Face finish probe and two-person pose reads then run on the CPU inside ComfyUI, without queueing behind a render. An older pack still works: the app falls back to queued graphs and the Castcut nodes card counts how often.
> - **Two Settings options are gone.** *Also lock the pose with ControlNet* lost every A/B against the pose drawing in words. *Legacy capsules* was the old pose-guide style, and a saved legacy choice now reads as OpenPose. ControlNet itself is unchanged everywhere else.
> - **Some Day stills still come out looking painted.** These are mostly two-person stills in lamp-lit rooms on Edit 2511. Every fix tried either did nothing or cost the Cast's likeness, so a re-roll is the fix for now.

## What's new

### Rendering
- **Live progress and previews** follow the still that is actually rendering, not the first ones queued.
- **Castcut nodes 1.2–1.4:** face checks, pose checks, the Face finish probe and two-person pose reads skip the queue. The graph is read without downloading the picture, and unused uploads can be deleted from *Settings → Input folder*.

### Day stills
- **No third leg** on solo stills lying back: the stance words now describe what the pose drawing shows.
- **Suggestive pose drawings no longer contradict the beat.** When the clothed drawing would turn a lie or a kneel into a seated or standing pair, Day sends no drawing and the words set the pose. A pose you pick yourself is always drawn.
- **Lying face to face stays lying** (both lying in 3 of 3 renders, about 1 of 3 before).
- **Two men, checked live.** The scene line speaks of him, menswear covers a slip, a camisole and panties, the lap and oral beats read right, and the lap is seated. Two women's lap beat gets its compact recipe again.
- **Picked shoes on two-person stills**, a beat's own furniture in the right place, no white dot spray on sport stills, and friend beats that open as a Day photo, not a date.

### Settings
- **System workflows are on for a fresh install**, with the Good quality that *Heal & ready* sets. A choice you made is kept.
- **Quality says where it comes from.** Each tool's Engine panel says whether its quality is set for that tool or comes from Settings. When tools differ, *Settings → Prompt quality* lists each tool under its quality.
- Prompt quality notes that the sampler preset and size defaults apply to the Prompt tool, Outfit and batches. Day and Story pick their own canvas size and steps for each engine.

### Setup
- The check packs say what is actually wrong (installed but not loading, or missing).
- *Prepare checks* downloads the face and pose check models during setup instead of on the first still.
- LM Studio can get a vision model from inside the app.

### Desktop
- The Linux AppImage build is fixed (a nested copy of the image library broke it in 2.3.1 and 2.3.2).

## Upgrading
- Update the **Castcut nodes** pack to 1.4.0 and restart ComfyUI. Nothing else to do.
