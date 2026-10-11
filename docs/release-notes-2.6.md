# Castcut 2.6 — release notes

Castcut 2.6 is about trust and finishing. Before a film is cut, Castcut now checks the shots themselves and says what it would otherwise do quietly. Every still says whether it looks like your Cast. The cut became a small editor: trim clips, frame stills closer, pick the poster, cut square or 1080p, set the music and voice levels and hear them together. Nothing you make is a dead end any more: every film remembers how it was cut and can be re-cut in another shape, every Day episode can be opened again, the Day plan has undo, and restoring a backup shows what it holds before it replaces anything.

> ## Changed defaults & things to know
>
> - **Cut film checks the shots first.** Pressing *Cut film* now reads each shot's file ("Checking the shots…", a second or two) and lists problems with the face / pose / Auto-review misses: a missing file, a black still, a clip that goes black, or a talking clip with no sound. *Cut anyway* is still there.
> - **Plain "WAN Video" clips sample as Rapid AIO.** The clip graph has always loaded the Rapid AIO file for every WAN engine. *WAN Video* (and the WAN fallback when LTX-2.5 can't take a shot) used full-WAN sampling — Max meant 40 steps at CFG 5 on a CFG-1 model. Those clips now use Rapid AIO's sampling (Max = 8 steps, CFG 1): much faster, no overcooked frames.
> - **Re-cut needs films cut in 2.6.** Only films cut from now on carry the recipe *Re-cut* uses. Shots that lived only in the browser (demo stills, uploads) can't come back.
> - **Music and voice levels are a server-encode feature.** The browser fallback cuts picture only, as before.
> - **LTX-2.5 runs every clip except two-person adult ones.** With LTX-2.5 picked, clothed one-person clips no longer fall back to WAN — held harder on the still, her face stayed closer on LTX than on WAN (0.55 vs 0.79 face distance on 8 stills). Untick *Use LTX-2.5 for clothed one-person clips* under Animate to keep them on WAN. Two-person adult clips stay on WAN unless you tick *Use LTX-2.5 for two-person adult clips too*.
> - **Talking clips have room sound** once castcut-nodes 1.7.0 is in ComfyUI. Untick *Room sound under the voice* (under the line) for voice only.
> - **Closer framing is a crop.** Asking the image engine for a close-up doesn't work (Edit 2511 kept her thighs in frame on 4 of 4 tries), so *waist up* / *chest up* crop the finished still around her face — never under 420 px tall.

## What's new

### Clips on LTX-2.5

- **Animate asks what should happen.** Animate opens the clip's direction — the default from the beat, editable. Your own words are formatted for the engine the clip runs on.
- **Faces hold.** One-person and adult clips hold the still harder (0.85) and render at 1024 on the long side. Clothed clips kept her face closer to the still than on WAN; one-person adult clips kept their anatomy where plain LTX lost it, and moved like WAN instead of overshooting.
- **Two-person adult clips on LTX (opt-in).** Tuned over a day of A/Bs: a calm tempo line, the anatomy said outright and the firmer hold. Across 10 stills they held the act every time (WAN drifted on 2 of 6). A small amount of unnatural genital interaction is left; the LoRA trained for it on LTX-2.5 is still in early access.
- **Refine detail (opt-in).** One more pass through Lightricks' Refine-Details IC-LoRA, guided by the clip's own frames: crisper texture, about twice the time, and the face can shift a little. Works on talking clips too — the voice is kept exactly and the lips stay on the words.

### Talking clips

- **Room sound under the voice** — the place's sounds (a café's cups and voices, a shop's footsteps and door chime, a fountain, traffic) in their own pass, 15 dB under her spoken level, the line still transcribed word for word. The pass listens to a blurred copy of the clip, so it can't read her lips and speak along. Needs castcut-nodes 1.7.0 in ComfyUI; *Room sound under the voice* under the line turns it off.
- **The scene keeps moving.** Steam from a coffee, candle flames, a fountain, water, leaves, people passing — whatever the place and the line name — keep moving while she talks. Before, LTX froze everything but her.
- **She keeps her pose.** A full-body still stays a wide shot and she stays standing (or seated) as in the still; earlier 2.6 builds sat standing women down on the pavement, and seated stills punched in to her face.
- **Eleven ways to say a line**, in a dropdown: Natural, Whisper, Laughing, Excited, Tender, Teasing, Angry, Nervous, Scared, Shouting, Sing-song.
- **Add sound names the place** — a silent clip's sound is the place's (waves and gulls in a bay, guests in a café), not generic room tone.

### Checked before the cut

- **Files, black frames, sound.** Cut film fetches each shot the way the encode will and samples it: missing files, black stills, clips mostly black or black for over 1.5 s, talking clips with no sound track or a silent one ("its line won't be heard"). A shot ComfyUI can't be reached for says so instead of calling the file missing. Checked against real media: a black picture, a silent track (−91 dB), a clip with no audio and a 2.5 s black gap were caught; the night sample still and a normal talking clip were not flagged.
- **What the cut would quietly do.** Under *Ready to cut*, Day says when a slot will be left out (its still failed or is still rendering), when a failed clip is replaced by its still, and when a line has no talking clip.
- **Which checks ran.** Every Cut says *Checked: faces 3 of 4, auto-review · Not checked: pose*.

### Looks like the Cast

**Auto-review no longer re-rolls good outfits.** Before an outfit miss costs a re-roll, Auto-review describes her clothes plainly and checks that loosely against the plan. On 30 of your Day stills it used to flag 7 correctly dressed ones (a tuxedo read as "blazer and trousers"); now 0, while 20 of 30 deliberately wrong outfits are still caught. A miss that stands says what she is wearing.

Each finished Day still shows a face mark — *Looks like Nora 72%*, *Face may drift 48%*, *Not Nora? 31%* — from its measured face match, and the Cut shot list shows it per shot (Day and Story, each with its own bars).

### A small film editor

The Cut shot list (Day, phone Day, Story, episodes) now has, per shot:

- **Trim** a clip — *from … to …*; its voice is trimmed with it, in both encoders.
- **Frame** a still — *as shot / waist up / chest up*.
- **Poster** — Save poster uses this shot; on a clip, *frame at … s*.

And for the whole cut:

- **Shape** — Widescreen 16:9, Vertical 9:16, or Square 1:1 (new) — and **Size**, 720p or 1080p.
- **Music / Lines** levels, with the music still ducking under every line.
- **▶ Preview the cut** — the whole film as it will come out, before any encode: order, holds, trims, framing, slow zoom, crossfades, captions, title card, in its shape, with the music and lines at their levels. Play, pause, scrub.
- **▶ Preview the mix** — just the sound: the music and every line, together, where the encode will put them.

### Every film has a home

- **What's in it · Re-cut.** A cut film keeps its recipe — shots, trims, framing, captions, music, levels — on its Gallery entry. On the Cast page each film lists its shots and re-cuts at another shape and size as a new film beside it.
- **Every Day episode keeps its Day.** The Cast page's *Seasons* show what went into each episode (each slot's still or clip, place, beat, line) and **Open this Day again** puts it back on Day. The Day that was there is kept aside behind *Bring back the Day you had*.

### Undo, continuity, timing

- **Undo / Redo for the Day plan** — places, beats, outfits, lines, poses and slot count, up to 30 steps.
- **Held across the Day** — above the clothing row: face from the plate (+ face finish), the Day's clothes, the Cast's recurring places, the weather — and what each still is free to change.
- **How long a batch will take** — under Queue the rest / Animate all, from this machine's own recent renders, behind what is already queued.

### Fixes

- *Clip unavailable* on Day cards after a reload (the clip played fine in the lightbox) — the card retries now, with *Try again*.
- Studio's sidebar sometimes lost the film card while the Cast list loaded.

### Backups you can check

Every *Import / Restore backup* now reads the file first and shows it beside what is here — Cast by name, films, renders, prompt history, workflows, when it was saved — marking anything the file has less of. The default restore downloads a copy of what is here before replacing it, and says how many renders in the file exist only in ComfyUI's output folder.
