# Castcut 2.5 — release notes

Castcut 2.5 is about sound and length. Talking clips got their faces back (the voice no longer warps them, a CodeFormer face pass cleans the mouth, and a *Keep the full frame* switch renders the whole still at a size the face holds up at). Two people can now talk to each other in one shot, each in their own voice. A cut film can get an original score written for it in your ComfyUI. And any finished clip can be carried on to about 30 seconds — in a direction you give it, with beats you can edit before anything renders. Suggested lines are about the scene in front of the Cast, and every page now edits its engine in the same sheet.

> ## Changed defaults & things to know
>
> - **The Engine opens as a sheet everywhere.** The docked Engine column beside Day, Refine, Compose and the other tools is gone: the **Engine** chip in the header opens the same sheet Outfit and Story already used, on desktop and phone. Pages keep their full width.
> - **Sound needs a few downloads.** All under **Settings → ComfyUI → Models** (the Play guide's *What sound needs* lists them):
>   - *Talking clips, conversations, Add voice, Make it 30 s on LTX:* the five LTX-2.5 files (about 39 GB). Lightricks gates them — accept the terms once on [huggingface.co/Lightricks/LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5) and set `HF_TOKEN`.
>   - *Face pass (recommended):* ComfyUI-ReActor (**Install** in **Settings → Overview → Play checks**) and *CodeFormer face restore*.
>   - *Score this film:* *ACE-Step 1.5 (film scores)*, 10 GB, on ComfyUI's built-in audio nodes (a recent ComfyUI).
> - **A kept Cast voice is opt-in.** Steering talking clips toward a kept voice helps some clips and not others; it is a switch on the Cast's Voice section, off by default, and it is never used in two-person conversations.
> - **Make it 30 s takes minutes.** About 6 minutes for a 5-second LTX clip, about 15 for a WAN clip, on an RTX 4090. Its parts queue behind renders already waiting in ComfyUI. Leaving the page is fine — the job is picked up again when Day or Story opens.
> - **Long and voiced clips are Gallery clips.** *Make it 30 s* and *Add voice* results are stored in the Gallery (kinds *Extend* and *Voice*), next to the clip they came from — they take disk space like any other clip.

## What's new

### Talking clips that hold up

- **The voice no longer warps the face.** A kept Cast voice now steers only the first, half-size LTX pass, at half strength; the refine pass runs on the plain model with the voiced audio frozen. Replays of clips that came out with white-mask faces came out clean.
- **Keep the full frame.** A Day slot or Story scene with a line has a *Keep the full frame* switch: the clip starts from the whole still instead of the chest-up crop. Full-frame talking clips render at a 1152-px long side so the small face keeps its shape.
- **Face pass.** With ComfyUI-ReActor and CodeFormer installed, talking clips get a CodeFormer pass on every frame (visibility 0.6, weight 0.7) — the mouth smears go, the lip-sync stays. Play checks offers to install it.

### Conversations

On a two-person clothed still, add **Their reply** under the line: Animate makes one clip where the lead says the line and the other person answers, each with their own voice and their own lip movement (about 6 s). *Suggest a reply* writes the answer. Live: both lines word for word, in order, two voices, each face moving on its own line. Two-person adult clips stay on WAN, without speech.

### Score this film

**Cut options → Score this film** (Day, phone Day, Story) writes an original instrumental in the film's mood with ACE-Step 1.5 in your ComfyUI — Workday upbeat indie pop, Intimate slow downtempo, Night out nu-disco, Lazy Sunday lo-fi; a Story's tone picks noir jazz, romantic piano, epic orchestral… — sized to the cut. It becomes the cut's music: fit-to-music, cuts on the beat and turning the music down under spoken lines all apply. About 8 seconds for 30 seconds of music.

### Make it 30 s

A finished clip's ⋯ menu (Day board, phone Day, Story) has **Make it 30 s**. Say where it should go (*"they finish their coffee, she grabs her bag, kisses him goodbye and heads for the door"*), tap **Write the beats** for one line per part, edit any line, add or remove parts, and start. The clip is carried on in parts that continue from each other and joined into one MP4 with sound:

- **LTX clips** continue from the last 17 frames of the part before — the motion carries over and the overlap is crossfaded. Each part names the slot's setting and rules out close-ups and new people.
- **WAN clips** (two-person adult clips) replay their own ComfyUI graph from the last frame — same engine, LoRAs and settings — with the camera held still.
- **Colours stay the clip's own:** every part is matched to the first frame (a 7-part WAN chain had turned the room pink; drift 26–36 → 4–9).

**Lines per part.** After *Write the beats*, every part of an LTX clip can say something (*Says…*): it speaks the line, lip-synced, while doing its beat — a 30-second clip can be a little scene with dialogue. WAN parts stay wordless (WAN cannot move lips to words).

Known limits: faces and clothes can drift late in a long clip, and the camera can still creep in on some LTX clips. Small steps in one place work best — a different place is a new slot.

### How it is said

Under a line, **How** picks *Natural, Whisper, Laughing, Excited, Tender, Teasing* or *Angry* — in talking clips, conversations and every *Says…* line of a 30-second clip. The words stay exact (14 of 14 in testing); a whisper comes out quieter and breathy, Excited and Angry pitch up and land the line with an exclamation, Tender sits low and warm.

### Lines that fit the scene

*Suggest a line* asks for four candidates said to the person in the scene (or whoever is filming) about one concrete thing there, and keeps the one most tied to the scene — no narrating the action, no "perfect light", nothing already said elsewhere in the Day. Day uses the beat its still was made from and the Day Cast's own personality (not the Story persona's, and not the catchphrase). Story's writer follows the same rule.

### Setup

The five LTX-2.5 files are downloads in **Settings → ComfyUI → Models**, marked *needs HF_TOKEN*. Play checks has rows for the talking-clip face pass (ReActor) and Score this film (ACE-Step 1.5).

## Fixes

- Lightbox plays clips with sound (gallery URLs carry no file extension); the gallery cache no longer breaks video range requests.
- A clip kept in the Gallery is recognised as a video even when its slot still carries the WebP job it came from.
- Escape closes the slot sheet again after *Suggest*.
- A voiced clip no longer turns back into the silent one: Day's gallery sync used to restore the original render's URL after *Add voice*.
